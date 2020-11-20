let { Crypto } = require('@aeternity/aepp-sdk')
let chai = require('chai');
let assert = chai.assert;

let { TxType, TxState, txStateToGrpc, txTypeToGrpc } = require('../enums/enums')

let clients = require('./ae/clients')
let grpcClient = require('./grpc/client')
let accounts = require('./ae/accounts')
let util = require('./util/util')
let db = require('./util/db')

describe('Fetch transaction info tests', function() {

    before(async () => {
        await db.clearTransactions(adminWalletTx.hash)
    })

    it('Should be able to fetch transaction info for some tx hash', async () => {
        let bobWallet = Crypto.generateKeyPair()
        let addBobWalletTx = await grpcClient.generateAddWalletTx(bobWallet.publicKey, coopId)
        let addBobWalletTxSigned = await clients.owner().signTransaction(addBobWalletTx)
        let addBobWalletTxHash = await grpcClient.postTransaction(addBobWalletTxSigned, coopId)
        
        await util.waitTxProcessed(addBobWalletTxHash)

        let info = await grpcClient.getTransactionInfo(addBobWalletTxHash)
        assert.equal(info.txHash, addBobWalletTxHash)
        assert.equal(info.fromTxHash, accounts.owner.publicKey)
        assert.equal(info.toTxHash, bobWallet.publicKey)
        assert.equal(info.state, txStateToGrpc(TxState.MINED))
        assert.equal(info.type, txTypeToGrpc(TxType.WALLET_CREATE))

        let infoUsingHash = await grpcClient.getTransactionInfo(addBobWalletTxHash, accounts.owner.publicKey, addBobWalletTxHash)
        assert.equal(infoUsingHash.txHash, addBobWalletTxHash)
        assert.equal(infoUsingHash.fromTxHash, accounts.owner.publicKey)
        assert.equal(infoUsingHash.toTxHash, addBobWalletTxHash)
        assert.equal(infoUsingHash.state, txStateToGrpc(TxState.MINED))
        assert.equal(infoUsingHash.type, txTypeToGrpc(TxType.WALLET_CREATE))
    })

})
