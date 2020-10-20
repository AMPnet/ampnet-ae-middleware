let { TxBuilder: TxBuilder, Crypto } = require('@aeternity/aepp-sdk')

let client = require('../ae/client')
let repo = require('../persistence/repository')
let enums = require('../enums/enums')
let contracts = require('../ae/contracts')
let config = require('../config')
let logger = require('../logger')(module)
let codec = require('../ae/codec')
let util = require('../ae/util')
let err = require('../error/errors')
let txProcessor = require('./transaction-processor')
let queueClient = require('../queue/queueClient')
let ErrorType = err.type

let { TxState, TxType } = require('../enums/enums')

async function postTransactionGrpc(call, callback) {
    postTransaction(call.request.data, function(err, result) {
        callback(err, result)
    })
}

async function postTransaction(tx, callback) {
    logger.debug(`Received request to post transaction`)
    try {
        let txData = TxBuilder.unpackTx(tx)
        let txHash = TxBuilder.buildTxHash(tx)
        logger.debug(`Precalculated tx hash: ${txHash}`)

        let existingRecords = await repo.get({ hash: txHash })
        if (existingRecords.length === 0) {
            logger.debug(`Transaction ${txHash} does not exist in database and was never broadcasted to blockchain. Moving on...`)
            // Two layers of security. dryRun() is experimental and will fail silently if anything unexpected occurs.
            await performSecurityChecks(txData)
            let dryRunResult = await dryRun(txData)
            await txProcessor.storeTransactionData(txHash, txData.tx.encodedTx.tx, dryRunResult)

            let result = await client.instance().sendTransaction(tx, { waitMined: false, verify: true })
            queueClient.publishTxProcessJob(result.hash)
        
            logger.debug(`Transaction successfully broadcasted! Tx hash: ${result.hash}`)
            callback(null, { txHash: result.hash })
        } else {
            let tx = existingRecords[0]
            let txExistsOnBlockchain = await util.transactionExists(txHash)
            if (txExistsOnBlockchain) {
                logger.debug(`Transaction ${txHash} exists in database and was broadcasted to blockchain!`)
                queueClient.publishTxProcessJob(txHash)
                callback(null, { txHash: txHash })
            } else {
                logger.debug(`Transaction ${txHash} exists in database but was never broadcasted to blockchain!`)
                let result = await client.instance().sendTransaction(tx, { waitMined: false })
                queueClient.publishTxProcessJob(result.hash)
                callback(null, { txHash: result.txHash })
            }
        }
    } catch(error) {
        logger.error("Error while posting transaction \n%o", error)
        logger.error("Error log \n%o", err.pretty(error))
        err.handle(error, callback)
    }
}

async function getPortfolio(call, callback) {
    logger.debug(`Received request to fetch portfolio for user with wallet txHash ${call.request.txHash}`)
    try {
        let tx = await repo.findByHashOrThrow(call.request.txHash)
        let userWallet = tx.wallet
        logger.debug(`Address represented by given hash: ${tx.wallet}`)

        let portfolioMap = new Map()
        
        let records = await repo.getUserUncanceledInvestments(userWallet)
        let recordsLength = records.length
        for (var i = 0; i < recordsLength; i++) {
            tx = await repo.findByWalletOrThrow(records[i].to_wallet)
            project = tx.hash
            amount = records[i].amount
            if (portfolioMap.has(project)) { 
                portfolioMap.set(project, Number(portfolioMap.get(project)) + Number(amount))
            } else {
                portfolioMap.set(project, amount)
            }
        }

        let marketRecords = await repo.getUserMarketTransactions(userWallet)
        let marketRecordsLength = marketRecords.length
        for (var i = 0; i < marketRecordsLength; i++) {
            info = await getSellOfferData(marketRecords[i])
            preOwnedShares = portfolioMap.has(info.project) ? Number(portfolioMap.get(info.project)) : 0
            if (userWallet == info.buyer) {
                portfolioMap.set(info.project, preOwnedShares + Number(info.shares))
            } else if (userWallet == info.seller) {
                portfolioMap.set(info.project, preOwnedShares - Number(info.shares))
            }
        }

        let portfolio = Array.from(portfolioMap).map(entry => {
            return {
                projectTxHash: entry[0],
                amount: entry[1]
            }
        }).filter(entry => { return entry.amount > 0 })
        logger.debug("Successfully fetched portfolio \n%o", portfolio)
        callback(null, { portfolio: portfolio })
    } catch (error) {
        logger.error(`Error while fetching portfolio: \n%o`, error)
        err.handle(error, callback)
    }
}

