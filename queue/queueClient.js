const { TxType, JobType, SupervisorStatus } = require('../enums/enums')
const util = require('../ae/util')
const logger = require('../logger')(module)
const config = require('../config')
const repo = require('../persistence/repository')

let queue
let txProcessorQueue
let autoFunderQueue

function init(pgBoss, funderQueue, processorQueue) {
    queue = pgBoss
    txProcessorQueue = processorQueue
    autoFunderQueue = funderQueue
}

function publishTxProcessJob(hash) {
    queue.publish(txProcessorQueue, {
        type: JobType.PROCESS_TX,
        hash: hash
    }, {
        retryLimit: 1,
        retryDelay: 3
    }).then(
        result => {
            logger.info(`QUEUE-PUBLISHER: Process transaction ${hash} job published successfully. Job id: ${result}`)
        },
        err => {
            logger.error(`QUEUE-PUBLISHER: Process transaction ${hash} job failed to get published. Error: %o`, err)
        }
    )
}

function publishSendFundsJob(wallet) {
    queue.publish(autoFunderQueue, {
        wallets: [wallet]
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
            autoFund = config.get().autoFund
            jobType = JobType.SEND_FUNDS
            if (autoFund) {
                queue.publish(autoFunderQueue, {
                    wallets: [tx.wallet, tx.worker_public_key],
                    originTxHash: tx.hash
                }).then(
                    result => {
                        logger.info(`QUEUE-PUBLISHER: Send funds to ${tx.wallet} (main user wallet) job originated from transaction ${tx.hash} published successfully. Job id: ${result}`)
                    },
                    err => {
                        logger.error(`QUEUE-PUBLISHER: Send funds to ${tx.wallet} (main user wallet) job originated from transaction ${tx.hash} failed to get published. Error: %o`, err)
                    }
                )
            } else {
                repo.update(
                    {
                        hash: tx.hash,
                        from_wallet: tx.from_wallet,
                        to_wallet: tx.to_wallet
                    },
                    { supervisor_status: SupervisorStatus.PROCESSED }
                )
                logger.info(`QUEUE-PUBLISHER: Send funds job originated from transaction ${tx.hash} not published! (welcome gift amount in config set to 0)`)
            }
            break
        default:
            logger.error(`QUEUE-PUBLISHER: Supervisor cannot create job from transaction ${tx.hash} with type ${tx.type}!`)
    }
}

module.exports = { init, publishTxProcessJob, publishSendFundsJob, publishJobFromTx }