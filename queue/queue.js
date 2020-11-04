const PgBoss = require('pg-boss')

const queueClient = require('./queueClient')
const logger = require('../logger')(module)
const repo = require('../persistence/repository')
const enums = require('../enums/enums')
const txProcessor = require('../service/transaction-processor')
const { JobType } = require('../enums/enums')

const autoFunderQueue = "ampnet-auto-funder-queue"
const txProcessorQueue = "ampnet-ae-middleware-tx-processor-queue"

let queue

async function initAndStart(dbConfig) {
    queue = new PgBoss({
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database,
        user: dbConfig.user,
        password: dbConfig.password,
        archiveCompletedJobsEvery: '1 day',
        deleteArchivedJobsEvery: '7 days',
        max: dbConfig.max,
        ssl: dbConfig.ssl
    })
    await queue.start()

    let autoFunderOnCompleteOptions = {
        teamSize: 3,
        teamConcurrency: 3,
        newJobCheckIntervalSeconds: 2
    }
    await queue.onComplete(
        autoFunderQueue,
        autoFunderOnCompleteOptions,
        autoFunderJobCompleteHandler
    )

    let txProcessorSubscriptionOptions = {
        teamSize: 10,
        teamConcurrency: 10,
        newJobCheckIntervalSeconds: 1
    }
    await queue.subscribe(
        txProcessorQueue,
        txProcessorSubscriptionOptions,
        txProcessorJobHandler
    )
    await queue.onComplete(
        txProcessorQueue,
        txProcessorSubscriptionOptions,
        txProcessorJobCompleteHandler
    )
    
    logger.info("Queue initialized successfully!")

    queueClient.init(queue, autoFunderQueue, txProcessorQueue)
    logger.info("Queue Client initialized successfully!")
}

async function autoFunderJobCompleteHandler(job) {
    if (job.data.failed) {
        logger.error(`FUNDER-QUEUE: Job ${job.data.request.id} failed. Full output: %o`, job)
        return
    }

    let jobData = job.data.request.data
    if (jobData.originTxHash === undefined) {
        logger.info(`FUNDER-QUEUE: Job ${job.data.request.id} completed!`)
        return
    }
    logger.info(`FUNDER-QUEUE: Job ${job.data.request.id} completed!`)
    
    repo.update({
        hash: jobData.originTxHash
    },
    { supervisor_status: enums.SupervisorStatus.PROCESSED })
}

async function txProcessorJobHandler(job) {
    logger.info(`PROCESSOR-QUEUE: Processing job with queue id ${job.id}`)
    switch (job.data.type) {
        case JobType.PROCESS_TX:
            let hash = job.data.hash
            return txProcessor.process(hash)
        default:
            logger.error(`PROCESSOR-QUEUE: Processing job with queue id ${job.id} failed. Unknown job type.`)
            job.done(new Error(`Processing job with queue id ${job.id} failed. Unknown job type.`))
    }
}

async function txProcessorJobCompleteHandler(job) {
    console.log("PROCESSOR-QUEUE: job done", job)
}

async function stop() {
    return queue.stop()
}

async function clearStorage() {
    return queue.deleteAllQueues()
}

module.exports = {
    initAndStart,
    stop,
    clearStorage
}