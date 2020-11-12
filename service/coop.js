let client = require('../ae/client')
let codec = require('../ae/codec')
let contracts = require('../ae/contracts')
let functions = require('../enums/enums').functions
let repo = require('../persistence/repository')
let util = require('../ae/util')
let err = require('../error/errors')
let { Crypto } = require('@aeternity/aepp-sdk')

let config = require('../config')
let logger = require('../logger')(module)

async function addWallet(call, callback) {
    logger.debug(`Received request to generate addWallet transaction. Wallet: ${call.request.wallet}`)
    try {
        if (call.request.wallet.startsWith("th")) {
            let txInfo = await client.instance().getTxInfo(call.request.wallet)
            address = util.enforceAkPrefix(txInfo.contractId)
        } else {
            address = call.request.wallet
        }
        let existingWalletRecords = (await repo.get({
            wallet: address
        }))
        if (existingWalletRecords.length > 0) {
            throw err.generate(err.type.WALLET_ALREADY_EXISTS)
        }
        let callData = await codec.coop.encodeAddWallet(address)
        let coopAddress = config.get().contracts.coop.address
        let coopOwner = await config.get().contracts.coop.owner()
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
        logger.debug(`Address represented by given hash: ${tx.wallet}`)
        let result = await client.instance().contractCallStatic(
            contracts.coopSource, 
            config.get().contracts.coop.address,
            functions.coop.isWalletActive, 
            [ tx.wallet ],
            {
                callerId: Crypto.generateKeyPair().publicKey
            }
        )
        let resultDecoded = await result.decode()
        logger.debug(`Wallet active: ${resultDecoded}`)
        callback(null, { active: resultDecoded })
    } catch (error) {
        logger.error(`Error fetching wallet active status \n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

async function getPlatformManager(call, callback) {
    logger.debug(`Received request to fetch platform manager wallet.`)
    try {
        let result = await client.instance().contractCallStatic(
            contracts.coopSource,
            config.get().contracts.coop.address,
            functions.coop.getOwner,
            [ ],
            {
                callerId: Crypto.generateKeyPair().publicKey
            }
        )
        let resultDecoded = await result.decode()
        logger.debug(`Fetched platform manager: ${resultDecoded}`)
        callback(null, { wallet: resultDecoded })
    } catch (error) {
        logger.error(`Error while fetching platform manager wallet:\n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

async function transferOwnership(call, callback) {
    logger.debug(`Received request to generate platform manager ownership transaction. New owner: ${call.request.newOwnerWallet}`)
    try {
        let callData = await codec.coop.encodeTransferCoopOwnership(call.request.newOwnerWallet)
        let coopOwner = await config.get().contracts.coop.owner()
        let tx = await client.instance().contractCallTx({
            callerId: coopOwner,
            contractId: config.get().contracts.coop.address,
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
    addWallet,
    walletActive,
    getPlatformManager,
    transferOwnership
}