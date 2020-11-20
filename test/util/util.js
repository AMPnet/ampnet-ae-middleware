let client = require('../../ae/client')
let enums = require('../../enums/enums')
let grpc = require('../grpc/client')
let db = require('./db')

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

function waitWalletExists() {
    return new Promise(async (resolve) => {
        let interval = 3000 //ms
        let maxChecks = 20
        var attempts = 0
        while(attempts < maxChecks) {
            await sleep(interval)
            let records = await db.getAll()
            if (records.length > 0) {
                resolve(records[0])
            }
            attempts++
        }
        throw new Error(`Waiting for admin wallet creation timed out.`)
    })
}

function waitTxProcessed(txHash, from, to) {
    return new Promise(async (resolve) => {
        let interval = 1000 //ms
        let maxChecks = 20
        var attempts = 0
        var txState = enums.txStateToGrpc(enums.TxState.PENDING)
        var supervisorState = enums.supervisorStatusToGrpc(enums.SupervisorStatus.REQUIRED)
        while(attempts < maxChecks) {
            await sleep(interval)
            info = await grpc.getTransactionInfo(txHash, from, to)
            if (info.state != enums.txStateToGrpc(enums.TxState.PENDING) && info.supervisorStatus != enums.supervisorStatusToGrpc(enums.SupervisorStatus.REQUIRED)) { 
                txState = info.state
                supervisorState = info.supervisorStatus
                break
            }
            attempts++
        }
        if (txState == enums.txStateToGrpc(enums.TxState.PENDING)) {
            throw new Error(`Waiting for transaction ${txHash} to be mined timed out.`)
        } else if (supervisorState == enums.supervisorStatusToGrpc(enums.SupervisorStatus.REQUIRED)) {
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
    waitWalletExists, 
    enforceAkPrefix, 
    currentTimeWithDaysOffset, 
    currentTimeWithSecondsOffset, 
    sleep,
    parseError
}