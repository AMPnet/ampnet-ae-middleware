let chai = require('chai');
let assert = chai.assert;

let { TxType, TxState, WalletType, txTypeToGrpc } = require('../enums/enums')

let grpcClient = require('./grpc/client')
let db = require('./util/db')

describe('Portfolio fetch tests', function() {

    before(async () => {
        await db.clearTransactions(adminWalletTx.hash)
    })

    it('Should fetch portfolio correctly', async () => {
        userWallet = "ak_user_wallet"
        userWalletHash = "th_user_hash"
        await db.insert({
            hash: userWalletHash,
            state: TxState.MINED,
            type: TxType.WALLET_CREATE,
            wallet: userWallet,
            wallet_type: WalletType.USER,
            created_at: new Date(),
            coop_id: coopId
        })

        sellerWallet = "ak_seller_wallet"
        sellerWalletHash = "th_seller_wallet_hash"
        await db.insert({
            hash: sellerWalletHash,
            state: TxState.MINED,
            type: TxType.WALLET_CREATE,
            wallet: sellerWallet,
            wallet_type: WalletType.USER,
            created_at: new Date(),
            coop_id: coopId
        })

        projectWallet = "ak_project_wallet"
        projectContract = "ct_project_wallet"
        projectWalletHash = "th_project_hash"
        await db.insert({
            hash: projectWalletHash,
            state: TxState.MINED,
            type: TxType.WALLET_CREATE,
            wallet: projectWallet,
            wallet_type: WalletType.PROJECT,
            created_at: new Date(),
            coop_id: coopId
        })

        secondProjectWallet = "ak_second_project_wallet"
        secondProjectHash = "th_second_project_hash"
        await db.insert({
            hash: secondProjectHash,
            state: TxState.MINED,
            type: TxType.WALLET_CREATE,
            wallet: secondProjectWallet,
            wallet_type: WalletType.PROJECT,
            created_at: new Date(),
            coop_id: coopId
        })

        let p1 = await grpcClient.getPortfolio(userWalletHash)
        assert.isUndefined(p1)
        
        let firstInvestmentAmount = 100
        let secondInvestmentAmount = 100
        await db.insert({
            hash: "random-hash-2",
            state: TxState.MINED,
            type: TxType.INVEST,
            from_wallet: userWallet,
            to_wallet: projectWallet,
            amount: firstInvestmentAmount,
            created_at: new Date(),
            coop_id: coopId
        })
        await db.insert({
            hash: "random-hash-3",
            state: TxState.MINED,
            type: TxType.INVEST,
            from_wallet: userWallet,
            to_wallet: projectWallet,
            amount: secondInvestmentAmount,
            created_at: new Date(),
            coop_id: coopId
        })

        let p2 = await grpcClient.getPortfolio(userWalletHash)
        assert.strictEqual(p2.length, 1)
        assert.strictEqual(p2[0].projectTxHash, projectWalletHash)
        assert.equal(p2[0].amount, firstInvestmentAmount + secondInvestmentAmount)

        let secondProjectInvestment = 100
        await db.insert({
            hash: "random-hash-4",
            state: TxState.MINED,
            type: TxType.INVEST,
            from_wallet: userWallet,
            to_wallet: secondProjectWallet,
            amount: secondProjectInvestment,
            created_at: new Date(),
            coop_id: coopId
        })

        let p3 = await grpcClient.getPortfolio(userWalletHash)
        assert.strictEqual(p3.length, 2)
        let p3firstProject = p3.filter(t => { return t.projectTxHash == projectWalletHash })[0]
        assert.strictEqual(p3firstProject.projectTxHash, projectWalletHash)
        assert.equal(p3firstProject.amount, firstInvestmentAmount + secondInvestmentAmount)
        let p3secondProject = p3.filter(t => { return t.projectTxHash == secondProjectHash })[0]
        assert.strictEqual(p3secondProject.projectTxHash, secondProjectHash)
        assert.equal(p3secondProject.amount, secondProjectInvestment)

        await db.insert({
            hash: "random-hash-5",
            state: TxState.FAILED,
            type: TxType.CANCEL_INVESTMENT,
            from_wallet: projectWallet,
            to_wallet: userWallet,
            amount: firstInvestmentAmount + secondInvestmentAmount,
            created_at: new Date(),
            coop_id: coopId
        })

        let p4 = await grpcClient.getPortfolio(userWalletHash)
        assert.strictEqual(p4.length, 2)
        let p4firstProject = p4.filter(t => { return t.projectTxHash == projectWalletHash })[0]
        assert.strictEqual(p4firstProject.projectTxHash, projectWalletHash)
        assert.equal(p4firstProject.amount, firstInvestmentAmount + secondInvestmentAmount)
        let p4secondProject = p4.filter(t => { return t.projectTxHash == secondProjectHash })[0]
        assert.strictEqual(p4secondProject.projectTxHash, secondProjectHash)
        assert.equal(p4secondProject.amount, secondProjectInvestment)

        await db.insert({
            hash: "random-hash-6",
            state: TxState.MINED,
            type: TxType.CANCEL_INVESTMENT,
            from_wallet: projectWallet,
            to_wallet: userWallet,
            amount: firstInvestmentAmount + secondInvestmentAmount,
            created_at: new Date(),
            coop_id: coopId
        })

        let p5 = await grpcClient.getPortfolio(userWalletHash)
        assert.strictEqual(p5.length, 1)
        assert.strictEqual(p5[0].projectTxHash, secondProjectHash)
        assert.equal(p5[0].amount, secondProjectInvestment)

        await db.insert({
            hash: "random-hash-7",
            state: TxState.FAILED,
            type: TxType.INVEST,
            from_wallet: userWallet,
            to_wallet: projectWallet,
            amount: firstInvestmentAmount,
            created_at: new Date(),
            coop_id: coopId
        })

        let p6 = await grpcClient.getPortfolio(userWalletHash)
        assert.strictEqual(p6.length, 1)
        assert.strictEqual(p6[0].projectTxHash, secondProjectHash)
        assert.equal(p6[0].amount, secondProjectInvestment)

        await db.insert({
            hash: "random-hash-8",
            state: TxState.MINED,
            type: TxType.INVEST,
            from_wallet: userWallet,
            to_wallet: projectWallet,
            amount: firstInvestmentAmount,
            created_at: new Date(),
            coop_id: coopId
        })

        let p7 = await grpcClient.getPortfolio(userWalletHash)
        assert.strictEqual(p7.length, 2)
        let p7firstProject = p7.filter(t => { return t.projectTxHash == projectWalletHash })[0]
        assert.strictEqual(p7firstProject.projectTxHash, projectWalletHash)
        assert.equal(p7firstProject.amount, firstInvestmentAmount)
        let p7secondProject = p7.filter(t => { return t.projectTxHash == secondProjectHash })[0]
        assert.strictEqual(p7secondProject.projectTxHash, secondProjectHash)
        assert.equal(p7secondProject.amount, secondProjectInvestment)

        sellerWalletInvestment = 200
        sellerWalletInvestmentPrice = 100
        await db.insert({
            hash: "random-hash-9",
            state: TxState.MINED,
            type: TxType.INVEST,
            from_wallet: sellerWallet,
            to_wallet: projectWallet,
            amount: sellerWalletInvestment,
            created_at: new Date(),
            coop_id: coopId
        })
        await db.insert({
            hash: "random-hash-10",
            state: TxState.MINED,
            type: TxType.SHARES_SOLD,
            from_wallet: sellerWallet,
            to_wallet: userWallet,
            input: `${projectContract};${sellerWalletInvestmentPrice}`,
            amount: sellerWalletInvestment,
            created_at: new Date(),
            coop_id: coopId
        })

        let p8 = await grpcClient.getPortfolio(userWalletHash)
        let p8firstProject = p8.filter(t => { return t.projectTxHash == projectWalletHash })[0]
        assert.strictEqual(p8firstProject.projectTxHash, projectWalletHash)
        assert.equal(p8firstProject.amount, firstInvestmentAmount + sellerWalletInvestment)
        
        let p9 = await grpcClient.getPortfolio(sellerWalletHash)
        assert.isUndefined(p9)

        let txType = txTypeToGrpc(TxType.INVEST)
        let distinctWalletsWithInvestActivity = (await grpcClient.getUserWalletsForCoopAndTxType(coopId, txType)).wallets
        assert.equal(distinctWalletsWithInvestActivity.length, 2)
        assert.includeDeepMembers(distinctWalletsWithInvestActivity, [{ wallet: userWallet, walletTxHash: userWalletHash }])
        assert.includeDeepMembers(distinctWalletsWithInvestActivity, [{ wallet: sellerWallet, walletTxHash: sellerWalletHash }])
    })

})