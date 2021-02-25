let client = require('../ae/client')
let codec = require('../ae/codec')
let contracts = require('../ae/contracts')
let repo = require('../persistence/repository')
let err = require('../error/errors')
let config = require('../config')

let logger = require('../logger')(module)

async function createOrganization(call, callback) {
    try {
        logger.info(`Received request to generate createOrganization transaction. Caller: ${call.request.fromTxHash}`)
        let walletTx = await repo.findByHashOrThrow(call.request.fromTxHash)
        logger.debug(`Address represented by given hash: ${walletTx.wallet}`)
        let callData = await codec.org.encodeCreateOrganization(walletTx.coop_contract)
        logger.debug(`Encoded call data: ${callData}`)
        let result = await client.instance().contractCreateTx({
            ownerId: walletTx.wallet,
            code: contracts.getOrgCompiled().bytecode,
            abiVersion: 3,
            deposit: 0,
            amount: 0,
            gas: config.get().contractCreateGasAmount,
            callData: callData
        })
        logger.info(`Successfully generated createOrganization transaction!`)
        callback(null, { tx: result.tx })
    } catch (error) {
        logger.error(`Error while generating organization create transaction \n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

module.exports = { createOrganization }