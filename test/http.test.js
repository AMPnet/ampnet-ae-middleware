let chai = require('chai')
let axios = require('axios')
let assert = chai.assert;

let grpcServer = require('../grpc/server')
let supervisor = require('../queue/queue')

let grpcClient = require('./grpc/client')
let accounts = require('./ae/accounts')
let clients = require('./ae/clients')
let util = require('./util/util')
let db = require('./util/db')

let config = require('../config')

describe('HTTP endpoints tests', function() {

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

    it('Should be able to fetch info for a single project', async () => {
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
        let createProjTxSigned = await clients.bob().signTransaction(createProjTx)
        let createProjTxHash = await grpcClient.postTransaction(createProjTxSigned)
        await util.waitTxProcessed(createProjTxHash)

        let addProjWalletTx = await grpcClient.generateAddWalletTx(createProjTxHash)
        let addProjWalletTxSigned = await clients.owner().signTransaction(addProjWalletTx)
        let addProjWalletTxHash = await grpcClient.postTransaction(addProjWalletTxSigned)
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
})
