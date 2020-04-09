const PgBoss = require('pg-boss')

const config = require('../config')
const logger = require('../logger')(module)
const ae = require('../ae/client')
const util = require('../ae/util')
const repo = require('../persistence/repository')
const enums = require('../enums/enums')
const { SupervisorJob: JobType, TxType, WalletType } = require('../enums/enums')

const queueName = "ampnet-ae-middleware-supervisor-queue"

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
        poolSize: dbConfig.poolSize,
        ssl: dbConfig.ssl
    })
    await queue.start()
    await queue.subscribe(queueName, jobHandler)
    await queue.onComplete(queueName, jobCompleteHandler)
    logger.info("QUEUE-PUBLISHER: Queue initialized successfully!")
}

async function publishSendFundsJob(wallet, amountAe) {
    queue.publish(queueName, {
        type: JobType.SEND_FUNDS,
        amount: util.toToken(amountAe),
        wallet: wallet
    }).then(
        result => {
            logger.info(`QUEUE-PUBLISHER: Send funds to ${wallet} job published successfully. Job id: ${result}`)
        },
        err => {
            logger.error(`QUEUE-PUBLISHER: Send funds to ${wallet} job failed to get published. Error: %o`, err)
        }
    )
}

async function publishJobFromTx(tx) {
    switch (tx.type) {
        case TxType.WALLET_CREATE:
            giftAmountAe = config.get().giftAmount
            jobType = JobType.SEND_FUNDS
            if (giftAmountAe > 0) {
                let options = {
                    retryLimit: 1,
                    retryDelay: 5
                }
                queue.publish(queueName, {
                    type: jobType,
                    amount: util.toToken(giftAmountAe),
                    wallet: tx.wallet,
                    originTxHash: tx.hash
                }, options).then(
                    result => {
                        logger.info(`QUEUE-PUBLISHER: Send funds to ${tx.wallet} (main user wallet) job originated from transaction ${tx.hash} published successfully. Job id: ${result}`)
                    },
                    err => {
                        logger.error(`QUEUE-PUBLISHER: Send funds to ${tx.wallet} (main user wallet) job originated from transaction ${tx.hash} failed to get published. Error: %o`, err)
                    }
                )
                queue.publish(queueName, {
                    type: jobType,
                    amount: util.toToken(giftAmountAe),
                    wallet: tx.worker_public_key,
                    originTxHash: tx.hash
                }, options).then(
                    result => {
                        logger.info(`QUEUE-PUBLISHER: Send funds to ${tx.worker_public_key} (worker user wallet) job originated from transaction ${tx.hash} published successfully. Job id: ${result}`)
                    },
                    err => {
                        logger.error(`QUEUE-PUBLISHER: Send funds to ${tx.worker_public_key} (worker user wallet) job originated from transaction ${tx.hash} failed to get published. Error: %o`, err)
                    }
                )
            } else {
                repo.update(tx.hash, { supervisor_status: enums.SupervisorStatus.PROCESSED })
                logger.info(`QUEUE-PUBLISHER: Send funds job originated from transaction ${tx.hash} not published! (welcome gift amount in config set to 0)`)
            }
            break
        default:
            logger.error(`QUEUE-PUBLISHER: Supervisor cannot create job from transaction ${tx.hash} with type ${tx.type}!`)
    }
}

async function jobHandler(job) {
    logger.info(`QUEUE-SUBSCRIBER: Processing job with queue id ${job.id}`)
    switch (job.data.type) {
        case JobType.SEND_FUNDS:
            return ae.sender().spend(job.data.amount, job.data.wallet).catch(console.log)
        default:
            logger.error(`QUEUE-SUBSCRIBER: Processing job with queue id ${job.id} failed. Unknown job type.`)
            job.done(new Error(`Processing job with queue id ${job.id} failed. Unknown job type.`))
    }
}

async function jobCompleteHandler(job) {
    if (job.data.failed) {
        logger.error(`QUEUE-RESULT-HANDLER: Job ${job.data.request.id} failed. Full output: %o`, job)
    } else {
        let originHash = job.data.request.data.originTxHash
        if (typeof originHash === "undefined") {
            logger.info(`QUEUE-RESULT-HANDLER: Job ${job.data.request.id} completed!`)
        } else {
            repo.update(job.data.request.data.originTxHash, { supervisor_status: enums.SupervisorStatus.PROCESSED })
            logger.info(`QUEUE-RESULT-HANDLER: Job ${job.data.request.id} originated from transaction ${originHash} completed! Updated origin tx supervisor state to PROCESSED.`)
        }
    }
}

async function stop() {
    return queue.stop()
}

async function clearStorage() {
    return queue.deleteAllQueues()
}

module.exports = {
    initAndStart,
    publishSendFundsJob,
    publishJobFromTx,
    stop,
    clearStorage
}