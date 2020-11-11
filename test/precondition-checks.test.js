let path = require('path')
let chai = require('chai');
let assert = chai.assert;
let { Crypto, Universal, Node, MemoryAccount } = require('@aeternity/aepp-sdk')

let enums = require('../enums/enums')
let grpcServer = require('../grpc/server')
let supervisor = require('../queue/queue')
let { TxType, TxState, SupervisorStatus, WalletType } = require('../enums/enums')

let grpcClient = require('./grpc/client')
let accounts = require('./ae/accounts')
let clients = require('./ae/clients')
let util = require('./util/util')
let db = require('./util/db')

let config = require('../config')

describe('Precondition checks test', function() {

    beforeEach(async() => {
        process.env['DB_SCAN_ENABLED'] = "false"
        process.env['AUTO_FUND'] = "false"
        await grpcServer.start()
        await grpcClient.start()
        await clients.init()
        await db.init()
    })

    afterEach(async() => {
        delete process.env.GIFT_AMOUNT
        await grpcServer.stop()
        await supervisor.stop()
    })

    it('Should return correct error messages if invest or revenue share payout transactions do not meet required conditions', async () => {
        let addBobWalletTx = await grpcClient.generateAddWalletTx(accounts.bob.publicKey)
        let addBobWalletTxSigned = await clients.owner().signTransaction(addBobWalletTx)
        let addBobWalletTxHash = await grpcClient.postTransaction(addBobWalletTxSigned)
        await util.waitTxProcessed(addBobWalletTxHash)

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

        let faultyRevenueSharePayoutTx = await grpcClient.generateStartRevenueSharesPayoutTx(addBobWalletTxHash, addProjWalletTxHash, 100000)
        assert.equal(faultyRevenueSharePayoutTx.details, "60 > Can not start revenue share payout on project which is still in funding phase.")

        let faultyInvestTx = await grpcClient.generateInvestTx(addBobWalletTxHash, addProjWalletTxHash, 10000)
        assert.equal(faultyInvestTx.details, "60 > Can not invest. Insufficient funds.")
    })

})