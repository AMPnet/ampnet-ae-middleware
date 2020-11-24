let chai = require('chai');
let { Crypto, Node, MemoryAccount, Universal: Ae } = require('@aeternity/aepp-sdk')
let assert = chai.assert;

let grpcClient = require('./grpc/client')
let accounts = require('./ae/accounts')
let clients = require('./ae/clients')
let util = require('./util/util')
let db = require('./util/db')

let client = require('../ae/client')
let codec = require('../ae/codec')
let contracts = require('../ae/contracts')
let config = require('../config')
let { TxType, TxState, SupervisorStatus } = require('../enums/enums')

let err = require('../error/errors')
let ErrorType = err.type

describe('Error handling tests', function() {

    before(async () => { 
        await db.clearTransactions(adminWalletTx.hash)

        addBobWalletTx = await grpcClient.generateAddWalletTx(accounts.bob.publicKey, coopId)
        addBobWalletTxSigned = await clients.owner().signTransaction(addBobWalletTx)
        addBobWalletTxHash = await grpcClient.postTransaction(addBobWalletTxSigned, coopId)
        await util.waitTxProcessed(addBobWalletTxHash)
    })

    it('Should fail with correct error message if transaction broadcasted but not signed', async () => {
        let unsignedTx = await grpcClient.generateAddWalletTx(accounts.jane.publicKey, coopId)
        let errResponse = await grpcClient.postTransaction(unsignedTx, coopId)
        assert.strictEqual(errResponse.details, err.generate(ErrorType.TX_NOT_SIGNED).message)
    }) 

    it('Should fail with correct error message if invalid contract is called', async () => {
        let randomContractId = 'ct_RYkcTuYcyxQ6fWZsL2G3Kj3K5WCRUEXsi76bPUNkEsoHc52Wp'
        let randomCallData = await codec.org.encodeCreateOrganization(coopInfo.coop_contract)
        let randomContractCallTx = await client.instance().contractCallTx({
            callerId: accounts.bob.publicKey,
            contractId: randomContractId,
            abiVersion: 1,
            amount: 0,
            gas: 10000,
            callData: randomCallData
        })
        let randomContractCallTxSigned = await clients.bob().signTransaction(randomContractCallTx)
    
        let errResponse = await grpcClient.postTransaction(randomContractCallTxSigned, coopId)
        assert.strictEqual(errResponse.details, err.generate(ErrorType.TX_INVALID_CONTRACT_CALLED).message)
    })

    it('Should fail with correct error message if Org is created with invalid Coop as argument', async () => {
        let badCoopAddr = 'ct_RYkcTuYcyxQ6fWZsL2G3Kj3K5WCRUEXsi76bPUNkEsoHc52Wp'
        let callData = await contracts.getOrgCompiled().encodeCall("init", [ badCoopAddr ])
        let badTx = await client.instance().contractCreateTx({
            ownerId: accounts.bob.publicKey,
            code: contracts.getOrgCompiled().bytecode,
            abiVersion: 3,
            deposit: 0,
            amount: 0,
            gas: 50000,
            callData: callData
        })
        let badTxSigned = await clients.bob().signTransaction(badTx.tx)
        let errResponse = await grpcClient.postTransaction(badTxSigned, coopId)
        assert.strictEqual(errResponse.details, err.generate(ErrorType.GROUP_INVALID_COOP_ARG).message)
    }) 

    it('Should fail with correct error message if Proj is created with invalid Org as argument', async () => {
        let badOrgAddr = 'ct_RYkcTuYcyxQ6fWZsL2G3Kj3K5WCRUEXsi76bPUNkEsoHc52Wp'
        let callData = await codec.proj.encodeCreateProject(
            badOrgAddr,
            '1000',
            '1000000',
            '1000000',
            '999999999'
        )
        let badTx = await client.instance().contractCreateTx({
            ownerId: accounts.bob.publicKey,
            code: contracts.getProjCompiled().bytecode,
            abiVersion: 1,
            deposit: 0,
            amount: 0,
            gas: 50000,
            callData: callData
        })
        let badTxSigned = await clients.bob().signTransaction(badTx.tx)

        let errResponse = await grpcClient.postTransaction(badTxSigned, coopId)
        assert.strictEqual(errResponse.details, err.generate(ErrorType.PROJ_INVALID_GROUP_ARG).message)
    })

    it('Should fail with correct error message if trying to deploy arbitrary Contract as Proj/Org', async () => {
        let source = 'contract HelloWorld = \n\tentrypoint hello_world() = "Hello World!"'
        let compiled = await client.instance().contractCompile(source)
        let callData = await codec.org.encodeCreateOrganization(coopInfo.coop_contract)
        let deployTx = await client.instance().contractCreateTx({
            ownerId: accounts.bob.publicKey,
            code: compiled.bytecode,
            abiVersion: 1,
            deposit: 0,
            amount: 0,
            gas: 50000,
            callData: callData
        })
        let deployTxSigned = await clients.bob().signTransaction(deployTx.tx)
        
        let errResponse = await grpcClient.postTransaction(deployTxSigned, coopId)
        assert.strictEqual(errResponse.details, err.generate(ErrorType.MALFORMED_CONTRACT_CODE).message)
    })

    it('Should fail with correct message if trying to post transaction but user wallet not registered on Platform', async () => {
        let callData = await codec.org.encodeCreateOrganization(coopInfo.coop_contract)
        let badTx = await client.instance().contractCreateTx({
            ownerId: accounts.alice.publicKey,
            code: contracts.getOrgCompiled().bytecode,
            abiVersion: 1,
            deposit: 0,
            amount: 0,
            gas: 50000,
            callData: callData
        })
        let badTxSigned = await clients.alice().signTransaction(badTx.tx)

        let errResponse = await grpcClient.postTransaction(badTxSigned, coopId)
        assert.strictEqual(errResponse.details, err.generate(ErrorType.WALLET_NOT_FOUND).message)
    })

    it('Should fail if trying to generate addWallet for txHash but transaction with given hash does not exist', async () => {
        let randomTxHash = 'th_vwXLMLZt3Nkog5BrhiCV2wS4qyUFoBtWnaS38zsi4B2xpwTcD'
        let errResponse = await grpcClient.generateAddWalletTx(randomTxHash, coopId)
        let errResponseParsed = util.parseError(errResponse.details)
        assert.strictEqual(errResponseParsed.message, 'Transaction not found')
    })

    it('Should fail if trying to generate addWallet for txHash but transaction with given hash not yet mined', async () => {
        let tx = await grpcClient.generateAddWalletTx(accounts.alice.publicKey, coopId)
        let txSigned = await clients.owner().signTransaction(tx)
        let txHash = await grpcClient.postTransaction(txSigned, coopId)

        let errResponse = await grpcClient.generateAddWalletTx(txHash, coopId)
        let errResponseParsed = util.parseError(errResponse.details)
        assert.strictEqual(errResponseParsed.message, 'Tx not mined')
    })

    it('Should fail if trying to check isWalletActive for non-existing wallet txHash', async () => {
        let nonExistingHash = "non-existing-hash"
        let errResponse = await grpcClient.isWalletActive(nonExistingHash)
        assert.strictEqual(errResponse.details, err.generate(ErrorType.WALLET_NOT_FOUND).message)
    })

    it('Should fail if trying to check isWalletActive for txHash which failed', async () => {
        let failedHash = "failed-hash"
        await db.insert({
            hash: failedHash,
            type: TxType.WALLET_CREATE,
            state: TxState.FAILED,
            created_at: new Date(),
            coop_id: coopId
        })
        let errResponse = await grpcClient.isWalletActive(failedHash)
        assert.strictEqual(errResponse.details, err.generate(ErrorType.WALLET_CREATION_FAILED).message)
    })

    it('Should fail if trying to check isWalletActive for txHash which is not yet mined', async () => {
        let pendingHash = "pending-hash"
        await db.insert({
            hash: pendingHash,
            type: TxType.WALLET_CREATE,
            state: TxState.PENDING,
            created_at: new Date(),
            coop_id: coopId
        })
        let errResponse = await grpcClient.isWalletActive(pendingHash)
        assert.strictEqual(errResponse.details, err.generate(ErrorType.WALLET_CREATION_PENDING).message)
    })

    it('Should fail if trying to check isWalletActive for txHash which is not yet auto-funded', async () => {
        let supervisorRequiredHash = "supervisor-required-hash"
        await db.insert({
            hash: supervisorRequiredHash,
            type: TxType.WALLET_CREATE,
            state: TxState.MINED,
            supervisor_status: SupervisorStatus.REQUIRED,
            created_at: new Date(),
            coop_id: coopId
        })
        let errResponse = await grpcClient.isWalletActive(supervisorRequiredHash)
        assert.strictEqual(errResponse.details, err.generate(ErrorType.WALLET_CREATION_PENDING).message)
    })
    
    it('Should fail if trying to check isWalletActive for txHash which represents another type of transcation (not wallet)', async () => {
        let investHash = "invest-hash"
        await db.insert({
            hash: investHash,
            type: TxType.INVEST,
            state: TxState.MINED,
            created_at: new Date(),
            coop_id: coopId
        })
        let errResponse = await grpcClient.isWalletActive(investHash)
        let errResponseParsed = util.parseError(errResponse.details)
        assert.strictEqual(errResponseParsed.message, "Given hash does not represent wallet creation transaction!")
    })

    it('Transaction that fails on Contract level should be updated correctly in its db entry', async () => {
        // For example, Bob tries to approve Alice's wallet but only admin can do such a thing, tx should fail
        let callData = await codec.coop.encodeAddWallet(accounts.alice.publicKey)
        let tx = await client.instance().contractCallTx({
            callerId : accounts.bob.publicKey,
            contractId : coopInfo.coop_contract,
            amount : 0,
            gas : 10000,
            callData : callData
        })
        let txSigned = await clients.bob().signTransaction(tx)
        let err = await grpcClient.postTransaction(txSigned, coopId)
        assert.strictEqual(err.message, "9 FAILED_PRECONDITION: 50 > Only Platform Manager can make this action!")
    })

    it('Transaction should fail if trying to generate addWallet transaction for wallet that already exists', async () => {
        let addBobWalletAgainTxErrResponse = await grpcClient.generateAddWalletTx(accounts.bob.publicKey, coopId)
        assert.strictEqual(addBobWalletAgainTxErrResponse.details, err.generate(ErrorType.WALLET_ALREADY_EXISTS).message)
    })

})