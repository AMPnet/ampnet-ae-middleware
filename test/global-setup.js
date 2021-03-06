let grpcServer = require('../grpc/server')
let queue = require('../queue/queue')
let { Crypto } = require("@aeternity/aepp-sdk")
let grpcClient = require('./grpc/client')
let clients = require('./ae/clients')
let accounts = require('./ae/accounts')

let util = require('./util/util')
let db = require('./util/db')

before(async () => {
    process.env['DB_SCAN_ENABLED'] = "false"
    process.env['DB_SCAN_OLDER_THAN'] = 0

    await grpcServer.start()
    await grpcClient.start()
    await clients.init()
    await db.init()
    await queue.clearAll()
    await db.clearAll()

    coopId = "ampnet-coop-1"
    await grpcClient.createCooperative(coopId, accounts.owner.publicKey)
    adminWalletTx = await util.waitWalletExists()
    await util.waitTxProcessed(adminWalletTx.hash)
    coopInfo = await db.getCoop(coopId)
})

async function changeOwner(newOwner) {
    accounts.owner = newOwner
    coopInfo = await db.getCoop(coopId)
    adminWalletTx = (await db.getBy({ wallet: newOwner.publicKey }))[0]
    await clients.setOwner(newOwner)
}

after(async () => {
    await grpcServer.stop()
})

module.exports = { changeOwner }

