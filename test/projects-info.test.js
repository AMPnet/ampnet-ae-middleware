let chai = require('chai');
let assert = chai.assert;

let config = require('../config')
let client = require('../ae/client')
let supervisor = require('../queue/queue')
let grpcServer = require('../grpc/server')
let { TxType, TxState, SupervisorStatus, WalletType } = require('../enums/enums')

let clients = require('./ae/clients')
let grpcClient = require('./grpc/client')
let accounts = require('./ae/accounts')
let util = require('./util/util')
let db = require('./util/db')


describe('Test fetching information for list of given projects', function() {

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

    it('Should be able to fetch info for list of given projects', async () => {
        let addBobWalletTx = await grpcClient.generateAddWalletTx(accounts.bob.publicKey)
        let addBobWalletTxSigned = await clients.owner().signTransaction(addBobWalletTx)
        let addBobWalletTxHash = await grpcClient.postTransaction(addBobWalletTxSigned)
        await util.waitTxProcessed(addBobWalletTxHash)

        let bobBalanceBeforeDeposit = await grpcClient.getBalance(addBobWalletTxHash)
        assert.equal(bobBalanceBeforeDeposit, 0)

        let createOrgTx = await grpcClient.generateCreateOrganizationTx(addBobWalletTxHash)
        let createOrgTxSigned = await clients.bob().signTransaction(createOrgTx)
        let createOrgTxHash = await grpcClient.postTransaction(createOrgTxSigned)
        await util.waitTxProcessed(createOrgTxHash)

        let addOrgWalletTx = await grpcClient.generateAddWalletTx(createOrgTxHash)
        let addOrgWalletTxSigned = await clients.owner().signTransaction(addOrgWalletTx)
        let addOrgWalletTxHash = await grpcClient.postTransaction(addOrgWalletTxSigned)
        await util.waitTxProcessed(addOrgWalletTxHash)

        let firstProjMinPerUser = 100
        let firstProjMaxPerUser = 200
        let firstProjInvestmentCap = 300
        let firstProjEndsAt = util.currentTimeWithDaysOffset(400)
        let createFirstProjTx = await grpcClient.generateCreateProjectTx(
            addBobWalletTxHash,
            addOrgWalletTxHash,
            firstProjMinPerUser,
            firstProjMaxPerUser,
            firstProjInvestmentCap,
            firstProjEndsAt                         
        )
        let createFirstProjTxSigned = await clients.bob().signTransaction(createFirstProjTx)
        let createFirstProjTxHash = await grpcClient.postTransaction(createFirstProjTxSigned)
        await util.waitTxProcessed(createFirstProjTxHash)
        
        let addFirstProjWalletTx = await grpcClient.generateAddWalletTx(createFirstProjTxHash)
        let addFirstProjWalletTxSigned = await clients.owner().signTransaction(addFirstProjWalletTx)
        let addFirstProjWalletTxHash = await grpcClient.postTransaction(addFirstProjWalletTxSigned)
        await util.waitTxProcessed(addFirstProjWalletTxHash)


        let secondProjMinPerUser = 500
        let secondProjMaxPerUser = 600
        let secondProjInvestmentCap = 700
        let secondProjEndsAt = util.currentTimeWithDaysOffset(800)
        let createSecondProjTx = await grpcClient.generateCreateProjectTx(
            addBobWalletTxHash,
            addOrgWalletTxHash,
            secondProjMinPerUser,
            secondProjMaxPerUser,
            secondProjInvestmentCap,
            secondProjEndsAt
        )
        let createSecondProjTxSigned = await clients.bob().signTransaction(createSecondProjTx)
        let createSecondProjTxHash = await grpcClient.postTransaction(createSecondProjTxSigned)
        await util.waitTxProcessed(createSecondProjTxHash)
        
        let addSecondProjWalletTx = await grpcClient.generateAddWalletTx(createSecondProjTxHash)
        let addSecondProjWalletTxSigned = await clients.owner().signTransaction(addSecondProjWalletTx)
        let addSecondProjWalletTxHash = await grpcClient.postTransaction(addSecondProjWalletTxSigned)
        await util.waitTxProcessed(addSecondProjWalletTxHash)

        let projectsInfo = await grpcClient.getProjectsInfo([addFirstProjWalletTxHash, addSecondProjWalletTxHash])        
        assert.strictEqual(projectsInfo.length, 2)
        
        let firstProject = projectsInfo.find(info => { return info.projectTxHash == addFirstProjWalletTxHash })
        assert.equal(firstProject.totalFundsRaised, 0)
        assert.equal(firstProject.investmentCap, firstProjInvestmentCap)
        assert.equal(firstProject.minPerUserInvestment, firstProjMinPerUser)
        assert.equal(firstProject.maxPerUserInvestment, firstProjMaxPerUser)
        assert.equal(firstProject.endsAt, firstProjEndsAt)
        assert.isFalse(firstProject.payoutInProcess)

        let secondProject = projectsInfo.find(info => { return info.projectTxHash == addSecondProjWalletTxHash })
        assert.equal(secondProject.totalFundsRaised, 0)
        assert.equal(secondProject.investmentCap, secondProjInvestmentCap)
        assert.equal(secondProject.minPerUserInvestment, secondProjMinPerUser)
        assert.equal(secondProject.maxPerUserInvestment, secondProjMaxPerUser)
        assert.equal(secondProject.endsAt, secondProjEndsAt)
        assert.isFalse(secondProject.payoutInProcess)
    })

    it('should return correct error message if some of the provided tx hashes do not represent project wallet creation transaction', async () => {
        let nonExistingProjectHash = "th_2s48ucdFRcCr4keCBHFh8oVzbLCukjdzn4sts31wT6Yq8jsBGM"
        let projectsInfo = await grpcClient.getProjectsInfo([nonExistingProjectHash])
        console.log("projectsInfo", projectsInfo)
    })

})