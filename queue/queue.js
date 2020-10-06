const PgBoss = require('pg-boss')
const { TxBuilder } = require('@aeternity/aepp-sdk')

const config = require('../config')
const logger = require('../logger')(module)
const ae = require('../ae/client')
const util = require('../ae/util')
const repo = require('../persistence/repository')
const enums = require('../enums/enums')
const processor = require('../service/transaction-processor')
const { JobType, TxType, WalletType } = require('../enums/enums')

const autoFunderQueue = "ampnet-ae-middleware-supervisor-queue"
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

    let autoFunderSubscriptionOptions = {
        teamSize: 1,
        teamConcurrency: 2,
        newJobCheckIntervalSeconds: 2
    }
    await queue.subscribe(
        autoFunderQueue,
        autoFunderSubscriptionOptions,
        autoFunderJobHandler
    )
    await queue.onComplete(
        autoFunderQueue,
        autoFunderSubscriptionOptions,
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
    
    logger.info("QUEUE-PUBLISHER: Queue initialized successfully!")
}

async function autoFunderJobHandler(job) {
    logger.info(`FUNDER-QUEUE: Processing job with queue id ${job.id}`)
    switch (job.data.type) {
        case JobType.SEND_FUNDS:
            let wallets = job.data.wallets
            let amount = job.data.amount
            
            if (wallets.length === 0) {
                logger.info("FUNDER-QUEUE: No wallets provided for auto-funding. Ignoring job.")
                return
            }
            if (amount === 0) {
                logger.info("FUNDER-QUEUE: Funding amount set to 0AE. Ignoring job.")
                return
            }
            
            let senderAddress = await ae.sender().address()
            let senderBalance = await ae.sender().getBalance(senderAddress)
            let nonce = await ae.sender().getAccountNonce(senderAddress)
            let pool = await ae.sender().mempool()
            for (entry of pool.transactions) {
                let tx = entry.tx
                if (tx.type === 'SpendTx' && tx.senderId === senderAddress && tx.nonce >= nonce) {
                    nonce = (entry.tx.nonce + 1)
                }
            }

            let transactions = []
            let totalCost = 0
            for (wallet of wallets) {
                let tx = await ae.sender().spendTx({
                    senderId: senderAddress,
                    recipientId: wallet,
                    amount: amount,
                    nonce: nonce
                })
                let params = TxBuilder.unpackTx(tx).tx
                let signedTx = await ae.sender().signTransaction(tx)
                
                transactions.push(signedTx)
                totalCost += (Number(params.fee) + Number(params.amount))
                nonce++
            }

            if (totalCost > senderBalance) {
                logger.error(`FUNDER-QUEUE: Error while funding wallets. Insufficient balance on supervisor account. Ignoring job.`)
                job.done(new Error(`Processing job with queue id ${job.id} failed. Insufficient balance on funder account.`))
            }

            let jobs = []
            for (t of transactions) {
                jobs.push(
                    ae.sender().sendTransaction(t, { waitMined: false, verify: false })
                )
            }

            return Promise.all(jobs)
        default:
            logger.error(`FUNDER-QUEUE: Processing job with queue id ${job.id} failed. Unknown job type.`)
            job.done(new Error(`Processing job with queue id ${job.id} failed. Unknown job type.`))
    }
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

    let jobResponse = job.data.response.value
    let results = []

    logger.info(`FUNDER-QUEUE: Job ${job.data.request.id} completed! Broadcasted ${jobResponse.length} transactions`)
    for (transaction of jobResponse) {
        results.push(ae.sender().poll(transaction.hash))
    }
    await Promise.all(results)
    logger.info(`FUNDER-QUEUE: Transactions mined. Updating status in database.`)

    repo.update({
        hash: jobData.originTxHash,
        from_wallet: jobData.originTxFromWallet,
        to_wallet: jobData.originTxToWallet
    },
    { supervisor_status: enums.SupervisorStatus.PROCESSED })
}

async function txProcessorJobHandler(job) {
    logger.info(`PROCESSOR-QUEUE: Processing job with queue id ${job.id}`)
    console.log("job", job)
    switch (job.data.type) {
        case JobType.PROCESS_TX:
            let hash = job.data.hash
            let shouldUpdateOriginTx = job.data.shouldUpdateOriginTx
            return processor.process(hash, shouldUpdateOriginTx)
        default:
            logger.error(`PROCESSOR-QUEUE: Processing job with queue id ${job.id} failed. Unknown job type.`)
            job.done(new Error(`Processing job with queue id ${job.id} failed. Unknown job type.`))
    }
}

async function txProcessorJobCompleteHandler(job) {
    
}

function publishTxProcessJob(hash, shouldUpdateOriginTx = false) {
    queue.publish(txProcessorQueue, {
        type: JobType.PROCESS_TX,
        hash: hash,
        shouldUpdateOriginTx: shouldUpdateOriginTx
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

function publishSendFundsJob(wallet, amountAe) {
    queue.publish(autoFunderQueue, {
        type: JobType.SEND_FUNDS,
        amount: util.toToken(amountAe),
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
            giftAmountAe = config.get().giftAmount
            jobType = JobType.SEND_FUNDS
            if (giftAmountAe > 0) {
                queue.publish(autoFunderQueue, {
                    type: jobType,
                    amount: util.toToken(giftAmountAe),
                    wallets: [tx.wallet, tx.worker_public_key],
                    originTxHash: tx.hash,
                    originTxFromWallet: tx.from_wallet,
                    originTxToWallet: tx.to_wallet
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
                    { supervisor_status: enums.SupervisorStatus.PROCESSED }
                )
                logger.info(`QUEUE-PUBLISHER: Send funds job originated from transaction ${tx.hash} not published! (welcome gift amount in config set to 0)`)
            }
            break
        default:
            logger.error(`QUEUE-PUBLISHER: Supervisor cannot create job from transaction ${tx.hash} with type ${tx.type}!`)
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
    publishTxProcessJob,
    stop,
    clearStorage
}