const { createMockServer } = require("grpc-mock")
const path = require('path')
const config = require('../../config')

let walletGrpcMockServer
let mailGrpcMockServer

async function init() {
    await initWalletServer()
    await initMailServer()
}

async function initWalletServer() {
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

async function initMailServer() {
    let protoPath = path.resolve(__dirname, '../../proto/mail_service.proto');
    mailGrpcMockServer = createMockServer({
        protoPath: protoPath,
        packageName: 'com.ampnet.mailservice.proto',
        serviceName: 'MailService',
        rules: [
            { method: "sendProjectFullyFunded", input: ".*", output: { } }
        ]
    })
    mailG.listen(config.get().mailServiceGrpc)
}

async function stop() {
    await walletGrpcMockServer.close(true)
    await mailGrpcMockServer.close(true)
}

module.exports = { init, stop }
