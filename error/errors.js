let { Crypto } = require('@aeternity/aepp-sdk')
let grpcErrors = require('grpc-errors')
let client = require('../ae/client')

let type = {
    TX_NOT_SIGNED: "01",
    TX_NOT_MINED: "02",
    TX_INVALID_CONTRACT_CALLED: "03",
    TX_VERIFICATION_ERROR: "04",
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
        case type.TX_VERIFICATION_ERROR:
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
        if (errorCodeExists(error.message)) {
            callback(error, null)
        } else {
            if (error.code === 'TX_VERIFICATION_ERROR' && typeof error.errorData.validation !== 'undefined') {
                let validationArray = error.errorData.validation
                if (validationArray.length > 0) {
                    callback(generate(type.TX_VERIFICATION_ERROR, error.errorData.validation[0].msg), null)
                } else {
                    callback(generate(type.TX_VERIFICATION_ERROR, error.message), null)
                }
            } else {
                callback(generate(type.GENERIC_ERROR), null)
            }
        }
    } else {
        callback(generate(type.GENERIC_ERROR), null)
    }
}

async function decode(result) {
    error = Buffer.from(result.returnValue).toString()
    if (isBase64(error.slice(3))) {
        return Buffer.from(error.slice(3), 'base64').toString().replace(/[^a-zA-Z0-9\(\)!\?\., ]/g, '').trim()
    } else {
        let decoded = await client.instance().contractDecodeDataAPI('string', error)
        return decoded.replace(/[^a-zA-Z0-9\(\)!\?\., ]/g, '').trim()
    }
}

function errorCodeExists(message) {
    let parts = message.split(">")
    if (parts.length != 2) { return false }
    let code = parts[0].trim()
    return Object.values(type).indexOf(code) > -1
}

function isBase64(str) {
    return Buffer.from(str, 'base64').toString('base64') === str
}

module.exports = { generate, type, handle, decode }