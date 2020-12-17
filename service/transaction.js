let { TxBuilder: TxBuilder, Crypto } = require('@aeternity/aepp-sdk')

let client = require('../ae/client')
let repo = require('../persistence/repository')
let enums = require('../enums/enums')
let contracts = require('../ae/contracts')
let config = require('../config')
let logger = require('../logger')(module)
let codec = require('../ae/codec')
let util = require('../ae/util')
let commonUtil = require('../util/util')
let err = require('../error/errors')
let txProcessor = require('./transaction-processor')
let queueClient = require('../queue/queueClient')
let ErrorType = err.type

let { TxType } = require('../enums/enums')
const coop = require('./coop')

async function postTransactionGrpc(call, callback) {
    postTransaction(call.request.data, call.request.coop, function(err, result) {
        callback(err, result)
    })
}

async function postTransaction(tx, coop, callback) {
    logger.debug(`Received request to post transaction`)
    try {
        let txData = TxBuilder.unpackTx(tx)
        let txHash = TxBuilder.buildTxHash(tx)
        logger.debug(`Precalculated tx hash: ${txHash}`)

        let coopInfo = await repo.getCooperative(coop)

        let existingRecords = await repo.get({ hash: txHash })
        if (existingRecords.length === 0) {
            logger.debug(`Transaction ${txHash} does not exist in database and was never broadcasted to blockchain. Moving on...`)
            await performSecurityChecks(txData, coopInfo)
            let dryRunResult = await dryRun(txData)
            await txProcessor.storeTransactionData(txHash, txData.tx.encodedTx.tx, dryRunResult, coopInfo)

            let result = await client.instance().sendTransaction(tx, { waitMined: false, verify: true })
            txProcessor.process(result.hash)
        
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
                let result = await client.instance().sendTransaction(tx, { waitMined: false, verify: true })
                txProcessor.process(result.hash)
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
        
        let records = await repo.getUserUncanceledInvestments(userWallet, tx.coop_id)
        let recordsLength = records.length
        for (var i = 0; i < recordsLength; i++) {
            tx = await repo.findByWalletOrThrow(records[i].to_wallet, tx.coop_id)
            project = tx.hash
            amount = records[i].amount
            if (portfolioMap.has(project)) { 
                portfolioMap.set(project, Number(portfolioMap.get(project)) + Number(amount))
            } else {
                portfolioMap.set(project, amount)
            }
        }

        let marketRecords = await repo.getUserMarketTransactions(userWallet, tx.coop_id)
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
        function checkRecordsExist(recordsList) {
            if (recordsList.length == 0) {
                let error = err.generate(ErrorType.TX_NOT_FOUND)
                logger.error(`Error while fetching transaction info: \n%o`, error)
                err.handle(error, callback)
                return
            }
        }

        let hash = call.request.txHash
        let from = call.request.from
        let to = call.request.to

        logger.debug(`Received request to fetch info for transaction with hash ${hash}.`)
        if (from) { logger.debug(`From: ${from}`) }
        if (to)   { logger.debug(`From: ${to}`) }

        let records = await repo.get({
            hash: hash
        })
        checkRecordsExist(records)

        let coopId = records[0].coop_id
        if (from && to) {
            let fromWallet = (await repo.addressFromWalletData(from, coopId)).wallet
            let toWallet = (await repo.addressFromWalletData(to, coopId)).wallet
            records = records.filter(r => (r.from_wallet === fromWallet && r.to_wallet === toWallet))
        }
        checkRecordsExist(records)

        let info = {
            txHash: records[0].hash,
            fromTxHash: from || records[0].from_wallet,
            toTxHash: to || records[0].to_wallet,
            state: enums.txStateToGrpc(records[0].state),
            type: enums.txTypeToGrpc(records[0].type),
            amount: records[0].amount,
            supervisorStatus: enums.supervisorStatusToGrpc(records[0].supervisor_status),
            date: commonUtil.dateToUnixEpoch(records[0].created_at)
        }
        logger.debug(`Successfully fetched transaction info, state: ${info.state}`)
        callback(null, info)
    } catch (error) {
        logger.error(`Error while fetching transaction info: \n%o`, error)
        err.handle(error, callback)
    }
}

async function getTransactions(call, callback) {
    try {
        logger.debug(`Received request to fetch transactions for user with wallet data ${call.request.walletHash}`)
        let walletTx = await repo.findByHashOrThrow(call.request.walletHash)
        let wallet = walletTx.wallet
        let coopId = walletTx.coop_id
        logger.debug(`Address represented by given wallet data: ${wallet}`)
        let types = new Set([TxType.DEPOSIT, TxType.WITHDRAW, TxType.APPROVE_INVESTMENT, TxType.INVEST, TxType.SHARE_PAYOUT, TxType.CANCEL_INVESTMENT])
        let transactionsPromisified = (await repo.getUserTransactions(wallet, coopId))
            .filter(r => types.has(r.type))
            .map(r => {
                switch (r.type) {
                    case TxType.DEPOSIT:
                        return new Promise(resolve => {
                            resolve({
                                txHash: r.hash,
                                fromTxHash: util.enforceCtPrefix(r.from_wallet),
                                toTxHash: call.request.walletHash,
                                amount: r.amount,
                                type: enums.txTypeToGrpc(r.type),
                                date: r.date,
                                state: enums.txStateToGrpc(r.state)
                            })
                        })
                    case TxType.WITHDRAW:
                        return new Promise(resolve => {
                            resolve({
                                txHash: r.hash,
                                fromTxHash: call.request.walletHash,
                                toTxHash: util.enforceCtPrefix(r.to_wallet),
                                amount: r.amount,
                                type: enums.txTypeToGrpc(r.type),
                                date: r.date,
                                state: enums.txStateToGrpc(r.state)
                            })
                        })
                    case TxType.APPROVE_INVESTMENT:
                    case TxType.INVEST:
                        return new Promise(async (resolve) => {
                            repo.findByWalletOrThrow(r.to_wallet, coopId).then(project => {
                                resolve({
                                    txHash: r.hash,
                                    fromTxHash: call.request.walletHash,
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
                            repo.findByWalletOrThrow(r.from_wallet, coopId).then(project => {
                                resolve({
                                    txHash: r.hash,
                                    fromTxHash: project.hash,
                                    toTxHash: call.request.walletHash,
                                    amount: r.amount,
                                    type: enums.txTypeToGrpc(r.type),
                                    date: r.date,
                                    state: enums.txStateToGrpc(r.state)
                                })
                            })                            
                        })
                    case TxType.CANCEL_INVESTMENT:
                        return new Promise(async (resolve) => {
                            repo.findByWalletOrThrow(r.from_wallet, coopId).then(project => {
                                resolve({
                                    txHash: r.hash,
                                    fromTxHash: project.hash,
                                    toTxHash: call.request.walletHash,
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
    logger.debug(`Received request to fetch investments in project ${call.request.projectTxHash} for user with wallet ${call.request.fromAddress}`)
    try {
        let projectTx = await repo.findByHashOrThrow(call.request.projectTxHash)
        logger.debug(`Project address represented by given hash: ${projectTx.wallet}`)
        let investments = (await repo.getUserUncanceledInvestments(call.request.fromAddress, projectTx.coop_id))
            .filter(tx => {
                return tx.to_wallet == projectTx.wallet
            })
            .map(tx => {
                return {
                    txHash: tx.hash,
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

async function performSecurityChecks(txData, coopInfo) {
    if (txData.txType != 'signedTx') {
        throw err.generate(ErrorType.TX_NOT_SIGNED)
    }
    let unpackedTx = txData.tx.encodedTx
    switch (unpackedTx.txType) {
        case 'contractCallTx':
            await checkTxCaller(unpackedTx.tx.callerId, coopInfo)
            await checkTxCallee(unpackedTx.tx.contractId, coopInfo)
            break
        case 'contractCreateTx':
            await checkTxCaller(unpackedTx.tx.ownerId, coopInfo)
            await checkContractData(unpackedTx.tx, coopInfo)
            break
        default:
            throw err.generate(ErrorType.GENERIC_ERROR, `Error posting transaction. Expected transaction of type contractCall or contractCreate but got ${unpackedTx.txType}. Aborting.`)
    }
}

async function checkTxCaller(callerId, coopInfo) {
    // if caller is coop or token authority return normally
    if(callerId == coopInfo.coop_owner || callerId == coopInfo.eur_owner) {
        return
    }

    // if caller not found in repo or caller's wallet still not mined exception is thrown
    return repo.findByWalletOrThrow(callerId, coopInfo.id)
}

async function checkTxCallee(calleeId, coopInfo) {
    let coopContract = coopInfo.coop_contract
    let eurContract = coopInfo.eur_contract
    if (calleeId == coopContract || calleeId == eurContract) { return }
    
    /**
     * Special case. Allow calling SellOffer without requiring for its
     * wallet to be activated. (SellOffers do not require active wallets)
     */
    let record = await repo.findFirstByWallet(calleeId, coopInfo.id)
    if (typeof record !== 'undefined' && record.type == enums.TxType.SELL_OFFER_CREATE) { return }

    let walletActive = await isWalletActive(calleeId, coopInfo)
    if (walletActive) { return }
    
    throw err.generate(ErrorType.TX_INVALID_CONTRACT_CALLED)
}

async function checkContractData(tx, coopInfo) {
    let orgBytecode = contracts.getOrgCompiled().bytecode
    let projBytecode = contracts.getProjCompiled().bytecode
    let sellOfferBytecode = contracts.getSellOfferCompiled().bytecode
    switch (tx.code) {
        case orgBytecode:
            logger.debug(`Check Org contract call - decoding call data`)
            callData = await codec.decodeDataByBytecode(orgBytecode, tx.callData)
            logger.debug(`Check Org contract call - decoded call data: %o`, callData)
            if (callData.arguments[0].value != coopInfo.coop_contract) {
                throw err.generate(ErrorType.GROUP_INVALID_COOP_ARG)
            }
            break
        case projBytecode:
            logger.debug(`Check Proj contract data - decoding call data`)
            callData = await codec.decodeDataByBytecode(projBytecode, tx.callData)
            logger.debug(`Check Proj contract data - decoded call data: %o`, callData)
            orgAddress = callData.arguments[0].value
            isOrgActive = await isWalletActive(orgAddress, coopInfo)
            logger.debug(`Decoded isOrgActive: ${isOrgActive}`)
            if (!isOrgActive) {
                throw err.generate(ErrorType.PROJ_INVALID_GROUP_ARG)
            }
            break
        case sellOfferBytecode:
            logger.debug(`Check SellOffer contract data - decoding call data`)
            callData = await codec.decodeDataByBytecode(sellOfferBytecode, tx.callData)
            logger.debug(`Check SellOffer contract data - decoded call data: %o`, callData)
            projAddress = callData.arguments[0].value
            isProjActive = await isWalletActive(projAddress, coopInfo)
            logger.debug(`Decoded isProjActive: ${isProjActive}`)
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

async function isWalletActive(wallet, coopInfo) {
    logger.debug(`Checking is wallet ${wallet} active in coop ${coopInfo}`)
    let address = await util.enforceAkPrefix(wallet)
    let result = await client.instance().contractCallStatic(
        contracts.coopSource, 
        coopInfo.coop_contract, 
        enums.functions.coop.isWalletActive,
        [ address ],
        {
            callerId: Crypto.generateKeyPair().publicKey
        }
    )
    logger.debug(`Fetched wallet active result: ${result}`)
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
                if (err.isErrorFormatValid(errorMessage)) {
                    throw err.generateAborted(errorMessage)
                } else {
                    throw err.generate(ErrorType.DRY_RUN_ERROR, errorMessage)
                }
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
    let projectHash = (await repo.findByWalletOrThrow(projectContract, sharesSoldTx.coop_id)).hash
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