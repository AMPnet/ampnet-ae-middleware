let path = require('path')
let chai = require('chai');
let assert = chai.assert;

let enums = require('../enums/enums')
let grpcServer = require('../grpc/server')
let { TxType, TxState, SupervisorStatus, WalletType } = require('../enums/enums')

let grpcClient = require('./grpc/client')
let deployer = require('./ae/deployer')
let accounts = require('./ae/accounts')
let clients = require('./ae/clients')
let util = require('./util/util')
let db = require('./util/db')

let config = require('../config')

describe('Main tests', function() {

    beforeEach(async() => {
        // await deployer.deploy()
        await grpcServer.start()
        await grpcClient.start()
        await clients.init()
        await db.init()
    })

    afterEach(async() => {
        await grpcServer.stop()
    })

    it('Should be possible to run one complete life-cycle of a project to be funded', async () => {
        let addBobWalletTx = await grpcClient.generateAddWalletTx(accounts.bob.publicKey)
        console.log("tx", addBobWalletTx)
        let addBobWalletTxSigned = await clients.owner().signTransaction(addBobWalletTx)
        let addBobWalletTxHash = await grpcClient.postTransaction(addBobWalletTxSigned)
        await util.waitMined(addBobWalletTxHash)

        let bobBalanceBeforeDeposit = await grpcClient.getBalance(addBobWalletTxHash)
        assert.equal(bobBalanceBeforeDeposit, 0)

        let createOrgTx = await grpcClient.generateCreateOrganizationTx(addBobWalletTxHash)
        let createOrgTxSigned = await clients.bob().signTransaction(createOrgTx)
        let createOrgTxHash = await grpcClient.postTransaction(createOrgTxSigned)
        
        await util.waitMined(createOrgTxHash)
        let addOrgWalletTx = await grpcClient.generateAddWalletTx(createOrgTxHash)
        let addOrgWalletTxSigned = await clients.owner().signTransaction(addOrgWalletTx)
        let addOrgWalletTxHash = await grpcClient.postTransaction(addOrgWalletTxSigned)
        await util.waitMined(addOrgWalletTxHash)

        let mintToBobAmount = 101000
        let mintToBobTx = await grpcClient.generateMintTx(addBobWalletTxHash, mintToBobAmount)
        let mintToBobTxSigned = await clients.owner().signTransaction(mintToBobTx)
        let mintToBobTxHash = await grpcClient.postTransaction(mintToBobTxSigned)
        await util.waitMined(mintToBobTxHash)

        let bobBalanceAfterDeposit = await grpcClient.getBalance(addBobWalletTxHash)
        assert.equal(bobBalanceAfterDeposit, mintToBobAmount)

        let withdrawFromBobAmount = 1000
        let approveBobWithdrawTx = await grpcClient.generateApproveWithdrawTx(addBobWalletTxHash, withdrawFromBobAmount)
        let approveBobWithdrawTxSigned = await clients.bob().signTransaction(approveBobWithdrawTx)
        let approveBobWithdrawTxHash = await grpcClient.postTransaction(approveBobWithdrawTxSigned)
        await util.waitMined(approveBobWithdrawTxHash)

        let burnFromBobTx = await grpcClient.generateBurnFromTx(addBobWalletTxHash)
        let burnFromBobTxSigned = await clients.owner().signTransaction(burnFromBobTx)
        let burnFromBobTxHash = await grpcClient.postTransaction(burnFromBobTxSigned)
        await util.waitMined(burnFromBobTxHash)

        let bobBalanceAfterWithdraw = await grpcClient.getBalance(addBobWalletTxHash)
        assert.equal(bobBalanceAfterWithdraw, mintToBobAmount - withdrawFromBobAmount)

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
        await util.waitMined(createProjTxHash)
        
        let addProjWalletTx = await grpcClient.generateAddWalletTx(createProjTxHash)
        let addProjWalletTxSigned = await clients.owner().signTransaction(addProjWalletTx)
        let addProjWalletTxHash = await grpcClient.postTransaction(addProjWalletTxSigned)
        await util.waitMined(addProjWalletTxHash)
        
        let bobInvestmentAmount = 100000
        let investTx = await grpcClient.generateInvestTx(addBobWalletTxHash, addProjWalletTxHash, bobInvestmentAmount)
        let investTxSigned = await clients.bob().signTransaction(investTx)
        let investTxHash = await grpcClient.postTransaction(investTxSigned)
        await util.waitMined(investTxHash)

        console.log("Wait for next block to be mined (for investment to be fully processed)")
        await util.waitNextBlock(investTxHash)

        let bobBalanceAfterInvestment = await grpcClient.getBalance(addBobWalletTxHash)
        assert.equal(bobBalanceAfterInvestment, mintToBobAmount - withdrawFromBobAmount - bobInvestmentAmount)

        let revenueToPayout = 1000
        let revenuePayoutTx = await grpcClient.generateStartRevenueSharesPayoutTx(addBobWalletTxHash, addProjWalletTxHash, revenueToPayout)
        let revenuePayoutTxSigned = await clients.bob().signTransaction(revenuePayoutTx)
        let revenuePayoutTxHash = await grpcClient.postTransaction(revenuePayoutTxSigned)
        await util.waitMined(revenuePayoutTxHash)
        
        console.log("Wait for next block to be mined (for supervisor to process revenue share payout)")
        await util.waitNextBlock(revenuePayoutTxHash)

        let bobBalanceAfterRevenuePayout = await grpcClient.getBalance(addBobWalletTxHash)
        assert.equal(bobBalanceAfterRevenuePayout, mintToBobAmount - withdrawFromBobAmount - bobInvestmentAmount + revenueToPayout)
        
        let bobPortfolio = await grpcClient.getPortfolio(addBobWalletTxHash)
        assert.strictEqual(bobPortfolio.length, 1, `Expected fetched Bob portfolio to contain 1 investment`)
        assert.strictEqual(bobPortfolio[0].projectTxHash, addProjWalletTxHash)
        assert.equal(bobPortfolio[0].amount, bobInvestmentAmount)
        
        let bobTransactions = await grpcClient.getTransactions(addBobWalletTxHash)
        assert.strictEqual(bobTransactions.length, 4)
        
        let bobTransactionsDeposit = bobTransactions.filter(t => { return t.type == enums.txTypeToGrpc(TxType.DEPOSIT) })[0]
        assert.equal(bobTransactionsDeposit.amount, mintToBobAmount)
        assert.exists(bobTransactionsDeposit.date)
        let bobTransactionsWithdraw = bobTransactions.filter(t => { return t.type == enums.txTypeToGrpc(TxType.WITHDRAW) })[0]
        assert.equal(bobTransactionsWithdraw.amount, withdrawFromBobAmount)
        assert.exists(bobTransactionsWithdraw.date)
        let bobTransactionsInvest = bobTransactions.filter(t => { return t.type == enums.txTypeToGrpc(TxType.INVEST) })[0]
        assert.strictEqual(bobTransactionsInvest.fromTxHash, addBobWalletTxHash)
        assert.strictEqual(bobTransactionsInvest.toTxHash, addProjWalletTxHash)
        assert.equal(bobTransactionsInvest.amount, bobInvestmentAmount)
        assert.exists(bobTransactionsInvest.date)
        let bobTransactionsPayout = bobTransactions.filter(t => { return t.type == enums.txTypeToGrpc(TxType.SHARE_PAYOUT) })[0]
        assert.strictEqual(bobTransactionsPayout.fromTxHash, addProjWalletTxHash)
        assert.strictEqual(bobTransactionsPayout.toTxHash, addBobWalletTxHash)
        assert.equal(bobTransactionsPayout.amount, revenueToPayout)
        assert.exists(bobTransactionsPayout.date)

        let bobInvestmentsInProject = await grpcClient.getInvestmentsInProject(addBobWalletTxHash, addProjWalletTxHash)
        assert.strictEqual(bobInvestmentsInProject.length, 1)
        let bobInvestmentInProject = bobInvestmentsInProject[0]
        assert.equal(bobInvestmentInProject.amount, bobInvestmentAmount)
        assert.exists(bobInvestmentInProject.date)

        let expectedRecordCount = 12
        let allRecords = await db.getAll()
        let recordsCount = allRecords.length
        assert.strictEqual(recordsCount, expectedRecordCount, `Expected ${expectedRecordCount} transactions but found ${recordsCount} in database.`)
        
        let addBobWalletTxRecord = (await db.getBy({hash: addBobWalletTxHash}))[0]
        assert.strictEqual(addBobWalletTxRecord.from_wallet, config.get().contracts.coop.owner)
        assert.strictEqual(addBobWalletTxRecord.to_wallet, accounts.bob.publicKey)
        assert.strictEqual(addBobWalletTxRecord.state, TxState.MINED)
        assert.strictEqual(addBobWalletTxRecord.supervisor_status, SupervisorStatus.PROCESSED)
        assert.strictEqual(addBobWalletTxRecord.type, TxType.WALLET_CREATE)
        assert.strictEqual(addBobWalletTxRecord.wallet_type, WalletType.USER)
        
        let createOrgTxRecord = (await db.getBy({hash: createOrgTxHash}))[0]
        assert.strictEqual(createOrgTxRecord.from_wallet, accounts.bob.publicKey)
        assert.isNotNull(createOrgTxRecord.to_wallet)
        assert.strictEqual(createOrgTxRecord.state, TxState.MINED)
        assert.strictEqual(createOrgTxRecord.supervisor_status, SupervisorStatus.NOT_REQUIRED)
        assert.strictEqual(createOrgTxRecord.type, TxType.ORG_CREATE)
        assert.isNull(createOrgTxRecord.wallet)
        let newOrgWallet = createOrgTxRecord.to_wallet
        
        let addOrgWalletTxRecord = (await db.getBy({hash: addOrgWalletTxHash}))[0]
        assert.strictEqual(addOrgWalletTxRecord.from_wallet, config.get().contracts.coop.owner)
        assert.strictEqual(addOrgWalletTxRecord.to_wallet, newOrgWallet)
        assert.strictEqual(addOrgWalletTxRecord.state, TxState.MINED)
        assert.strictEqual(addOrgWalletTxRecord.supervisor_status, SupervisorStatus.NOT_REQUIRED)
        assert.strictEqual(addOrgWalletTxRecord.type, TxType.WALLET_CREATE)
        assert.strictEqual(addOrgWalletTxRecord.wallet, newOrgWallet)
        assert.strictEqual(addOrgWalletTxRecord.wallet_type, WalletType.ORGANIZATION)
        
        let mintToBobTxRecord = (await db.getBy({hash: mintToBobTxHash}))[0]
        assert.strictEqual(mintToBobTxRecord.from_wallet, config.get().contracts.eur.owner)
        assert.strictEqual(mintToBobTxRecord.to_wallet, accounts.bob.publicKey)
        assert.strictEqual(mintToBobTxRecord.state, TxState.MINED)
        assert.strictEqual(mintToBobTxRecord.supervisor_status, SupervisorStatus.NOT_REQUIRED)
        assert.strictEqual(mintToBobTxRecord.type, TxType.DEPOSIT)
        assert.equal(mintToBobTxRecord.amount, mintToBobAmount)

        let approveBobWithdrawTxRecord = (await db.getBy({hash: approveBobWithdrawTxHash}))[0]
        assert.strictEqual(approveBobWithdrawTxRecord.from_wallet, accounts.bob.publicKey)
        assert.strictEqual(approveBobWithdrawTxRecord.to_wallet, config.get().contracts.eur.owner)
        assert.strictEqual(approveBobWithdrawTxRecord.state, TxState.MINED)
        assert.strictEqual(approveBobWithdrawTxRecord.supervisor_status, SupervisorStatus.NOT_REQUIRED)
        assert.strictEqual(approveBobWithdrawTxRecord.type, TxType.APPROVE_USER_WITHDRAW)
        assert.equal(approveBobWithdrawTxRecord.amount, withdrawFromBobAmount)
        
        let bobWithdrawTxRecord = (await db.getBy({hash: burnFromBobTxHash}))[0]
        assert.strictEqual(bobWithdrawTxRecord.from_wallet, accounts.bob.publicKey)
        assert.strictEqual(bobWithdrawTxRecord.to_wallet, config.get().contracts.eur.owner)
        assert.strictEqual(bobWithdrawTxRecord.state, TxState.MINED)
        assert.strictEqual(bobWithdrawTxRecord.supervisor_status, SupervisorStatus.NOT_REQUIRED)
        assert.strictEqual(bobWithdrawTxRecord.type, TxType.WITHDRAW)
        assert.equal(bobWithdrawTxRecord.amount, withdrawFromBobAmount)
        
        let createProjTxRecord = (await db.getBy({hash: createProjTxHash}))[0]
        assert.strictEqual(createProjTxRecord.from_wallet, accounts.bob.publicKey)
        assert.isNotNull(createProjTxRecord.to_wallet)
        assert.strictEqual(createProjTxRecord.state, TxState.MINED)
        assert.strictEqual(createProjTxRecord.supervisor_status, SupervisorStatus.NOT_REQUIRED)
        assert.strictEqual(createProjTxRecord.type, TxType.PROJ_CREATE)
        assert.isNull(createProjTxRecord.wallet)
        let newProjWallet = createProjTxRecord.to_wallet
        
        let addProjWalletTxRecord = (await db.getBy({hash: addProjWalletTxHash}))[0]
        assert.strictEqual(addProjWalletTxRecord.from_wallet, config.get().contracts.coop.owner)
        assert.strictEqual(addProjWalletTxRecord.to_wallet, newProjWallet)
        assert.strictEqual(addProjWalletTxRecord.state, TxState.MINED)
        assert.strictEqual(addProjWalletTxRecord.supervisor_status, SupervisorStatus.NOT_REQUIRED)
        assert.strictEqual(addProjWalletTxRecord.type, TxType.WALLET_CREATE)
        assert.strictEqual(addProjWalletTxRecord.wallet, newProjWallet)
        assert.strictEqual(addProjWalletTxRecord.wallet_type, WalletType.PROJECT)

        let approveInvestmentTxRecord = (await db.getBy({hash: investTxHash}))[0]
        assert.strictEqual(approveInvestmentTxRecord.from_wallet, accounts.bob.publicKey)
        assert.strictEqual(approveInvestmentTxRecord.to_wallet, newProjWallet)
        assert.strictEqual(approveInvestmentTxRecord.state, TxState.MINED)
        assert.strictEqual(approveInvestmentTxRecord.supervisor_status, SupervisorStatus.PROCESSED)
        assert.strictEqual(approveInvestmentTxRecord.type, TxType.APPROVE_INVESTMENT)
        assert.equal(approveInvestmentTxRecord.amount, bobInvestmentAmount)

        let investmentTxRecord = (await db.getBy({type: TxType.INVEST}))[0]
        assert.strictEqual(investmentTxRecord.from_wallet, accounts.bob.publicKey)
        assert.strictEqual(investmentTxRecord.to_wallet, newProjWallet)
        assert.strictEqual(investmentTxRecord.state, TxState.MINED)
        assert.strictEqual(investmentTxRecord.supervisor_status, SupervisorStatus.NOT_REQUIRED)
        assert.strictEqual(investmentTxRecord.type, TxType.INVEST)
        assert.equal(investmentTxRecord.amount, bobInvestmentAmount)
        
        let startRevenuePayoutTxRecord = (await db.getBy({hash: revenuePayoutTxHash}))[0]
        assert.strictEqual(startRevenuePayoutTxRecord.from_wallet, accounts.bob.publicKey)
        assert.strictEqual(startRevenuePayoutTxRecord.to_wallet, newProjWallet)
        assert.strictEqual(startRevenuePayoutTxRecord.state, TxState.MINED)
        assert.strictEqual(startRevenuePayoutTxRecord.supervisor_status, SupervisorStatus.PROCESSED)
        assert.strictEqual(startRevenuePayoutTxRecord.type, TxType.START_REVENUE_PAYOUT)
        assert.equal(startRevenuePayoutTxRecord.amount, revenueToPayout)

        let revenueSharePayoutTxRecord = (await db.getBy({type: TxType.SHARE_PAYOUT}))[0]
        assert.strictEqual(revenueSharePayoutTxRecord.from_wallet, newProjWallet)
        assert.strictEqual(revenueSharePayoutTxRecord.to_wallet, accounts.bob.publicKey)
        assert.strictEqual(revenueSharePayoutTxRecord.state, TxState.MINED)
        assert.strictEqual(revenueSharePayoutTxRecord.supervisor_status, SupervisorStatus.NOT_REQUIRED)
        assert.strictEqual(revenueSharePayoutTxRecord.type, TxType.SHARE_PAYOUT)
        assert.equal(revenueSharePayoutTxRecord.amount, revenueToPayout)
    })

})