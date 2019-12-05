let client = require('../../ae/client')
let enums = require('../../enums/enums')
let grpc = require('../grpc/client')

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

function waitTxProcessed(txHash) {
    return new Promise(async (resolve) => {
        let interval = 1000 //ms
        let maxChecks = 20
        var attempts = 0
        var txState = enums.TxState.PENDING
        var supervisorState = enums.SupervisorStatus.REQUIRED
        while(attempts < maxChecks) {
            await sleep(interval)
            info = await grpc.getTransactionInfo(txHash)
            if (info.state != enums.TxState.PENDING && info.supervisorStatus != enums.SupervisorStatus.REQUIRED) { 
                txState = info.state
                supervisorState = info.supervisorStatus
                break
            }
            attempts++
        }
        if (txState == enums.TxState.PENDING) {
            throw new Error(`Waiting for transaction ${txHash} to be mined timed out.`)
        } else if (supervisorState == enums.SupervisorStatus.REQUIRED) {
            throw new Error(`Waiting for supervisor to process transaction ${txHash} timed out.`)
        } else {
            console.log(`Transaction ${txHash} processed. \n\tTx status: ${txState}\n\tSupervisor status: ${supervisorState}`)
            resolve()
        }
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
    waitTxProcessed, 
    enforceAkPrefix, 
    currentTimeWithDaysOffset, 
    currentTimeWithSecondsOffset, 
    sleep,
    parseError
}