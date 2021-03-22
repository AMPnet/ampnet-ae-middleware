const CronJob = require('cron').CronJob

const config = require('../config')
const logger = require('../logger')(module)
const util = require('../ae/util')
const repo = require('../persistence/repository')
const queueClient = require('../queue/queueClient')
const projectService = require('../service/project')
const { SupervisorJob: JobType, TxType, WalletType, TxState, SupervisorStatus } = require('../enums/enums')

var job

function start() {
    if (!config.get().dbScanEnabled) {
        logger.info(`DB-SCANNER: Scanner disabled in config and will not be started.`)
        return
    }
    let interval = config.get().dbScanPeriod
    let scanOlderThan = config.get().dbScanOlderThan
    let cronString = `0 */${interval} * * * *`
    job = new CronJob(
        cronString,
        scanAndProcess
    )
    job.start()
    logger.info(`DB-SCANNER: Started cron job! Database will be checked every ${interval} minute(s) and will look for records older than ${scanOlderThan} minute(s).`)
}

async function scanAndProcess() {
    let interval = config.get().dbScanPeriod
    logger.debug(`DB-SCANNER: ${interval} minute(s) passed. Starting database consistency check...`)
    handlePendingRecords()
    handleSupervisorRequiredRecords()
}

async function handlePendingRecords() {
    let interval = config.get().dbScanPeriod
    let scanOlderThanMinutes = config.get().dbScanOlderThan
    let pendingRecords = await repo.getPendingOlderThan(scanOlderThanMinutes)
    if (pendingRecords.length === 0) {
        logger.debug(`DB-SCANNER: Found 0 records older than ${scanOlderThanMinutes} minute(s) with PENDING transaction state.`)
    } else {
        logger.warn(`DB-SCANNER: Found ${pendingRecords.length} record(s) older than ${scanOlderThanMinutes} minute(s) with PENDING transaction state. Starting recovery...`)
        for (tx of pendingRecords) {
            let hash = tx.hash
            let type = tx.type
            logger.warn(`DB-SCANNER: Processing transaction ${hash} of type ${type}.`)
            util.transactionExists(hash).then(exists => {
                if (exists) {
                    logger.warn(`DB-SCANNER: Transaction ${hash} was broadcasted to chain but remained in PENDING state for atleast ${interval} minute(s). Further investigation may be required. Sending transaction to tx processor queue...`)
                    queueClient.publishTxProcessJob(hash, type)
                } else {
                    logger.warn(`DB-SCANNER: Transaction ${hash} was never broadcasted to chain. Updating state to failed with error description.`)
                    repo.update(
                        {
                            hash: tx.hash
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
                logger.warn(`DB-SCANNER: Error while fetching info for transaction ${hash}. Hash may be invalid, further investigation required. Error: %o`, err)
            })
        }
    }
}

async function handleSupervisorRequiredRecords() {
    let scanOlderThanMinutes = config.get().dbScanOlderThan
    let records = await repo.getSupervisorRequiredOlderThan(scanOlderThanMinutes)
    if (records.length === 0) {
        logger.debug(`DB-SCANNER: Found 0 records older than ${scanOlderThanMinutes} minute(s) with supervisor status REQUIRED.`)
    } else {
        logger.warn(`DB-SCANNER: Found ${records.length} record(s) older than ${scanOlderThanMinutes} minute(s) with supervisor status REQUIRED. Starting recovery...`)
        for (tx of records) {
            let hash = tx.hash
            let type = tx.type
            logger.warn(`DB-SCANNER: Processing transaction ${hash} of type ${type}.`)
            repo.getAsc({
                originated_from: hash
            }).then(chainedTransactions => {
                if (chainedTransactions.length === 0) {
                    logger.warn(`DB-SCANNER: Found 0 transactions originated from transaction ${hash}. Sending origin transaction to tx processor queue again...`)
                    queueClient.publishTxProcessJob(hash, type)
                    return
                }
                logger.warn(`DB-SCANNER: Found ${chainedTransactions.length} transaction(s) originated from transaction ${hash}`)
                let lastChainedTx = chainedTransactions[chainedTransactions.length - 1]
                switch (lastChainedTx.state) {
                    case TxState.MINED:
                        if (tx.type === TxType.START_REVENUE_PAYOUT) {
                            logger.warn(`DB-SCANNER: Last revenue share payout transaction was mined successfully. Checking if more revenue share payout calls is required before finalizing job...`)
                            projectService.getProjectInfoByWallet(tx.to_wallet, tx.coop_id).then(info => {
                                if (info.payoutInProcess) {
                                    logger.warn(`DB-SCANNER: Revenue share payout was not finalized. One or more batches were not processed. Sending origin transaction to tx processor queue again...`)
                                    queueClient.publishTxProcessJob(hash, type)
                                } else {
                                    logger.warn(`DB-SCANNER: Special action call was processed for transaction ${hash} but supervisor status in origin transaction was not updated. Updating supervisor status...`)
                                    repo.update(
                                        {
                                            hash: hash
                                        },
                                        {
                                            supervisor_status: SupervisorStatus.PROCESSED
                                        }
                                    ).then(_ => {
                                        logger.warn(`DB-SCANNER: Updated supervisor status of origin transaction ${hash} to PROCESSED.`)
                                    })
                                }
                            })
                        } else {
                            logger.warn(`DB-SCANNER: Special action call was processed for transaction ${hash} but supervisor status in origin transaction was not updated. Updating supervisor status...`)
                            repo.update(
                                {
                                    hash: hash
                                },
                                {
                                    supervisor_status: SupervisorStatus.PROCESSED
                                }
                            ).then(_ => {
                                logger.warn(`DB-SCANNER: Updated supervisor status of origin transaction ${hash} to PROCESSED.`)
                            })
                        }
                        break
                    case TxState.PENDING:
                        logger.warn(`DB-SCANNER: Special action call was executed for transaction ${hash} but chained transaction is still in state PENDING. Supervisor will handle this transaction, moving on...`)
                        break
                    case TxState.FAILED:
                        logger.warn(`DB-SCANNER: Special action call was executed for transaction ${hash} but chained transaction was mined with status FAILED. Sending origin transaction to tx processor queue again...`)
                        queueClient.publishTxProcessJob(hash, type)
                        break
                }
            })
        }
    }
}

function stop() {
    if (job !== undefined) { 
        logger.info(`DB-SCANNER: Stoping cron job...`)
        job.stop()
    }
}

module.exports = {
    start,
    scanAndProcess,
    stop
}