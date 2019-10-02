let { TxBuilder: TxBuilder } = require('@aeternity/aepp-sdk')

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

let { TxState, TxType, WalletType, SupervisorStatus } = require('../enums/enums')

async function postTransaction(call, callback) {
    logger.debug(`Received request to post transaction`)
    try {
        let tx = call.request.data
        await performSecurityChecks(tx)
        let result = await client.instance().sendTransaction(tx, { waitMined: false })
        txProcessor.process(result.hash).then(
            records => {
                records.forEach(record => {
                    if (record.supervisor_status == SupervisorStatus.REQUIRED) {
                        logger.info('Supervisor action required. Creating a job.')
                        supervisor.publishJobFromTx(record)
                    }
                })
            },
            error => {
                logger.error(`Processing of transaction ${result.hash} failed with error: \n%o`, error)
            }
        )
        logger.debug(`Transaction successfully broadcasted! Tx hash: ${result.hash}`)
        callback(null, { txHash: result.hash })
    } catch(error) {
        logger.error("Error while posting transaction \n%o", call.request.data)
        logger.error("Error log \n%o", error)
        err.handle(error, callback)
    }
}

async function getPortfolio(call, callback) {
    logger.debug(`Received request to fetch portfolio for user with wallet txHash ${call.request.txHash}`)
    try {
        let tx = await repo.findByHashOrThrow(call.request.txHash)
        logger.debug(`Address represented by given hash: ${tx.wallet}`)

        let portfolioMap = new Map()
        let records = await repo.get({
            from_wallet: tx.wallet,
            type: TxType.INVEST,
            state: TxState.MINED
        })
        let recordsLength = records.length

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

async function getTransactions(call, callback) {
    logger.debug(`Received request to fetch transactions for user with wallet txHash ${call.request.txHash}`)
    try {
        let tx = await repo.findByHashOrThrow(call.request.txHash)
        logger.debug(`Address represented by given hash: ${tx.wallet}`)
        let types = new Set([TxType.DEPOSIT, TxType.WITHDRAW, TxType.INVEST, TxType.SHARE_PAYOUT])
        let transactionsPromisified = (await repo.getUserTransactions(tx.wallet))
            .filter(r => { return types.has(r.type) && r.state == TxState.MINED }) 
            .map(r => {
                switch (r.type) {
                    case TxType.DEPOSIT:
                    case TxType.WITHDRAW:
                        return new Promise(resolve => {
                            resolve({
                                amount: r.amount,
                                type: enums.txTypeToGrpc(r.type),
                                date: (new Date(r.processed_at)).getTime()
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
                                    date: (new Date(r.processed_at)).getTime()
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
                                    date: (new Date(r.processed_at)).getTime()
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
        let investments = (await repo.getUserTransactions(investorTx.wallet))
            .filter(tx => {
                return tx.type == TxType.INVEST && tx.to_wallet == projectTx.wallet
            })
            .map(tx => {
                return {
                    amount: tx.amount,
                    date: (new Date(tx.processed_at)).getTime()
                }
            })
        logger.debug(`Successfully fetched investments \n%o`, investments)
        callback(null, { transactions: investments })
    } catch (error) {
        logger.error(`Error while fetching transactions \n%o`, error)
        err.handle(error, callback)
    }
}



async function performSecurityChecks(data) {
    let txMetadata = TxBuilder.unpackTx(data)
    if (txMetadata.txType != 'signedTx') {
        throw err.generate(ErrorType.TX_NOT_SIGNED)
    }
    let unpackedTx = txMetadata.tx.encodedTx

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

async function handleSupervisorAction(tx) {
    switch (tx.type) {
        case TxType.WALLET_CREATE:
            if (tx.wallet_type == WalletType.USER) {
                giftAmountAe = config.get().giftAmount
                if (giftAmountAe > 0) {
                    await client.instance().spend(giftAmountAe * 1000000000000000000, tx.wallet)
                    logger.info(`SUPERVISOR: Transferred ${giftAmountAe}AE to user with wallet ${tx.wallet} (welcome gift)`)
                    await repo.update(tx.hash, { supervisor_status: SupervisorStatus.PROCESSED })
                    logger.info(`SUPERVISOR: Updated SUPERVISOR_STATUS in original transaction.`)
                } else {
                    logger.info(`SUPERVISOR: Not sending welcome gift. (amount in config set to 0)`)
                }
            }
            break
        case TxType.APPROVE_INVESTMENT:
            contract = util.enforceCtPrefix(tx.to_wallet)
            logger.info(`SUPERVISOR: Calling invest() on Project Contract ${contract}`)
            result = await client.instance().contractCall(
                contracts.projSource,
                contract,
                enums.functions.proj.invest,
                [ tx.from_wallet ]
            )
            logger.info(`SUPERVISOR: Call result: \n%o`, result)
            await repo.update(tx.hash, { supervisor_status: SupervisorStatus.PROCESSED })
            logger.info(`SUPERVISOR: Updated SUPERVISOR_STATUS in original transaction.`)
            process(result.hash)
            break 
        case TxType.START_REVENUE_PAYOUT:
            contract = util.enforceCtPrefix(tx.to_wallet)
            logger.info(`SUPERVISOR: Starting multiple calls on payout_revenue_shares() until all investors on project ${contract} are payed out.`)
            batchCount = 1 
            do {
                logger.info(`Call #${batchCount} on payout_revenue_shares()`)
                batchPayout = await client.instance().contractCall(
                    contracts.projSource,
                    contract,
                    enums.functions.proj.payoutRevenueSharesBatch,
                    [ ]
                )
                logger.info(`SUPERVISOR: Call result: \n%o`, batchPayout)
                shouldPayoutAnotherBatch = await batchPayout.decode()
                logger.info(`SUPERVISOR: Need to call again to payout next batch? ${shouldPayoutAnotherBatch}`)
                batchCount++
                process(batchPayout.hash)
            } while(shouldPayoutAnotherBatch)
            logger.info(`SUPERVISOR: All batches payed out.`)
            await repo.update(tx.hash, { supervisor_status: SupervisorStatus.PROCESSED })
            logger.info(`SUPERVISOR: Updated SUPERVISOR_STATUS in original transaction.`)
            break
        default:
            throw new Error(`Supervisor cannot process provided transaction type: ${tx.type}`)
    }
}

async function checkTxCaller(callerId) {
    let coopAuthorityId = config.get().contracts.coop.owner
    let issuingAuthorityId = config.get().contracts.eur.owner
    
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
    switch (tx.code) {
        case contracts.getOrgCompiled().bytecode:
            callData = await codec.decodeDataBySource(contracts.orgSource, "init", tx.callData)
            if (callData.arguments[0].value != config.get().contracts.coop.address) {
                throw err.generate(ErrorType.GROUP_INVALID_COOP_ARG)
            }
            break
        case contracts.getProjCompiled().bytecode:
            callData = await codec.decodeDataBySource(contracts.projSource, "init", tx.callData)
            orgAddress = callData.arguments[0].value
            isOrgActive = await isWalletActive(orgAddress)
            if (!isOrgActive) {
                throw err.generate(ErrorType.PROJ_INVALID_GROUP_ARG)
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
        [ address ]
    )
    return result.decode()
}

module.exports = { 
    postTransaction, 
    getPortfolio, 
    getTransactions,
    getInvestmentsInProject
}