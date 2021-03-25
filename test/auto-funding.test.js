let chai = require('chai');
let assert = chai.assert;
let { Crypto, Universal, Node, MemoryAccount } = require('@aeternity/aepp-sdk')

let grpcClient = require('./grpc/client')
let accounts = require('./ae/accounts')
let clients = require('./ae/clients')
let util = require('./util/util')
let aeUtil = require('../ae/util')
let db = require('./util/db')

let config = require('../config')

describe('Auto funding test', function() {
    
    before(async () => {
        await db.clearTransactions(adminWalletTx.hash)
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

        let thresholdAe = config.get().refundThreshold
        let threshold = aeUtil.toToken(thresholdAe)
        let gift = aeUtil.toToken(0.3)

        let addRandomWalletTx = await grpcClient.generateAddWalletTx(randomWallet.publicKey, coopId)
        let addRandomWalletTxSigned = await clients.owner().signTransaction(addRandomWalletTx)
        let addRandomWalletTxHash = await grpcClient.postTransaction(addRandomWalletTxSigned, coopId)
        await util.waitTxProcessed(addRandomWalletTxHash)

        let balanceBeforeAutoFund = await clients.empty().balance(randomWallet.publicKey)
        assert.strictEqual(Number(balanceBeforeAutoFund), gift)
        
        await client.spend(balanceBeforeAutoFund - threshold + 1, accounts.bob.publicKey)
        let balanceAfterSpend = await clients.empty().balance(randomWallet.publicKey)

        let createOrgTx = await grpcClient.generateCreateOrganizationTx(addRandomWalletTxHash)
        let createOrgTxSigned = await client.signTransaction(createOrgTx)
        let createOrgTxHash = await grpcClient.postTransaction(createOrgTxSigned, coopId)
        await util.waitTxProcessed(createOrgTxHash)
        await waitBalanceGreaterThan(randomWallet.publicKey, Number(balanceAfterSpend))
    })

    async function waitBalanceGreaterThan(address, threshold, maxAttempts = 20, sleepTime = 1000) {
        if (maxAttempts === 0) { throw new Error("Waiting for balance timed out!") }
        let balance = await clients.empty().balance(address)
        if (Number(balance) <= threshold) {
            await util.sleep(sleepTime)
            waitBalanceGreaterThan(address, threshold, maxAttempts - 1, sleepTime)
        }
    }

})