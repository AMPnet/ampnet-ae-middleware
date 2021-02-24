const amqplib = require('amqplib')
const config = require('../config')

const QUEUE_MAIL_PROJECT_FULLY_FUNDED = 'mail.middleware.project-funded'
const QUEUE_MAIL_SUCCESSFULLY_INVESTED = 'mail.middleware.project-invested'

async function sendMessage(queue, message) {
    const amqp_url = config.get().amqp
    const connection = await amqplib.connect(amqp_url)
    const channel = await connection.createChannel()
    await channel.assertQueue(queue, {durable: true})
    const sendResult = channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)))
    if (!sendResult) {
        await new Promise((resolve) => channel.once('drain', () => resolve));
    }
    if (channel) await channel.close()
    await connection.close()
}

module.exports = {
    sendMessage, QUEUE_MAIL_PROJECT_FULLY_FUNDED, QUEUE_MAIL_SUCCESSFULLY_INVESTED
}
