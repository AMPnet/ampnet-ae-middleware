let chai = require('chai')
let axios = require('axios')
let { Crypto, Universal: Ae, Node, MemoryAccount } = require('@aeternity/aepp-sdk')
let assert = chai.assert;

let config = require('../config')

let grpcClient = require('./grpc/client')
let clients = require('./ae/clients')
let util = require('./util/util')
let db = require('./util/db')

describe('HTTP endpoints tests', function() {

    before(async () => {
        await db.clearTransactions(adminWalletTx.hash)

        bobWallet = Crypto.generateKeyPair()
        node = await Node({
            url: config.get().node.url,
            internalUrl: config.get().node.internalUrl
        })
        bobClient = await Ae({
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
        addBobWalletTx = await grpcClient.generateAddWalletTx(bobWallet.publicKey, coopId)
        addBobWalletTxSigned = await clients.owner().signTransaction(addBobWalletTx)
        addBobWalletTxHash = await grpcClient.postTransaction(addBobWalletTxSigned, coopId)
        await util.waitTxProcessed(addBobWalletTxHash)
    })

    it('Should be able to fetch info for a single project', async () => {
        let createOrgTx = await grpcClient.generateCreateOrganizationTx(addBobWalletTxHash)
        let createOrgTxSigned = await bobClient.signTransaction(createOrgTx)
        let createOrgTxHash = await grpcClient.postTransaction(createOrgTxSigned, coopId)
        await util.waitTxProcessed(createOrgTxHash)

        let addOrgWalletTx = await grpcClient.generateAddWalletTx(createOrgTxHash, coopId)
        let addOrgWalletTxSigned = await clients.owner().signTransaction(addOrgWalletTx)
        let addOrgWalletTxHash = await grpcClient.postTransaction(addOrgWalletTxSigned, coopId)
        await util.waitTxProcessed(addOrgWalletTxHash)

        let minPerUser = 10000
        let maxPerUser = 100000
        let investmentCap = 100000
        let endsAt = util.currentTimeWithDaysOffset(10) 
        let createProjTx = await grpcClient.generateCreateProjectTx(
            addBobWalletTxHash,
            addOrgWalletTxHash,
            minPerUser,                           // min 100$ per user
            maxPerUser,                           // max 1000$ per user
            investmentCap,                        // 1000$ investment cap
            endsAt                                // expires in 10 days
        )
        let createProjTxSigned = await bobClient.signTransaction(createProjTx)
        let createProjTxHash = await grpcClient.postTransaction(createProjTxSigned, coopId)
        await util.waitTxProcessed(createProjTxHash)

        let addProjWalletTx = await grpcClient.generateAddWalletTx(createProjTxHash, coopId)
        let addProjWalletTxSigned = await clients.owner().signTransaction(addProjWalletTx)
        let addProjWalletTxHash = await grpcClient.postTransaction(addProjWalletTxSigned, coopId)
        await util.waitTxProcessed(addProjWalletTxHash)

        let baseUrl = `http://0.0.0.0:${config.get().http.port}`
        let url = `${baseUrl}/projects/${addProjWalletTxHash}`
        let info = (await axios.get(url)).data
        assert.equal(info.projectHash, addProjWalletTxHash)
        assert.equal(info.minPerUserInvestment, minPerUser)
        assert.equal(info.maxPerUserInvestment, maxPerUser)
        assert.equal(info.investmentCap, investmentCap)
        assert.equal(info.endsAt, endsAt)
        assert.equal(info.totalFundsRaised, 0)
        assert.equal(info.payoutInProcess, false)
    })

    it('Should be able to fetch wallet balance', async () => {
        let baseUrl = `http://0.0.0.0:${config.get().http.port}`
        let url = `${baseUrl}/wallet/${addBobWalletTxHash}/balance`
        let response = (await axios.get(url)).data
        assert.strictEqual(response.wallet_hash, addBobWalletTxHash)
        assert.strictEqual(response.balance, 0)
    })
})