async function getTransactionInfo(call, callback) {
    try {
        let hash = call.request.txHash
        let from = call.request.from
        let to = call.request.to

        let records
        if (from === undefined || to === undefined || from === "" || to === "") {
            logger.debug(`Received request to fetch info for transaction with hash ${hash}.`)
            records = await repo.get({ 
                hash: hash
            })
        } else {
            logger.debug(`Received request to fetch info for transaction with hash ${hash}. From: ${from} To: ${to}`)
            let fromWallet = (from.startsWith("th_")) ? ((await repo.findByHashOrThrow(from)).wallet) : from
            let toWallet = (to.startsWith("th_")) ? ((await repo.findByHashOrThrow(to)).wallet) : to
            records = await repo.get({ 
                hash: hash,
                from_wallet: fromWallet,
                to_wallet: toWallet
            })
        }

        if (records.length == 0) {
            let error = err.generate(ErrorType.TX_NOT_FOUND)
            logger.error(`Error while fetching transaction info: \n%o`, error)
            err.handle(error, callback)
            return
        }

        let info = {
            hash: records[0].hash,
            fromWallet: records[0].from_wallet,
            toWallet: records[0].to_wallet,
            state: enums.txStateToGrpc(records[0].state),
            type: enums.txTypeToGrpc(records[0].type),
            amount: records[0].amount,
            supervisorStatus: records[0].supervisor_status
        }
        logger.debug(`Successfully fetched transaction info, state: ${info.state}`)
        callback(null, info)
    } catch (error) {
        logger.error(`Error while fetching transaction info: \n%o`, error)
        err.handle(error, callback)
    }
}

async function getTransactions(call, callback) {
    logger.debug(`Received request to fetch transactions for user with wallet txHash ${call.request.txHash}`)
    try {
        let tx = await repo.findByHashOrThrow(call.request.txHash)
        logger.debug(`Address represented by given hash: ${tx.wallet}`)
        let types = new Set([TxType.DEPOSIT, TxType.WITHDRAW, TxType.APPROVE_INVESTMENT, TxType.INVEST, TxType.SHARE_PAYOUT, TxType.CANCEL_INVESTMENT])
        let transactionsPromisified = (await repo.getUserTransactions(tx.wallet))
            .filter(r => types.has(r.type))
            .map(r => {
                switch (r.type) {
                    case TxType.DEPOSIT:
                    case TxType.WITHDRAW:
                        return new Promise(resolve => {
                            resolve({
                                amount: r.amount,
                                type: enums.txTypeToGrpc(r.type),
                                date: r.date,
                                state: enums.txStateToGrpc(r.state)
                            })
                        })
                    case TxType.APPROVE_INVESTMENT:
                    case TxType.INVEST:
                        return new Promise(async (resolve) => {
                            repo.findByWalletOrThrow(r.to_wallet).then(project => {
                                resolve({
                                    fromTxHash: call.request.txHash,
                                    toTxHash: project.hash,
                                    amount: r.amount,
                                    type: enums.txTypeToGrpc(r.type),
                                    date: r.date,
                                    state: enums.txStateToGrpc(r.state)
                                })
                            })
                        })
                    case TxType.SHARE_PAYOUT:
                        return new Promise(async (resolve) => {
                            repo.findByWalletOrThrow(r.from_wallet).then(project => {
                                resolve({
                                    fromTxHash: project.hash,
                                    toTxHash: call.request.txHash,
                                    amount: r.amount,
                                    type: enums.txTypeToGrpc(r.type),
                                    date: r.date,
                                    state: enums.txStateToGrpc(r.state)
                                })
                            })                            
                        })
                    case TxType.CANCEL_INVESTMENT:
                        return new Promise(async (resolve) => {
                            repo.findByWalletOrThrow(r.from_wallet).then(project => {
                                resolve({
                                    fromTxHash: project.hash,
                                    toTxHash: call.request.txHash,
                                    amount: r.amount,
                                    type: enums.txTypeToGrpc(r.type),
                                    date: r.date,
                                    state: enums.txStateToGrpc(r.state)
                                })
                            })
                        })
                }
            })
        let transactions = await Promise.all(transactionsPromisified)
        logger.debug("Successfully fetched user's transactions \n%o", transactions)
        callback(null, { transactions: transactions })
    } catch (error) {
        logger.error(`Error while fetching transactions: \n%o`, error)
        err.handle(error, callback)
    }
}

