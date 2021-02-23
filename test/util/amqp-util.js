const amqplib = require('amqplib')
const config = require('../../config')
const {QUEUE_MAIL_SUCCESSFULLY_INVESTED, QUEUE_MAIL_PROJECT_FULLY_FUNDED} = require("../../amqp/amqp");

let connection
let channel
let projectFullyFundedMessages = []
let successfullyInvestedMessages = []

async function init() {
    await createChannel()
    await handleChannel(QUEUE_MAIL_SUCCESSFULLY_INVESTED, (msg) => {
        successfullyInvestedMessages.push(msg.content.toString())
    });
    await handleChannel(QUEUE_MAIL_PROJECT_FULLY_FUNDED, (msg) => {
        projectFullyFundedMessages.push(msg.content.toString())
    });
}

async function handleChannel(queue, handle) {
    await channel.assertQueue(queue, {
        durable: true
    })
    channel.consume(queue, (msg) => {
        handle(msg);
    }, {
        noAck: true
    });
}

async function createChannel () {
    const amqp_url = config.get().amqp
    connection = await amqplib.connect(amqp_url)
    channel = await connection.createChannel()
    await channel.purgeQueue(QUEUE_MAIL_SUCCESSFULLY_INVESTED)
    await channel.purgeQueue(QUEUE_MAIL_PROJECT_FULLY_FUNDED)
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
