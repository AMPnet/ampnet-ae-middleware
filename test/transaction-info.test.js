let chai = require('chai');
let assert = chai.assert;

let config = require('../config')
let client = require('../ae/client')
let supervisor = require('../queue/queue')
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

    it.only('x', async () => {
        let firstTxNonce = await clients.bob().getAccountNonce(accounts.bob.publicKey)
        console.log("first nonce", firstTxNonce)
        let firstSpendTx = await clients.bob().spendTx({
            senderId: accounts.bob.publicKey,
            recipientId: accounts.alice.publicKey,
            amount: 10000000000000000,
            nonce: firstTxNonce
        })
        let firstSpendTxSigned = await clients.bob().signTransaction(firstSpendTx)
        let firstSpendTxHash = await clients.bob().sendTransaction(firstSpendTxSigned, { waitMined: false, verify: false })
        let pool = await clients.bob().mempool()
        console.log("pool", pool.transactions[0].tx)
        console.log("firstSpendTxHash", firstSpendTxHash)
        clients.bob().poll(firstSpendTxHash.hash).then(pollResult => {
            console.log("first spend poll result", pollResult)
            clients.bob().getAccountNonce(accounts.bob.publicKey).then(n => { console.log("nonce", n) })
        }).catch(err => {
            console.log("err", err)
        })

        let secondSpendTx = await clients.bob().spendTx({
            senderId: accounts.bob.publicKey,
            recipientId: accounts.jane.publicKey,
            amount: 100000000000000000,
            nonce: firstTxNonce + 1
        })
        let secondSpendTxSigned = await clients.bob().signTransaction(secondSpendTx)
        let secondSpendTxHash = await clients.bob().sendTransaction(secondSpendTxSigned, { waitMined: false, verify: false })
        console.log("secondSpoendTxHash", secondSpendTxHash)
        clients.bob().poll(secondSpendTxHash.hash).then(pollResult => {
            console.log("second spend poll result", pollResult)
            clients.bob().getAccountNonce(accounts.bob.publicKey).then(n => { console.log("nonce", n) })
        }).catch(err => {
            console.log("err", err)
        })
        let nonce = await clients.bob().getAccountNonce(accounts.bob.publicKey)
        console.log("nonce", nonce)
        let mempool = await clients.bob().mempool()
        console.log("mempool", mempool.transactions[0].tx)
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
