let path = require('path')
let chai = require('chai');
let assert = chai.assert;
let { Crypto, Universal, Node, MemoryAccount } = require('@aeternity/aepp-sdk')

let enums = require('../enums/enums')
let grpcServer = require('../grpc/server')
let supervisor = require('../queue/queue')
let { TxType, TxState, SupervisorStatus, WalletType } = require('../enums/enums')

let grpcClient = require('./grpc/client')
let accounts = require('./ae/accounts')
let clients = require('./ae/clients')
let util = require('./util/util')
let db = require('./util/db')

let config = require('../config')

describe('Auto funding test', function() {

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

    it("should auto fund wallet when balance goes below threshold (0.3 AE)", async () => {
        let randomWallet = Crypto.generateKeyPair()
        let node = await Node({
            url: config.get().node.url,
            internalUrl: config.get().node.internalUrl
        })
        let client = await Universal({
            nodes: [
                { name: "node", instance: node }
            ],
            compilerUrl: config.get().node.compilerUrl,
            accounts: [
                MemoryAccount({ keypair: randomWallet })
            ],
            address: randomWallet.publicKey,
            networkId: config.get().node.networkId
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