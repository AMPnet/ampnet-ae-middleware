const repo = require('../persistence/repository')
const logger = require('../logger')(module)
const txProcessor = require('./transaction-processor')
const { TxState } = require('../enums/enums')

async function processAllRecords() {
    logger.info("Checking database state. Processing all records.")
    let records = await repo.get({})
    let count = records.length
    logger.info(`Found total of ${count} records.`)
    for (i = 0; i < count; i++) {
        let r = records[i]
        if (r.state == TxState.PENDING) {
            logger.info(`Detected inconsistent record with hash ${r.hash}`)
            let updatedRecords = await txProcessor.process(r.hash)
            logger.info(`Successfully processed record with hash ${r.hash}`)
            logger.info(`Updated records: %o`, updatedRecords)
        }
    }
}

module.exports = { processAllRecords }
