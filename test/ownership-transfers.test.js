let chai = require('chai');
let assert = chai.assert;

let config = require('../config')
let client = require('../ae/client')
let supervisor = require('../queue/queue')
let grpcServer = require('../grpc/server')
let codec = require('../ae/codec')
let { TxType, TxState, SupervisorStatus } = require('../enums/enums')

let clients = require('./ae/clients')
let grpcClient = require('./grpc/client')
let accounts = require('./ae/accounts')
let util = require('./util/util')
let db = require('./util/db')

describe('Ownership transfer tests', function() {

    before(async() => {
        process.env['DB_SCAN_ENABLED'] = "false"
        process.env['AUTO_FUND'] = "false"
        await grpcServer.start()
        await grpcClient.start()
        await clients.init()
        await db.init()

        addAliceWalletTx = await grpcClient.generateAddWalletTx(accounts.alice.publicKey)
        addAliceWalletTxSigned = await clients.owner().signTransaction(addAliceWalletTx)
        addAliceWalletTxHash = await grpcClient.postTransaction(addAliceWalletTxSigned)
        await util.waitTxProcessed(addAliceWalletTxHash)
    })

    after(async() => {
        await grpcServer.stop()
        await supervisor.stop()
    })

    it("Should be able to change Coop ownership", async () => {
        let changeOwnershipTx = await grpcClient.generateTransferPlatformManagerOwnershipTx(accounts.bob.publicKey)
        let changeOwnershipTxSigned = await clients.owner().signTransaction(changeOwnershipTx)
        let changeOwnershipTxHash = await grpcClient.postTransaction(changeOwnershipTxSigned)
        await util.waitTxProcessed(changeOwnershipTxHash)

        let fetchedCoopOwner = await grpcClient.getPlatformManager()
        assert.equal(fetchedCoopOwner, accounts.bob.publicKey)

        let ownershipChangeRecord = (await db.getBy({
            hash: changeOwnershipTxHash
        }))[0]
        assert.strictEqual(ownershipChangeRecord.from_wallet, accounts.owner.publicKey)
        assert.strictEqual(ownershipChangeRecord.to_wallet, accounts.bob.publicKey)
        assert.strictEqual(ownershipChangeRecord.state, TxState.MINED)
        assert.strictEqual(ownershipChangeRecord.supervisor_status, SupervisorStatus.NOT_REQUIRED)
        assert.strictEqual(ownershipChangeRecord.type, TxType.COOP_OWNERSHIP_TRANSFER)
    })

    it("Should be able to change Eur ownership", async () => {
        let changeOwnershipTx = await grpcClient.generateTransferTokenIssuerOwnershipTx(accounts.bob.publicKey)
        let changeOwnershipTxSigned = await clients.owner().signTransaction(changeOwnershipTx)
        let changeOwnershipTxHash = await grpcClient.postTransaction(changeOwnershipTxSigned)
        await util.waitTxProcessed(changeOwnershipTxHash)

        let fetchedEurOwner = await grpcClient.getTokenIssuer()
        assert.equal(fetchedEurOwner, accounts.bob.publicKey)

        let ownershipChangeRecord = (await db.getBy({
            hash: changeOwnershipTxHash
        }))[0]
        assert.strictEqual(ownershipChangeRecord.from_wallet, accounts.owner.publicKey)
        assert.strictEqual(ownershipChangeRecord.to_wallet, accounts.bob.publicKey)
        assert.strictEqual(ownershipChangeRecord.state, TxState.MINED)
        assert.strictEqual(ownershipChangeRecord.supervisor_status, SupervisorStatus.NOT_REQUIRED)
        assert.strictEqual(ownershipChangeRecord.type, TxType.EUR_OWNERSHIP_TRANSFER)
    })

    it('Should fail if non-owner tries to change ownership of Eur/Coop', async () => {
        let coopTransferCallData = await codec.coop.encodeTransferCoopOwnership(accounts.alice.publicKey)
        let forbiddenCoopOwnershipTransferTx = await client.instance().contractCallTx({
            callerId: accounts.alice.publicKey,
            contractId: config.get().contracts.coop.address,
            amount: 0,
            gas: 10000,
            callData: coopTransferCallData
        })
        let forbiddenCoopOwnershipTransferTxSigned = await clients.alice().signTransaction(forbiddenCoopOwnershipTransferTx)
        let forbiddenCoopOwnership = await grpcClient.postTransaction(forbiddenCoopOwnershipTransferTxSigned)
        assert.equal(forbiddenCoopOwnership.details, "50 > Only Platform Manager can make this action!")

        let eurTransferCallData = await codec.eur.encodeTransferEurOwnership(accounts.alice.publicKey)
        let forbiddenEurOwnershipTransferTx = await client.instance().contractCallTx({
            callerId: accounts.alice.publicKey,
            contractId: config.get().contracts.eur.address,
            amount: 0,
            gas: 10000,
            callData: eurTransferCallData
        })
        let forbiddenEurOwnershipTransferTxSigned = await clients.alice().signTransaction(forbiddenEurOwnershipTransferTx)
        let forbiddenEurOwnership = await grpcClient.postTransaction(forbiddenEurOwnershipTransferTxSigned)
        assert.equal(forbiddenEurOwnership.details, "50 > Only Token Issuer can make this action!")
    })

})