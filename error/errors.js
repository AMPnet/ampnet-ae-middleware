let grpcErrors = require('grpc-errors')
let client = require('../ae/client')

let type = {
    TX_NOT_SIGNED: "01",
    TX_NOT_MINED: "02",
    TX_INVALID_CONTRACT_CALLED: "03",
    TX_VERIFICATION_ERROR: "04",
    TX_NOT_FOUND: "05",
    WALLET_NOT_FOUND: "10",
    WALLET_CREATION_FAILED: "11",
    WALLET_CREATION_PENDING: "12",
    WALLET_ALREADY_EXISTS: "13",
    GROUP_INVALID_COOP_ARG: "20",
    PROJ_INVALID_GROUP_ARG: "30",
    SELL_OFFER_INVALID_PROJ_ARG: "31",
    AEPP_SDK_ERROR: "40",
    DRY_RUN_ERROR: "50",
    PRECONDITION_FAILED_ERROR: "60",
    COOP_NOT_FOUND: "70",
    MALFORMED_CONTRACT_CODE: "90",
    GENERIC_ERROR: "99"
}

let DefaultMessages = new Map([
    [type.TX_NOT_SIGNED, "Transaction not signed. Aborting."],
    [type.TX_INVALID_CONTRACT_CALLED, "Invalid contract called! Contract not part of Cooperative contracts collection."],
    [type.GROUP_INVALID_COOP_ARG, "Error while creating Group. Invalid Coop contract provided as argument!"],
    [type.PROJ_INVALID_GROUP_ARG, "Error while creating Project. Invalid Group contract provided as argument!"],
    [type.SELL_OFFER_INVALID_PROJ_ARG, "Error while creating Sell Offer. Invalid Project contract provided as argument!"],
    [type.MALFORMED_CONTRACT_CODE, "Error while deploying Contract. Malformed code. Can only deploy official AMPnet Contracts."],
    [type.GENERIC_ERROR, "Unknown error occured."],
    [type.WALLET_NOT_FOUND, "Wallet not found!"],
    [type.COOP_NOT_FOUND, "Cooperative does not exist!"],
    [type.WALLET_CREATION_PENDING, "Wallet creation transaction still pending!"],
    [type.WALLET_CREATION_FAILED, "Wallet creation transaction failed!"],
    [type.WALLET_ALREADY_EXISTS, "Wallet already exists!"],
    [type.AEPP_SDK_ERROR, "Ae Sdk error was thrown."],
    [type.DRY_RUN_ERROR, "Unknown error occured while dry running transaction. Contact system administrator!"],
    [type.PRECONDITION_FAILED_ERROR, "Error: precondition failed."],
    [type.TX_NOT_FOUND, "Transaction not found."],
    [type.TX_NOT_MINED, "This is still being verified on blockchain. Please wait for a few more minutes and then try again."]
])

function generate(errorType, message = DefaultMessages.get(errorType)) {
    let errorData = `${errorType} > ${message}`
    switch (errorType) { 
        case type.MALFORMED_CONTRACT_CODE:
        case type.WALLET_NOT_FOUND:
        case type.WALLET_CREATION_FAILED:
        case type.WALLET_CREATION_PENDING:
        case type.TX_VERIFICATION_ERROR:
        case type.WALLET_ALREADY_EXISTS:
        case type.DRY_RUN_ERROR:
        case type.PRECONDITION_FAILED_ERROR:
        case type.TX_NOT_SIGNED:
        case type.TX_NOT_FOUND: 
        case type.TX_NOT_MINED:
        case type.COOP_NOT_FOUND: return new grpcErrors.FailedPreconditionError(errorData)
        
        case type.TX_INVALID_CONTRACT_CALLED:
        case type.GROUP_INVALID_COOP_ARG:
        case type.PROJ_INVALID_GROUP_ARG: 
        case type.SELL_OFFER_INVALID_PROJ_ARG: return new grpcErrors.InvalidArgumentError(errorData)
        
        case type.AEPP_SDK_ERROR:
        case type.GENERIC_ERROR: return new grpcErrors.AbortedError(errorData)
    }
}

function generateAborted(message) {
    return new grpcErrors.AbortedError(message)
}

function handle(error, callback) {
    if (error.response) {
        callback(generate(type.AEPP_SDK_ERROR, error.response.obj.reason), null)
    } else if (error.message) {
        let filtered = filterMessage(error.message)
        if (isErrorFormatValid(filtered)) {
            callback(generateAborted(filtered), null)
        } else {
            callback(generate(type.PRECONDITION_FAILED_ERROR, filtered), null)
        }
    } else if (typeof error.decodedError !== 'undefined') {
        let filtered = filterMessage(error.decodedError)
        if (isErrorFormatValid(filtered)) {
            callback(generateAborted(filtered), null)
        } else {
            callback(generate(type.PRECONDITION_FAILED_ERROR, filtered), null)
        }
    } else if (typeof error.message !== 'undefined' && typeof error.code !== 'undefined') {
        if (isErrorFormatValid(error.message) || errorCodeExists(error.message)) {
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
        return filterMessage(Buffer.from(error.slice(3), 'base64').toString())
    } else {
        let decoded = await client.instance().contractDecodeDataAPI('string', error)
        return filterMessage(decoded)
    }
}

function errorCodeExists(message) {
    let parts = message.split(">")
    if (parts.length != 2) { return false }
    let code = parts[0].trim()
    return Object.values(type).indexOf(code) > -1
}

function isErrorFormatValid(str) {
    let parts = str.split(">")
    return parts.length === 2
}

function isBase64(str) {
    return Buffer.from(str, 'base64').toString('base64') === str
}

function pretty(error) {
    if (typeof error.error !== 'undefined') {
        if (typeof error.error.isAxiosError !== 'undefined' && error.error.isAxiosError) {
            return error.error.toJSON()
        }
    }
    return error
}

function filterMessage(str) {
    let startPosition = str.indexOf("#")
    let endPosition = str.lastIndexOf("#")
    if (startPosition == -1 || endPosition == -1 || startPosition == endPosition) {
        return str.replace(/[^a-zA-Z0-9\(\)!\?\., ]/g, '').trim()
    } else {
        return str.substring(startPosition + 1, endPosition)
    }
}

module.exports = { generate, generateAborted, type, handle, decode, pretty, isErrorFormatValid }