let { Crypto } = require('@aeternity/aepp-sdk')
let grpcErrors = require('grpc-errors')
let client = require('../ae/client')

let type = {
    TX_NOT_SIGNED: "01",
    TX_NOT_MINED: "02",
    TX_INVALID_CONTRACT_CALLED: "03",
    WALLET_NOT_FOUND: "10",
    WALLET_CREATION_FAILED: "11",
    WALLET_CREATION_PENDING: "12",
    GROUP_INVALID_COOP_ARG: "20",
    PROJ_INVALID_GROUP_ARG: "30",
    AEPP_SDK_ERROR: "40",
    MALFORMED_CONTRACT_CODE: "90",
    GENERIC_ERROR: "99"
}

let DefaultMessages = new Map([
    [type.TX_NOT_SIGNED, "Transaction not signed. Aborting."],
    [type.TX_INVALID_CONTRACT_CALLED, "Invalid contract called! Contract not part of Cooperative contracts collection."],
    [type.GROUP_INVALID_COOP_ARG, "Error while creating Group. Invalid Coop contract provided as argument!"],
    [type.PROJ_INVALID_GROUP_ARG, "Error while creating Project. Invalid Group contract provided as argument!"],
    [type.MALFORMED_CONTRACT_CODE, "Error while deploying Contract. Malformed code. Can only deploy official AMPnet Contracts."],
    [type.GENERIC_ERROR, "Unknown error occured."],
    [type.WALLET_NOT_FOUND, "Wallet not found!"],
    [type.WALLET_CREATION_PENDING, "Wallet creation transaction still pending!"],
    [type.WALLET_CREATION_FAILED, "Wallet creation transaction failed!"],
    [type.AEPP_SDK_ERROR, "Ae Sdk error was thrown."]
])

function generate(errorType, message = DefaultMessages.get(errorType)) {
    let errorData = `${errorType} > ${message}`
    switch (errorType) {
        case type.MALFORMED_CONTRACT_CODE:
        case type.WALLET_NOT_FOUND:
        case type.WALLET_CREATION_FAILED:
        case type.WALLET_CREATION_PENDING:
        case type.TX_NOT_SIGNED: return new grpcErrors.FailedPreconditionError(errorData)
        
        case type.TX_INVALID_CONTRACT_CALLED:
        case type.GROUP_INVALID_COOP_ARG:
        case type.PROJ_INVALID_GROUP_ARG: return new grpcErrors.InvalidArgumentError(errorData)
        
        case type.AEPP_SDK_ERROR:
        case type.GENERIC_ERROR: return new grpcErrors.AbortedError(errorData)
    }
}

function handle(error, callback) {
    if (typeof error.response !== 'undefined') {
        callback(generate(type.AEPP_SDK_ERROR, error.response.data.reason), null)
    } else if (typeof error.message !== 'undefined' && typeof error.code !== 'undefined') {
        callback(error, null)
    } else {
        callback(generate(type.GENERIC_ERROR), null)
    }
}

async function decode(result) {
    error = Buffer.from(result.returnValue).toString()
    if (Crypto.isBase64(error.slice(3))) {
        return Buffer.from(error.slice(3), 'base64').toString().replace(/[^a-zA-Z0-9\(\)!\?\., ]/g, '').trim()
    } else {
        return client.instance().contractDecodeDataAPI('string', error).replace(/[^a-zA-Z0-9\(\)!\?\., ]/g, '').trim()
    }
}

module.exports = { generate, type, handle, decode }