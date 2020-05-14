let chai = require('chai');
let assert = chai.assert;

let config = require('../config')
let client = require('../ae/client')
let supervisor = require('../supervisor')
let grpcServer = require('../grpc/server')
let codec = require('../ae/codec')
let { TxType, TxState, SupervisorStatus, WalletType } = require('../enums/enums')

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

    it("Should be able to change Coop ownership", async () => {
        let changeOwnershipTx = await grpcClient.generateTransferPlatformManagerOwnershipTx(accounts.bob.publicKey)
        let changeOwnershipTxSigned = await clients.owner().signTransaction(changeOwnershipTx)
        let changeOwnershipTxHash = await grpcClient.postTransaction(changeOwnershipTxSigned)
        await util.waitTxProcessed(changeOwnershipTxHash)

        let fetchedCoopOwner = await grpcClient.getPlatformManager()
        assert.equal(fetchedCoopOwner, accounts.bob.publicKey)

        let expectedRecordCount = 1
        let allRecords = await db.getAll()
        let recordsCount = allRecords.length
        assert.strictEqual(recordsCount, expectedRecordCount)

        let ownershipChangeRecord = allRecords[0]
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

        let expectedRecordCount = 1
        let allRecords = await db.getAll()
        let recordsCount = allRecords.length
        assert.strictEqual(recordsCount, expectedRecordCount)

        let ownershipChangeRecord = allRecords[0]
        assert.strictEqual(ownershipChangeRecord.from_wallet, accounts.owner.publicKey)
        assert.strictEqual(ownershipChangeRecord.to_wallet, accounts.bob.publicKey)
        assert.strictEqual(ownershipChangeRecord.state, TxState.MINED)
        assert.strictEqual(ownershipChangeRecord.supervisor_status, SupervisorStatus.NOT_REQUIRED)
        assert.strictEqual(ownershipChangeRecord.type, TxType.EUR_OWNERSHIP_TRANSFER)
    })

    it('Should fail if non-owner tries to change ownership of Eur/Coop', async () => {
        let addBobWalletTx = await grpcClient.generateAddWalletTx(accounts.bob.publicKey)
        let addBobWalletTxSigned = await clients.owner().signTransaction(addBobWalletTx)
        let addBobWalletTxHash = await grpcClient.postTransaction(addBobWalletTxSigned)
        await util.waitTxProcessed(addBobWalletTxHash)

        let coopTransferCallData = await codec.coop.encodeTransferCoopOwnership(accounts.bob.publicKey)
        let forbiddenCoopOwnershipTransferTx = await client.instance().contractCallTx({
            callerId: accounts.bob.publicKey,
            contractId: config.get().contracts.coop.address,
            amount: 0,
            gas: 10000,
            callData: coopTransferCallData
        })
        let forbiddenCoopOwnershipTransferTxSigned = await clients.bob().signTransaction(forbiddenCoopOwnershipTransferTx)
        let forbiddenCoopOwnership = await grpcClient.postTransaction(forbiddenCoopOwnershipTransferTxSigned)
        assert.equal(forbiddenCoopOwnership.details, "50 > Only Platform Manager can make this action!")

        let eurTransferCallData = await codec.eur.encodeTransferEurOwnership(accounts.bob.publicKey)
        let forbiddenEurOwnershipTransferTx = await client.instance().contractCallTx({
            callerId: accounts.bob.publicKey,
            contractId: config.get().contracts.eur.address,
            amount: 0,
            gas: 10000,
            callData: eurTransferCallData
        })
        let forbiddenEurOwnershipTransferTxSigned = await clients.bob().signTransaction(forbiddenEurOwnershipTransferTx)
        let forbiddenEurOwnership = await grpcClient.postTransaction(forbiddenEurOwnershipTransferTxSigned)
        assert.equal(forbiddenEurOwnership.details, "50 > Only Token Issuer can make this action!")
    })

})