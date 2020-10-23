const repo = require('../persistence/repository')
const clients = require('../ae/client')
const logger = require('../logger')(module)
const err = require('../error/errors')
const config = require('../config')
const util = require('../ae/util')
const enums = require('../enums/enums')
const contracts = require('../ae/contracts')
const queueClient = require('../queue/queueClient')
const ws = require('../ws/server')
const { Universal, Crypto, Node, MemoryAccount, TxBuilder } = require('@aeternity/aepp-sdk')

/**
 * Updates record states for given transaction hash, after transaction has been mined or failed.
 * Return
 * @param {string} hash Transaction hash 
 * @returns {Array.<Object>} Returns list of records updated in db
 */
async function process(hash) {
    logger.info(`Processing transaction ${hash}`)

    let confirmations = config.get().numberOfConfirmations
    await clients.instance().poll(hash, {
        blocks: confirmations
    })
    let info = await clients.instance().getTxInfo(hash)
    logger.info(`Fetched tx info \n%o`, info)
    
    sendFundsIfRequired(info)
    
    let transactions
    if (info.returnType == 'ok') {
        logger.info(`Transaction ${hash} mined with return type ${info.returnType}.`)
        transactions = await handleTransactionMined(hash)
        if (transactions.length > 0 && transactions[0].originated_from !== null) {
            let originHash = transactions[0].originated_from
            repo.update(
                { hash: originHash },
                {
                    supervisor_status: enums.SupervisorStatus.PROCESSED
                }
            ).then(_ => {
                logger.info(`Updated origin transaction (${originHash}) supervisor state to processed.`)
            })
        }
    } else {
        logger.info(`Transaction ${hash} mined with return type ${info.returnType}.`)
        transactions = await handleTransactionFailed(hash, info)
    }

    return transactions
}

async function handleTransactionMined(hash) {
    logger.info(`Handling mined tx success case.`)
    let transactions = await repo.update(
        { hash: hash }, 
        {
            state: enums.TxState.MINED,
            processed_at: new Date()
        }
    )
    logger.info(`Updated total of ${transactions.length} transaction record(s) with hash ${hash}. State: ${enums.TxState.MINED}`)
    
    for (tx of transactions) {
        ws.notifySubscribersForTransaction(tx)
        callSpecialActions(tx)
    }
    return transactions
}

async function handleTransactionFailed(hash, info) {
    logger.warn(`Handling mined tx failed case.`)
    let decodedError = await err.decode(info)
    logger.warn(`Decoded error: ${decodedError}`)
    let transactions = await repo.update(
        { hash: hash }, 
        {
            state: enums.TxState.FAILED,
            error_message: decodedError,
            processed_at: new Date()
        }
    )
    logger.warn(`Updated total of ${transactions.length} transaction record(s) with hash ${hash}. State: ${enums.TxState.FAILED}`)
    for (tx of transactions) {
        ws.notifySubscribersForTransaction(tx)
    }
    return transactions
}

async function storeTransactionData(txHash, txData, txInfo, originatedFrom = null) {
    logger.debug(`Storing transaction records based on dry run result for transaction with precalculated hash ${txHash}. Parsing total of ${txInfo.log.length} event(s) emitted in transaction dry run result.`)
    for (event of txInfo.log) {
        let record = await generateTxRecord(txInfo, txHash, event, txData)
        await repo.saveTransaction({
            ...record,
            originated_from: originatedFrom
        })
        logger.debug(`Stored new record:\n%o`, record)
        ws.notifySubscribersForTransaction(record)
    }
    logger.debug(`Stored total of ${txInfo.log.length} record(s) for transaction with precalculated hash ${txHash}.`)
}

