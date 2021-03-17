let { Crypto } = require('@aeternity/aepp-sdk')
let { BigNumber } = require('bignumber.js')
let fromExponential = require('from-exponential')
let config = require('../config')

let client = require('./client')

const tokenFactor = 1000000000000000000 // 10e18 (1 eur = 100 * 10^18 tokens)

function transactionExists(hash) {
    return new Promise((resolve, reject) => {
       client.instance().getTxInfo(hash).then(rrr => {
           resolve(true)
       }).catch(err => {
           if (err.response !== undefined && err.response.status === 404 && err.response.data.reason === 'Tx not mined') { resolve(true) }
           if (err.response !== undefined && err.response.status === 404) { resolve(false) }
           reject(err)
       })
    })
}

async function waitForTxConfirm(hash, maxAttempts = 3) {
    let numberOfConfirmations = config.get().confirmations
    // logger.debug(`Waiting for transaction ${hash}; Number of confirmations: ${numberOfConfirmations}; Attempts left: ${maxAttempts};`)
    if (maxAttempts == 0) throw new Error(`Error: Waiting for transaction ${hash} confirmation timed out...`)
    let pollResult = await client.instance().poll(hash, { blocks: 10, interval: 10000 })
    // logger.debug(`Transaction ${hash} poll result: %o`, pollResult)
    let currentHeight = await client.instance().waitForTxConfirm(hash, { confirm: numberOfConfirmations, interval: 10000, attempts: 20 })
    // logger.debug(`Wait for ${hash} tx confirm result: %o`, currentHeight)
    let txInfo = await client.instance().tx(hash)
    // logger.debug(`Fetched tx info again for ${hash}. Result: %o`, txInfo)
    if (txInfo.blockHeight === -1 || (currentHeight - txInfo.blockHeight) < numberOfConfirmations) {
        logger.debug(`Height does not look good for transaction ${hash}. Executing recursive call...`)
        return await waitForTxConfirm(hash, maxAttempts - 1)
    } else {
        if (txInfo.returnType !== 'ok') { throw new Error(`Error: Transaction ${hash} mined with error status!`) }
        return txInfo
    }
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
    waitForTxConfirm,
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