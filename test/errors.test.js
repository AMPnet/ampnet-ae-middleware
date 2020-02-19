let chai = require('chai');
let assert = chai.assert;

let grpcClient = require('./grpc/client')
let deployer = require('./ae/deployer')
let accounts = require('./ae/accounts')
let clients = require('./ae/clients')
let util = require('./util/util')
let db = require('./util/db')

let config = require('../config')
let grpcServer = require('../grpc/server')
let client = require('../ae/client')
let codec = require('../ae/codec')
let supervisor = require('../supervisor')
let contracts = require('../ae/contracts')
let { TxType, TxState } = require('../enums/enums')

let err = require('../error/errors')
let ErrorType = err.type

describe('Error handling tests', function() {

    beforeEach(async() => {
        await grpcServer.start()
        await grpcClient.start()
        await clients.init()
        await db.init()
    })

    afterEach(async() => {
        await grpcServer.stop()
        await supervisor.stop()
    })

    // it('Should fail with correct error message if transaction broadcasted but not signed', async () => {
    //     addBobWalletTx = await grpcClient.generateAddWalletTx(accounts.bob.publicKey)
    //     errResponse = await grpcClient.postTransaction(addBobWalletTx)
    //     assert.strictEqual(errResponse.details, err.generate(ErrorType.TX_NOT_SIGNED).message)
    // }) 

    // it('Should fail with correct error message if invalid contract is called', async () => {
    //     addBobWalletTx = await grpcClient.generateAddWalletTx(accounts.bob.publicKey)
    //     addBobWalletTxSigned = await clients.owner().signTransaction(addBobWalletTx)
    //     addBobWalletTxHash = await grpcClient.postTransaction(addBobWalletTxSigned)
    //     await util.waitMined(addBobWalletTxHash)

    //     randomContractId = 'ct_RYkcTuYcyxQ6fWZsL2G3Kj3K5WCRUEXsi76bPUNkEsoHc52Wp'
    //     randomCallData = await codec.org.encodeCreateOrganization()
    //     randomContractCallTx = await client.instance().contractCallTx({
    //         callerId: accounts.bob.publicKey,
    //         contractId: randomContractId,
    //         abiVersion: 1,
    //         amount: 0,
    //         gas: 10000,
    //         callData:  randomCallData
    //     })
    //     randomContractCallTxSigned = await clients.bob().signTransaction(randomContractCallTx)
    
    //     errResponse = await grpcClient.postTransaction(randomContractCallTxSigned)
    //     assert.strictEqual(errResponse.details, err.generate(ErrorType.TX_INVALID_CONTRACT_CALLED).message)
    // })

    // it('Should fail with correct error message if Org is created with invalid Coop as argument', async () => {
    //     addBobWalletTx = await grpcClient.generateAddWalletTx(accounts.bob.publicKey)
    //     addBobWalletTxSigned = await clients.owner().signTransaction(addBobWalletTx)
    //     addBobWalletTxHash = await grpcClient.postTransaction(addBobWalletTxSigned)
    //     await util.waitMined(addBobWalletTxHash)

    //     badCoopAddr = 'ct_RYkcTuYcyxQ6fWZsL2G3Kj3K5WCRUEXsi76bPUNkEsoHc52Wp'
    //     callData = await contracts.getOrgCompiled().encodeCall("init", [ badCoopAddr ])
    //     badTx = await client.instance().contractCreateTx({
    //         ownerId: accounts.bob.publicKey,
    //         code: contracts.getOrgCompiled().bytecode,
    //         abiVersion: 1,
    //         deposit: 0,
    //         amount: 0,
    //         gas: 50000,
    //         callData: callData
    //     })
    //     badTxSigned = await clients.bob().signTransaction(badTx.tx)
    //     errResponse = await grpcClient.postTransaction(badTxSigned)
    //     assert.strictEqual(errResponse.details, err.generate(ErrorType.GROUP_INVALID_COOP_ARG).message)
    // }) 

    // it('Should fail with correct error message if Proj is created with invalid Org as argument', async () => {
    //     addBobWalletTx = await grpcClient.generateAddWalletTx(accounts.bob.publicKey)
    //     addBobWalletTxSigned = await clients.owner().signTransaction(addBobWalletTx)
    //     addBobWalletTxHash = await grpcClient.postTransaction(addBobWalletTxSigned)
    //     await util.waitMined(addBobWalletTxHash)

    //     badOrgAddr = 'ct_RYkcTuYcyxQ6fWZsL2G3Kj3K5WCRUEXsi76bPUNkEsoHc52Wp'
    //     callData = await codec.proj.encodeCreateProject(
    //         badOrgAddr,
    //         '1000',
    //         '1000000',
    //         '1000000',
    //         '999999999'
    //     )
    //     badTx = await client.instance().contractCreateTx({
    //         ownerId: accounts.bob.publicKey,
    //         code: contracts.getProjCompiled().bytecode,
    //         abiVersion: 1,
    //         deposit: 0,
    //         amount: 0,
    //         gas: 50000,
    //         callData: callData
    //     })
    //     badTxSigned = await clients.bob().signTransaction(badTx.tx)

    //     errResponse = await grpcClient.postTransaction(badTxSigned)
    //     assert.strictEqual(errResponse.details, err.generate(ErrorType.PROJ_INVALID_GROUP_ARG).message)
    // })

    // it('Should fail with correct error message if trying to deploy arbitrary Contract as Proj/Org', async () => {
    //     addBobWalletTx = await grpcClient.generateAddWalletTx(accounts.bob.publicKey)
    //     addBobWalletTxSigned = await clients.owner().signTransaction(addBobWalletTx)
    //     addBobWalletTxHash = await grpcClient.postTransaction(addBobWalletTxSigned)
    //     await util.waitMined(addBobWalletTxHash)

    //     source = 'contract HelloWorld = \n\tentrypoint hello_world() = "Hello World!"'
    //     compiled = await client.instance().contractCompile(source)
    //     callData = await codec.org.encodeCreateOrganization()
    //     deployTx = await client.instance().contractCreateTx({
    //         ownerId: accounts.bob.publicKey,
    //         code: compiled.bytecode,
    //         abiVersion: 1,
    //         deposit: 0,
    //         amount: 0,
    //         gas: 50000,
    //         callData: callData
    //     })
    //     deployTxSigned = await clients.bob().signTransaction(deployTx.tx)
        
    //     errResponse = await grpcClient.postTransaction(deployTxSigned)
    //     assert.strictEqual(errResponse.details, err.generate(ErrorType.MALFORMED_CONTRACT_CODE).message)
    // })

    // it('Should fail with correct message if trying to post transaction but user wallet not registered on Platform', async () => {
    //     callData = await codec.org.encodeCreateOrganization()
    //     badTx = await client.instance().contractCreateTx({
    //         ownerId: accounts.bob.publicKey,
    //         code: contracts.getOrgCompiled().bytecode,
    //         abiVersion: 1,
    //         deposit: 0,
    //         amount: 0,
    //         gas: 50000,
    //         callData: callData
    //     })
    //     badTxSigned = await clients.bob().signTransaction(badTx.tx)

    //     errResponse = await grpcClient.postTransaction(badTxSigned)
    //     assert.strictEqual(errResponse.details, err.generate(ErrorType.WALLET_NOT_FOUND).message)
    // })

    // it('Should fail if trying to generate addWallet for txHash but transaction with given hash does not exist', async () => {
    //     randomTxHash = 'th_vwXLMLZt3Nkog5BrhiCV2wS4qyUFoBtWnaS38zsi4B2xpwTcD'
    //     errResponse = await grpcClient.generateAddWalletTx(randomTxHash)
    //     errResponseParsed = util.parseError(errResponse.details)
    //     assert.strictEqual(errResponseParsed.message, 'Transaction not found')
    // })

    // it('Should fail if trying to generate addWallet for txHash but transaction with given hash not yet mined', async () => {
    //     tx = await grpcClient.generateAddWalletTx(accounts.bob.publicKey)
    //     txSigned = await clients.owner().signTransaction(tx)
    //     txHash = await grpcClient.postTransaction(txSigned)

    //     // try to add txHash as new wallet, doesnt make sense but serves the purpose as txHash most probably still not mined
    //     errResponse = await grpcClient.generateAddWalletTx(txHash)
    //     errResponseParsed = util.parseError(errResponse.details)
    //     assert.strictEqual(errResponseParsed.message, 'Tx not mined')
    // })

    // it('Should fail if trying to check isWalletActive for non-existing wallet txHash', async () => {
    //     nonExistingHash = "non-existing-hash"
    //     errResponse = await grpcClient.isWalletActive(nonExistingHash)
    //     assert.strictEqual(errResponse.details, err.generate(ErrorType.WALLET_NOT_FOUND).message)
    // })

    // it('Should fail if trying to check isWalletActive for txHash which failed', async () => {
    //     failedHash = "failed-hash"
    //     await db.insert({
    //         hash: failedHash,
    //         type: TxType.WALLET_CREATE,
    //         state: TxState.FAILED,
    //         created_at: new Date()
    //     })
    //     errResponse = await grpcClient.isWalletActive(failedHash)
    //     assert.strictEqual(errResponse.details, err.generate(ErrorType.WALLET_CREATION_FAILED).message)
    // })

    // it('Should fail if trying to check isWalletActive for txHash which is not yet mined', async () => {
    //     pendingHash = "pending-hash"
    //     await db.insert({
    //         hash: pendingHash,
    //         type: TxType.WALLET_CREATE,
    //         state: TxState.PENDING,
    //         created_at: new Date()
    //     })
    //     errResponse = await grpcClient.isWalletActive(pendingHash)
    //     assert.strictEqual(errResponse.details, err.generate(ErrorType.WALLET_CREATION_PENDING).message)
    // })
    
    // it('Should fail if trying to check isWalletActive for txHash which represents another type of transcation (not wallet)', async () => {
    //     investHash = "invest-hash"
    //     await db.insert({
    //         hash: investHash,
    //         type: TxType.INVEST,
    //         state: TxState.MINED,
    //         created_at: new Date()
    //     })
    //     errResponse = await grpcClient.isWalletActive(investHash)
    //     errResponseParsed = util.parseError(errResponse.details)
    //     assert.strictEqual(errResponseParsed.message, "Given hash does not represent wallet creation transaction!")
    // })

    it('Transaction that fails on Contract level should be updated correctly in its db entry', async () => {
        addBobWalletTx = await grpcClient.generateAddWalletTx(accounts.bob.publicKey)
        addBobWalletTxSigned = await clients.owner().signTransaction(addBobWalletTx)
        addBobWalletTxHash = await grpcClient.postTransaction(addBobWalletTxSigned)
        await util.waitMined(addBobWalletTxHash)

        // For example, Bob tries to approve Alice's wallet but only admin can do such a thing, tx should fail
        callData = await codec.coop.encodeAddWallet(accounts.alice.publicKey)
        tx = await client.instance().contractCallTx({
            callerId : accounts.bob.publicKey,
            contractId : config.get().contracts.coop.address,
            amount : 0,
            gas : 10000,
            callData : callData
        })
        txSigned = await clients.bob().signTransaction(tx)
        faultyTxHash = await grpcClient.postTransaction(txSigned)
        await util.waitMined(faultyTxHash)

        // Sleep for 2 seconds to wait for updated tx state in database
        await util.sleep(2000)

        faultyTxRecord = (await db.getBy({hash: faultyTxHash}))[0]
        assert.strictEqual(faultyTxRecord.hash, faultyTxHash)
        assert.strictEqual(faultyTxRecord.state, TxState.FAILED)
        assert.strictEqual(faultyTxRecord.error_message, 'Only owner can make this action!')
    })

    it.only('Transaction that fails on Protocol level should be update correctly in its db entry', async () => {
        addEmptyWalletTx = await grpcClient.generateAddWalletTx(accounts.empty.publicKey)
        addEmptyWalletTxSigned = await clients.owner().signTransaction(addEmptyWalletTx)
        addEmptyWalletTxHash = await grpcClient.postTransaction(addEmptyWalletTxSigned)
        await util.waitMined(addEmptyWalletTxHash)

        emptyWalletBalance = await client.instance().balance(accounts.empty.publicKey)
        console.log('emptyWalletBalance', emptyWalletBalance)
        
        callData = await codec.org.encodeCreateOrganization()
        txResult = await client.instance().contractCreateTx({
            ownerId: accounts.empty.publicKey,
            code: contracts.getOrgCompiled().bytecode,
            deposit: 0,
            amount: 0,
            gas: 0,
            callData: callData
        })
        txSigned = await clients.empty().signTransaction(txResult.tx)
        faultyHash = await grpcClient.postTransaction(txSigned)
        await util.waitMined(faultyHash)

        // Sleep for 2 second to wait for updated tx state in database
        await util.sleep(2000)

        faultyTxRecord = (await db.getBy({hash: faultyHash}))[0]
        assert.strictEqual(faultyTxRecord.hash, faultyHash)
        assert.strictEqual(faultyTxRecord.state, TxState.FAILED)
        assert.strictEqual(faultyTxRecord.error_message, 'outofgasG')
    })

})