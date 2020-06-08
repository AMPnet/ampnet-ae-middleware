let client = require('../ae/client')
let codec = require('../ae/codec')
let contracts = require('../ae/contracts')
let repo = require('../persistence/repository')
let util = require('../ae/util')
let err = require('../error/errors')
let functions = require('../enums/enums').functions
let config = require('../config')
let logger = require('../logger')(module)
let { Crypto } = require('@aeternity/aepp-sdk')

async function createSellOffer(fromTxHash, projectTxHash, shares, price) {
    logger.debug(`Received request to generate createSellOffer transaction.\n\tSeller: ${fromTxHash}\n\tProject: ${projectTxHash}\n\tShares: ${shares}\n\tPrice: ${price}`)
    let fromWallet = (await repo.findByHashOrThrow(fromTxHash)).wallet
    logger.debug(`Seller wallet: ${fromWallet}`)
    let projectContract = util.enforceCtPrefix(
        (await repo.findByHashOrThrow(projectTxHash)).wallet
    )
    logger.debug(`Address of project contract: ${projectContract}`)
    let callData = await codec.sellOffer.encodeCreateSellOffer(
        projectContract,
        util.eurToToken(shares),
        util.eurToToken(price)
    )
    let result = await client.instance().contractCreateTx({
        ownerId: fromWallet,
        code: contracts.getSellOfferCompiled().bytecode,
        abiVersion: 3,
        deposit: 0,
        amount: 0,
        gas: config.get().contractCreateGasAmount,
        callData: callData
    })
    logger.debug(`Successfully generated createSellOffer transaction!`)
    return result.tx
}

async function acceptCounterOffer(fromTxHash, sellOfferTxHash, buyerWallet) {
    logger.debug(`Received request to generate acceptCounterOffer transaction.\n\tSeller: ${fromTxHash}\n\tSell Offer: ${sellOfferTxHash}\n\tBuyer: ${buyerWallet}`)
    let fromWallet = (await repo.findByHashOrThrow(fromTxHash)).wallet
    logger.debug(`Seller wallet: ${fromWallet}`)
    let sellOffer = (await repo.findByHashOrThrow(sellOfferTxHash)).to_wallet
    logger.debug(`SellOffer address: ${sellOffer}`)
    let callData = await codec.sellOffer.encodeAcceptCounterOffer(buyerWallet)
    let tx = await client.instance().contractCallTx({
        callerId: fromWallet,
        contractId: util.enforceCtPrefix(sellOffer),
        amount: 0,
        gas: config.get().contractCallGasAmount,
        callData: callData
    })
    logger.debug(`Successfully generated acceptCounterOffer transaction.`)
    return tx
}

module.exports = {
    createSellOffer,
    acceptCounterOffer
}