let client = require('../ae/client')
let codec = require('../ae/codec')
let contracts = require('../ae/contracts')
let repo = require('../persistence/repository')
let err = require('../error/errors')

let logger = require('../logger')(module)

async function createOrganization(call, callback) {
    try {
        logger.debug(`Received request to generate createOrganization transaction. Caller: ${call.request.fromTxHash}`)
        let walletTx = await repo.findByHashOrThrow(call.request.fromTxHash)
        logger.debug(`Address represented by given hash: ${walletTx.wallet}`)
        let callData = await codec.org.encodeCreateOrganization()
        let result = await client.instance().contractCreateTx({
            ownerId: walletTx.wallet,
            code: contracts.getOrgCompiled().bytecode,
            abiVersion: 3,
            deposit: 0,
            amount: 0,
            gas: 50000,
            callData: callData
        })
        logger.debug(`Successfully generated createOrganization transaction!`)
        callback(null, { tx: result.tx })
    } catch (error) {
        logger.error(`Error while generating organization create transaction \n%o`, error)
        err.handle(error, callback)
    }
}

module.exports = { createOrganization }