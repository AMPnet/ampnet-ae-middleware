let path = require('path')
let chai = require('chai');
let assert = chai.assert;
let { Crypto, Universal } = require('@aeternity/aepp-sdk')

let enums = require('../enums/enums')
let grpcServer = require('../grpc/server')
let supervisor = require('../supervisor')
let { TxType, TxState, SupervisorStatus, WalletType } = require('../enums/enums')

let grpcClient = require('./grpc/client')
let accounts = require('./ae/accounts')
let clients = require('./ae/clients')
let util = require('./util/util')
let db = require('./util/db')

let config = require('../config')

describe('Main tests', function() {

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

    it("should auto fund wallet when balance goes below threshold (0.3 AE)", async () => {
        let randomWallet = Crypto.generateKeyPair()
        let client = await Universal({
            url: config.get().node.url,
            internalUrl: config.get().node.internalUrl,
            keypair: randomWallet,
            networkId: config.get().node.networkId,
            compilerUrl: config.get().node.compilerUrl
        })

        let addRandomWalletTx = await grpcClient.generateAddWalletTx(randomWallet.publicKey)
        let addRandomWalletTxSigned = await clients.owner().signTransaction(addRandomWalletTx)
        let addRandomWalletTxHash = await grpcClient.postTransaction(addRandomWalletTxSigned)
        await util.waitTxProcessed(addRandomWalletTxHash)

        let balanceBeforeAutoFund = await clients.empty().balance(randomWallet.publicKey)

        let createOrgTx = await grpcClient.generateCreateOrganizationTx(addRandomWalletTxHash)
        let createOrgTxSigned = await client.signTransaction(createOrgTx)
        let createOrgTxHash = await grpcClient.postTransaction(createOrgTxSigned)
        await util.waitTxProcessed(createOrgTxHash)

        await util.sleep(10000)
        let balanceAfterAutoFund = await clients.empty().balance(randomWallet.publicKey)
        
        assert(balanceAfterAutoFund > balanceBeforeAutoFund)
    })

})