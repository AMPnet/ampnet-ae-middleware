const PgBoss = require('pg-boss')
const { Universal: Ae } = require('@aeternity/aepp-sdk')

const config = require('../config')
const logger = require('../logger')(module)
const ae = require('../ae/client')
const contracts = require('../ae/contracts')
const repo = require('../persistence/repository')
const { SupervisorStatus, SupervisorJob: JobType, functions: Functions, TxType, WalletType } = require('../enums/enums')
const namespace = require('../cls')

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
    await queue.start().catch(console.log)
    await queue.subscribe(queueName, jobHandler).catch(console.log)
    await queue.onComplete(queueName, jobCompleteHandler).catch(console.log)
}

async function publishJobFromTx(tx) {
    logger.info(`QUEUE-PUBLISHER: Publishing job created by transaction ${tx.hash}.`)
    switch (tx.type) {
        case TxType.WALLET_CREATE:
            jobType = JobType.SEND_FUNDS
            logger.info(`QUEUE-PUBLISHER: Job type is ${jobType}`)
            if (tx.wallet_type == WalletType.USER) {
                giftAmountAe = config.get().giftAmount
                if (giftAmountAe > 0) {
                    await queue.publish(queueName, {
                        type: jobType,
                        amount: giftAmountAe * 1000000000000000000,
                        wallet: tx.wallet
                    })
                    await queue.publish(queueName, {
                        type: jobType,
                        amount: giftAmountAe * 1000000000000000000,
                        wallet: tx.worker_public_key
                    })
                    logger.info(`QUEUE-PUBLISHER: Job published!`)
                    // await client.instance().spend(giftAmountAe * 1000000000000000000, tx.wallet)
                    // logger.info(`SUPERVISOR: Transferred ${giftAmountAe}AE to user with wallet ${tx.wallet} (welcome gift)`)
                    // await repo.update(tx.hash, { supervisor_status: SupervisorStatus.PROCESSED })
                    // logger.info(`SUPERVISOR: Updated SUPERVISOR_STATUS in original transaction.`)
                } else {
                    logger.info(`QUEUE-PUBLISHER: Job not published! (welcome gift amount in config set to 0)`)
                }
            }
            break
        case TxType.APPROVE_INVESTMENT:
            jobType = JobType.CALL_INVEST
            logger.info(`QUEUE-PUBLISHER: Job type is ${jobType}`)
            contract = util.enforceCtPrefix(tx.to_wallet)
            investor = tx.from_wallet
            walletCreationRecord = await repo.findByWalletOrThrow(tx.from_wallet)
            workerPublicKey = walletCreationRecord.worker_public_key
            workerSecretKey = walletCreationRecord.worker_secret_key
            await queue.publish(queueName, {
                type: jobType,
                contract: contract,
                wallet: tx.from_wallet,
                workerPublicKey: workerPublicKey,
                workerSecretKey: workerSecretKey
            })
            logger.info(`QUEUE-PUBLISHER: Job published!`)
            // result = await client.instance().contractCall(
            //     contracts.projSource,
            //     contract,
            //     enums.functions.proj.invest,
            //     [ tx.from_wallet ]
            // )
            // logger.info(`SUPERVISOR: Call result: \n%o`, result)
            // await repo.update(tx.hash, { supervisor_status: SupervisorStatus.PROCESSED })
            // logger.info(`SUPERVISOR: Updated SUPERVISOR_STATUS in original transaction.`)
            // processTransaction(result.hash)
            break 
        case TxType.START_REVENUE_PAYOUT:
            jobType = JobType.CALL_PAYOUT_SHARES
            logger.info(`QUEUE-PUBLISHER: Job type is ${jobType}`)
            contract = util.enforceCtPrefix(tx.to_wallet)
            await queue.publish(queueName, {
                type: JobType.CALL_PAYOUT_SHARES,
                contract: contract
            })
            logger.info(`QUEUE-PUBLISHER: Job published!`)
            // logger.info(`SUPERVISOR: Starting multiple calls on payout_revenue_shares() until all investors on project ${contract} are payed out.`)
            // batchCount = 1 
            // do {
            //     logger.info(`Call #${batchCount} on payout_revenue_shares()`)
            //     batchPayout = await client.instance().contractCall(
            //         contracts.projSource,
            //         contract,
            //         enums.functions.proj.payoutRevenueSharesBatch,
            //         [ ]
            //     )
            //     logger.info(`SUPERVISOR: Call result: \n%o`, batchPayout)
            //     shouldPayoutAnotherBatch = await batchPayout.decode()
            //     logger.info(`SUPERVISOR: Need to call again to payout next batch? ${shouldPayoutAnotherBatch}`)
            //     batchCount++
            //     processTransaction(batchPayout.hash)
            // } while(shouldPayoutAnotherBatch)
            // logger.info(`SUPERVISOR: All batches payed out.`)
            // await repo.update(tx.hash, { supervisor_status: SupervisorStatus.PROCESSED })
            // logger.info(`SUPERVISOR: Updated SUPERVISOR_STATUS in original transaction.`)
            break
        default:
            throw new Error(`Supervisor cannot process provided transaction type: ${tx.type}`)
    }
}

async function jobHandler(job) {
    let traceID = namespace.getTraceID()
    logger.info(`QUEUE-SUBSCRIBER: Processing job ${traceID}`)
    switch (job.data.type) {
        case JobType.SEND_FUNDS:
            return ae.instance().spend(job.data.amount, job.data.wallet) 
        case JobType.CALL_INVEST:
            client = await Ae({
                url: config.get().node.url,
                internalUrl: config.get().node.internalUrl,
                keypair: {
                    publicKey: job.data.workerPublicKey,
                    secretKey: job.data.workerSecretKey
                },
                compilerUrl: config.get().node.compilerUrl,
                networkId: config.get().networkId
            })
            return client.contractCall(
                contracts.projSource,
                job.data.contract,
                enums.functions.proj.invest,
                [ job.data.wallet ]
            )
        case JobType.CALL_PAYOUT_SHARES:
            return ae.instance().contractCall(
                contracts.projSource,
                job.data.contract,
                enums.functions.proj.payoutRevenueSharesBatch,
                [ ]
            )
        default:
                throw new Error(`QUEUE-SUBSCRIBER: Error while processing job. Job type ${job.data.type} not recognized!`)
    }
}

async function jobCompleteHandler(job) {
    let traceID = namespace.getTraceID()
    logger.info(`QUEUE-RESULT-HANDLER: Job ${traceID} completed!`)
    logger.info("job %o", job)
}



module.exports = {
    initAndStart,
    publishJobFromTx
}