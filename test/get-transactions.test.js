let chai = require('chai');
let assert = chai.assert;

let { TxType, TxState, WalletType, txTypeToGrpc } = require('../enums/enums')

let grpcClient = require('./grpc/client')
let db = require('./util/db')

describe('Fetch transaction info tests', function() {
    
    before(async () => {
        await db.clearTransactions(adminWalletTx.hash)
    })

    it('Should be able to fetch transaction info for some tx hash', async () => {
        userWallet = "ak_user_wallet"
        userWalletHash = "th_user_hash"
        await db.insert({
            hash: userWalletHash,
            state: TxState.MINED,
            type: TxType.WALLET_CREATE,
            wallet: userWallet,
            wallet_type: WalletType.USER,
            created_at: new Date(),
            processed_at: new Date(),
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
            processed_at: new Date(),
            coop_id: coopId
        })

        pendingInvestmentHash = "random-hash-2"
        pendingInvestmentAmount = 100000
        pendingInvestmnetDate = new Date()
        await db.insert({
            hash: pendingInvestmentHash,
            state: TxState.PENDING,
            type: TxType.INVEST,
            from_wallet: userWallet,
            to_wallet: projectWallet,
            amount: pendingInvestmentAmount,
            created_at: pendingInvestmnetDate,
            coop_id: coopId
        })

        minedInvestmentHash = "random-hash-3"
        minedInvestmentAmount = 100000
        minedInvestmentCreatedAt = new Date()
        minedInvestmentDate = new Date(minedInvestmentCreatedAt.getTime() + 5000)
        await db.insert({
            hash: minedInvestmentHash,
            state: TxState.MINED,
            type: TxType.INVEST,
            from_wallet: userWallet,
            to_wallet: projectWallet,
            amount: minedInvestmentAmount,
            created_at: minedInvestmentCreatedAt,
            processed_at: minedInvestmentDate,
            coop_id: coopId
        })

        let txs = await grpcClient.getTransactions(userWalletHash)
        
        let pendingTx = txs[0]
        assert.equal(pendingTx.txHash, pendingInvestmentHash)
        assert.equal(pendingTx.fromTxHash, userWalletHash)
        assert.equal(pendingTx.toTxHash, projectWalletHash)
        assert.equal(pendingTx.amount, pendingInvestmentAmount)
        assert.equal(pendingTx.type, txTypeToGrpc(TxType.INVEST))
        assert.equal(pendingTx.date, pendingInvestmnetDate.getTime())

        let minedTx = txs[1]
        assert.equal(minedTx.txHash, minedInvestmentHash)
        assert.equal(minedTx.fromTxHash, userWalletHash)
        assert.equal(minedTx.toTxHash, projectWalletHash)
        assert.equal(minedTx.amount, minedInvestmentAmount)
        assert.equal(minedTx.type, txTypeToGrpc(TxType.INVEST))
        assert.equal(minedTx.date, minedInvestmentCreatedAt.getTime())
    })

})
