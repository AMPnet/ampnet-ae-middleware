let client = require('../../ae/client')

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function currentTimeWithDaysOffset(days) {
    var result = new Date();
    result.setDate(result.getDate() + days);
    return result.getTime();
}

function currentTimeWithSecondsOffset(seconds) {
    var result = new Date();
    result.setSeconds(result.getSeconds() + seconds);
    return result.getTime();
}

async function waitMined(txHash) {
    return new Promise(async (resolve) => {
        client.instance().poll(txHash).then(async _ => {
            client.instance().getTxInfo(txHash).then(async (info) => {
                console.log(`Transaction ${txHash} mined! Status: ${info.returnType}`)
                await sleep(1000)
                resolve()
            })
        })
    })
}

async function waitNextBlock(afterHash) {
    let tx = await client.instance().getTxInfo(afterHash)
    return client.instance().awaitHeight(tx.height + 5)
}

function enforceAkPrefix(address) {
    return address.replace("ct_", "ak_")
}

function parseError(err) {
    let parts = err.split('>')
    let code = Number(parts[0].trim())
    let message = parts[1].trim()
    return {
        code: code,
        message: message
    }
}

module.exports = { 
    waitMined,
    waitNextBlock, 
    enforceAkPrefix, 
    currentTimeWithDaysOffset, 
    currentTimeWithSecondsOffset, 
    sleep,
    parseError
}