let client = require('../ae/client')
let codec = require('../ae/codec')
let contracts = require('../ae/contracts')
let functions = require('../enums/enums').functions
let repo = require('../persistence/repository')
let util = require('../ae/util')
let err = require('../error/errors')

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
        let callData = await codec.coop.encodeAddWallet(address)
        let coopAddress = config.get().contracts.coop.address
        let tx = await client.instance().contractCallTx({
            callerId : config.get().contracts.coop.owner,
            contractId : coopAddress,
            amount : 0,
            gas : 10000,
            callData : callData
        })
        logger.debug('Successfully generated addWallet transaction \n%o', tx)
        callback(null, { tx: tx })
    } catch (error) {
        logger.error(`Error generating addWallet transaction \n%o`, error)
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
            [ tx.wallet ]
        )
        let resultDecoded = await result.decode()
        logger.debug(`Wallet active: ${resultDecoded}`)
        callback(null, { active: resultDecoded })
    } catch (error) {
        logger.error(`Error fetching wallet active status \n%o`, error)
        err.handle(error, callback)
    }
}

module.exports = { 
    addWallet,
    walletActive
}