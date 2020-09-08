let client = require('../ae/client')
let codec = require('../ae/codec')
let contracts = require('../ae/contracts')
let functions = require('../enums/enums').functions
let repo = require('../persistence/repository')
let util = require('../ae/util')
let err = require('../error/errors')
let { Crypto } = require('@aeternity/aepp-sdk')

let config = require('../config')
let logger = require('../logger')(module)

async function mint(call, callback) {
    logger.debug(`Received request to generate minting of ${call.request.amount} tokens to wallet with txHash ${call.request.toTxHash}`)
    try {
        let record = await repo.findByHashOrThrow(call.request.toTxHash)
        logger.debug(`Address represented by given hash: ${record.wallet}`)
        let callData = await codec.eur.encodeMint(record.wallet, util.eurToToken(call.request.amount))
        let eurOwner = await config.get().contracts.eur.owner()
        let tx = await client.instance().contractCallTx({
            callerId: eurOwner,
            contractId: config.get().contracts.eur.address,
            amount: 0,
            gas: config.get().contractCallGasAmount,
            callData: callData
        })
        logger.debug(`Successfully generated mint transaction: ${tx}`)
        callback(null, { tx: tx })
    } catch (error) {
        logger.error(`Error while generating mint transaction \n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

async function approveWithdraw(call, callback) {
    logger.debug(`Received request to generate withdraw approval of ${call.request.amount} tokens from wallet with txHash ${call.request.fromTxHash}`)
    try {
        let record = await repo.findByHashOrThrow(call.request.fromTxHash)
        logger.debug(`Address represented by given hash: ${record.wallet}`)
        let amount = util.eurToToken(call.request.amount)
        let eurOwner = await config.get().contracts.eur.owner()
        let callData = await codec.eur.encodeApprove(eurOwner, amount)
        let tx = await client.instance().contractCallTx({
            callerId: record.wallet,
            contractId: config.get().contracts.eur.address,
            amount: 0,
            gas: config.get().contractCallGasAmount,
            callData: callData
        })
        logger.debug(`Successfully generated approve withdraw transaction: ${tx}`)
        callback(null, { tx: tx })
    } catch (error) {
        logger.error(`Error while withdraw approve transaction \n%o`, err.pretty(error))
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
        let eurOwner = await config.get().contracts.eur.owner()
        let tx = await client.instance().contractCallTx({
            callerId: eurOwner,
            contractId: config.get().contracts.eur.address,
            amount: 0,
            gas: config.get().contractCallGasAmount,
            callData: callData
        })
        logger.debug(`Successfully generated burn transaction: ${tx}`)
        callback(null, { tx: tx })
    } catch (error) {
        logger.error(`Error while generating burn transaction \n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

async function balance(call, callback) {
    logger.debug(`Received request to fetch balance of wallet with txHash ${call.request.walletTxHash}`)
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
        logger.debug(`Received request to generate invest transaction. Caller: ${call.request.fromTxHash}; Project: ${call.request.projectTxHash}; Amount: ${call.request.amount}`)
        let investor = (await repo.findByHashOrThrow(call.request.fromTxHash)).wallet
        logger.debug(`Investor address: ${investor}`)
        let project = (await repo.findByHashOrThrow(call.request.projectTxHash)).wallet
        logger.debug(`Project address: ${project}`)
        let amount = util.eurToToken(call.request.amount)
        await checkInvestmentPreconditions(project, investor, amount)
        let callData = await codec.eur.encodeApprove(project, amount)
        let tx = await client.instance().contractCallTx({
            callerId: investor,
            contractId: config.get().contracts.eur.address,
            amount: 0,
            gas: config.get().contractCallGasAmount,
            callData: callData
        })
        logger.debug(`Successfully generated invest tx: ${tx}`)
        callback(null, { tx: tx })
    } catch (error) {
        logger.error(`Error while generating invest transaction \n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

async function acceptSellOffer(fromTxHash, sellOfferTxHash, counterOfferPrice) {
    logger.debug(`Received request to generate acceptSellOffer transaction. CallerHash: ${fromTxHash}; SellOfferHash: ${sellOfferTxHash}; CounterOfferPrice: ${counterOfferPrice}`)
    let buyer = (await repo.findByHashOrThrow(fromTxHash)).wallet
    logger.debug(`Buyer wallet: ${buyer}`)
    let sellOffer = (await repo.findByHashOrThrow(sellOfferTxHash)).to_wallet
    logger.debug(`SellOffer address: ${sellOffer}`)
    let amount = util.eurToToken(counterOfferPrice)
    let callData = await codec.eur.encodeApprove(sellOffer, amount)
    let tx = await client.instance().contractCallTx({
        callerId: buyer,
        contractId: config.get().contracts.eur.address,
        amount: 0,
        gas: config.get().contractCallGasAmount,
        callData: callData
    })
    logger.debug(`Successfully generated acceptSellOffer tx: ${tx}`)
    return tx
}

async function getTokenIssuer(call, callback) {
    logger.debug(`Received request to fetch token issuer wallet.`)
    try {
        let result = await client.instance().contractCallStatic(
            contracts.eurSource,
            config.get().contracts.eur.address,
            functions.eur.getOwner,
            [ ],
            {
                callerId: Crypto.generateKeyPair().publicKey
            }
        )
        let resultDecoded = await result.decode()
        logger.debug(`Fetched token issuer: ${resultDecoded}`)
        callback(null, { wallet: resultDecoded })
    } catch (error) {
        logger.error(`Error while fetching token issuer wallet:\n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

async function transferOwnership(call, callback) {
    logger.debug(`Received request to generate token issuer ownership transaction. New owner: ${call.request.newOwnerWallet}`)
    try {
        let callData = await codec.eur.encodeTransferEurOwnership(call.request.newOwnerWallet)
        let eurOwner = await config.get().contracts.eur.owner()
        let tx = await client.instance().contractCallTx({
            callerId: eurOwner,
            contractId: config.get().contracts.eur.address,
            amount: 0,
            gas: config.get().contractCallGasAmount,
            callData: callData
        })
        logger.debug('Successfully generated transferOwnership transaction \n%o', tx)
        callback(null, { tx: tx })
    } catch(error) {
        logger.error(`Error while generating token issuer ownership change transaction:\n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}


// HELPER FUNCTIONS

async function getBalance(walletHash) {
    let tx = await repo.findByHashOrThrow(walletHash)
    logger.debug(`Address represented by given hash: ${tx.wallet}`)
    let result = await client.instance().contractCallStatic(
        contracts.eurSource,
        config.get().contracts.eur.address,
        functions.eur.balanceOf,
        [ tx.wallet ],
        {
            callerId: Crypto.generateKeyPair().publicKey
        }
    )
    let resultDecoded = await result.decode()
    let resultInEur = util.tokenToEur(resultDecoded)
    logger.debug(`Successfully fetched balance: ${resultInEur}`)
    return resultInEur
}

async function allowance(owner) {
    let eurOwner = await config.get().contracts.eur.owner() 
    let result = await client.instance().contractCallStatic(
        contracts.eurSource,
        config.get().contracts.eur.address,
        functions.eur.allowance,
        [ owner, eurOwner ],
        {
            callerId: Crypto.generateKeyPair().publicKey
        }
    )
    return result.decode()
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