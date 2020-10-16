let path = require('path')
let chai = require('chai');
let assert = chai.assert;
let { Crypto, Universal, Node, MemoryAccount } = require('@aeternity/aepp-sdk')

let enums = require('../enums/enums')
let grpcServer = require('../grpc/server')
let supervisor = require('../queue/queue')
let config = require('../config')
let codec = require('../ae/codec')
let stateChecker = require('../service/state-checker')
let repo = require('../persistence/repository')
let { TxType, TxState, SupervisorStatus, WalletType, txStateToGrpc } = require('../enums/enums')

let grpcClient = require('./grpc/client')
let accounts = require('./ae/accounts')
let clients = require('./ae/clients')
let util = require('./util/util')
let db = require('./util/db')

describe('DB records recovery test', function() {

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

    it.skip('should recover from inconsistent state in database', async () => {  
        let MS_PER_MINUTE = 60000
        let now = new Date()
        let nowMinusFourMinutes = new Date(now - 4 * MS_PER_MINUTE)
        await db.insert({
            hash: 'random-hash-1',
            type: TxType.WALLET_CREATE,
            state: TxState.PENDING,
            created_at: new Date()
        })
        await db.insert({
            hash: 'random-hash-2',
            type: TxType.WALLET_CREATE,
            state: TxState.PENDING,
            created_at: nowMinusFourMinutes
        })
        await db.insert({
            hash: 'random-hash-3',
            type: TxType.WALLET_CREATE,
            state: TxState.MINED,
            supervisor_status: SupervisorStatus.REQUIRED,
            created_at: new Date()
        })
        await db.insert({
            hash: 'random-hash-4',
            type: TxType.WALLET_CREATE,
            state: TxState.MINED,
            supervisor_status: SupervisorStatus.REQUIRED,
            created_at: nowMinusFourMinutes
        })
        await db.insert({
            hash: 'random-hash-5',
            type: TxType.WALLET_CREATE,
            state: TxState.FAILED,
            supervisor_status: SupervisorStatus.REQUIRED,
            created_at: nowMinusFourMinutes
        })
        await db.insert({
            hash: 'random-hash-6',
            type: TxType.WALLET_CREATE,
            state: TxState.PENDING,
            supervisor_status: SupervisorStatus.REQUIRED,
            created_at: nowMinusFourMinutes
        })
        let pendingOlderThan = await repo.getPendingOlderThan(2)
        console.log("pending", pendingOlderThan)
        console.log("x", pendingOlderThan[0].originated_from !== null)
        let supervisorRequiredOlderThan = await repo.getSupervisorRequiredOlderThan(2)
        console.log("sup req", supervisorRequiredOlderThan)

        // let contractId = config.get().contracts.coop.address
        // let callData = await codec.coop.encodeAddWallet(accounts.bob.publicKey)
        // let addWalletTx = await clients.owner().contractCallTx({
        //     callerId: accounts.owner.publicKey,
        //     contractId: contractId,
        //     amount: 0,
        //     gas: 10000,
        //     callData:  callData
        // })
        // let addWalletTxSigned = await clients.owner().signTransaction(addWalletTx)
        // let addWalletTxHash = (await clients.owner().sendTransaction(addWalletTxSigned, { waitMined: false })).hash

        // await db.insert({
        //     hash: addWalletTxHash,
        //     type: TxType.WALLET_CREATE,
        //     state: TxState.PENDING,
        //     created_at: new Date()
        // })
        // await stateChecker.processAllRecords()
        // await util.waitTxProcessed(addWalletTxHash)

        // let txInfo = await grpcClient.getTransactionInfo(addWalletTxHash)
        // assert.strictEqual(txInfo.state, txStateToGrpc(TxState.MINED))
    })
})