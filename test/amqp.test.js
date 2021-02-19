const chai = require('chai');
const amqp = require('../amqp/amqp')
const amqplib = require('amqplib')
const assert = chai.assert;
const config = require('../config')

let connection
let channel

before('Connect to amqp and create channel', async () => {
    const amqp_url = config.get().amqp
    connection = await amqplib.connect(amqp_url)
    channel = await connection.createChannel()
})

it('Should consume message from project fully funded queue', async() => {
    const messageSent = {txHash: 'project_txHash'}
    await amqp.sendMessage(amqp.QUEUE_MAIL_PROJECT_FULLY_FUNDED, messageSent)
    await consumeMessage(amqp.QUEUE_MAIL_PROJECT_FULLY_FUNDED, (messageReceived) => {
        assert.equal(messageReceived.content.toString(), JSON.stringify(messageSent))
    })
})

it('Should consume message from successfully invested queue', async() => {
    const messageSent = {userWalletTxHash: 'userWalletHash', projectWalletTxHash: 'projectWalletTxHash', amount: '500'}
    await amqp.sendMessage(amqp.QUEUE_MAIL_SUCCESSFULLY_INVESTED, messageSent)
    await consumeMessage(amqp.QUEUE_MAIL_SUCCESSFULLY_INVESTED, (messageReceived) => {
        assert.equal(messageReceived.content.toString(), JSON.stringify(messageSent))
    })
})

async function consumeMessage(queue, consume) {
    await channel.assertQueue(queue, {
        durable: true
    })
    channel.consume(queue, function(msg) {
        consume(msg);
    }, {
      noAck: true
    })
}