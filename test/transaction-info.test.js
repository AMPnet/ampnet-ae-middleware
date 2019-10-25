let chai = require('chai');
let assert = chai.assert;

let config = require('../config')
let client = require('../ae/client')
let grpcServer = require('../grpc/server')
let { TxType, TxState, SupervisorStatus, WalletType } = require('../enums/enums')

let clients = require('./ae/clients')
let grpcClient = require('./grpc/client')
let accounts = require('./ae/accounts')
let util = require('./util/util')
let db = require('./util/db')

describe('Test fetching information for list of given projects', function() {

    beforeEach(async() => {
        await grpcServer.start()
        await grpcClient.start()
        await clients.init()
        await db.init()
    })

    afterEach(async() => {
        await grpcServer.stop()
    })

    it('Should be able to fetch transaction info for some tx hash', async () => {
        let addBobWalletTx = await grpcClient.generateAddWalletTx(accounts.bob.publicKey)
        let addBobWalletTxSigned = await clients.owner().signTransaction(addBobWalletTx)
        let addBobWalletTxHash = await grpcClient.postTransaction(addBobWalletTxSigned)
        
        await util.waitMined(addBobWalletTxHash)

        let info = await grpcClient.getTransactionInfo(addBobWalletTxHash)
        assert.equal(info.hash, addBobWalletTxHash)
        assert.equal(info.fromWallet, accounts.coop.publicKey)
        assert.equal(info.toWallet, accounts.bob.publicKey)
        assert.equal(info.state, 'MINED')
        assert.equal(info.type, 'WALLET_CREATE')
    })

})
