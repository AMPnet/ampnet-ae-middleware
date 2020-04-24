let path = require('path')
let chai = require('chai');
let assert = chai.assert;
let { Crypto, Universal, Node, MemoryAccount } = require('@aeternity/aepp-sdk')

let enums = require('../enums/enums')
let grpcServer = require('../grpc/server')
let supervisor = require('../supervisor')
let config = require('../config')
let codec = require('../ae/codec')
let stateChecker = require('../service/state-checker')
let { TxType, TxState, SupervisorStatus, WalletType } = require('../enums/enums')

let grpcClient = require('./grpc/client')
let accounts = require('./ae/accounts')
let clients = require('./ae/clients')
let util = require('./util/util')
let db = require('./util/db')

describe('Auto funding test', function() {

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

    it('should recover from inconsistent state in database', async () => {
        let contractId = config.get().contracts.coop.address
        let callData = await codec.coop.encodeAddWallet(accounts.bob.publicKey)
        let addWalletTx = await clients.owner().contractCallTx({
            callerId: accounts.owner.publicKey,
            contractId: contractId,
            amount: 0,
            gas: 10000,
            callData:  callData
        })
        let addWalletTxSigned = await clients.owner().signTransaction(addWalletTx)
        let addWalletTxHash = (await clients.owner().sendTransaction(addWalletTxSigned, { waitMined: false })).hash

        await db.insert({
            hash: addWalletTxHash,
            state: TxState.PENDING,
            created_at: new Date()
        })
        await stateChecker.processAllRecords()
        await util.waitTxProcessed(addWalletTxHash)

        let txInfo = await grpcClient.getTransactionInfo(addWalletTxHash)
        assert.strictEqual(txInfo.state, TxState.MINED)
    })
})