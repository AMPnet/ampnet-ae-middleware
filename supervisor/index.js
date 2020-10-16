const CronJob = require('cron').CronJob

const PgBoss = require('pg-boss')

const config = require('../config')
const logger = require('../logger')(module)
const ae = require('../ae/client')
const util = require('../ae/util')
const repo = require('../persistence/repository')
const queueClient = require('../queue/queueClient')
const enums = require('../enums/enums')
const { SupervisorJob: JobType, TxType, WalletType, TxState } = require('../enums/enums')

var job

function start() {
    let interval = config.get().dbScanPeriod
    let cronString = `0 */${interval} * * * *`
    job = new CronJob(
        cronString,
        scanAndProcess
    )
    job.start()
    logger.info(`DB-SCANNER: Started cron job!`)
}

async function scanAndProcess() {
    let interval = config.get().dbScanPeriod
    logger.info(`DB-SCANNER: ${interval} minute(s) passed. Starting database consistency check...`)
    handlePendingRecords()
    handleSupervisorRequiredRecords()
}

async function handlePendingRecords() {
    let interval = config.get().dbScanPeriod
    let scanOlderThanMinutes = config.get().dbScanOlderThan
    let pendingRecords = await repo.getPendingOlderThan(scanOlderThanMinutes)
    if (pendingRecords.length === 0) {
        logger.info(`DB-SCANNER: Found 0 records older than ${scanOlderThanMinutes} minute(s) with PENDING transaction state.`)
    } else {
        logger.warn(`DB-SCANNER: Found ${pendingRecords.length} record(s) older than ${scanOlderThanMinutes} minute(s) with PENDING transaction state. Starting recovery...`)
        for (tx of pendingRecords) {
            let hash = tx.hash
            let type = tx.type
            logger.warn(`DB-SCANNER: Processing transaction ${hash} of type ${type}.`)
            util.transactionExists(hash).then(exists => {
                if (exists) {
                    logger.warn(`DB-SCANNER: Transaction ${hash} was broadcasted to chain but remained in PENDING state for atleast ${interval} minute(s). Further investigation may be required. Sending transaction to tx processor queue...`)
                    queueClient.publishTxProcessJob()
                } else {
                    logger.warn(`DB-SCANNER: Transaction ${hash} was never broadcasted to chain. Updating state to failed with error description.`)
                    repo.update(
                        {
                            hash: tx.hash,
                            from_wallet: tx.from_wallet,
                            to_wallet: tx.to_wallet
                        },
                        {
                            state: TxState.FAILED,
                            error_message: "Transaction was cached but never broadcasted to chain."
                        }
                    ).then(_ => {
                        logger.warn(`DB-SCANNER: Updated state of transaction ${hash} to FAILED. Transaction was never broadcasted to chain.`)
                    })
                }
            }).catch(err => {
                logger.warn(`DB-SCANNER: Error while fetching info for transaction ${hash}. Hash may be invalid, further investigation required.`)
            })
        }
    }
}

async function handleSupervisorRequiredRecords() {
    let interval = config.get().dbScanPeriod
    let scanOlderThanMinutes = config.get().dbScanOlderThan
    let records = await repo.getSupervisorRequiredOlderThan(scanOlderThanMinutes)
    if (records.length === 0) {
        logger.info(`DB-SCANNER: Found 0 records older than ${scanOlderThanMinutes} minute(s) with supervisor status REQUIRED.`)
    } else {
        logger.warn(`DB-SCANNER: Found ${records.length} record(s) older than ${scanOlderThanMinutes} minute(s) with supervisor status REQUIRED. Starting recovery...`)
        for (tx of records) {
            let hash = tx.hash
            let type = tx.type
            logger.warn(`DB-SCANNER: Processing transaction ${hash} of type ${type}.`)
            repo.get({
                originated_from: hash
            }).then(chainedTransactions => {
                if (chainedTransactions.length === 0) {
                    logger.warn(`DB-SCANNER: Found 0 transactions originated from transaction ${hash}. Calling special actions...`)
                    // TODO: call special actions
                } else {
                    logger.warn(`DB-SCANNER: Found ${chainedTransactions.length} transaction(s) originated from transaction ${hash}`)
                    if (chainedTransactions[0].type === TxType.SHARE_PAYOUT) {
                    // TODO: handle
                    } else {
                    // TODO: handle
                    }
                }
            }).catch(err => {
            // TODO: handle
            })
        }
    }
}

function stop() {
    job.stop()
}

module.exports = {
    start,
    stop
}