let { Crypto } = require('@aeternity/aepp-sdk')
let { BigNumber } = require('bignumber.js')
let fromExponential = require('from-exponential')

const tokenFactor = 1000000000000000000 // 10e18 (1 eur = 100 * 10^18 tokens)

function enforceAkPrefix(address) {
    if (address.startsWith("ct_")) { return address.replace("ct_", "ak_") }
    else { return address }
}

function enforceCtPrefix(address) {
    if (address.startsWith("ak_")) { return address.replace("ak_", "ct_") }
    else { return address }
}

function decodeAddress(data) {
    return Crypto.addressFromDecimal(data)
}

function blake2b(data) {
    return Crypto.hash(data).toString('hex')
}

function bigNumberToHex(num) {
    let bigNum = BigNumber(num)
    let hexString = bigNum.toString(16)
    if (hexString.length % 2 > 0) hexString = '0' + hexString
    return hexString
}

function eurToToken(amount) {
    return fromExponential(amount * tokenFactor);
}

function tokenToEur(amount) {
    let value = BigNumber(amount)
    return Math.floor(value.dividedBy(tokenFactor))
}

function toToken(amount) {
    return amount * tokenFactor
}

module.exports = { 
    enforceAkPrefix,
    enforceCtPrefix,
    eurToToken,
    tokenToEur,
    decodeAddress,
    blake2b,
    bigNumberToHex,
    toToken
}