async function getInvestmentsInProject(call, callback) {
    logger.debug(`Received request to fetch investments in project ${call.request.projectTxHash} for user with wallet ${call.request.fromTxHash}`)
    try {
        let investorTx = await repo.findByHashOrThrow(call.request.fromTxHash)
        logger.debug(`Investor wallet represented by given hash: ${investorTx.wallet}`)
        let projectTx = await repo.findByHashOrThrow(call.request.projectTxHash)
        logger.debug(`Project address represented by given hash: ${projectTx.wallet}`)
        let investments = (await repo.getUserUncanceledInvestments(investorTx.wallet))
            .filter(tx => {
                return tx.to_wallet == projectTx.wallet
            })
            .map(tx => {
                return {
                    fromTxHash: call.request.fromTxHash,
                    toTxHash: call.request.projectTxHash,
                    amount: tx.amount,
                    date: (new Date(tx.processed_at)).getTime(),
                    type: enums.txTypeToGrpc(tx.type),
                    state: enums.txStateToGrpc(tx.state)
                }
            })
        logger.debug(`Successfully fetched investments \n%o`, investments)
        callback(null, { transactions: investments })
    } catch (error) {
        logger.error(`Error while fetching investments in project \n%o`, error)
        err.handle(error, callback)
    }
}

async function performSecurityChecks(txData) {
    if (txData.txType != 'signedTx') {
        throw err.generate(ErrorType.TX_NOT_SIGNED)
    }
    let unpackedTx = txData.tx.encodedTx
    switch (unpackedTx.txType) {
        case 'contractCallTx':
            await checkTxCaller(unpackedTx.tx.callerId)
            await checkTxCallee(unpackedTx.tx.contractId)
            break
        case 'contractCreateTx':
            await checkTxCaller(unpackedTx.tx.ownerId)
            await checkContractData(unpackedTx.tx)
            break
        default:
            throw err.generate(ErrorType.GENERIC_ERROR, `Error posting transaction. Expected transaction of type contractCall or contractCreate but got ${unpackedTx.txType}. Aborting.`)
    }
}

async function checkTxCaller(callerId) {
    let coopAuthorityId = await config.get().contracts.coop.owner()
    let issuingAuthorityId = await config.get().contracts.eur.owner()
    
    // if caller is coop or token authority return normally
    if(callerId == coopAuthorityId || callerId == issuingAuthorityId) {
        return
    }

    // if caller not found in repo or caller's wallet still not mined exception is thrown
    return repo.findByWalletOrThrow(callerId)
}

async function checkTxCallee(calleeId) {
    if (calleeId == config.get().contracts.coop.address || calleeId == config.get().contracts.eur.address) { return }
    
    /**
     * Special case. Allow calling SellOffer without requiring for its
     * wallet to be activated. (SellOffers do not require active wallets)
     */
    let record = await repo.findFirstByWallet(calleeId)
    if (typeof record !== 'undefined' && record.type == enums.TxType.SELL_OFFER_CREATE) { return }

    let walletActive = await isWalletActive(calleeId)
    if (walletActive) { return }
    
    throw err.generate(ErrorType.TX_INVALID_CONTRACT_CALLED)
}

async function checkContractData(tx) {
    let orgBytecode = contracts.getOrgCompiled().bytecode
    let projBytecode = contracts.getProjCompiled().bytecode
    let sellOfferBytecode = contracts.getSellOfferCompiled().bytecode
    switch (tx.code) {
        case orgBytecode:
            callData = await codec.decodeDataByBytecode(orgBytecode, tx.callData)
            if (callData.arguments[0].value != config.get().contracts.coop.address) {
                throw err.generate(ErrorType.GROUP_INVALID_COOP_ARG)
            }
            break
        case projBytecode:
            callData = await codec.decodeDataByBytecode(projBytecode, tx.callData)
            orgAddress = callData.arguments[0].value
            isOrgActive = await isWalletActive(orgAddress)
            if (!isOrgActive) {
                throw err.generate(ErrorType.PROJ_INVALID_GROUP_ARG)
            }
            break
        case sellOfferBytecode:
            callData = await codec.decodeDataByBytecode(sellOfferBytecode, tx.callData)
            projAddress = callData.arguments[0].value
            isProjActive = await isWalletActive(projAddress)
            if (!isProjActive) {
                throw err.generate(ErrorType.SELL_OFFER_INVALID_PROJ_ARG)
            }
            break
        default:
            throw err.generate(ErrorType.MALFORMED_CONTRACT_CODE)
    }

    if (tx.amount != 0) {
        throw err.generate(ErrorType.GENERIC_ERROR, `Error posting Contract create transaction. Amount field has to be set to 0 but ${tx.amount} provided!`)
    }
    if (tx.deposit != 0) {
        throw err.generate(ErrorType.GENERIC_ERROR, `Error posting Contract create transaction. Deposit field has to be set to 0 but ${tx.deposit} provided!`)
    }
}

