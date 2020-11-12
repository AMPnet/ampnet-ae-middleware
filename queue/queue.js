const Queue = require('bull')

const queueClient = require('./queueClient')
const logger = require('../logger')(module)
const repo = require('../persistence/repository')
const enums = require('../enums/enums')
const txProcessor = require('../service/transaction-processor')
const config = require('../config')

let txProcessorQueue 
let autoFunderQueueServer
let autoFunderQueueClient

function init() {
    let redisConfig = {
        redis: config.get().redis
    }
    txProcessorQueue = new Queue("ampnet-ae-middleware-tx-processor-queue", redisConfig)
    autoFunderQueueServer = new Queue("ampnet-auto-funder-queue-server", redisConfig)
    autoFunderQueueClient = new Queue("ampnet-auto-funder-queue-client", redisConfig)

    txProcessorQueue.process(10, txProcessorJobHandler)
    txProcessorQueue.on('completed', txProcessorJobCompleteHandler)
    autoFunderQueueClient.process(autoFunderJobCompleteHandler)
    
    logger.info("Queue initialized successfully!")

    queueClient.init(autoFunderQueueServer, txProcessorQueue)
    logger.info("Queue Client initialized successfully!")
}

async function txProcessorJobHandler(job) {
    logger.info(`PROCESSOR-QUEUE: Processing job with queue id ${job.id}`)
    let hash = job.data.hash
    return txProcessor.process(hash)
}

async function txProcessorJobCompleteHandler(job, result) {
    logger.info(`PROCESSOR-QUEUE: Job ${job.id} completed. Result: %o`, result)
}

async function autoFunderJobCompleteHandler(job) {
    let jobData = job.data
    if (jobData.originTxHash === undefined) {
        logger.info(`FUNDER-QUEUE: Job ${job.id} completed!`)
        return
    }
    logger.info(`FUNDER-QUEUE: Job ${job.id} completed!`)
    
    repo.update({
        hash: jobData.originTxHash
    },
    { supervisor_status: enums.SupervisorStatus.PROCESSED })
}

async function stop() {
    await txProcessorQueue.close()
    await autoFunderQueueServer.close()
    await autoFunderQueueClient.close()
}

module.exports = { init, stop }