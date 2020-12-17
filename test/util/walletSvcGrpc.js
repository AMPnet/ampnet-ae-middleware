const { createMockServer } = require("grpc-mock")
const path = require('path')
const config = require('../../config')

let walletGrpcMockServer

async function init() {
    let protoPath = path.resolve(__dirname, '../../proto/wallet_service.proto');
    walletGrpcMockServer = createMockServer({
        protoPath: protoPath,
        packageName: 'com.ampnet.walletservice.proto',
        serviceName: 'WalletService',
        rules: [
            { method: "activateWallet", input: ".*", output: { } },
            { method: "updateCoopRoles", input: ".*", output: { } }
        ]
    })
    walletGrpcMockServer.listen(config.get().walletServiceGrpc)
}

async function stop() {
    return walletGrpcMockServer.close(true)
}

module.exports = { init, stop }