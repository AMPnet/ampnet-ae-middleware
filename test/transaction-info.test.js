let chai = require('chai');
let assert = chai.assert;

let supervisor = require('../queue/queue')
let grpcServer = require('../grpc/server')
let { TxType, TxState, txStateToGrpc, txTypeToGrpc } = require('../enums/enums')

let clients = require('./ae/clients')
let grpcClient = require('./grpc/client')
let accounts = require('./ae/accounts')
let util = require('./util/util')
let db = require('./util/db')

describe('Fetch transaction info tests', function() {

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

    it('Should be able to fetch transaction info for some tx hash', async () => {
        let addBobWalletTx = await grpcClient.generateAddWalletTx(accounts.bob.publicKey)
        let addBobWalletTxSigned = await clients.owner().signTransaction(addBobWalletTx)
        let addBobWalletTxHash = await grpcClient.postTransaction(addBobWalletTxSigned)
        
        await util.waitTxProcessed(addBobWalletTxHash)

        let info = await grpcClient.getTransactionInfo(addBobWalletTxHash)
        assert.equal(info.txHash, addBobWalletTxHash)
        assert.equal(info.fromTxHash, accounts.owner.publicKey)
        assert.equal(info.toTxHash, accounts.bob.publicKey)
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
