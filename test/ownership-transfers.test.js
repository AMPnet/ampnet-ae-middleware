let { Crypto } = require('@aeternity/aepp-sdk')
let chai = require('chai');
let assert = chai.assert;
let expect = chai.expect

let client = require('../ae/client')
let codec = require('../ae/codec')
let { TxType, TxState, SupervisorStatus } = require('../enums/enums')

let clients = require('./ae/clients')
let grpcClient = require('./grpc/client')
let accounts = require('./ae/accounts')
let util = require('./util/util')
let db = require('./util/db')
let globalSetup = require('./global-setup')
let amqpUtil = require('./util/amqp-util')

describe('Ownership transfer tests', function() {

    before(async () => {
        await db.clearTransactions(adminWalletTx.hash)
        await amqpUtil.init()
    })

    beforeEach( async () => {
        amqpUtil.clearAllMessages()
    })

    it("Should be able to change Coop and Eur ownership", async () => {
        let newOwner = Crypto.generateKeyPair()
        
        let addNewOwnerWalletTx = await grpcClient.generateAddWalletTx(newOwner.publicKey, coopId)
        let addNewOwnerWalletTxSigned = await clients.owner().signTransaction(addNewOwnerWalletTx)
        let addNewOwnerWalletTxHash = await grpcClient.postTransaction(addNewOwnerWalletTxSigned, coopId)
        await util.waitTxProcessed(addNewOwnerWalletTxHash)

        let changeCoopOwnershipTx = await grpcClient.generateTransferPlatformManagerOwnershipTx(newOwner.publicKey, coopId)
        let changeCoopOwnershipTxSigned = await clients.owner().signTransaction(changeCoopOwnershipTx)
        let changeCoopOwnershipTxHash = await grpcClient.postTransaction(changeCoopOwnershipTxSigned, coopId)
        await util.waitTxProcessed(changeCoopOwnershipTxHash)

        let fetchedCoopOwner = await grpcClient.getPlatformManager(coopId)
        assert.equal(fetchedCoopOwner, newOwner.publicKey)

        let coopOwnershipChangeRecord = (await db.getBy({
            hash: changeCoopOwnershipTxHash
        }))[0]
        assert.strictEqual(coopOwnershipChangeRecord.from_wallet, accounts.owner.publicKey)
        assert.strictEqual(coopOwnershipChangeRecord.to_wallet, newOwner.publicKey)
        assert.strictEqual(coopOwnershipChangeRecord.state, TxState.MINED)
        assert.strictEqual(coopOwnershipChangeRecord.supervisor_status, SupervisorStatus.NOT_REQUIRED)
        assert.strictEqual(coopOwnershipChangeRecord.type, TxType.COOP_OWNERSHIP_TRANSFER)

        let changeEurOwnershipTx = await grpcClient.generateTransferTokenIssuerOwnershipTx(newOwner.publicKey, coopId)
        let changeEurOwnershipTxSigned = await clients.owner().signTransaction(changeEurOwnershipTx)
        let changeEurOwnershipTxHash = await grpcClient.postTransaction(changeEurOwnershipTxSigned, coopId)
        await util.waitTxProcessed(changeEurOwnershipTxHash)

        let fetchedEurOwner = await grpcClient.getTokenIssuer(coopId)
        assert.equal(fetchedEurOwner, newOwner.publicKey)

        let eurOwnershipChangeRecord = (await db.getBy({
            hash: changeEurOwnershipTxHash
        }))[0]
        assert.strictEqual(eurOwnershipChangeRecord.from_wallet, accounts.owner.publicKey)
        assert.strictEqual(eurOwnershipChangeRecord.to_wallet, newOwner.publicKey)
        assert.strictEqual(eurOwnershipChangeRecord.state, TxState.MINED)
        assert.strictEqual(eurOwnershipChangeRecord.supervisor_status, SupervisorStatus.NOT_REQUIRED)
        assert.strictEqual(eurOwnershipChangeRecord.type, TxType.EUR_OWNERSHIP_TRANSFER)

        await globalSetup.changeOwner(newOwner)

        // Verify AMQP messages
        const updateCoopRolesMessages = amqpUtil.getUpdateCoopRolesMessages()
        const messageSent = amqpUtil.createUpdateCoopRolesMessage(coopId)
        expect(updateCoopRolesMessages).to.have.lengthOf(2)
        expect(updateCoopRolesMessages).to.contain(messageSent)
    })

    it('Should fail if non-owner tries to change ownership of Eur/Coop', async () => {
        let addAliceWalletTx = await grpcClient.generateAddWalletTx(accounts.alice.publicKey, coopId)
        let addAliceWalletTxSigned = await clients.owner().signTransaction(addAliceWalletTx)
        let addAliceWalletTxHash = await grpcClient.postTransaction(addAliceWalletTxSigned, coopId)
        await util.waitTxProcessed(addAliceWalletTxHash)

        let coopTransferCallData = await codec.coop.encodeTransferCoopOwnership(accounts.alice.publicKey)
        let forbiddenCoopOwnershipTransferTx = await client.instance().contractCallTx({
            callerId: accounts.alice.publicKey,
            contractId: coopInfo.coop_contract,
            amount: 0,
            gas: 10000,
            callData: coopTransferCallData
        })
        let forbiddenCoopOwnershipTransferTxSigned = await clients.alice().signTransaction(forbiddenCoopOwnershipTransferTx)
        let forbiddenCoopOwnership = await grpcClient.postTransaction(forbiddenCoopOwnershipTransferTxSigned, coopId)
        assert.equal(forbiddenCoopOwnership.details, "603 > Only Platform Manager can make this action!")

        let eurTransferCallData = await codec.eur.encodeTransferEurOwnership(accounts.alice.publicKey)
        let forbiddenEurOwnershipTransferTx = await client.instance().contractCallTx({
            callerId: accounts.alice.publicKey,
            contractId: coopInfo.eur_contract,
            amount: 0,
            gas: 10000,
            callData: eurTransferCallData
        })
        let forbiddenEurOwnershipTransferTxSigned = await clients.alice().signTransaction(forbiddenEurOwnershipTransferTx)
        let forbiddenEurOwnership = await grpcClient.postTransaction(forbiddenEurOwnershipTransferTxSigned, coopId)
        assert.equal(forbiddenEurOwnership.details, "616 > Only Token Issuer can make this action!")

        // Verify no AMQP messages sent
        const updateCoopRolesMessages = amqpUtil.getUpdateCoopRolesMessages()
        expect(updateCoopRolesMessages).to.have.lengthOf(0)
    })

    after(async () => {
        await amqpUtil.stop()
    })
})
