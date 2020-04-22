let path = require('path')
let chai = require('chai')
let axios = require('axios')
let assert = chai.assert

let enums = require('../enums/enums')
let grpcServer = require('../grpc/server')
let supervisor = require('../supervisor')
let aeUtil = require('../ae/util')
let { TxType, TxState, SupervisorStatus, WalletType } = require('../enums/enums')

let grpcClient = require('./grpc/client')
let accounts = require('./ae/accounts')
let clients = require('./ae/clients')
let util = require('./util/util')
let db = require('./util/db')

let config = require('../config')

describe('Happy path scenario', function() {

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

    it('should be able to fetch platform summary', async () => {
        let summaryUrl = `http://0.0.0.0:${config.get().http.port}/summary`

        let summaryBefore = (await axios.get(summaryUrl)).data
        assert.strictEqual(summaryBefore.number_of_funded_projects, 0)
        assert.strictEqual(summaryBefore.average_project_size, 0)
        assert.strictEqual(summaryBefore.average_funded_project_size, 0)
        assert.strictEqual(summaryBefore.average_user_investment, 0)
        assert.strictEqual(summaryBefore.total_money_raised, 0)

        let addBobWalletTx = await grpcClient.generateAddWalletTx(accounts.bob.publicKey)
        let addBobWalletTxSigned = await clients.owner().signTransaction(addBobWalletTx)
        let addBobWalletTxHash = await grpcClient.postTransaction(addBobWalletTxSigned)
        await util.waitTxProcessed(addBobWalletTxHash)

        let addAliceWalletTx = await grpcClient.generateAddWalletTx(accounts.alice.publicKey)
        let addAliceWalletTxSigned = await clients.owner().signTransaction(addAliceWalletTx)
        let addAliceWalletTxHash = await grpcClient.postTransaction(addAliceWalletTxSigned)
        await util.waitTxProcessed(addAliceWalletTxHash)

        let createOrgTx = await grpcClient.generateCreateOrganizationTx(addBobWalletTxHash)
        let createOrgTxSigned = await clients.bob().signTransaction(createOrgTx)
        let createOrgTxHash = await grpcClient.postTransaction(createOrgTxSigned)
        await util.waitTxProcessed(createOrgTxHash)

        let addOrgWalletTx = await grpcClient.generateAddWalletTx(createOrgTxHash)
        let addOrgWalletTxSigned = await clients.owner().signTransaction(addOrgWalletTx)
        let addOrgWalletTxHash = await grpcClient.postTransaction(addOrgWalletTxSigned)
        await util.waitTxProcessed(addOrgWalletTxHash)

        let mintToBobTx = await grpcClient.generateMintTx(addBobWalletTxHash, 100000000)
        let mintToBobTxSigned = await clients.owner().signTransaction(mintToBobTx)
        let mintToBobTxHash = await grpcClient.postTransaction(mintToBobTxSigned)
        await util.waitTxProcessed(mintToBobTxHash)

        let mintToAliceTx = await grpcClient.generateMintTx(addAliceWalletTxHash, 100000000)
        let mintToAliceTxSigned = await clients.owner().signTransaction(mintToAliceTx)
        let mintToAliceTxHash = await grpcClient.postTransaction(mintToAliceTxSigned)
        await util.waitTxProcessed(mintToAliceTxHash)

        let fundedProjectMinPerUser = 10000
        let fundedProjectMaxPerUser = 100000
        let fundedProjectInvestmentCap = 100000
        let createFundedProjTx = await grpcClient.generateCreateProjectTx(
            addBobWalletTxHash,
            addOrgWalletTxHash,
            fundedProjectMinPerUser,
            fundedProjectMaxPerUser,
            fundedProjectInvestmentCap,
            util.currentTimeWithDaysOffset(10) 
        )
        let createFundedProjTxSigned = await clients.bob().signTransaction(createFundedProjTx)
        let createFundedProjTxHash = await grpcClient.postTransaction(createFundedProjTxSigned)
        await util.waitTxProcessed(createFundedProjTxHash)

        let addFundedProjWalletTx = await grpcClient.generateAddWalletTx(createFundedProjTxHash)
        let addFundedProjWalletTxSigned = await clients.owner().signTransaction(addFundedProjWalletTx)
        let addFundedProjWalletTxHash = await grpcClient.postTransaction(addFundedProjWalletTxSigned)
        await util.waitTxProcessed(addFundedProjWalletTxHash)

        let bobInvestTx = await grpcClient.generateInvestTx(addBobWalletTxHash, addFundedProjWalletTxHash, 30000)
        let bobInvestTxSigned = await clients.bob().signTransaction(bobInvestTx)
        let bobInvestTxHash = await grpcClient.postTransaction(bobInvestTxSigned)
        await util.waitTxProcessed(bobInvestTxHash)

        let aliceInvestTx = await grpcClient.generateInvestTx(addAliceWalletTxHash, addFundedProjWalletTxHash, 70000)
        let aliceInvestTxSigned = await clients.alice().signTransaction(aliceInvestTx)
        let aliceInvestTxHash = await grpcClient.postTransaction(aliceInvestTxSigned)
        await util.waitTxProcessed(aliceInvestTxHash)
        
        let nonFundedProjectMinPerUser = 10000
        let nonFundedProjectMaxPerUser = 100000
        let nonFundedProjectInvestmentCap = 200000
        let createNonFundedProjTx = await grpcClient.generateCreateProjectTx(
            addBobWalletTxHash,
            addOrgWalletTxHash,
            nonFundedProjectMinPerUser,
            nonFundedProjectMaxPerUser,
            nonFundedProjectInvestmentCap,
            util.currentTimeWithDaysOffset(10) 
        )
        let createNonFundedProjTxSigned = await clients.bob().signTransaction(createNonFundedProjTx)
        let createNonFundedProjTxHash = await grpcClient.postTransaction(createNonFundedProjTxSigned)
        await util.waitTxProcessed(createNonFundedProjTxHash)

        let addNonFundedProjWalletTx = await grpcClient.generateAddWalletTx(createNonFundedProjTxHash)
        let addNonFundedProjWalletTxSigned = await clients.owner().signTransaction(addNonFundedProjWalletTx)
        let addNonFundedProjWalletTxHash = await grpcClient.postTransaction(addNonFundedProjWalletTxSigned)
        await util.waitTxProcessed(addNonFundedProjWalletTxHash)

        let secondBobInvestTx = await grpcClient.generateInvestTx(addBobWalletTxHash, addNonFundedProjWalletTxHash, 10000)
        let secondBobInvestTxSigned = await clients.bob().signTransaction(secondBobInvestTx)
        let secondBobInvestTxHash = await grpcClient.postTransaction(secondBobInvestTxSigned)
        await util.waitTxProcessed(secondBobInvestTxHash)

        let thirdBobInvestTx = await grpcClient.generateInvestTx(addBobWalletTxHash, addNonFundedProjWalletTxHash, 10000)
        let thirdBobInvestTxSigned = await clients.bob().signTransaction(thirdBobInvestTx)
        let thirdBobInvestTxHash = await grpcClient.postTransaction(thirdBobInvestTxSigned)
        await util.waitTxProcessed(thirdBobInvestTxHash)
        
        let bobCancelTx = await grpcClient.generateCancelInvestmentTx(addBobWalletTxHash, addNonFundedProjWalletTxHash)
        let bobCancelTxSigned = await clients.bob().signTransaction(bobCancelTx)
        let bobCancelTxHash = await grpcClient.postTransaction(bobCancelTxSigned)
        await util.waitTxProcessed(bobCancelTxHash)

        let secondAliceInvestTx = await grpcClient.generateInvestTx(addAliceWalletTxHash, addNonFundedProjWalletTxHash, 20000)
        let secondAliceInvestTxSigned = await clients.alice().signTransaction(secondAliceInvestTx)
        let secondAliceInvestTxHash = await grpcClient.postTransaction(secondAliceInvestTxSigned)
        await util.waitTxProcessed(secondAliceInvestTxHash)

        let randomProjectMinPerUser = 10000
        let randomProjectMaxPerUser = 100000
        let randomProjectInvestmentCap = 500000
        let createRandomProjTx = await grpcClient.generateCreateProjectTx(
            addBobWalletTxHash,
            addOrgWalletTxHash,
            randomProjectMinPerUser,
            randomProjectMaxPerUser,
            randomProjectInvestmentCap,
            util.currentTimeWithDaysOffset(10) 
        )
        let createRandomProjTxSigned = await clients.bob().signTransaction(createRandomProjTx)
        let createRandomProjTxHash = await grpcClient.postTransaction(createRandomProjTxSigned)
        await util.waitTxProcessed(createRandomProjTxHash)

        let addRandomProjWalletTx = await grpcClient.generateAddWalletTx(createRandomProjTxHash)
        let addRandomProjWalletTxSigned = await clients.owner().signTransaction(addRandomProjWalletTx)
        let addRandomProjWalletTxHash = await grpcClient.postTransaction(addRandomProjWalletTxSigned)
        await util.waitTxProcessed(addRandomProjWalletTxHash)

        let unactivatedProjectMinPerUser = 10000
        let unactivatedProjectMaxPerUser = 100000
        let unactivatedProjectInvestmentCap = 500000
        let createUnactivatedProjTx = await grpcClient.generateCreateProjectTx(
            addBobWalletTxHash,
            addOrgWalletTxHash,
            unactivatedProjectMinPerUser,
            unactivatedProjectMaxPerUser,
            unactivatedProjectInvestmentCap,
            util.currentTimeWithDaysOffset(10) 
        )
        let createUnactivatedProjTxSigned = await clients.bob().signTransaction(createUnactivatedProjTx)
        let createUnactivatedProjTxHash = await grpcClient.postTransaction(createUnactivatedProjTxSigned)
        await util.waitTxProcessed(createUnactivatedProjTxHash)

        let allRecords = await db.getAll()
        console.log("all records", allRecords)

        let summary = (await axios.get(summaryUrl)).data
        assert.strictEqual(summary.number_of_funded_projects, 1)
        assert.strictEqual(summary.average_project_size, 150000)
        assert.strictEqual(summary.average_funded_project_size, 100000)
        assert.strictEqual(summary.average_user_investment, 40000)
        assert.strictEqual(summary.total_money_raised, 120000)
    })

})