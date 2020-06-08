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
let supervisor = require('../supervisor')
let ErrorType = err.type

let { TxState, TxType, SupervisorStatus } = require('../enums/enums')

async function postTransaction(call, callback) {
    logger.debug(`Received request to post transaction`)
    try {
        let tx = call.request.data
        let txData = TxBuilder.unpackTx(tx)

        // Two layers of security. dryRun() is experimental and will fail silently if anything unexpected occurs.
        await performSecurityChecks(txData)
        await dryRun(txData)
        
        let result = await client.instance().sendTransaction(tx, { waitMined: false })
        
        txProcessor.process(result.hash).then(
            records => {
                logger.info(`Processing of transaction ${result.hash} completed successfully. ${records.length} record(s) updated.`)
            },
            error => {
                logger.error(`Processing of transaction ${result.hash} failed with error: \n%o`, error)
            }
        )
        
        logger.debug(`Transaction successfully broadcasted! Tx hash: ${result.hash}`)
        callback(null, { txHash: result.hash })
    } catch(error) {
        logger.error("Error while posting transaction \n%o", call.request.data)
        logger.error("Error log \n%o", err.pretty(error))
        err.handle(error, callback)
    }
}

async function getPortfolio(call, callback) {
    logger.debug(`Received request to fetch portfolio for user with wallet txHash ${call.request.txHash}`)
    try {
        let tx = await repo.findByHashOrThrow(call.request.txHash)
        logger.debug(`Address represented by given hash: ${tx.wallet}`)
        
        let records = await repo.getUserUncanceledInvestments(tx.wallet)
        let recordsLength = records.length

        let portfolioMap = new Map()

        for (var i = 0; i < recordsLength; i++) {
            tx = await repo.findByWalletOrThrow(records[i].to_wallet)
            project = tx.hash
            amount = records[i].amount
            if (portfolioMap.has(project)) { 
                portfolioMap.set(project, Number(portfolioMap.get(project)) + Number(amount)).toString()
            } else {
                portfolioMap.set(project, amount)
            }
        }

        let portfolio = Array.from(portfolioMap).map(entry => {
            return {
                projectTxHash: entry[0],
                amount: entry[1]
            }
        })
        logger.debug("Successfully fetched portfolio \n%o", portfolio)
        callback(null, { portfolio: portfolio })
    } catch (error) {
        logger.error(`Error while fetching portfolio: \n%o`, error)
        err.handle(error, callback)
    }
}

async function getTransactionInfo(call, callback) {
    logger.debug(`Received request to fetch info for transaction with hash ${call.request.txHash} `)
    try {
        let records = await repo.get({ hash: call.request.txHash })
        let info = {
            hash: records[0].hash,
            fromWallet: records[0].from_wallet,
            toWallet: records[0].to_wallet,
            state: records[0].state,
            type: records[0].type,
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
        let types = new Set([TxType.DEPOSIT, TxType.WITHDRAW, TxType.INVEST, TxType.SHARE_PAYOUT, TxType.CANCEL_INVESTMENT])
        let transactionsPromisified = (await repo.getUserTransactions(tx.wallet))
            .filter(r => { return types.has(r.type) && (r.state == TxState.MINED || r.state == TxState.FAILED) }) 
            .map(r => {
                switch (r.type) {
                    case TxType.DEPOSIT:
                    case TxType.WITHDRAW:
                        return new Promise(resolve => {
                            resolve({
                                amount: r.amount,
                                type: enums.txTypeToGrpc(r.type),
                                date: (new Date(r.processed_at)).getTime(),
                                state: r.state
                            })
                        })
                    case TxType.INVEST:
                        return new Promise(async (resolve) => {
                            repo.findByWalletOrThrow(r.to_wallet).then(project => {
                                resolve({
                                    fromTxHash: call.request.txHash,
                                    toTxHash: project.hash,
                                    amount: r.amount,
                                    type: enums.txTypeToGrpc(r.type),
                                    date: (new Date(r.processed_at)).getTime(),
                                    state: r.state
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
                                    date: (new Date(r.processed_at)).getTime(),
                                    state: r.state
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
                                    date: (new Date(r.processed_at)).getTime(),
                                    state: r.state
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
                    state: tx.state
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
 * If some error occurs while dry running transaction this function fails silently (return statements).
 */
async function dryRun(txData) {
    logger.debug(`Dry running transaction.`)
    let unpackedTx = txData.tx.encodedTx
    let unsignedTx = TxBuilder.buildTx(unpackedTx.tx, unpackedTx.txType).tx
    let callerId = unpackedTx.txType === 'contractCreateTx' ? unpackedTx.tx.ownerId : unpackedTx.tx.callerId
    logger.debug(`Caller id: ${callerId}`)
    
    let response = await client.chainNode().txDryRun([unsignedTx], [{ pubKey: callerId, amount: 0 }])
    if (response.results === 'undefined') {
        logger.warn(`Error while dry running tx. Expected json with <results> field but got: %o`, response)
        return
    }
    let results = response.results
    if (results.length == 0) {
        logger.warn(`Error while dry running tx. <results> field in response empty! Full response: %o`, response)
        return
    }
    if (results.length > 1) {
        logger.warn(`Warning: Dry run resulted in more than one result. Further analysis is required! Moving on and taking first result in array as relevant one. Full response: %o`, response)
    }

    let result = results[0]
    logger.debug(`Received result:\n%o`, result)
    
    if (result.result !== 'undefined') {
        let status = result.result
        if (status === "ok") {
            if (result.callObj === 'undefined') {
                logger.warn(`Warning: <callObj> property missing in json result. Further analysis is required!`)
                return
            } 
            let callObj = result.callObj
            if (callObj.returnType === "revert") {
                logger.debug(`Error detected while dryRunning transaction!`)
                let errorMessage = await err.decode(callObj)
                logger.debug(`Decoded error message: ${errorMessage}`)
                throw err.generate(ErrorType.DRY_RUN_ERROR, errorMessage)
            } else if (callObj.returnType === "ok") {
                logger.debug(`No errors detected while dryRunning transaction! Transaction is safe for broadcasting.`)
                return
            } else {
                logger.warn(`Unknown <returnType> field value detected in callObj response. Further analysis is requried!`)
                return
            }
        } else if (status === "error") {
            logger.debug(`Error detected while dryRunning transaction!`)
            if (result.reason === 'undefined') {
                logger.warn(`Error while parsing dry run result. <reason> field not found.`)
                throw err.generate(ErrorType.DRY_RUN_ERROR)
            }
            let errorMessage = result.reason
            logger.debug(`Error message: ${errorMessage}`)
            throw err.generate(ErrorType.DRY_RUN_ERROR, errorMessage)
        } else {
            logger.warn(`Error while parsing dry run result. Unexpected <result> field value.`)
        }
    } else {
        logger.warn(`Error while parsing dry run result. Missing <result> field.`)
    }
}

module.exports = { 
    postTransaction, 
    getPortfolio, 
    getTransactions,
    getInvestmentsInProject,
    getTransactionInfo
}