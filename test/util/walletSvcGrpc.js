const { createMockServer } = require("grpc-mock")
const path = require('path')
const config = require('../../config')
const globalSetup = require('../global-setup')

let walletGrpcMockServer

async function init() {
    let protoPath = path.resolve(__dirname, '../../proto/wallet_service.proto');
    walletGrpcMockServer = createMockServer({
        protoPath: protoPath,
        packageName: 'com.ampnet.walletservice.proto',
        serviceName: 'WalletService',
        rules: [
            { method: "activateWallet", input: ".*", output: { } }
        ]
    })
    walletGrpcMockServer.listen(config.get().walletServiceGrpc)
}

async function stop() {
    return walletGrpcMockServer.close(true)
}

module.exports = { init, stop }