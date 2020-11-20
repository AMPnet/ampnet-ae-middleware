let axios = require('axios')
let { Crypto, Node, Universal: Ae, MemoryAccount } = require('@aeternity/aepp-sdk')

let grpcClient = require('./grpc/client')
let clients = require('./ae/clients')
let util = require('./util/util')

let config = require('../config')

describe('Sell offers test', function() {

    it.skip('Should be possible to sell owned shares of fully funded project to another cooperative member', async () => {
        let bobWallet = Crypto.generateKeyPair()
        let aliceWallet = Crypto.generateKeyPair()

        let node = await Node({
            url: config.get().node.url,
            internalUrl: config.get().node.internalUrl
        })
        let bobClient = await Ae({
            nodes: [
                { name: "node", instance: node } 
            ],
            compilerUrl: config.get().node.compilerUrl,
            accounts: [
                MemoryAccount({ keypair: bobWallet })
            ],
            address: bobWallet.publicKey,
            networkId: config.get().node.networkId
        })
        let aliceClient = await Ae({
            nodes: [
                { name: "node", instance: node } 
            ],
            compilerUrl: config.get().node.compilerUrl,
            accounts: [
                MemoryAccount({ keypair: aliceWallet })
            ],
            address: aliceWallet.publicKey,
            networkId: config.get().node.networkId
        })

        let baseUrl = `http://0.0.0.0:${config.get().http.port}`
        let createSellOfferUrl = `${baseUrl}/market/create-offer`
        let acceptSellOfferUrl = `${baseUrl}/market/accept-sell-offer`
        let acceptCounterOfferUrl = `${baseUrl}/market/accept-counter-offer`
        let postTransactionUrl = `${baseUrl}/transactions`

        let addBobWalletTx = await grpcClient.generateAddWalletTx(bobWallet.publicKey, coopId)
        let addBobWalletTxSigned = await clients.owner().signTransaction(addBobWalletTx)
        let addBobWalletTxHash = (await axios.post(postTransactionUrl, {
            data: addBobWalletTxSigned,
            coop: coopId
        })).data.tx_hash
        await util.waitTxProcessed(addBobWalletTxHash)

        let addAliceWalletTx = await grpcClient.generateAddWalletTx(aliceWallet.publicKey, coopId)
        let addAliceWalletTxSigned = await clients.owner().signTransaction(addAliceWalletTx)
        let addAliceWalletTxHash = await grpcClient.postTransaction(addAliceWalletTxSigned, coopId)
        await util.waitTxProcessed(addAliceWalletTxHash)

        let mintToBobAmount = 100000
        let mintToBobTx = await grpcClient.generateMintTx(addBobWalletTxHash, mintToBobAmount)
        let mintToBobTxSigned = await clients.owner().signTransaction(mintToBobTx)
        let mintToBobTxHash = await grpcClient.postTransaction(mintToBobTxSigned, coopId)
        await util.waitTxProcessed(mintToBobTxHash)

        let mintToAliceAmount = 100000
        let mintToAliceTx = await grpcClient.generateMintTx(addAliceWalletTxHash, mintToAliceAmount)
        let mintToAliceTxSigned = await clients.owner().signTransaction(mintToAliceTx)
        let mintToAliceTxHash = await grpcClient.postTransaction(mintToAliceTxSigned, coopId)
        await util.waitTxProcessed(mintToAliceTxHash)

        let createOrgTx = await grpcClient.generateCreateOrganizationTx(addBobWalletTxHash)
        let createOrgTxSigned = await bobClient.signTransaction(createOrgTx)
        let createOrgTxHash = await grpcClient.postTransaction(createOrgTxSigned, coopId)
        await util.waitTxProcessed(createOrgTxHash)

        let addOrgWalletTx = await grpcClient.generateAddWalletTx(createOrgTxHash, coopId)
        let addOrgWalletTxSigned = await clients.owner().signTransaction(addOrgWalletTx)
        let addOrgWalletTxHash = await grpcClient.postTransaction(addOrgWalletTxSigned, coopId)
        await util.waitTxProcessed(addOrgWalletTxHash)

        let createProjTx = await grpcClient.generateCreateProjectTx(
            addBobWalletTxHash,
            addOrgWalletTxHash,
            10000,                              // min 100$ per user
            100000,                             // max 1000$ per user
            100000,                             // 1000$ investment cap
            util.currentTimeWithDaysOffset(10)  // expires in 10 days
        )
        let createProjTxSigned = await bobClient.signTransaction(createProjTx)
        let createProjTxHash = await grpcClient.postTransaction(createProjTxSigned, coopId)
        await util.waitTxProcessed(createProjTxHash)

        let addProjWalletTx = await grpcClient.generateAddWalletTx(createProjTxHash, coopId)
        let addProjWalletTxSigned = await clients.owner().signTransaction(addProjWalletTx)
        let addProjWalletTxHash = await grpcClient.postTransaction(addProjWalletTxSigned, coopId)
        await util.waitTxProcessed(addProjWalletTxHash)

        let bobInvestmentAmount = 100000
        let investTx = await grpcClient.generateInvestTx(addBobWalletTxHash, addProjWalletTxHash, bobInvestmentAmount)
        let investTxSigned = await bobClient.signTransaction(investTx)
        let investTxHash = await grpcClient.postTransaction(investTxSigned, coopId)
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
        let createSellOfferTxSigned = await bobClient.signTransaction(createSellOfferTx)
        let createSellOfferTxHash = await grpcClient.postTransaction(createSellOfferTxSigned, coopId)
        await util.waitTxProcessed(createSellOfferTxHash)

        let acceptSellOfferTx = (await axios.get(acceptSellOfferUrl, {
            params: {
                fromTxHash: addAliceWalletTxHash,
                sellOfferTxHash: createSellOfferTxHash,
                counterOfferPrice: sharesPrice / 2
            }
        })).data.tx
        let acceptSellOfferTxSigned = await aliceClient.signTransaction(acceptSellOfferTx)
        let acceptSellOfferTxHash = await grpcClient.postTransaction(acceptSellOfferTxSigned, coopId)
        await util.waitTxProcessed(acceptSellOfferTxHash)

        let activeOffers = await grpcClient.getActiveSellOffers(coopId)
        console.log("active offers", activeOffers)

        let acceptCounterOfferTx = (await axios.get(acceptCounterOfferUrl, {
            params: {
                fromTxHash: addBobWalletTxHash,
                sellOfferTxHash: createSellOfferTxHash,
                buyerTxHash: addAliceWalletTxHash 
            }
        })).data.tx
        let acceptCounterOfferTxSigned = await clients.bob().signTransaction(acceptCounterOfferTx)
        let acceptCounterOfferTxHash = await grpcClient.postTransaction(acceptCounterOfferTxSigned, coopId)
        await util.waitTxProcessed(acceptCounterOfferTxHash)
    })

})