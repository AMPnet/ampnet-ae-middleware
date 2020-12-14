let { Crypto, Node, Universal: Ae, MemoryAccount } = require('@aeternity/aepp-sdk')
let chai = require('chai');
let assert = chai.assert;

let config = require('../config')

let grpcClient = require('./grpc/client')
let clients = require('./ae/clients')
let util = require('./util/util')
let db = require('./util/db')

describe('Precondition checks test', function() {

    before(async () => {
        await db.clearTransactions(adminWalletTx.hash)
    })

    it('Should return correct error messages if invest or revenue share payout transactions do not meet required conditions', async () => {
        let bobWallet = Crypto.generateKeyPair()
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
        
        let addBobWalletTx = await grpcClient.generateAddWalletTx(bobWallet.publicKey, coopId)
        let addBobWalletTxSigned = await clients.owner().signTransaction(addBobWalletTx)
        let addBobWalletTxHash = await grpcClient.postTransaction(addBobWalletTxSigned, coopId)
        await util.waitTxProcessed(addBobWalletTxHash)

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

        let faultyRevenueSharePayoutTx = await grpcClient.generateStartRevenueSharesPayoutTx(addBobWalletTxHash, addProjWalletTxHash, 100000)
        assert.equal(faultyRevenueSharePayoutTx.details, "645 > Can not start revenue share payout on project which is still in funding phase.")

        let faultyInvestTx = await grpcClient.generateInvestTx(addBobWalletTxHash, addProjWalletTxHash, 10000)
        assert.equal(faultyInvestTx.details, "638 > Can not invest. Insufficient funds.")
    })

})