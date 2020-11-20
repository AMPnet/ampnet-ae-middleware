let grpcServer = require('../grpc/server')
let queue = require('../queue/queue')

let grpcClient = require('./grpc/client')
let walletSvcMock = require('./util/walletSvcGrpc')

let clients = require('./ae/clients')
let accounts = require('./ae/accounts')

let util = require('./util/util')
let db = require('./util/db')

before(async () => {
    await grpcServer.start()
    await grpcClient.start()
    await clients.init()
    await db.init()
    await walletSvcMock.init()
    await queue.clearAll()
    await db.clearAll()

    coopId = "ampnet-coop-1"
    await grpcClient.createCooperative(coopId, accounts.owner.publicKey)
    let adminWalletTx = await util.waitWalletExists()
    console.log("adminWalletTx", adminWalletTx)
    await util.waitTxProcessed(adminWalletTx.hash)
    let tx = await db.getBy({
        hash: adminWalletTx.hash
    })
    console.log("tx", tx)
})

after(async () => {
    await grpcServer.stop()
    await walletSvcMock.stop()
})
