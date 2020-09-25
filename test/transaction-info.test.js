let chai = require('chai');
let assert = chai.assert;

let config = require('../config')
let client = require('../ae/client')
let supervisor = require('../supervisor')
let grpcServer = require('../grpc/server')
let { TxType, TxState, SupervisorStatus, WalletType, txStateToGrpc, txTypeToGrpc } = require('../enums/enums')

let clients = require('./ae/clients')
let grpcClient = require('./grpc/client')
let accounts = require('./ae/accounts')
let util = require('./util/util')
let db = require('./util/db')

describe('Fetch transaction info tests', function() {

    beforeEach(async() => {
        process.env['GIFT_AMOUNT'] = 0
        await grpcServer.start()
        await grpcClient.start()
        await clients.init()
        await db.init()
    })

    afterEach(async() => {
        delete process.env.GIFT_AMOUNT
        await grpcServer.stop()
        await supervisor.clearStorage()
        await supervisor.stop()
    })

    it('Should be able to fetch transaction info for some tx hash', async () => {
        let addBobWalletTx = await grpcClient.generateAddWalletTx(accounts.bob.publicKey)
        let addBobWalletTxSigned = await clients.owner().signTransaction(addBobWalletTx)
        let addBobWalletTxHash = await grpcClient.postTransaction(addBobWalletTxSigned)
        
        await util.waitTxProcessed(addBobWalletTxHash)

        let info = await grpcClient.getTransactionInfo(addBobWalletTxHash)
        assert.equal(info.hash, addBobWalletTxHash)
        assert.equal(info.fromWallet, accounts.owner.publicKey)
        assert.equal(info.toWallet, accounts.bob.publicKey)
        assert.equal(info.state, txStateToGrpc(TxState.MINED))
        assert.equal(info.type, txTypeToGrpc(TxType.WALLET_CREATE))

        let infoUsingHash = await grpcClient.getTransactionInfo(addBobWalletTxHash, accounts.owner.publicKey, addBobWalletTxHash)
        assert.equal(infoUsingHash.hash, addBobWalletTxHash)
        assert.equal(infoUsingHash.fromWallet, accounts.owner.publicKey)
        assert.equal(infoUsingHash.toWallet, accounts.bob.publicKey)
        assert.equal(infoUsingHash.state, txStateToGrpc(TxState.MINED))
        assert.equal(infoUsingHash.type, txTypeToGrpc(TxType.WALLET_CREATE))
    })

})
