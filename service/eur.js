let client = require('../ae/client')
let codec = require('../ae/codec')
let contracts = require('../ae/contracts')
let functions = require('../enums/enums').functions
let repo = require('../persistence/repository')
let util = require('../ae/util')
let commonUtil = require('../util/util')
let err = require('../error/errors')
let cache = require('../cache/redis')
let { Crypto } = require('@aeternity/aepp-sdk')
let { BigNumber } = require('bignumber.js')

let config = require('../config')
let logger = require('../logger')(module)

async function mint(call, callback) {
    try {
        logger.info(`Received request to generate minting of ${call.request.amount} tokens to wallet with txHash ${call.request.toTxHash}`)
        let record = await repo.findByHashOrThrow(call.request.toTxHash)
        logger.debug(`Address represented by given hash: ${record.wallet}`)
        let callData = await codec.eur.encodeMint(record.wallet, util.eurToToken(call.request.amount))
        logger.debug(`Encoded call data: ${callData}`)
        let tx = await client.instance().contractCallTx({
            callerId: record.eur_owner,
            contractId: record.eur_contract,
            amount: 0,
            gas: config.get().contractCallGasAmount,
            gasPrice: config.get().gasPrice,
            callData: callData
        })
        logger.info(`Successfully generated mint transaction!`)
        callback(null, { tx: tx })
    } catch (error) {
        logger.error(`Error while generating mint transaction \n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

async function approveWithdraw(call, callback) {
    try {
        logger.info(`Received request to generate withdraw approval of ${call.request.amount} tokens from wallet with txHash ${call.request.fromTxHash}`)
        let record = await repo.findByHashOrThrow(call.request.fromTxHash)
        logger.debug(`Address represented by given hash: ${record.wallet}`)
        let amount = util.eurToToken(call.request.amount)
        let callData = await codec.eur.encodeApprove(record.eur_owner, amount)
        logger.debug(`Encoded call data: ${callData}`)
        let tx = await client.instance().contractCallTx({
            callerId: record.wallet,
            contractId: record.eur_contract,
            amount: 0,
            gas: config.get().contractCallGasAmount,
            gasPrice: config.get().gasPrice,
            callData: callData
        })
        logger.info(`Successfully generated approve withdraw transaction!`)
        callback(null, { tx: tx })
    } catch (error) {
        logger.error(`Error while withdraw approve transaction \n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

async function burnFrom(call, callback) {
    try {
        logger.info(`Received request to generate burning of tokens from wallet with txHash ${call.request.burnFromTxHash}`)
        let record = await repo.findByHashOrThrow(call.request.burnFromTxHash)
        logger.debug(`Address represented by given hash: ${record.wallet}`)
        let amount = await allowance(record)
        logger.debug(`Amount to burn: ${amount}`)
        let callData = await codec.eur.encodeBurnFrom(record.wallet, amount)
        logger.debug(`Encoded call data: ${callData}`)
        let tx = await client.instance().contractCallTx({
            callerId: record.eur_owner,
            contractId: record.eur_contract,
            amount: 0,
            gas: config.get().contractCallGasAmount,
            gasPrice: config.get().gasPrice,
            callData: callData
        })
        logger.info(`Successfully generated burn transaction!`)
        callback(null, { tx: tx })
    } catch (error) {
        logger.error(`Error while generating burn transaction \n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

async function balance(call, callback) {
    getBalance(call.request.walletTxHash)
        .then((result) => {
            callback(null, { balance: result })
        })
        .catch((error) => {
            logger.error(`Error while fetching balance \n%o`, err.pretty(error))
            err.handle(error, callback)
        })
}

async function invest(call, callback) {
    try {
        logger.info(`Received request to generate invest transaction. Caller: ${call.request.fromTxHash}; Project: ${call.request.projectTxHash}; Amount: ${call.request.amount}`)
        let investorRecord = await repo.findByHashOrThrow(call.request.fromTxHash) 
        let investor = investorRecord.wallet
        logger.debug(`Investor address: ${investor}`)
        let project = (await repo.findByHashOrThrow(call.request.projectTxHash)).wallet
        logger.debug(`Project address: ${project}`)
        let amount = util.eurToToken(call.request.amount)
        await checkInvestmentPreconditions(project, investor, amount)
        let callData = await codec.eur.encodeApprove(project, amount)
        logger.debug(`Encoded call data: ${callData}`)
        let tx = await client.instance().contractCallTx({
            callerId: investor,
            contractId: investorRecord.eur_contract,
            amount: 0,
            gas: config.get().contractCallGasAmount,
            gasPrice: config.get().gasPrice,
            callData: callData
        })
        logger.info(`Successfully generated invest tx!`)
        callback(null, { tx: tx })
    } catch (error) {
        logger.error(`Error while generating invest transaction \n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

async function acceptSellOffer(fromTxHash, sellOfferTxHash, counterOfferPrice) {
    logger.info(`Received request to generate acceptSellOffer transaction. CallerHash: ${fromTxHash}; SellOfferHash: ${sellOfferTxHash}; CounterOfferPrice: ${counterOfferPrice}`)
    let buyerRecord = await repo.findByHashOrThrow(fromTxHash)
    let buyer = buyerRecord.wallet
    logger.debug(`Buyer wallet: ${buyer}`)
    let sellOffer = (await repo.findByHashOrThrow(sellOfferTxHash)).to_wallet
    logger.debug(`SellOffer address: ${sellOffer}`)
    let amount = util.eurToToken(counterOfferPrice)
    let callData = await codec.eur.encodeApprove(sellOffer, amount)
    logger.debug(`Encoded call data: ${callData}`)
    let tx = await client.instance().contractCallTx({
        callerId: buyer,
        contractId: buyerRecord.eur_contract,
        amount: 0,
        gas: config.get().contractCallGasAmount,
        gasPrice: config.get().gasPrice,
        callData: callData
    })
    logger.info(`Successfully generated acceptSellOffer tx!`)
    return tx
}

async function getTokenIssuer(call, callback) {
    try {
        logger.info(`Received request to fetch token issuer wallet. Coop: ${call.request.coop}`)
        let coopInfo = await repo.getCooperative(call.request.coop)
        logger.info(`Successfully fetched token issuer wallet: ${coopInfo.eur_owner}`)
        callback(null, { wallet: coopInfo.eur_owner })
    } catch (error) {
        logger.error(`Error while fetching token issuer wallet:\n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

async function transferOwnership(call, callback) {
    try {
        logger.info(`Received request to generate token issuer ownership transaction. New owner: ${call.request.newOwnerWallet}; Coop: ${call.request.coop}`)
        let callData = await codec.eur.encodeTransferEurOwnership(call.request.newOwnerWallet)
        logger.debug(`Encoded call data: ${callData}`)
        let coopInfo = await repo.getCooperative(call.request.coop)
        let tx = await client.instance().contractCallTx({
            callerId: coopInfo.eur_owner,
            contractId: coopInfo.eur_contract,
            amount: 0,
            gas: config.get().contractCallGasAmount,
            gasPrice: config.get().gasPrice,
            callData: callData
        })
        logger.info('Successfully generated transferOwnership transaction!')
        callback(null, { tx: tx })
    } catch(error) {
        logger.error(`Error while generating token issuer ownership change transaction:\n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}


// HELPER FUNCTIONS

async function getBalance(walletHash) {
    logger.info(`Received request to fetch balance of wallet with txHash ${walletHash}`)
    let tx = await repo.findByHashOrThrow(walletHash)
    logger.debug(`Address represented by given hash: ${tx.wallet}`)
    let balancesResult = await cache.balances(
        tx.coop_id,
        async () => {
            let result = await client.instance().contractCallStatic(
                contracts.eurSource,
                tx.eur_contract,
                functions.eur.balances,
                [ ],
                {
                    callerId: Crypto.generateKeyPair().publicKey
                }
            )
            let resultDecoded = await result.decode()
            logger.debug(`Fetched total of ${resultDecoded.length} balance entries.`)
            return commonUtil.arrayToJson(resultDecoded)
        }
    )
    if (tx.wallet in balancesResult) {
        let balance = balancesResult[tx.wallet]
        logger.info(`Wallet ${tx.wallet} exists in balances response - wallet balance: ${balance}`)
        return util.tokenToEur(balance)
    } else {
        logger.info(`Wallet ${tx.wallet} does not exist in balances response - wallet balance: 0`)
        return 0
    }
}

async function allowance(ownerRecord) {
    logger.debug(`Fetching allowance for wallet ${ownerRecord.wallet}`)
    let result = await client.instance().contractCallStatic(
        contracts.eurSource,
        ownerRecord.eur_contract,
        functions.eur.allowance,
        [ ownerRecord.wallet, ownerRecord.eur_owner ],
        {
            callerId: Crypto.generateKeyPair().publicKey
        }
    )
    let allowance = await result.decode()
    let allowanceStringified = BigNumber(allowance.toString()).toString(10)
    logger.debug(`Fetched allowance: ${allowanceStringified}`)
    return allowanceStringified
}

async function checkInvestmentPreconditions(project, investor, amount) {
    logger.debug(`Checking new investment preconditions`)
    let result = await client.instance().contractCallStatic(
        contracts.projSource,
        util.enforceCtPrefix(project),
        functions.proj.checkInvestmentPreconditions,
        [ investor, amount ],
        {
            callerId: Crypto.generateKeyPair().publicKey
        }
    )
    logger.debug(`Preconditions checklist result: %o`, result)
}

module.exports = { 
    mint, 
    approveWithdraw, 
    burnFrom, 
    balance, 
    invest,
    acceptSellOffer,
    getTokenIssuer,
    transferOwnership,
    getBalance
}