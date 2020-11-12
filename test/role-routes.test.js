let chai = require('chai');
let assert = chai.assert;

let config = require('../config')
let client = require('../ae/client')
let supervisor = require('../queue/queue')
let grpcServer = require('../grpc/server')
let { TxType, TxState, SupervisorStatus, WalletType } = require('../enums/enums')

let clients = require('./ae/clients')
let grpcClient = require('./grpc/client')
let accounts = require('./ae/accounts')
let util = require('./util/util')
let db = require('./util/db')


describe('Test role routes', function() {

    before(async() => {
        process.env['DB_SCAN_ENABLED'] = "false"
        process.env['AUTO_FUND'] = "false"
        await grpcServer.start()
        await grpcClient.start()
        await clients.init()
        await db.init()
    })

    after(async() => {
        await grpcServer.stop()
        await supervisor.stop()
    })

    it('Should be able to fetch token issuer wallet', async () => {
        let tokenIssuer = await grpcClient.getTokenIssuer()
        assert.equal(tokenIssuer, accounts.owner.publicKey)
    })

    it('Should be able to fetch platform manager wallet', async () => {
        let platformManager = await grpcClient.getPlatformManager()
        assert.equal(platformManager, accounts.owner.publicKey)
    })

})
