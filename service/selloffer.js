let client = require('../ae/client')
let codec = require('../ae/codec')
let contracts = require('../ae/contracts')
let repo = require('../persistence/repository')
let util = require('../ae/util')
let enums = require('../enums/enums')
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

async function getActiveSellOffers(call, callback) {
    logger.debug(`Received request to fetch active sell offers.`)
    try {
        let sellOfferCreateTransactions = await repo.get({
            type: enums.TxType.SELL_OFFER_CREATE,
            state: enums.TxState.MINED
        })
        let sellOffers = await Promise.all(sellOfferCreateTransactions.map(tx => {
            return new Promise((resolve, reject) => {
                client.instance().contractCallStatic(
                    contracts.sellOfferSource,
                    util.enforceCtPrefix(tx.to_wallet),
                    functions.sellOffer.getOffer,
                    [ ],
                    {
                        callerId: Crypto.generateKeyPair().publicKey
                    }
                ).then(callResult => {
                    callResult.decode().then(decoded => {
                        console.log("decoded", decoded)
                        resolve(decoded)
                    }).catch(console.log)
                }).catch(console.log)
            })
        }))
        console.log("sell offers", sellOffers)
    
        let sellOffersFiltered = sellOffers.filter(o => (o[5] && !o[6]))
        console.log("sell offers filtered", sellOffersFiltered)
    
        let sellOffersTransformed = await Promise.all(sellOffersFiltered.map(async (offer) => {
            let projectTxHash = (await repo.findByWalletOrThrow(offer[0])).hash
            let sellerTxHash = (await repo.findByWalletOrThrow(offer[1])).hash
            let shares = util.tokenToEur(offer[2])
            let price = util.tokenToEur(offer[3])
            let counterOffers = offer[4].map(counterOffer => {
                return {
                    buyerTxHash: counterOffer[0],
                    price: util.tokenToEur(counterOffer[1])
                }
            })
            return {
                projectTxHash,
                sellerTxHash,
                shares,
                price,
                counterOffers
            }
        }))
        logger.debug(`Successfully fetched active sell offers: %o`, sellOffersTransformed)
        callback(null, {
            offers: sellOffersTransformed
        })
    } catch (error) {
        logger.error(`Error while fetching active sell offers\n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

module.exports = {
    createSellOffer,
    acceptCounterOffer,
    getActiveSellOffers
}