async function isWalletActive(wallet) {
    let address = await util.enforceAkPrefix(wallet)
    let result = await client.instance().contractCallStatic(
        contracts.coopSource, 
        config.get().contracts.coop.address, 
        enums.functions.coop.isWalletActive,
        [ address ],
        {
            callerId: Crypto.generateKeyPair().publicKey
        }
    )
    return result.decode()
}

/**
 * Adds another layer of security and is used as a first filter when broadcasting transactions.
 * If some error occurs while dry running transaction this function will throw.
 */
async function dryRun(txData) {
    logger.debug(`Dry running transaction.`)
    let unpackedTx = txData.tx.encodedTx
    let unsignedTx = TxBuilder.buildTx(unpackedTx.tx, unpackedTx.txType).tx
    let callerId = unpackedTx.txType === 'contractCreateTx' ? unpackedTx.tx.ownerId : unpackedTx.tx.callerId
    logger.debug(`Caller id: ${callerId}`)
    
    let response = await client.chainNode().txDryRun([unsignedTx], [{ pubKey: callerId, amount: 0 }])
    if (typeof response.results === 'undefined') {
        logger.warn(`Error while dry running tx. Expected json with <results> field but got: %o`, response)
        throw err.generate(ErrorType.DRY_RUN_ERROR)
    }
    let results = response.results
    if (results.length == 0) {
        logger.warn(`Error while dry running tx. <results> field in response empty! Full response: %o`, response)
        throw err.generate(ErrorType.DRY_RUN_ERROR)
    }
    if (results.length > 1) {
        logger.warn(`Warning: Dry run resulted in more than one result. Further analysis is required! Full response: %o`, response)
        throw err.generate(ErrorType.DRY_RUN_ERROR)
    }

    let result = results[0]
    logger.debug(`Received result:\n%o`, result)
    
    if (typeof result.result !== 'undefined') {
        let status = result.result
        if (status === "ok") {
            if (typeof result.callObj === 'undefined') {
                logger.warn(`Warning: <callObj> property missing in json result. Further analysis is required!`)
                throw err.generate(ErrorType.DRY_RUN_ERROR) 
            } 
            let callObj = result.callObj
            if (callObj.returnType === "revert" || callObj.returnType === "error") {
                logger.debug(`Error detected while dryRunning transaction!`)
                let errorMessage = await err.decode(callObj)
                logger.debug(`Decoded error message: ${errorMessage}`)
                throw err.generate(ErrorType.DRY_RUN_ERROR, errorMessage)
            } else if (callObj.returnType === "ok") {
                logger.debug(`No errors detected while dryRunning transaction! Transaction is safe for broadcasting.`)
                return callObj
            } else {
                logger.warn(`Unknown <returnType> field value detected in callObj response. Further analysis is requried!`)
                throw err.generate(ErrorType.DRY_RUN_ERROR)
            }
        } else if (status === "error") {
            logger.debug(`Error detected while dryRunning transaction!`)
            if (typeof result.reason === 'undefined') {
                logger.warn(`Error while parsing dry run result. <reason> field not found.`)
                throw err.generate(ErrorType.DRY_RUN_ERROR)
            }
            let errorMessage = result.reason
            logger.debug(`Error message: ${errorMessage}`)
            throw err.generate(ErrorType.DRY_RUN_ERROR, errorMessage)
        } else {
            logger.warn(`Error while parsing dry run result. Unexpected <result> field value.`)
            throw err.generate(ErrorType.DRY_RUN_ERROR)
        }
    } else {
        logger.warn(`Error while parsing dry run result. Missing <result> field.`)
        throw err.generate(ErrorType.DRY_RUN_ERROR)
    }
}

/**
 * HELPER FUNCTIONS
 */

 async function getSellOfferData(sharesSoldTx) {
    let seller = sharesSoldTx.from_wallet
    let buyer = sharesSoldTx.to_wallet
    let sharesAmount = sharesSoldTx.amount
    let info = sharesSoldTx.input.split(";")
    let projectContract = info[0]
    let projectHash = (await repo.findByWalletOrThrow(projectContract)).hash
    return {
        buyer: buyer,
        seller: seller,
        shares: sharesAmount,
        project: projectHash
    }
 }

module.exports = { 
    postTransaction,
    postTransactionGrpc,
    getPortfolio, 
    getTransactions,
    getInvestmentsInProject,
    getTransactionInfo
}