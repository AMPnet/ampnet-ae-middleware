const amqplib = require('amqplib')
const config = require('../../config')
const {
    QUEUE_MAIL_SUCCESSFULLY_INVESTED,
    QUEUE_MAIL_PROJECT_FULLY_FUNDED,
    QUEUE_MIDDLEWARE_UPDATE_COOP_ROLES
} = require("../../amqp/amqp");

let connection

let projectFullyFundedMessages = []
let successfullyInvestedMessages = []
let updateCoopRolesMessages = []

async function init() {
    const amqp_url = config.get().amqp
    connection = await amqplib.connect(amqp_url)
    const channel = await connection.createChannel()
    await handleChannel(channel, QUEUE_MAIL_SUCCESSFULLY_INVESTED, (msg) => {
        successfullyInvestedMessages.push(msg)
    });
    await handleChannel(channel, QUEUE_MAIL_PROJECT_FULLY_FUNDED, (msg) => {
        projectFullyFundedMessages.push(msg)
    });
    await handleChannel(channel, QUEUE_MIDDLEWARE_UPDATE_COOP_ROLES, (msg) => {
        updateCoopRolesMessages.push(msg)
    })
}

async function stop() {
    return connection.close()
}

async function handleChannel(channel, queue, handle) {
    await channel.assertQueue(queue, {
        durable: true
    })
    await channel.purgeQueue(queue)
    return channel.consume(queue, (msg) => {
        handle(msg.content.toString());
    }, {
        noAck: true
    })
}

function getProjectFullyFundedMessages() {
    return projectFullyFundedMessages
}

function getSuccessfullyInvestedMessages() {
    return successfullyInvestedMessages
}

function getUpdateCoopRolesMessages() {
    return updateCoopRolesMessages
}

function clearAllMessages() {
    updateCoopRolesMessages = []
    successfullyInvestedMessages = []
    projectFullyFundedMessages = []
}

function createSuccessfullyInvestedMessage(user_wallet_tx_hash, project_wallet_tx_hash, amount) {
    return JSON.stringify(
        { user_wallet_tx_hash: user_wallet_tx_hash, project_wallet_tx_hash: project_wallet_tx_hash, amount: amount.toString() }
    )
}

function createFullyFundedMessage(tx_hash) {
    return JSON.stringify({ tx_hash: tx_hash })
}

function createUpdateCoopRolesMessage(coopId) {
    return JSON.stringify({ coop: coopId })
}

module.exports = {
    init,
    stop,
    getProjectFullyFundedMessages,
    getSuccessfullyInvestedMessages,
    getUpdateCoopRolesMessages,
    createSuccessfullyInvestedMessage,
    clearAllMessages,
    createFullyFundedMessage,
    createUpdateCoopRolesMessage,
    QUEUE_MAIL_SUCCESSFULLY_INVESTED,
    QUEUE_MAIL_PROJECT_FULLY_FUNDED
}
