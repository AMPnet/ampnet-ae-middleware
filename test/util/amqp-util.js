const amqplib = require('amqplib')
const config = require('../../config')
const {QUEUE_MAIL_SUCCESSFULLY_INVESTED, QUEUE_MAIL_PROJECT_FULLY_FUNDED} = require("../../amqp/amqp");

let projectFullyFundedMessages = []
let successfullyInvestedMessages = []

async function init() {
    const amqp_url = config.get().amqp
    const connection = await amqplib.connect(amqp_url)
    const channel = await connection.createChannel()
    await handleChannel(channel, QUEUE_MAIL_SUCCESSFULLY_INVESTED, (msg) => {
        successfullyInvestedMessages.push(msg)
    });
    await handleChannel(channel, QUEUE_MAIL_PROJECT_FULLY_FUNDED, (msg) => {
        projectFullyFundedMessages.push(msg)
    });
}

async function handleChannel(channel, queue, handle) {
    channel.purgeQueue(queue);
    channel.assertQueue(queue, {
        durable: true
    });
    channel.consume(queue, (msg) => {
        handle(msg.content.toString());
    }, {
        noAck: true
    });
}

function getProjectFullyFundedMessages() {
    return projectFullyFundedMessages
}

function getSuccessfullyInvestedMessages() {
    return successfullyInvestedMessages
}

function createSuccessfullyInvestedMessage(user_wallet_tx_hash, project_wallet_tx_hash, amount) {
    return JSON.stringify(
        { user_wallet_tx_hash: user_wallet_tx_hash, project_wallet_tx_hash: project_wallet_tx_hash, amount: amount.toString() }
    )
}

function createFullyFundedMessage(tx_hash) {
    return JSON.stringify({ tx_hash: tx_hash })
}

module.exports = {
    init,
    getProjectFullyFundedMessages,
    getSuccessfullyInvestedMessages,
    createSuccessfullyInvestedMessage,
    createFullyFundedMessage,
    QUEUE_MAIL_SUCCESSFULLY_INVESTED,
    QUEUE_MAIL_PROJECT_FULLY_FUNDED
}