async function generateTxRecord(info, hash, event, txData) {
    let type = enums.fromEvent(event.topics[0])
    switch (type) {
        case enums.TxType.WALLET_CREATE:
            address = util.decodeAddress(event.topics[1])
            walletType = await repo.getWalletTypeOrThrow(address)
            supervisorStatus = (walletType == enums.WalletType.USER) ? enums.SupervisorStatus.REQUIRED : enums.SupervisorStatus.NOT_REQUIRED
            keypair = Crypto.generateKeyPair()
            workerKeyPair = (walletType == enums.WalletType.USER) ? {
                worker_public_key: keypair.publicKey,
                worker_secret_key: keypair.secretKey
            } : {}
            return {
                hash: hash,
                from_wallet: info.callerId,
                to_wallet: address,
                input: txData.callData,
                supervisor_status: supervisorStatus,
                type: enums.TxType.WALLET_CREATE,
                wallet: address,
                wallet_type: walletType,
                state: enums.TxState.PENDING,
                created_at: new Date(),
                ...workerKeyPair
            }
        case enums.TxType.ORG_CREATE:
            return {
                hash: hash,
                from_wallet: info.callerId,
                to_wallet: util.enforceAkPrefix(info.contractId),
                input: txData.callData,
                supervisor_status: enums.SupervisorStatus.NOT_REQUIRED,
                type: enums.TxType.ORG_CREATE,
                state: enums.TxState.PENDING,
                created_at: new Date()
            }
        case enums.TxType.PROJ_CREATE:
            toWallet = util.enforceAkPrefix(info.contractId)
            return {
                hash: hash,
                from_wallet: info.callerId,
                to_wallet: toWallet,
                input: txData.callData,
                supervisor_status: enums.SupervisorStatus.NOT_REQUIRED,
                type: enums.TxType.PROJ_CREATE,
                state: enums.TxState.PENDING,
                created_at: new Date()
            }
        case enums.TxType.SELL_OFFER_CREATE:
            toWallet = util.enforceAkPrefix(info.contractId)
            return {
                hash: hash,
                from_wallet: info.callerId,
                to_wallet: util.enforceAkPrefix(info.contractId),
                input: txData.callData,
                supervisor_status: enums.SupervisorStatus.NOT_REQUIRED,
                type: enums.TxType.SELL_OFFER_CREATE,
                wallet: toWallet,
                state: enums.TxState.PENDING,
                created_at: new Date()
            }
        case enums.TxType.DEPOSIT:
            address = util.decodeAddress(event.topics[1])
            amount = util.tokenToEur(event.topics[2])
            return {
                hash: hash,
                from_wallet: info.callerId,
                to_wallet: address,
                input: txData.callData,
                supervisor_status: enums.SupervisorStatus.NOT_REQUIRED,
                type: enums.TxType.DEPOSIT,
                amount: amount,
                state: enums.TxState.PENDING,
                created_at: new Date()
            }
        case enums.TxType.APPROVE:
            caller = util.decodeAddress(event.topics[1])
            spender = util.decodeAddress(event.topics[2])
            amount = util.tokenToEur(event.topics[3])
            eurOwner = await config.get().contracts.eur.owner()
            if (spender == eurOwner) {
                r = await repo.findByWalletOrThrow(caller)
                type = (r.wallet_type == enums.WalletType.PROJECT) ? enums.TxType.PENDING_PROJ_WITHDRAW : enums.TxType.APPROVE_USER_WITHDRAW
                supervisorStatus = enums.SupervisorStatus.NOT_REQUIRED
            } else {
                r = await repo.findByWalletOrThrow(spender)
                type = (r.type == enums.TxType.SELL_OFFER_CREATE) ? enums.TxType.APPROVE_COUNTER_OFFER : enums.TxType.APPROVE_INVESTMENT
                supervisorStatus = enums.SupervisorStatus.REQUIRED
            }
            return {
                hash: hash,
                from_wallet: info.callerId,
                to_wallet: util.enforceAkPrefix(spender),
                input: txData.callData,
                supervisor_status: supervisorStatus,
                type: type,
                amount: amount,
                state: enums.TxState.PENDING,
                created_at: new Date()
            }
        case enums.TxType.WITHDRAW:
            withdrawFrom = util.decodeAddress(event.topics[1])
            amount = util.tokenToEur(event.topics[2])
            return {
                hash: hash,
                from_wallet: withdrawFrom,
                to_wallet: info.callerId,
                input: txData.callData,
                supervisor_status: enums.SupervisorStatus.NOT_REQUIRED,
                type: enums.TxType.WITHDRAW,
                amount: amount,
                state: enums.TxState.PENDING,
                created_at: new Date()
            }
        case enums.TxType.INVEST:
            investor = util.decodeAddress(event.topics[1])
            amount = util.tokenToEur(event.topics[2])
            return {
                hash: hash,
                from_wallet: investor,
                to_wallet: util.enforceAkPrefix(info.contractId),
                input: txData.callData,
                supervisor_status: enums.SupervisorStatus.NOT_REQUIRED,
                type: enums.TxType.INVEST,
                amount: amount,
                state: enums.TxState.PENDING,
                created_at: new Date()
            }
        case enums.TxType.CANCEL_INVESTMENT:
            investor = util.decodeAddress(event.topics[1])
            amount = util.tokenToEur(event.topics[2])
            return {
                hash: hash,
                from_wallet: util.enforceAkPrefix(info.contractId),
                to_wallet: investor,
                input: txData.callData,
                supervisor_status: enums.SupervisorStatus.NOT_REQUIRED,
                type: enums.TxType.CANCEL_INVESTMENT,
                amount: amount,
                state: enums.TxState.PENDING,
                created_at: new Date()
            }
        case enums.TxType.START_REVENUE_PAYOUT:
            amount = util.tokenToEur(event.topics[1])
            return {
                hash: hash,
                from_wallet: info.callerId,
                to_wallet: util.enforceAkPrefix(info.contractId),
                input: txData.callData,
                supervisor_status: enums.SupervisorStatus.REQUIRED,
                type: enums.TxType.START_REVENUE_PAYOUT,
                amount: amount,
                state: enums.TxState.PENDING,
                created_at: new Date()
            }
        case enums.TxType.SHARE_PAYOUT:
            investor = util.decodeAddress(event.topics[1])
            share = util.tokenToEur(event.topics[2])
            return {
                hash: hash,
                from_wallet: util.enforceAkPrefix(info.contractId),
                to_wallet: investor,
                input: txData.callData,
                supervisor_status: enums.SupervisorStatus.NOT_REQUIRED,
                type: enums.TxType.SHARE_PAYOUT,
                amount: share,
                state: enums.TxState.PENDING,
                created_at: new Date()
            }
        case enums.TxType.COOP_OWNERSHIP_TRANSFER:
            newOwner = util.decodeAddress(event.topics[1])
            return {
                hash: hash,
                from_wallet: info.callerId,
                to_wallet: newOwner,
                input: txData.callData,
                supervisor_status: enums.SupervisorStatus.NOT_REQUIRED,
                type: enums.TxType.COOP_OWNERSHIP_TRANSFER,
                state: enums.TxState.PENDING,
                created_at: new Date()
            }
        case enums.TxType.EUR_OWNERSHIP_TRANSFER:
            newOwner = util.decodeAddress(event.topics[1])
            return {
                hash: hash,
                from_wallet: info.callerId,
                to_wallet: newOwner,
                input: txData.callData,
                supervisor_status: enums.SupervisorStatus.NOT_REQUIRED,
                type: enums.TxType.EUR_OWNERSHIP_TRANSFER,
                state: enums.TxState.PENDING,
                created_at: new Date()
            }
        case enums.TxType.COUNTER_OFFER_PLACED:
            buyerAddress = util.decodeAddress(event.topics[1])
            counterOfferPrice = util.tokenToEur(event.topics[2])
            return {
                hash: hash,
                from_wallet: buyerAddress,
                to_wallet: util.enforceAkPrefix(info.contractId),
                input: txData.callData,
                supervisor_status: enums.SupervisorStatus.NOT_REQUIRED,
                type: enums.TxType.COUNTER_OFFER_PLACED,
                amount: counterOfferPrice,
                state: enums.TxState.PENDING,
                created_at: new Date()
            }
        case enums.TxType.COUNTER_OFFER_REMOVED:
            buyerAddress = util.decodeAddress(event.topics[1])
            return {
                hash: hash,
                from_wallet: buyerAddress,
                to_wallet: util.enforceAkPrefix(info.contractId),
                input: txData.callData,
                supervisor_status: enums.SupervisorStatus.NOT_REQUIRED,
                type: enums.TxType.COUNTER_OFFER_REMOVED,
                state: enums.TxState.PENDING,
                created_at: new Date()
            }
        case enums.TxType.SHARES_SOLD:
            buyerAddress = util.decodeAddress(event.topics[1])
            sellerAddress = util.decodeAddress(event.topics[2])
            price = util.tokenToEur(event.topics[3])
            offerInfo = await getSellOfferInfo(info.contractId)
            projectShares = util.tokenToEur(offerInfo[2])
            projectContract = offerInfo[0]
            return {
                hash: hash,
                from_wallet: sellerAddress,
                to_wallet: buyerAddress,
                input: `${projectContract};${price}`,
                supervisor_status: enums.SupervisorStatus.NOT_REQUIRED,
                type: enums.TxType.SHARES_SOLD,
                amount: projectShares,
                state: enums.TxState.PENDING,
                created_at: new Date()
            }
        default:
            throw new Error(`Unknown transaction processed! Hash: ${hash}`)
    }
}

