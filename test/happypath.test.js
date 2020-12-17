let chai = require('chai')
let axios = require('axios')
let { Crypto, Node, Universal: Ae, MemoryAccount } = require('@aeternity/aepp-sdk')
let WebSocket = require('ws')
let assert = chai.assert

let enums = require('../enums/enums')
let aeUtil = require('../ae/util')
let config = require('../config')
let  projSvc = require('../service/project')
let { TxType, TxState, SupervisorStatus, WalletType } = require('../enums/enums')

let grpcClient = require('./grpc/client')
let clients = require('./ae/clients')
let util = require('./util/util')
let db = require('./util/db')

let contracts = require('../ae/contracts')

describe('Happy path scenario', function() {

    before(async () => {
        await db.clearTransactions(adminWalletTx.hash)
    })

    it('Should be possible to run one complete life-cycle of a project to be funded', async () => {   
        let bobWallet = Crypto.generateKeyPair()
        let aliceWallet = Crypto.generateKeyPair()
        let janeWallet = Crypto.generateKeyPair()

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
        let janeClient = await Ae({
            nodes: [
                { name: "node", instance: node } 
            ],
            compilerUrl: config.get().node.compilerUrl,
            accounts: [
                MemoryAccount({ keypair: janeWallet })
            ],
            address: janeWallet.publicKey,
            networkId: config.get().node.networkId
        })

        let socket = new WebSocket(`ws://localhost:${config.get().ws.port}/ws`)
        let bobWalletUpdates = 0
        socket.onopen = function(event) {
            socket.send(JSON.stringify({
                wallet: bobWallet.publicKey
            }))
        }
        socket.on('message', (data) => {
            let parsedJson = JSON.parse(data)
            if (parsedJson.wallet === bobWallet.publicKey) {
                bobWalletUpdates++ 
            }
        })

        let addBobWalletTx = await grpcClient.generateAddWalletTx(bobWallet.publicKey, coopId)
        let addBobWalletTxSigned = await clients.owner().signTransaction(addBobWalletTx)
        let addBobWalletTxHash = await grpcClient.postTransaction(addBobWalletTxSigned, coopId)
        await util.waitTxProcessed(addBobWalletTxHash)

        let addAliceWalletTx = await grpcClient.generateAddWalletTx(aliceWallet.publicKey, coopId)
        let addAliceWalletTxSigned = await clients.owner().signTransaction(addAliceWalletTx)
        let addAliceWalletTxHash = await grpcClient.postTransaction(addAliceWalletTxSigned, coopId)
        await util.waitTxProcessed(addAliceWalletTxHash)

        let addJaneWalletTx = await grpcClient.generateAddWalletTx(janeWallet.publicKey, coopId)
        let addJaneWalletTxSigned = await clients.owner().signTransaction(addJaneWalletTx)
        let addJaneWalletTxHash = await grpcClient.postTransaction(addJaneWalletTxSigned, coopId)
        await util.waitTxProcessed(addJaneWalletTxHash)

        let bobBalanceBeforeDeposit = await grpcClient.getBalance(addBobWalletTxHash)
        assert.equal(bobBalanceBeforeDeposit, 0)

        let createOrgTx = await grpcClient.generateCreateOrganizationTx(addBobWalletTxHash)
        let createOrgTxSigned = await bobClient.signTransaction(createOrgTx)
        let createOrgTxHash = await grpcClient.postTransaction(createOrgTxSigned, coopId)
        await util.waitTxProcessed(createOrgTxHash)

        let addOrgWalletTx = await grpcClient.generateAddWalletTx(createOrgTxHash, coopId)
        let addOrgWalletTxSigned = await clients.owner().signTransaction(addOrgWalletTx)
        let addOrgWalletTxHash = await grpcClient.postTransaction(addOrgWalletTxSigned, coopId)
        await util.waitTxProcessed(addOrgWalletTxHash)

        let mintToBobAmount = 101000
        let mintToBobTx = await grpcClient.generateMintTx(addBobWalletTxHash, mintToBobAmount)
        let mintToBobTxSigned = await clients.owner().signTransaction(mintToBobTx)
        let mintToBobTxHash = await grpcClient.postTransaction(mintToBobTxSigned, coopId)
        await util.waitTxProcessed(mintToBobTxHash)
        
        let mintToAliceAmount = 10000
        let mintToAliceTx = await grpcClient.generateMintTx(addAliceWalletTxHash, mintToAliceAmount)
        let mintToAliceTxSigned = await clients.owner().signTransaction(mintToAliceTx)
        let mintToAliceTxHash = await grpcClient.postTransaction(mintToAliceTxSigned, coopId)
        await util.waitTxProcessed(mintToAliceTxHash)

        let mintToJaneAmount = 100000
        let mintToJaneTx = await grpcClient.generateMintTx(addJaneWalletTxHash, mintToJaneAmount)
        let mintToJaneTxSigned = await clients.owner().signTransaction(mintToJaneTx)
        let mintToJaneTxHash = await grpcClient.postTransaction(mintToJaneTxSigned, coopId)
        await util.waitTxProcessed(mintToJaneTxHash)

        let bobBalanceAfterDeposit = await grpcClient.getBalance(addBobWalletTxHash)
        assert.equal(bobBalanceAfterDeposit, mintToBobAmount)

        let withdrawFromBobAmount = 1000
        let approveBobWithdrawTx = await grpcClient.generateApproveWithdrawTx(addBobWalletTxHash, withdrawFromBobAmount)
        let approveBobWithdrawTxSigned = await bobClient.signTransaction(approveBobWithdrawTx)
        let approveBobWithdrawTxHash = await grpcClient.postTransaction(approveBobWithdrawTxSigned, coopId)
        await util.waitTxProcessed(approveBobWithdrawTxHash)

        let burnFromBobTx = await grpcClient.generateBurnFromTx(addBobWalletTxHash)
        let burnFromBobTxSigned = await clients.owner().signTransaction(burnFromBobTx)
        let burnFromBobTxHash = await grpcClient.postTransaction(burnFromBobTxSigned, coopId)
        await util.waitTxProcessed(burnFromBobTxHash)

        let bobBalanceAfterWithdraw = await grpcClient.getBalance(addBobWalletTxHash)
        assert.equal(bobBalanceAfterWithdraw, mintToBobAmount - withdrawFromBobAmount)

        let minPerUser = 10000
        let maxPerUser = 100000
        let cap = 200000
        let endsAt = util.currentTimeWithDaysOffset(10)
        let createProjTx = await grpcClient.generateCreateProjectTx(
            addBobWalletTxHash,
            addOrgWalletTxHash,
            minPerUser,                             // min 100$ per user
            maxPerUser,                             // max 1000$ per user
            cap,                                    // 2000$ investment cap
            endsAt                                  // expires in 10 days
        )
        let createProjTxSigned = await bobClient.signTransaction(createProjTx)
        let createProjTxHash = await grpcClient.postTransaction(createProjTxSigned, coopId)
        await util.waitTxProcessed(createProjTxHash)
        
        let addProjWalletTx = await grpcClient.generateAddWalletTx(createProjTxHash, coopId)
        let addProjWalletTxSigned = await clients.owner().signTransaction(addProjWalletTx)
        let addProjWalletTxHash = await grpcClient.postTransaction(addProjWalletTxSigned, coopId)
        await util.waitTxProcessed(addProjWalletTxHash)

        let projDetailsUsingHttpUrl = `http://0.0.0.0:${config.get().http.port}/projects/${addProjWalletTxHash}`
        let projDetailsUsingHttp = (await axios.get(projDetailsUsingHttpUrl)).data
        assert.equal(projDetailsUsingHttp.minPerUserInvestment, minPerUser)
        assert.equal(projDetailsUsingHttp.maxPerUserInvestment, maxPerUser)
        assert.equal(projDetailsUsingHttp.investmentCap, cap)
        assert.equal(projDetailsUsingHttp.endsAt, endsAt)
        assert.equal(projDetailsUsingHttp.totalFundsRaised, 0)
        assert.equal(projDetailsUsingHttp.payoutInProcess, false)
        assert.equal(projDetailsUsingHttp.balance, 0)

        let aliceInvestmentAmount = mintToAliceAmount
        let aliceInvestTx = await grpcClient.generateInvestTx(addAliceWalletTxHash, addProjWalletTxHash, aliceInvestmentAmount)
        let aliceInvestTxSigned = await aliceClient.signTransaction(aliceInvestTx)
        let aliceInvestTxHash = await grpcClient.postTransaction(aliceInvestTxSigned, coopId)
        await util.waitTxProcessed(aliceInvestTxHash)

        let aliceBalanceBeforeCancelInvestment = await grpcClient.getBalance(addAliceWalletTxHash)
        assert.equal(aliceBalanceBeforeCancelInvestment, 0)

        let investmentDetailsUrl = `http://0.0.0.0:${config.get().http.port}/projects/${addProjWalletTxHash}/investors/${addAliceWalletTxHash}/details`
        let investmentDetails = (await axios.get(investmentDetailsUrl)).data
        assert.equal(investmentDetails.walletBalance, 0)
        assert.equal(investmentDetails.amountInvested, aliceInvestmentAmount)
        assert.equal(investmentDetails.totalFundsRaised, aliceInvestmentAmount)
        assert.equal(investmentDetails.investmentCancelable, true)
        assert.equal(investmentDetails.payoutInProcess, false)

        let aliceCancelInvestmentTx = await grpcClient.generateCancelInvestmentTx(addAliceWalletTxHash, addProjWalletTxHash)
        let aliceCancelInvestmentTxSigned = await aliceClient.signTransaction(aliceCancelInvestmentTx)
        let aliceCancelInvestmentTxHash = await grpcClient.postTransaction(aliceCancelInvestmentTxSigned, coopId)
        await util.waitTxProcessed(aliceCancelInvestmentTxHash)

        let aliceBalanceAfterCancelInvestment = await grpcClient.getBalance(addAliceWalletTxHash)
        assert.equal(aliceBalanceAfterCancelInvestment, mintToAliceAmount)
        
        let bobInvestmentAmount = 100000
        let investTx = await grpcClient.generateInvestTx(addBobWalletTxHash, addProjWalletTxHash, bobInvestmentAmount)
        let investTxSigned = await bobClient.signTransaction(investTx)
        let investTxHash = await grpcClient.postTransaction(investTxSigned, coopId)
        await util.waitTxProcessed(investTxHash)

        let bobBalanceAfterInvestment = await grpcClient.getBalance(addBobWalletTxHash)
        assert.equal(bobBalanceAfterInvestment, mintToBobAmount - withdrawFromBobAmount - bobInvestmentAmount)

        let janeInvestmentAmount = mintToJaneAmount
        let janeInvestTx = await grpcClient.generateInvestTx(addJaneWalletTxHash, addProjWalletTxHash, janeInvestmentAmount)
        let janeInvestTxSigned = await janeClient.signTransaction(janeInvestTx)
        let janeInvestTxHash = await grpcClient.postTransaction(janeInvestTxSigned, coopId)
        await util.waitTxProcessed(janeInvestTxHash)

        let withdrawInvestmentAmount = 200000 // withdraw all funds from project
        let approveProjectWithdrawTx = await grpcClient.generateApproveProjectWithdrawTx(addBobWalletTxHash, addProjWalletTxHash, withdrawInvestmentAmount) 
        let approveProjectWithdrawTxSigned = await bobClient.signTransaction(approveProjectWithdrawTx)
        let approveProjectWithdrawTxHash = await grpcClient.postTransaction(approveProjectWithdrawTxSigned, coopId)
        await util.waitTxProcessed(approveProjectWithdrawTxHash)

        let burnFromProjectTx = await grpcClient.generateBurnFromTx(addProjWalletTxHash)
        let burnFromProjectTxSigned = await clients.owner().signTransaction(burnFromProjectTx)
        let burnFromProjectTxHash = await grpcClient.postTransaction(burnFromProjectTxSigned, coopId)
        await util.waitTxProcessed(burnFromProjectTxHash)

        let projectBalanceAfterWithdraw = await grpcClient.getBalance(addProjWalletTxHash)
        assert.equal(projectBalanceAfterWithdraw, 0)

        let revenueToPayout = 1000
        let mintRevenueToProjectTx = await grpcClient.generateMintTx(addProjWalletTxHash, revenueToPayout)
        let mintRevenueToProjectTxSigned = await clients.owner().signTransaction(mintRevenueToProjectTx)
        let mintRevenueToProjectTxHash = await grpcClient.postTransaction(mintRevenueToProjectTxSigned, coopId)
        await util.waitTxProcessed(mintRevenueToProjectTxHash)

        let revenuePayoutTx = await grpcClient.generateStartRevenueSharesPayoutTx(addBobWalletTxHash, addProjWalletTxHash, revenueToPayout)
        let revenuePayoutTxSigned = await bobClient.signTransaction(revenuePayoutTx)
        let revenuePayoutTxHash = await grpcClient.postTransaction(revenuePayoutTxSigned, coopId)
        await util.waitTxProcessed(revenuePayoutTxHash)
        
        let bobBalanceAfterRevenuePayout = await grpcClient.getBalance(addBobWalletTxHash)
        assert.equal(bobBalanceAfterRevenuePayout, mintToBobAmount - withdrawFromBobAmount - bobInvestmentAmount + revenueToPayout / 2)
        
        let janeBalanceAfterRevenuePayout = await grpcClient.getBalance(addJaneWalletTxHash)
        assert.equal(janeBalanceAfterRevenuePayout, mintToJaneAmount - janeInvestmentAmount + revenueToPayout / 2)

        let bobPortfolio = await grpcClient.getPortfolio(addBobWalletTxHash)
        assert.strictEqual(bobPortfolio.length, 1, `Expected fetched Bob portfolio to contain 1 investment`)
        assert.strictEqual(bobPortfolio[0].projectTxHash, addProjWalletTxHash)
        assert.equal(bobPortfolio[0].amount, bobInvestmentAmount)
        
        let bobTransactions = await grpcClient.getTransactions(addBobWalletTxHash)
        assert.strictEqual(bobTransactions.length, 5)
        
        let bobTransactionsDeposit = bobTransactions.filter(t => { return t.type == enums.txTypeToGrpc(TxType.DEPOSIT) })[0]
        assert.strictEqual(bobTransactionsDeposit.fromTxHash, coopInfo.eur_contract)
        assert.strictEqual(bobTransactionsDeposit.toTxHash, addBobWalletTxHash)
        assert.equal(bobTransactionsDeposit.amount, mintToBobAmount)
        assert.exists(bobTransactionsDeposit.date)
        assert.equal(bobTransactionsDeposit.state, enums.txStateToGrpc(enums.TxState.MINED))
        let bobTransactionsWithdraw = bobTransactions.filter(t => { return t.type == enums.txTypeToGrpc(TxType.WITHDRAW) })[0]
        assert.strictEqual(bobTransactionsWithdraw.fromTxHash, addBobWalletTxHash)
        assert.strictEqual(bobTransactionsWithdraw.toTxHash, coopInfo.eur_contract)
        assert.equal(bobTransactionsWithdraw.amount, withdrawFromBobAmount)
        assert.exists(bobTransactionsWithdraw.date)
        assert.equal(bobTransactionsWithdraw.state, enums.txStateToGrpc(enums.TxState.MINED))
        let bobTransactionsApproveInvest = bobTransactions.filter(t => { return t.type == enums.txTypeToGrpc(TxType.APPROVE_INVESTMENT) })[0]
        assert.strictEqual(bobTransactionsApproveInvest.fromTxHash, addBobWalletTxHash)
        assert.strictEqual(bobTransactionsApproveInvest.toTxHash, addProjWalletTxHash)
        assert.equal(bobTransactionsApproveInvest.amount, bobInvestmentAmount)
        assert.exists(bobTransactionsApproveInvest.date)
        assert.equal(bobTransactionsApproveInvest.state, enums.txStateToGrpc(enums.TxState.MINED))
        let bobTransactionsInvest = bobTransactions.filter(t => { return t.type == enums.txTypeToGrpc(TxType.INVEST) })[0]
        assert.strictEqual(bobTransactionsInvest.fromTxHash, addBobWalletTxHash)
        assert.strictEqual(bobTransactionsInvest.toTxHash, addProjWalletTxHash)
        assert.equal(bobTransactionsInvest.amount, bobInvestmentAmount)
        assert.exists(bobTransactionsInvest.date)
        assert.equal(bobTransactionsInvest.state, enums.txStateToGrpc(enums.TxState.MINED))
        let bobTransactionsPayout = bobTransactions.filter(t => { return t.type == enums.txTypeToGrpc(TxType.SHARE_PAYOUT) })[0]
        assert.strictEqual(bobTransactionsPayout.fromTxHash, addProjWalletTxHash)
        assert.strictEqual(bobTransactionsPayout.toTxHash, addBobWalletTxHash)
        assert.equal(bobTransactionsPayout.amount, revenueToPayout / 2)
        assert.exists(bobTransactionsPayout.date)
        assert.equal(bobTransactionsPayout.state, enums.txStateToGrpc(enums.TxState.MINED))

        let bobInvestmentsInProject = await grpcClient.getInvestmentsInProject(bobWallet.publicKey, addProjWalletTxHash)
        assert.strictEqual(bobInvestmentsInProject.length, 1)
        let bobInvestmentInProject = bobInvestmentsInProject[0]
        assert.exists(bobInvestmentInProject.txHash)
        assert.equal(bobInvestmentInProject.amount, bobInvestmentAmount)
        assert.equal(bobInvestmentInProject.state, enums.txStateToGrpc(enums.TxState.MINED))
        assert.exists(bobInvestmentInProject.date)

        let janeTransactions = await grpcClient.getTransactions(addJaneWalletTxHash)
        let janeTransactionsPayout = janeTransactions.filter(t => { return t.type == enums.txTypeToGrpc(TxType.SHARE_PAYOUT) && t.toTxHash === addJaneWalletTxHash })[0]
        assert.strictEqual(janeTransactionsPayout.fromTxHash, addProjWalletTxHash)
        assert.strictEqual(janeTransactionsPayout.toTxHash, addJaneWalletTxHash)
        assert.equal(janeTransactionsPayout.amount, revenueToPayout / 2)
        assert.exists(janeTransactionsPayout.date)
        assert.equal(janeTransactionsPayout.state, enums.txStateToGrpc(enums.TxState.MINED))

        let alicePortfolio = await grpcClient.getPortfolio(addAliceWalletTxHash)
        assert.isUndefined(alicePortfolio)

        let aliceInvestmentsInProject = await grpcClient.getInvestmentsInProject(aliceWallet.publicKey, addProjWalletTxHash)
        assert.isUndefined(aliceInvestmentsInProject)

        let aliceTransactions = await grpcClient.getTransactions(addAliceWalletTxHash)
        assert.strictEqual(aliceTransactions.length, 4)

        let aliceTransactionsDeposit = aliceTransactions.filter(t => { return t.type == enums.txTypeToGrpc(TxType.DEPOSIT) })[0]
        assert.equal(aliceTransactionsDeposit.amount, mintToAliceAmount)
        assert.exists(aliceTransactionsDeposit.date)
        assert.equal(aliceTransactionsDeposit.state, enums.txStateToGrpc(enums.TxState.MINED))
        let aliceTransactionsApproveInvest = aliceTransactions.filter(t => { return t.type == enums.txTypeToGrpc(TxType.APPROVE_INVESTMENT) })[0]
        assert.strictEqual(aliceTransactionsApproveInvest.fromTxHash, addAliceWalletTxHash)
        assert.strictEqual(aliceTransactionsApproveInvest.toTxHash, addProjWalletTxHash)
        assert.equal(aliceTransactionsApproveInvest.amount, mintToAliceAmount)
        assert.exists(aliceTransactionsApproveInvest.date)
        assert.equal(aliceTransactionsApproveInvest.state, enums.txStateToGrpc(enums.TxState.MINED))
        let aliceTransactionsInvest = aliceTransactions.filter(t => { return t.type == enums.txTypeToGrpc(TxType.INVEST) })[0]
        assert.strictEqual(aliceTransactionsInvest.fromTxHash, addAliceWalletTxHash)
        assert.strictEqual(aliceTransactionsInvest.toTxHash, addProjWalletTxHash)
        assert.equal(aliceTransactionsInvest.amount, mintToAliceAmount)
        assert.exists(aliceTransactionsInvest.date)
        assert.equal(aliceTransactionsInvest.state, enums.txStateToGrpc(enums.TxState.MINED))
        let aliceTransactionsCancel = aliceTransactions.filter(t => { return t.type == enums.txTypeToGrpc(TxType.CANCEL_INVESTMENT) })[0]
        assert.strictEqual(aliceTransactionsCancel.fromTxHash, addProjWalletTxHash)
        assert.strictEqual(aliceTransactionsCancel.toTxHash, addAliceWalletTxHash)
        assert.equal(aliceTransactionsCancel.amount, mintToAliceAmount)
        assert.exists(aliceTransactionsCancel.date)
        assert.equal(aliceTransactionsCancel.state, enums.txStateToGrpc(enums.TxState.MINED))

        let coopOwner = coopInfo.coop_owner
        let eurOwner = coopInfo.eur_owner
        let eurContractAddress = coopInfo.eur_contract.replace("ct_", "ak_")
        
        let addBobWalletTxRecord = (await db.getBy({hash: addBobWalletTxHash}))[0]
        assert.strictEqual(addBobWalletTxRecord.from_wallet, coopOwner)
        assert.strictEqual(addBobWalletTxRecord.to_wallet, bobWallet.publicKey)
        assert.strictEqual(addBobWalletTxRecord.state, TxState.MINED)
        assert.strictEqual(addBobWalletTxRecord.supervisor_status, SupervisorStatus.PROCESSED)
        assert.strictEqual(addBobWalletTxRecord.type, TxType.WALLET_CREATE)
        assert.strictEqual(addBobWalletTxRecord.wallet_type, WalletType.USER)
        assert.strictEqual(addBobWalletTxRecord.coop_id, coopId)

        let addAliceWalletTxRecord = (await db.getBy({hash: addAliceWalletTxHash}))[0]
        assert.strictEqual(addAliceWalletTxRecord.from_wallet, coopOwner)
        assert.strictEqual(addAliceWalletTxRecord.to_wallet, aliceWallet.publicKey)
        assert.strictEqual(addAliceWalletTxRecord.state, TxState.MINED)
        assert.strictEqual(addAliceWalletTxRecord.supervisor_status, SupervisorStatus.PROCESSED)
        assert.strictEqual(addAliceWalletTxRecord.type, TxType.WALLET_CREATE)
        assert.strictEqual(addAliceWalletTxRecord.wallet_type, WalletType.USER)
        assert.strictEqual(addAliceWalletTxRecord.coop_id, coopId)

        let createOrgTxRecord = (await db.getBy({hash: createOrgTxHash}))[0]
        assert.strictEqual(createOrgTxRecord.from_wallet, bobWallet.publicKey)
        assert.isNotNull(createOrgTxRecord.to_wallet)
        assert.strictEqual(createOrgTxRecord.state, TxState.MINED)
        assert.strictEqual(createOrgTxRecord.supervisor_status, SupervisorStatus.NOT_REQUIRED)
        assert.strictEqual(createOrgTxRecord.type, TxType.ORG_CREATE)
        assert.isNull(createOrgTxRecord.wallet)
        assert.strictEqual(createOrgTxRecord.coop_id, coopId)
        let newOrgWallet = createOrgTxRecord.to_wallet
        
        let addOrgWalletTxRecord = (await db.getBy({hash: addOrgWalletTxHash}))[0]
        assert.strictEqual(addOrgWalletTxRecord.from_wallet, coopOwner)
        assert.strictEqual(addOrgWalletTxRecord.to_wallet, newOrgWallet)
        assert.strictEqual(addOrgWalletTxRecord.state, TxState.MINED)
        assert.strictEqual(addOrgWalletTxRecord.supervisor_status, SupervisorStatus.NOT_REQUIRED)
        assert.strictEqual(addOrgWalletTxRecord.type, TxType.WALLET_CREATE)
        assert.strictEqual(addOrgWalletTxRecord.wallet, newOrgWallet)
        assert.strictEqual(addOrgWalletTxRecord.wallet_type, WalletType.ORGANIZATION)
        assert.strictEqual(addOrgWalletTxRecord.coop_id, coopId)

        let mintToBobTxRecord = (await db.getBy({hash: mintToBobTxHash}))[0]
        assert.strictEqual(mintToBobTxRecord.from_wallet, eurContractAddress)
        assert.strictEqual(mintToBobTxRecord.to_wallet, bobWallet.publicKey)
        assert.strictEqual(mintToBobTxRecord.state, TxState.MINED)
        assert.strictEqual(mintToBobTxRecord.supervisor_status, SupervisorStatus.NOT_REQUIRED)
        assert.strictEqual(mintToBobTxRecord.type, TxType.DEPOSIT)
        assert.equal(mintToBobTxRecord.amount, mintToBobAmount)
        assert.strictEqual(mintToBobTxRecord.coop_id, coopId)

        let mintToAliceTxRecord = (await db.getBy({hash: mintToAliceTxHash}))[0]
        assert.strictEqual(mintToAliceTxRecord.from_wallet, eurContractAddress)
        assert.strictEqual(mintToAliceTxRecord.to_wallet, aliceWallet.publicKey)
        assert.strictEqual(mintToAliceTxRecord.state, TxState.MINED)
        assert.strictEqual(mintToAliceTxRecord.supervisor_status, SupervisorStatus.NOT_REQUIRED)
        assert.strictEqual(mintToAliceTxRecord.type, TxType.DEPOSIT)
        assert.equal(mintToAliceTxRecord.amount, mintToAliceAmount)
        assert.strictEqual(mintToAliceTxRecord.coop_id, coopId)

        let approveBobWithdrawTxRecord = (await db.getBy({hash: approveBobWithdrawTxHash}))[0]
        assert.strictEqual(approveBobWithdrawTxRecord.from_wallet, bobWallet.publicKey)
        assert.strictEqual(approveBobWithdrawTxRecord.to_wallet, eurOwner)
        assert.strictEqual(approveBobWithdrawTxRecord.state, TxState.MINED)
        assert.strictEqual(approveBobWithdrawTxRecord.supervisor_status, SupervisorStatus.NOT_REQUIRED)
        assert.strictEqual(approveBobWithdrawTxRecord.type, TxType.APPROVE_USER_WITHDRAW)
        assert.equal(approveBobWithdrawTxRecord.amount, withdrawFromBobAmount)
        assert.strictEqual(approveBobWithdrawTxRecord.coop_id, coopId)

        let bobWithdrawTxRecord = (await db.getBy({hash: burnFromBobTxHash}))[0]
        assert.strictEqual(bobWithdrawTxRecord.from_wallet, bobWallet.publicKey)
        assert.strictEqual(bobWithdrawTxRecord.to_wallet, eurContractAddress)
        assert.strictEqual(bobWithdrawTxRecord.state, TxState.MINED)
        assert.strictEqual(bobWithdrawTxRecord.supervisor_status, SupervisorStatus.NOT_REQUIRED)
        assert.strictEqual(bobWithdrawTxRecord.type, TxType.WITHDRAW)
        assert.equal(bobWithdrawTxRecord.amount, withdrawFromBobAmount)
        assert.strictEqual(bobWithdrawTxRecord.coop_id, coopId)

        let createProjTxRecord = (await db.getBy({hash: createProjTxHash}))[0]
        assert.strictEqual(createProjTxRecord.from_wallet, bobWallet.publicKey)
        assert.isNotNull(createProjTxRecord.to_wallet)
        assert.strictEqual(createProjTxRecord.state, TxState.MINED)
        assert.strictEqual(createProjTxRecord.supervisor_status, SupervisorStatus.NOT_REQUIRED)
        assert.strictEqual(createProjTxRecord.type, TxType.PROJ_CREATE)
        assert.isNull(createProjTxRecord.wallet)
        assert.strictEqual(createProjTxRecord.coop_id, coopId)
        let newProjWallet = createProjTxRecord.to_wallet
        
        let addProjWalletTxRecord = (await db.getBy({hash: addProjWalletTxHash}))[0]
        assert.strictEqual(addProjWalletTxRecord.from_wallet, coopOwner)
        assert.strictEqual(addProjWalletTxRecord.to_wallet, newProjWallet)
        assert.strictEqual(addProjWalletTxRecord.state, TxState.MINED)
        assert.strictEqual(addProjWalletTxRecord.supervisor_status, SupervisorStatus.NOT_REQUIRED)
        assert.strictEqual(addProjWalletTxRecord.type, TxType.WALLET_CREATE)
        assert.strictEqual(addProjWalletTxRecord.wallet, newProjWallet)
        assert.strictEqual(addProjWalletTxRecord.wallet_type, WalletType.PROJECT)
        assert.strictEqual(addProjWalletTxRecord.coop_id, coopId)

        let projDetailsUsingService = await projSvc.getProjectInfoByWallet(addProjWalletTxRecord.wallet, addProjWalletTxRecord.coop_id)
        assert.equal(projDetailsUsingService.minPerUserInvestment, minPerUser)
        assert.equal(projDetailsUsingService.maxPerUserInvestment, maxPerUser)
        assert.equal(projDetailsUsingService.investmentCap, cap)
        assert.equal(projDetailsUsingService.endsAt, endsAt)
        assert.equal(projDetailsUsingService.totalFundsRaised, cap)
        assert.equal(projDetailsUsingService.payoutInProcess, false)
        assert.equal(projDetailsUsingService.balance, 0)

        let approveAliceInvestmentTxRecord = (await db.getBy({hash: aliceInvestTxHash}))[0]
        assert.strictEqual(approveAliceInvestmentTxRecord.from_wallet, aliceWallet.publicKey)
        assert.strictEqual(approveAliceInvestmentTxRecord.to_wallet, newProjWallet)
        assert.strictEqual(approveAliceInvestmentTxRecord.state, TxState.MINED)
        assert.strictEqual(approveAliceInvestmentTxRecord.supervisor_status, SupervisorStatus.PROCESSED)
        assert.strictEqual(approveAliceInvestmentTxRecord.type, TxType.APPROVE_INVESTMENT)
        assert.equal(approveAliceInvestmentTxRecord.amount, aliceInvestmentAmount)
        assert.strictEqual(approveAliceInvestmentTxRecord.coop_id, coopId)

        let aliceInvestmentTxRecord = (await db.getBy({type: TxType.INVEST, from_wallet: aliceWallet.publicKey}))[0]
        assert.strictEqual(aliceInvestmentTxRecord.from_wallet, aliceWallet.publicKey)
        assert.strictEqual(aliceInvestmentTxRecord.to_wallet, newProjWallet)
        assert.strictEqual(aliceInvestmentTxRecord.state, TxState.MINED)
        assert.strictEqual(aliceInvestmentTxRecord.supervisor_status, SupervisorStatus.NOT_REQUIRED)
        assert.strictEqual(aliceInvestmentTxRecord.type, TxType.INVEST)
        assert.equal(aliceInvestmentTxRecord.amount, aliceInvestmentAmount)
        assert.strictEqual(aliceInvestmentTxRecord.coop_id, coopId)

        let aliceCancelInvestmentTxRecord = (await db.getBy({type: TxType.CANCEL_INVESTMENT}))[0]
        assert.strictEqual(aliceCancelInvestmentTxRecord.from_wallet, newProjWallet)
        assert.strictEqual(aliceCancelInvestmentTxRecord.to_wallet, aliceWallet.publicKey)
        assert.strictEqual(aliceCancelInvestmentTxRecord.state, TxState.MINED)
        assert.strictEqual(aliceCancelInvestmentTxRecord.supervisor_status, SupervisorStatus.NOT_REQUIRED)
        assert.strictEqual(aliceCancelInvestmentTxRecord.type, TxType.CANCEL_INVESTMENT)
        assert.equal(aliceCancelInvestmentTxRecord.amount, aliceInvestmentAmount)
        assert.strictEqual(aliceCancelInvestmentTxRecord.coop_id, coopId)

        let approveInvestmentTxRecord = (await db.getBy({hash: investTxHash}))[0]
        assert.strictEqual(approveInvestmentTxRecord.from_wallet, bobWallet.publicKey)
        assert.strictEqual(approveInvestmentTxRecord.to_wallet, newProjWallet)
        assert.strictEqual(approveInvestmentTxRecord.state, TxState.MINED)
        assert.strictEqual(approveInvestmentTxRecord.supervisor_status, SupervisorStatus.PROCESSED)
        assert.strictEqual(approveInvestmentTxRecord.type, TxType.APPROVE_INVESTMENT)
        assert.equal(approveInvestmentTxRecord.amount, bobInvestmentAmount)
        assert.strictEqual(approveInvestmentTxRecord.coop_id, coopId)

        let investmentTxRecord = (await db.getBy({type: TxType.INVEST, from_wallet: bobWallet.publicKey}))[0]
        assert.strictEqual(investmentTxRecord.from_wallet, bobWallet.publicKey)
        assert.strictEqual(investmentTxRecord.to_wallet, newProjWallet)
        assert.strictEqual(investmentTxRecord.state, TxState.MINED)
        assert.strictEqual(investmentTxRecord.supervisor_status, SupervisorStatus.NOT_REQUIRED)
        assert.strictEqual(investmentTxRecord.type, TxType.INVEST)
        assert.equal(investmentTxRecord.amount, bobInvestmentAmount)
        assert.strictEqual(investmentTxRecord.coop_id, coopId)

        let mintToProjTxRecord = (await db.getBy({hash: mintRevenueToProjectTxHash}))[0]
        let projectContractAddress = aeUtil.enforceAkPrefix((await clients.owner().getTxInfo(createProjTxHash)).contractId)
        assert.strictEqual(mintToProjTxRecord.from_wallet, eurContractAddress)
        assert.strictEqual(mintToProjTxRecord.to_wallet, projectContractAddress)
        assert.strictEqual(mintToProjTxRecord.state, TxState.MINED)
        assert.strictEqual(mintToProjTxRecord.supervisor_status, SupervisorStatus.NOT_REQUIRED)
        assert.strictEqual(mintToProjTxRecord.type, TxType.DEPOSIT)
        assert.equal(mintToProjTxRecord.amount, revenueToPayout)
        assert.strictEqual(mintToProjTxRecord.coop_id, coopId)
        
        let startRevenuePayoutTxRecord = (await db.getBy({hash: revenuePayoutTxHash}))[0]
        assert.strictEqual(startRevenuePayoutTxRecord.from_wallet, bobWallet.publicKey)
        assert.strictEqual(startRevenuePayoutTxRecord.to_wallet, newProjWallet)
        assert.strictEqual(startRevenuePayoutTxRecord.state, TxState.MINED)
        assert.strictEqual(startRevenuePayoutTxRecord.supervisor_status, SupervisorStatus.PROCESSED)
        assert.strictEqual(startRevenuePayoutTxRecord.type, TxType.START_REVENUE_PAYOUT)
        assert.equal(startRevenuePayoutTxRecord.amount, revenueToPayout)
        assert.strictEqual(startRevenuePayoutTxRecord.coop_id, coopId)

        let revenueSharePayoutTxRecord = (await db.getBy({type: TxType.SHARE_PAYOUT, to_wallet: bobWallet.publicKey}))[0]
        assert.strictEqual(revenueSharePayoutTxRecord.from_wallet, newProjWallet)
        assert.strictEqual(revenueSharePayoutTxRecord.to_wallet, bobWallet.publicKey)
        assert.strictEqual(revenueSharePayoutTxRecord.state, TxState.MINED)
        assert.strictEqual(revenueSharePayoutTxRecord.supervisor_status, SupervisorStatus.NOT_REQUIRED)
        assert.strictEqual(revenueSharePayoutTxRecord.type, TxType.SHARE_PAYOUT)
        assert.equal(revenueSharePayoutTxRecord.amount, revenueToPayout / 2)
        assert.strictEqual(revenueSharePayoutTxRecord.coop_id, coopId)

        assert.strictEqual(bobWalletUpdates, 23)
        socket.terminate()
    })

})