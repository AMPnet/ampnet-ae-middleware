let { Crypto } = require('@aeternity/aepp-sdk')
let { BigNumber } = require('bignumber.js')
let fromExponential = require('from-exponential')
let client = require('./client')

const tokenFactor = 1000000000000000000 // 10e18 (1 eur = 100 * 10^18 tokens)

function transactionExists(hash) {
    return new Promise((resolve, reject) => {
       client.instance().getTxInfo(hash).then(rrr => {
           resolve(true)
       }).catch(err => {
           if (err.response !== undefined && err.response.status === 404 && err.response.obj.reason === 'Tx not mined') { resolve(true) }
           if (err.response !== undefined && err.response.status === 404) { resolve(false) }
           reject(err)
       })
    })
}

async function waitNextBlock(afterHash) {
    let tx = await client.instance().getTxInfo(afterHash)
    return client.instance().awaitHeight(tx.height + 3)
}

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

function toAe(amount) {
    return amount / tokenFactor
}

module.exports = {
    transactionExists,
    waitNextBlock,
    enforceAkPrefix,
    enforceCtPrefix,
    eurToToken,
    tokenToEur,
    decodeAddress,
    blake2b,
    bigNumberToHex,
    toToken,
    toAe
}