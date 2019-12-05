const PgBoss = require('pg-boss')

const config = require('../config')
const logger = require('../logger')(module)
const ae = require('../ae/client')
const repo = require('../persistence/repository')
const enums = require('../enums/enums')
const { SupervisorJob: JobType, TxType, WalletType } = require('../enums/enums')

const queueName = "ampnet-ae-middleware-supervisor-queue"

let queue

async function initAndStart(dbConfig) {
    console.log("db config", dbConfig)
    console.log(`${dbConfig.host}:${dbConfig.port}`)
    queue = new PgBoss({
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database,
        user: dbConfig.user,
        password: dbConfig.password,
        archiveCompletedJobsEvery: '1 day',
        deleteArchivedJobsEvery: '7 days'
    })
    await queue.start()
    await queue.subscribe(queueName, jobHandler)
    await queue.onComplete(queueName, jobCompleteHandler)
    logger.info("QUEUE-PUBLISHER: Queue initialized successfully!")
}

async function publishSendFundsJob(wallet, amountAe) {
    queue.publish(queueName, {
        type: JobType.SEND_FUNDS,
        amount: amountAe * 1000000000000000000,
        wallet: wallet
    }).then(
        result => {
            logger.info(`QUEUE-PUBLISHER: Send funds to ${tx.wallet} (main user wallet) job published successfully. Job id: ${result}`)
        },
        err => {
            logger.error(`QUEUE-PUBLISHER: Send funds to ${tx.wallet} (main user wallet) job failed to get published. Error: %o`, err)
        }
    )
}

async function publishJobFromTx(tx) {
    switch (tx.type) {
        case TxType.WALLET_CREATE:
            jobType = JobType.SEND_FUNDS
            if (tx.wallet_type == WalletType.USER) {
                giftAmountAe = config.get().giftAmount
                if (giftAmountAe > 0) {
                    queue.publish(queueName, {
                        type: jobType,
                        amount: giftAmountAe * 1000000000000000000,
                        wallet: tx.wallet,
                        originTxHash: tx.hash
                    }).then(
                        result => {
                            logger.info(`QUEUE-PUBLISHER: Send funds to ${tx.wallet} (main user wallet) job originated from transaction ${tx.hash} published successfully. Job id: ${result}`)
                        },
                        err => {
                            logger.error(`QUEUE-PUBLISHER: Send funds to ${tx.wallet} (main user wallet) job originated from transaction ${tx.hash} failed to get published. Error: %o`, err)
                        }
                    )
                    queue.publish(queueName, {
                        type: jobType,
                        amount: giftAmountAe * 1000000000000000000,
                        wallet: tx.worker_public_key,
                        originTxHash: tx.hash
                    }).then(
                        result => {
                            logger.info(`QUEUE-PUBLISHER: Send funds to ${tx.worker_public_key} (worker user wallet) job originated from transaction ${tx.hash} published successfully. Job id: ${result}`)
                        },
                        err => {
                            logger.error(`QUEUE-PUBLISHER: Send funds to ${tx.worker_public_key} (worker user wallet) job originated from transaction ${tx.hash} failed to get published. Error: %o`, err)
                        }
                    )
                } else {
                    logger.info(`QUEUE-PUBLISHER: Send funds job originated from transaction ${tx.hash} not published! (welcome gift amount in config set to 0)`)
                }
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
            return ae.sender().spend(job.data.amount, job.data.wallet)
        default:
            logger.error(`QUEUE-SUBSCRIBER: Processing job with queue id ${job.id} failed. Unknown job type.`)
            job.done(new Error(`Processing job with queue id ${job.id} failed. Unknown job type.`))
    }
}

async function jobCompleteHandler(job) {
    if (job.data.failed) {
        logger.error(`QUEUE-RESULT-HANDLER: Job ${job.data.request.id} failed. Full output: %o`, job)
    } else {
        logger.info(`QUEUE-RESULT-HANDLER: Job ${job.data.request.id} completed!`)
        let originHash = job.data.request.data.originTxHash
        if (typeof originHash === undefined) {
            logger.info(`QUEUE-RESULT-HANDLER: Job ${job.data.request.id} did not originate from add_wallet transaction.`)
        } else {
            repo.update(job.data.request.data.originTxHash, { supervisor_status: enums.SupervisorStatus.PROCESSED })
            logger.info(`QUEUE-RESULT-HANDLER: Job ${job.data.request.id} originated from transaction ${originHash}. Updated origin tx supervisor state to PROCESSED.`)
        }
    }
}

async function stop() {
    return queue.stop()
}

module.exports = {
    initAndStart,
    publishSendFundsJob,
    publishJobFromTx,
    stop
}