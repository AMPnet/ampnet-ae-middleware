const repo = require('../persistence/repository')
const client = require('../ae/client')
const logger = require('../logger')(module)
const err = require('../error/errors')
const config = require('../config')
const util = require('../ae/util')
const enums = require('../enums/enums')
const { UniversalCrypto } = require('@aeternity/aepp-sdk')

/**
 * Fetches and processes transaction events for given tx hash.
 * Return
 * @param {string} hash Transaction hash 
 * @returns {Array.<Object>} Returns list of records saved in db which represent one parsed event each
 */
async function process(hash) {
    try {
        logger.info(`Processing transaction ${hash}`)
        await repo.saveHash(hash)
        let poll = await client.instance().poll(hash)
        let info = await client.instance().getTxInfo(hash)
        logger.info(`Fetched tx info \n%o`, info)
        if (info.returnType == 'ok') {
            logger.info(`Transaction ${hash} mined with return type OK.`)
            let transactions = await handleTransactionMined(info, poll)
            return transactions
        } else {
            logger.info(`Transaction ${hash} mined with return type ${info.returnType}.`)
            await handleTransactionFailed(info, hash)
            return []
        }
    } catch(error) {
        logger.error(`Error while processing transaction \n%o`, error)
    }
}

async function handleTransactionMined(info, poll) {
    logger.info(`Handling mined tx success case.`)
    let transactions = new Array()
    for (event of info.log) {
        logger.info(`Parsing event ${event.topics[0]}`)
        type = enums.fromEvent(event.topics[0], poll)
        logger.info(`Parsed event type: ${type}`)
        tx = await updateTransactionState(info, poll, type)
        logger.info(`Updated state. Saved tx: \n%o`, tx)
        callSpecialActions(tx)
        transactions.push(tx)
    }
    return transactions
}

async function handleTransactionFailed(txInfo, hash) {
    logger.warn(`Handling mined tx failed case.`)
    decodedError = await err.decode(txInfo)
    logger.warn(`Decoded error: ${decodedError}`)
    await repo.update(hash, {
        state: enums.TxState.FAILED,
        error_message: decodedError
    })
    logger.warn(`Updated tx state to failed.`)
}

async function updateTransactionState(info, poll, type) {
    logger.info(`Updating transaction state in database.`)
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
            return repo.update(poll.hash, {
                from_wallet: info.callerId,
                to_wallet: address,
                input: poll.tx.callData,
                state: enums.TxState.MINED,
                supervisor_status: supervisorStatus,
                type: enums.TxType.WALLET_CREATE,
                wallet: address,
                wallet_type: walletType,
                processed_at: new Date(),
                ...workerKeyPair
            })
        case enums.TxType.ORG_CREATE:
            return repo.update(poll.hash, {
                from_wallet: info.callerId,
                to_wallet: util.enforceAkPrefix(info.contractId),
                input: poll.tx.callData,
                state: enums.TxState.MINED,
                supervisor_status: enums.SupervisorStatus.NOT_REQUIRED,
                type: enums.TxType.ORG_CREATE,
                processed_at: new Date()
            })
        case enums.TxType.PROJ_CREATE:
            return repo.update(poll.hash, {
                from_wallet: info.callerId,
                to_wallet: util.enforceAkPrefix(info.contractId),
                input: poll.tx.callData,
                state: enums.TxState.MINED,
                supervisor_status: enums.SupervisorStatus.NOT_REQUIRED,
                type: enums.TxType.PROJ_CREATE,
                processed_at: new Date()
            })
        case enums.TxType.DEPOSIT:
            address = util.decodeAddress(event.topics[1])
            amount = util.tokenToEur(event.topics[2])
            return repo.update(poll.hash, {
                from_wallet: info.callerId,
                to_wallet: address,
                input: poll.tx.callData,
                state: enums.TxState.MINED,
                supervisor_status: enums.SupervisorStatus.NOT_REQUIRED,
                type: enums.TxType.DEPOSIT,
                amount: amount,
                processed_at: new Date()
            })
        case enums.TxType.APPROVE:
            spender = util.decodeAddress(event.topics[1])
            amount = util.tokenToEur(event.topics[2])
            type = (spender == config.get().contracts.eur.owner) ? enums.TxType.APPROVE_USER_WITHDRAW : enums.TxType.APPROVE_INVESTMENT
            supervisorStatus = (type == enums.TxType.APPROVE_INVESTMENT) ? enums.SupervisorStatus.REQUIRED : enums.SupervisorStatus.NOT_REQUIRED
            return repo.update(poll.hash, {
                from_wallet: info.callerId,
                to_wallet: spender,
                input: poll.tx.callData,
                state: enums.TxState.MINED,
                supervisor_status: supervisorStatus,
                type: type,
                amount: amount,
                processed_at: new Date()
            })
        case enums.TxType.WITHDRAW:
            withdrawFrom = util.decodeAddress(event.topics[1])
            amount = util.tokenToEur(event.topics[2])
            return repo.update(poll.hash, {
                from_wallet: withdrawFrom,
                to_wallet: info.callerId,
                input: poll.tx.callData,
                state: enums.TxState.MINED,
                supervisor_status: enums.SupervisorStatus.NOT_REQUIRED,
                type: enums.TxType.WITHDRAW,
                amount: amount,
                processed_at: new Date()
            })
        case enums.TxType.INVEST:
            investor = util.decodeAddress(event.topics[1])
            amount = util.tokenToEur(event.topics[2])
            return repo.update(poll.hash, {
                from_wallet: investor,
                to_wallet: util.enforceAkPrefix(info.contractId),
                input: poll.tx.callData,
                state: enums.TxState.MINED,
                supervisor_status: enums.SupervisorStatus.NOT_REQUIRED,
                type: enums.TxType.INVEST,
                amount: amount,
                processed_at: new Date()
            })
        case enums.TxType.START_REVENUE_PAYOUT:
            amount = util.tokenToEur(event.topics[1])
            return repo.update(poll.hash, {
                from_wallet: info.callerId,
                to_wallet: util.enforceAkPrefix(info.contractId),
                input: poll.tx.callData,
                state: enums.TxState.MINED,
                supervisor_status: enums.SupervisorStatus.REQUIRED,
                type: enums.TxType.START_REVENUE_PAYOUT,
                amount: amount,
                processed_at: new Date()
            })
        case enums.TxType.SHARE_PAYOUT:
            investor = util.decodeAddress(event.topics[1])
            share = util.tokenToEur(event.topics[2])
            return repo.update(poll.hash, {
                from_wallet: util.enforceAkPrefix(info.contractId),
                to_wallet: investor,
                input: poll.tx.callData,
                state: enums.TxState.MINED,
                supervisor_status: enums.SupervisorStatus.NOT_REQUIRED,
                type: enums.TxType.SHARE_PAYOUT,
                amount: share,
                processed_at: new Date()
            })
        default:
            throw new Error(`Unknown transaction processed! Hash: ${poll.hash}`)
    }
}

async function callSpecialActions(tx) {
    if (tx.type == enums.TxType.APPROVE_INVESTMENT) {
        let investorWalletCreationTx = await repo.findByWalletOrThrow(tx.from_wallet)
        let investorWorkerKeyPair = {
            publicKey: investorWalletCreationTx.worker_public_key,
            secretKey: investorWalletCreationTx.worker_secret_key
        }
        let client = 
    }
}

module.exports = {
    process
}