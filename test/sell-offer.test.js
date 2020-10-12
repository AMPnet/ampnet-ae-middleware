let axios = require('axios')
let path = require('path')
let chai = require('chai');
let assert = chai.assert;

let enums = require('../enums/enums')
let grpcServer = require('../grpc/server')
let supervisor = require('../queue/queue')
let aeUtil = require('../ae/util')
let { TxType, TxState, SupervisorStatus, WalletType } = require('../enums/enums')

let grpcClient = require('./grpc/client')
let accounts = require('./ae/accounts')
let clients = require('./ae/clients')
let util = require('./util/util')
let db = require('./util/db')

let config = require('../config')

describe('Sell offers test', function() {

    beforeEach(async() => {
        await grpcServer.start()
        await grpcClient.start()
        await clients.init()
        await db.init()
    })

    afterEach(async() => {
        await grpcServer.stop()
        await supervisor.clearStorage()
        await supervisor.stop()
    })

    it('Should be possible to owned shares of fully funded project to another cooperative member', async () => {
        let baseUrl = `http://0.0.0.0:${config.get().http.port}`
        let createSellOfferUrl = `${baseUrl}/market/create-offer`
        let acceptSellOfferUrl = `${baseUrl}/market/accept-sell-offer`
        let acceptCounterOfferUrl = `${baseUrl}/market/accept-counter-offer`
        let postTransactionUrl = `${baseUrl}/transactions`

        let addBobWalletTx = await grpcClient.generateAddWalletTx(accounts.bob.publicKey)
        let addBobWalletTxSigned = await clients.owner().signTransaction(addBobWalletTx)
        let addBobWalletTxHash = (await axios.post(postTransactionUrl, {
            data: addBobWalletTxSigned
        })).data.tx_hash
        await util.waitTxProcessed(addBobWalletTxHash)

        let addAliceWalletTx = await grpcClient.generateAddWalletTx(accounts.alice.publicKey)
        let addAliceWalletTxSigned = await clients.owner().signTransaction(addAliceWalletTx)
        let addAliceWalletTxHash = await grpcClient.postTransaction(addAliceWalletTxSigned)
        await util.waitTxProcessed(addAliceWalletTxHash)

        let mintToBobAmount = 100000
        let mintToBobTx = await grpcClient.generateMintTx(addBobWalletTxHash, mintToBobAmount)
        let mintToBobTxSigned = await clients.owner().signTransaction(mintToBobTx)
        let mintToBobTxHash = await grpcClient.postTransaction(mintToBobTxSigned)
        await util.waitTxProcessed(mintToBobTxHash)

        let mintToAliceAmount = 100000
        let mintToAliceTx = await grpcClient.generateMintTx(addAliceWalletTxHash, mintToAliceAmount)
        let mintToAliceTxSigned = await clients.owner().signTransaction(mintToAliceTx)
        let mintToAliceTxHash = await grpcClient.postTransaction(mintToAliceTxSigned)
        await util.waitTxProcessed(mintToAliceTxHash)

        let createOrgTx = await grpcClient.generateCreateOrganizationTx(addBobWalletTxHash)
        let createOrgTxSigned = await clients.bob().signTransaction(createOrgTx)
        let createOrgTxHash = await grpcClient.postTransaction(createOrgTxSigned)
        await util.waitTxProcessed(createOrgTxHash)

        let addOrgWalletTx = await grpcClient.generateAddWalletTx(createOrgTxHash)
        let addOrgWalletTxSigned = await clients.owner().signTransaction(addOrgWalletTx)
        let addOrgWalletTxHash = await grpcClient.postTransaction(addOrgWalletTxSigned)
        await util.waitTxProcessed(addOrgWalletTxHash)

        let createProjTx = await grpcClient.generateCreateProjectTx(
            addBobWalletTxHash,
            addOrgWalletTxHash,
            10000,                              // min 100$ per user
            100000,                             // max 1000$ per user
            100000,                             // 1000$ investment cap
            util.currentTimeWithDaysOffset(10)  // expires in 10 days
        )
        let createProjTxSigned = await clients.bob().signTransaction(createProjTx)
        let createProjTxHash = await grpcClient.postTransaction(createProjTxSigned)
        await util.waitTxProcessed(createProjTxHash)

        let addProjWalletTx = await grpcClient.generateAddWalletTx(createProjTxHash)
        let addProjWalletTxSigned = await clients.owner().signTransaction(addProjWalletTx)
        let addProjWalletTxHash = await grpcClient.postTransaction(addProjWalletTxSigned)
        await util.waitTxProcessed(addProjWalletTxHash)

        let bobInvestmentAmount = 100000
        let investTx = await grpcClient.generateInvestTx(addBobWalletTxHash, addProjWalletTxHash, bobInvestmentAmount)
        let investTxSigned = await clients.bob().signTransaction(investTx)
        let investTxHash = await grpcClient.postTransaction(investTxSigned)
        await util.waitTxProcessed(investTxHash)
        
        let sharesToSell = bobInvestmentAmount / 2
        let sharesPrice  = mintToBobAmount
        let createSellOfferTx = (await axios.get(createSellOfferUrl, {
            params: {
                fromTxHash: addBobWalletTxHash,
                projectTxHash: addProjWalletTxHash,
                shares: sharesToSell,
                price: sharesPrice
            }
        })).data.tx
        let createSellOfferTxSigned = await clients.bob().signTransaction(createSellOfferTx)
        let createSellOfferTxHash = await grpcClient.postTransaction(createSellOfferTxSigned)
        await util.waitTxProcessed(createSellOfferTxHash)

        let acceptSellOfferTx = (await axios.get(acceptSellOfferUrl, {
            params: {
                fromTxHash: addAliceWalletTxHash,
                sellOfferTxHash: createSellOfferTxHash,
                counterOfferPrice: sharesPrice / 2
            }
        })).data.tx
        let acceptSellOfferTxSigned = await clients.alice().signTransaction(acceptSellOfferTx)
        let acceptSellOfferTxHash = await grpcClient.postTransaction(acceptSellOfferTxSigned)
        await util.waitTxProcessed(acceptSellOfferTxHash)

        let activeOffers = await grpcClient.getActiveSellOffers()
        console.log("active offers", activeOffers)

        let acceptCounterOfferTx = (await axios.get(acceptCounterOfferUrl, {
            params: {
                fromTxHash: addBobWalletTxHash,
                sellOfferTxHash: createSellOfferTxHash,
                buyerTxHash: addAliceWalletTxHash 
            }
        })).data.tx
        let acceptCounterOfferTxSigned = await clients.bob().signTransaction(acceptCounterOfferTx)
        let acceptCounterOfferTxHash = await grpcClient.postTransaction(acceptCounterOfferTxSigned)
        await util.waitTxProcessed(acceptCounterOfferTxHash)

        let allTransactions = await db.getAll()
        console.log("all transactions", allTransactions)

        let sellerPortfolio = await grpcClient.getPortfolio(addBobWalletTxHash)
        console.log("sellerPortfolio", sellerPortfolio)

        let buyerPortfolio = await grpcClient.getPortfolio(addAliceWalletTxHash)
        console.log("buyerPortfolio", buyerPortfolio)
    })

})