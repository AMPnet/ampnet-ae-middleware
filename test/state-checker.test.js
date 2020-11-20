let { Crypto } = require('@aeternity/aepp-sdk')
let chai = require('chai');
let assert = chai.assert;

let codec = require('../ae/codec')
let cron = require('../supervisor')
let { TxType, TxState, SupervisorStatus, WalletType, txStateToGrpc } = require('../enums/enums')

let grpcClient = require('./grpc/client')
let accounts = require('./ae/accounts')
let clients = require('./ae/clients')
let util = require('./util/util')
let db = require('./util/db')

describe('DB records recovery test', function() {

    before(async () => {
        await db.clearTransactions(adminWalletTx.hash)
    })

    it('should recover from inconsistent state in database', async () => {
        let bobWallet = Crypto.generateKeyPair()
        
        let contractId = coopInfo.coop_contract
        let callData = await codec.coop.encodeAddWallet(bobWallet.publicKey)
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
            type: TxType.WALLET_CREATE,
            state: TxState.PENDING,
            supervisor_status: SupervisorStatus.NOT_REQUIRED,
            created_at: new Date(),
            coop_id: coopId
        })
        cron.scanAndProcess()
        await util.waitTxProcessed(addWalletTxHash)

        let txInfo = await grpcClient.getTransactionInfo(addWalletTxHash)
        assert.strictEqual(txInfo.state, txStateToGrpc(TxState.MINED))
    })
})