async function sendFundsIfRequired(info) {
    let callerBalance = await clients.instance().getBalance(info.callerId)
    let giftAmount = config.get().giftAmount
    let threshold = config.get().refundThreshold
    if (callerBalance < util.toToken(threshold)) {
        logger.info(`Sending funds to caller wallet. Balance fell below ${threshold} AE threshold after processing last transaction.`)
        queueClient.publishSendFundsJob(info.callerId, giftAmount)
    } else {
        logger.info("Not sending funds to caller wallet. Wallet has enough funds after processing last transaction.")
    }
}

async function callSpecialActions(tx) {
    if (tx.supervisor_status == enums.SupervisorStatus.REQUIRED) {
        logger.info(`Special action call required for record with type ${tx.type} originated from transaction with hash ${tx.hash}`)
        if (tx.type == enums.TxType.APPROVE_INVESTMENT) {
            let investorWalletCreationTx = await repo.findByWalletOrThrow(tx.from_wallet)
            let projectWalletCreationTx = await repo.findByWalletOrThrow(tx.to_wallet)
            let investorWallet = investorWalletCreationTx.wallet
            let investorWorkerKeyPair = {
                publicKey: investorWalletCreationTx.worker_public_key,
                secretKey: investorWalletCreationTx.worker_secret_key
            }
            let projectContractAddress = util.enforceCtPrefix(projectWalletCreationTx.wallet)
            logger.info(`Calling approve investment for user ${investorWallet} and project ${projectContractAddress}.`)
            let client = await Universal({
                nodes: [
                    { name: "node", instance: clients.node() }
                ],
                compilerUrl: config.get().node.compilerUrl,
                accounts: [
                    MemoryAccount({ keypair: investorWorkerKeyPair })
                ],
                address: investorWorkerKeyPair.publicKey,
                networkId: config.get().node.networkId
            })
            let dryRunResult = await client.contractCallStatic(
                contracts.projSource,
                projectContractAddress,
                enums.functions.proj.invest,
                [ investorWallet ]
            )
            logger.info(`Approve investment dry run result: %o`, dryRunResult)
            let signedTx = await client.signTransaction(dryRunResult.tx.encodedTx)
            let precalculatedHash = await TxBuilder.buildTxHash(signedTx)
            logger.info(`Approve investment precalculated hash: ${precalculatedHash}. Caching transaction data...`)
            await storeTransactionData(precalculatedHash, dryRunResult.tx.params, dryRunResult.result, tx.hash)
            logger.info(`Approve investment transaction cached. Posting transaction to blockchain.`)
            let result = await client.sendTransaction(signedTx, {
                verify: true,
                waitMined: false
            })
            logger.info(`Approve investment transaction posted to blockchain and will be added to tx processor queue.`)
            process(result.hash)
        } else if (tx.type == enums.TxType.START_REVENUE_PAYOUT) {
            let projectManagerWalletCreationTx = await repo.findByWalletOrThrow(tx.from_wallet)
            let projectWalletCreationTx = await repo.findByWalletOrThrow(tx.to_wallet)
            let projectManagerWorkerKeyPair = {
                publicKey: projectManagerWalletCreationTx.worker_public_key,
                secretKey: projectManagerWalletCreationTx.worker_secret_key
            }
            let projectContractAddress = util.enforceCtPrefix(projectWalletCreationTx.wallet)
            let client = await Universal({
                nodes: [
                    { name: "node", instance: clients.node() }
                ],
                compilerUrl: config.get().node.compilerUrl,
                accounts: [
                    MemoryAccount({ keypair: projectManagerWorkerKeyPair })
                ],
                address: projectManagerWorkerKeyPair.publicKey,
                networkId: config.get().node.networkId
            })
            logger.info(`Calling revenue share payout for project ${projectContractAddress}.`)
            var batchCount = 0
            do {
                dryRunResult = await client.contractCallStatic(
                    contracts.projSource,
                    projectContractAddress,
                    enums.functions.proj.payoutRevenueSharesBatch,
                    [ ]
                )
                logger.info(`Revenue batch payout dry run result: %o`, dryRunResult)
                let signedTx = await client.signTransaction(dryRunResult.tx.encodedTx)
                let precalculatedHash = await TxBuilder.buildTxHash(signedTx)
                logger.info(`Revenue batch payout precalculated hash: ${precalculatedHash}. Caching transaction data...`)
                await storeTransactionData(precalculatedHash, dryRunResult.tx.params, dryRunResult.result, tx.hash)
                logger.info(`Revenue batch payout transaction cached. Posting transaction to blockchain.`)
                let result = await client.sendTransaction(signedTx, {
                    waitMined: true,
                    verify: true
                })
                logger.info(`Revenue batch payout transaction posted to blockchain and mined. It will be posted to tx processor queue...`)
                info = await client.getTxInfo(result.hash)
                shouldPayoutAnotherBatch = await client.contractDecodeData(contracts.projSource, enums.functions.proj.payoutRevenueSharesBatch, info.returnValue, info.returnType)
                batchCount++
                logger.info(`Payed out batch #${batchCount}.`)
                process(result.hash)
            } while(shouldPayoutAnotherBatch)
            logger.info(`All batches payed out.`)
        } else if (tx.type == enums.TxType.APPROVE_COUNTER_OFFER) {
            let buyerWalletCreationTx = await repo.findByWalletOrThrow(tx.from_wallet)
            let sellOfferContract = util.enforceCtPrefix(tx.to_wallet)
            let buyerWallet = buyerWalletCreationTx.wallet
            let buyerWorkerKeyPair = {
                publicKey: buyerWalletCreationTx.worker_public_key,
                secretKey: buyerWalletCreationTx.worker_secret_key
            }
            logger.info(`Calling tryToSettle for user ${buyerWallet} and sell offer ${sellOfferContract}.`)
            let client = await Universal({
                nodes: [
                    { name: "node", instance: clients.node() }
                ],
                compilerUrl: config.get().node.compilerUrl,
                accounts: [
                    MemoryAccount({ keypair: buyerWorkerKeyPair })
                ],
                address: buyerWorkerKeyPair.publicKey,
                networkId: config.get().node.networkId
            })
            let dryRunResult = await client.contractCallStatic(
                contracts.sellOfferSource,
                sellOfferContract,
                enums.functions.sellOffer.tryToSettle,
                [ buyerWallet ]
            )
            logger.info(`Market tryToSettle dry run result %o`, dryRunResult)
            let signedTx = await client.signTransaction(dryRunResult.tx.encodedTx)
            let precalculatedHash = await TxBuilder.buildTxHash(signedTx)
            logger.info(`Market tryToSettle precalculated hash: ${precalculatedHash}. Caching transaction data...`)
            await storeTransactionData(precalculatedHash, dryRunResult.tx.params, dryRunResult.result, tx.hash)
            logger.info(`Market tryToSettletransaction cached. Posting transaction to blockchain.`)
            let result = await client.sendTransaction(signedTx, {
                waitMined: false,
                verify: true
            })
            logger.info(`Market tryToSettle transaction posted to blockchain and will be added to tx processor queue.`)
            process(result.hash)
        } else if (tx.type == enums.TxType.WALLET_CREATE && tx.wallet_type == enums.WalletType.USER) {
            queueClient.publishJobFromTx(tx)
        }
    }
}

async function getSellOfferInfo(sellOfferContract) {
    let result = await clients.instance().contractCallStatic(
        contracts.sellOfferSource,
        sellOfferContract,
        enums.functions.sellOffer.getOffer,
        [ ],
        {
            callerId: Crypto.generateKeyPair().publicKey
        }
    )
    let resultDecoded = await result.decode()
    return resultDecoded
}

module.exports = {
    process, storeTransactionData
}