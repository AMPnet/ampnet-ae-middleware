let client = require('../ae/client')
let codec = require('../ae/codec')
let contracts = require('../ae/contracts')
let functions = require('../enums/enums').functions
let repo = require('../persistence/repository')
let util = require('../ae/util')
let err = require('../error/errors')
let queueClient = require('../queue/queueClient')
let { Crypto } = require('@aeternity/aepp-sdk')

let config = require('../config')
let logger = require('../logger')(module)

async function createCooperative(call, callback) {
    try {
        let coopId = call.request.coop
        let adminWallet = call.request.wallet
        logger.info(`Received request to create cooperative with admin ${adminWallet} and coopId ${coopId}`)
        queueClient.publishCreateCoopJob(coopId, adminWallet)
        callback(null, {})
    } catch (error) {
        logger.error(`Error while posting createCooperative job`, err.pretty(error))
        err.handle(error, callback)
    }
}

async function addWallet(call, callback) {
    try {
        logger.debug(`Received request to generate addWallet transaction. Wallet: ${call.request.wallet} Coop: ${call.request.coop}`)

        let coopInfo = await repo.getCooperative(call.request.coop)
        if (call.request.wallet.startsWith("th")) {
            let txInfo = await client.instance().getTxInfo(call.request.wallet)
            address = util.enforceAkPrefix(txInfo.contractId)
        } else {
            address = call.request.wallet
        }
        let existingWalletRecords = (await repo.get({
            wallet: address,
            coop_id: coopInfo.id
        }))
        if (existingWalletRecords.length > 0) {
            throw err.generate(err.type.WALLET_ALREADY_EXISTS)
        }
        let callData = await codec.coop.encodeAddWallet(address)
        logger.debug(`Encoded call data: ${callData}`)
        let coopAddress = coopInfo.coop_contract
        let coopOwner = coopInfo.coop_owner
        let tx = await client.instance().contractCallTx({
            callerId : coopOwner,
            contractId : coopAddress,
            amount : 0,
            gas : config.get().contractCallGasAmount,
            callData : callData
        })
        logger.debug('Successfully generated addWallet transaction \n%o', tx)
        callback(null, { tx: tx })
    } catch (error) {
        logger.error(`Error generating addWallet transaction \n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

async function walletActive(call, callback) {
    logger.debug(`Received request to check is wallet with txHash ${call.request.walletTxHash} active.`)
    try {
        let tx = await repo.findByHashOrThrow(call.request.walletTxHash)
        logger.debug(`Address represented by given hash: ${tx.wallet}; Coop: ${tx.coop_id}`)
        let result = await client.instance().contractCallStatic(
            contracts.coopSource, 
            tx.coop_contract,
            functions.coop.isWalletActive, 
            [ tx.wallet ],
            {
                callerId: Crypto.generateKeyPair().publicKey
            }
        )
        logger.debug(`Received static call result: %o`, result)
        let resultDecoded = await result.decode()
        logger.debug(`Wallet active: ${resultDecoded}`)
        callback(null, { active: resultDecoded })
    } catch (error) {
        logger.error(`Error fetching wallet active status \n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

async function getPlatformManager(call, callback) {
    try {
        logger.debug(`Received request to fetch platform manager wallet for coop ${call.request.coop}.`)
        let coopInfo = await repo.getCooperative(call.request.coop)
        let result = await client.instance().contractCallStatic(
            contracts.coopSource,
            coopInfo.coop_contract,
            functions.coop.getOwner,
            [ ],
            {
                callerId: Crypto.generateKeyPair().publicKey
            }
        )
        logger.debug(`Received static call result: %o`, result)
        let resultDecoded = await result.decode()
        logger.debug(`Fetched platform manager: ${resultDecoded}`)
        callback(null, { wallet: resultDecoded })
    } catch (error) {
        logger.error(`Error while fetching platform manager wallet:\n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

async function transferOwnership(call, callback) {
    try {
        logger.debug(`Received request to generate platform manager ownership transaction. New owner: ${call.request.newOwnerWallet}; Coop: ${call.request.coop}`)
        let newOwnerWallet = call.request.newOwnerWallet
        let coopInfo = await repo.getCooperative(call.request.coop)
        let callData = await codec.coop.encodeTransferCoopOwnership(newOwnerWallet)
        logger.debug(`Encoded call data: ${callData}`)
        let tx = await client.instance().contractCallTx({
            callerId: coopInfo.coop_owner,
            contractId: coopInfo.coop_contract,
            amount: 0,
            gas: config.get().contractCallGasAmount,
            callData: callData
        })
        logger.debug('Successfully generated transferOwnership transaction \n%o', tx)
        callback(null, { tx: tx })
    } catch(error) {
        logger.error(`Error while generating platform manager ownership change transaction:\n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

module.exports = { 
    createCooperative,
    addWallet,
    walletActive,
    getPlatformManager,
    transferOwnership
}