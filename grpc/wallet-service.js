const path = require('path')
const protoLoader = require('@grpc/proto-loader')
const grpc = require('grpc')
const config = require('../config')
const logger = require('../logger')(module)

let walletServiceGrpcClient

async function init() {
    let protoPath = path.resolve(__dirname, '../proto/wallet_service.proto')
    let protoDefinition = protoLoader.loadSync(protoPath)
    let packageDefinition = grpc.loadPackageDefinition(protoDefinition).com.ampnet.walletservice.proto
    walletServiceGrpcClient = await new packageDefinition.WalletService(config.get().walletServiceGrpc, grpc.credentials.createInsecure());
    logger.info("Wallet Service GRPC Client initialized successfully!")
}

function activateWallet(walletAddress, coopId, hash) {
    walletServiceGrpcClient.activateWallet({
        address: walletAddress,
        coop: coopId,
        hash: hash
    }, (err, result) => {
        if (err != null) {
            logger.error(`SUPERVISOR-QUEUE: Error while calling activateWallet GRPC route: %o`, err)
            throw err
        } else {
            logger.info(`SUPERVISOR-QUEUE: Activate Wallet called on GRPC Wallet Service for coop ${coopId}`)
        }
    })
}

function updateCoopRoles(coopId) {
    walletServiceGrpcClient.updateCoopRoles({
        coop: coopId
    }, (err, result) => {
        if (err != null) {
            logger.error(`Error while calling updateCoopRoles GRPC route: %o`, err)
            throw err
        } else {
            logger.info(`Update Coop Roles called on GRPC Wallet Service for coop ${coopId}`)
        }
    })
}

module.exports = { init, activateWallet, updateCoopRoles }
