let client = require('../ae/client')
let codec = require('../ae/codec')
let contracts = require('../ae/contracts')
let functions = require('../enums/enums').functions
let repo = require('../persistence/repository')
let util = require('../ae/util')
let err = require('../error/errors')

let config = require('../config')
let logger = require('../logger')(module)

async function mint(call, callback) {
    logger.debug(`Received request to generate minting of ${call.request.amount} tokens to wallet with txHash ${call.request.toTxHash}`)
    try {
        let record = await repo.findByHashOrThrow(call.request.toTxHash)
        logger.debug(`Address represented by given hash: ${record.wallet}`)
        let callData = await codec.eur.encodeMint(record.wallet, util.eurToToken(call.request.amount))
        let tx = await client.instance().contractCallTx({
            callerId: config.get().contracts.eur.owner,
            contractId: config.get().contracts.eur.address,
            amount: 0,
            gas: 10000,
            callData: callData
        })
        logger.debug(`Successfully generated mint transaction: ${tx}`)
        callback(null, { tx: tx })
    } catch (error) {
        logger.error(`Error while generating mint transaction \n%o`, error)
        err.handle(error, callback)
    }
}

async function approveWithdraw(call, callback) {
    logger.debug(`Received request to generate withdraw approval of ${call.request.amount} tokens from wallet with txHash ${call.request.fromTxHash}`)
    try {
        let record = await repo.findByHashOrThrow(call.request.fromTxHash)
        logger.debug(`Address represented by given hash: ${record.wallet}`)
        let amount = util.eurToToken(call.request.amount)
        let callData = await codec.eur.encodeApprove(config.get().contracts.eur.owner, amount)
        let tx = await client.instance().contractCallTx({
            callerId: record.wallet,
            contractId: config.get().contracts.eur.address,
            amount: 0,
            gas: 10000,
            callData: callData
        })
        logger.debug(`Successfully generated approve withdraw transaction: ${tx}`)
        callback(null, { tx: tx })
    } catch (error) {
        logger.error(`Error while withdraw approve transaction \n%o`, error)
        err.handle(error, callback)
    }
}

async function burnFrom(call, callback) {
    logger.debug(`Received request to generate burning of tokens from wallet with txHash ${call.request.burnFromTxHash}`)
    try {
        let record = await repo.findByHashOrThrow(call.request.burnFromTxHash)
        logger.debug(`Address represented by given hash: ${record.wallet}`)
        let amount = await allowance(record.wallet)
        logger.debug(`Amount to burn: ${amount}`)
        let callData = await codec.eur.encodeBurnFrom(record.wallet, amount)
        let tx = await client.instance().contractCallTx({
            callerId: config.get().contracts.eur.owner,
            contractId: config.get().contracts.eur.address,
            amount: 0,
            gas: 10000,
            callData: callData
        })
        logger.debug(`Successfully generated burn transaction: ${tx}`)
        callback(null, { tx: tx })
    } catch (error) {
        logger.error(`Error while generating burn transaction \n%o`, error)
        err.handle(error, callback)
    }
}

async function balance(call, callback) {
    logger.debug(`Received request to fetch balance of wallet with txHash ${call.request.walletTxHash}`)
    try {
        let tx = await repo.findByHashOrThrow(call.request.walletTxHash)
        logger.debug(`Address represented by given hash: ${tx.wallet}`)
        let result = await client.instance().contractCallStatic(
            contracts.eurSource,
            config.get().contracts.eur.address,
            functions.eur.balanceOf,
            [ tx.wallet ]
        )
        let resultDecoded = await result.decode()
        let resultInEur = util.tokenToEur(resultDecoded)
        logger.debug(`Successfully fetched balance: ${resultInEur}`)
        callback(null, { balance: resultInEur })
    } catch (error) {
        logger.error(`Error while fetching balance \n%o`, error)
        err.handle(error, callback)
    }
}

async function invest(call, callback) {
    try {
        logger.debug(`Received request to generate invest transaction. Caller: ${call.request.fromTxHash}; Project: ${call.request.projectTxHash}; Amount: ${call.request.amount}`)
        let investor = (await repo.findByHashOrThrow(call.request.fromTxHash)).wallet
        logger.debug(`Investor address: ${investor}`)
        let project = (await repo.findByHashOrThrow(call.request.projectTxHash)).wallet
        logger.debug(`Project address: ${project}`)
        let amount = util.eurToToken(call.request.amount)
        let callData = await codec.eur.encodeApprove(project, amount)
        let tx = await client.instance().contractCallTx({
            callerId: investor,
            contractId: config.get().contracts.eur.address,
            amount: 0,
            gas: 10000,
            callData: callData
        })
        logger.debug(`Successfully generated invest tx: ${tx}`)
        callback(null, { tx: tx })
    } catch (error) {
        logger.error(`Error while generating invest transaction \n%o`, error)
        err.handle(error, callback)
    }
}

async function allowance(owner) {
    let result = await client.instance().contractCallStatic(
        contracts.eurSource,
        config.get().contracts.eur.address,
        functions.eur.allowance,
        [ owner, config.get().contracts.eur.owner ]
    )
    return result.decode()
}

module.exports = { 
    mint, 
    approveWithdraw, 
    burnFrom, 
    balance, 
    invest 
}