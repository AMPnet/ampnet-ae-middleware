let grpcServer = require('../grpc/server')
let queue = require('../queue/queue')

let grpcClient = require('./grpc/client')
let walletSvcMock = require('./util/walletSvcGrpc')

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
    await walletSvcMock.init()
    await queue.clearAll()
    await db.clearAll()

    coopId = "ampnet-coop-1"
    await grpcClient.createCooperative(coopId, accounts.owner.publicKey)
    adminWalletTx = await util.waitWalletExists()
    await util.waitTxProcessed(adminWalletTx.hash)
    coopInfo = await db.getCoop(coopId)

})

after(async () => {
    await grpcServer.stop()
    await walletSvcMock.stop()
})
