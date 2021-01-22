const path = require('path')
const config = require('../config')
const logger = require('../logger')(module)
const protoLoader = require('@grpc/proto-loader')
const grpc = require('grpc')

let mailServiceGrpcClient

async function init() {
    const protoPath = path.resolve(__dirname, '../proto/mail_service.proto')
    const protoDefinition = protoLoader.loadSync(protoPath)
    const packageDefinition = grpc.loadPackageDefinition(protoDefinition).com.ampnet.mailservice.proto
    mailServiceGrpcClient = await new packageDefinition.MailService(config.get().mailServiceGrpc, grpc.credentials.createInsecure());
    logger.info("Mail Service GRPC Client initialized successfully!")
}

function sendProjectFullyFunded(activationData) {
    logger.info(`SUPERVISOR-QUEUE: Received request to send project fully funded mail. Activation data: ${activationData}`)
    mailServiceGrpcClient.sendProjectFullyFunded({
        activationData: activationData,
    }, (err, _) => {
        if (err != null) {
            logger.error(`SUPERVISOR-QUEUE: Error while calling sendProjectFullyFunded GRPC route: %o`, err)
        } else {
            logger.info(`SUPERVISOR-QUEUE: Project fully funded called on GRPC Mail Service`)
        }
    })
}

function sendSuccessfullyInvested(txHashFrom, txHashTo, amount) {
    logger.info(`SUPERVISOR-QUEUE: Received request to send successful investment mail. From wallet hash: ${txHashFrom}; To wallet hash: ${txHashTo}; Amount: ${amount}`)
    mailServiceGrpcClient.sendSuccessfullyInvested({
        walletHashFrom: txHashFrom,
        walletHashTo: txHashTo,
        amount: amount
    }, (err, _) => {
        if (err != null) {
            logger.error(`SUPERVISOR-QUEUE: Error while calling sendSuccessfullyInvested GRPC route: %o`, err)
        } else {
            logger.debug(`SUPERVISOR-QUEUE: Successful investment send to GRPC Mail Service`)
        }
    })
}

module.exports = { init, sendProjectFullyFunded, sendSuccessfullyInvested }
