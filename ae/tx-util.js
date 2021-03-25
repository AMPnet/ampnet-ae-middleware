let config = require('../config')
let client = require('./client')
let logger = require('../logger')(module)

async function waitForTxConfirm(hash, type, maxAttempts = 3) {
    try {
        let numberOfConfirmations = config.get().confirmations
        let confirmationsTxTypes = config.get().confirmationsTxTypes
        logger.info(`Waiting for transaction ${hash} of type ${type}; Number of confirmations: ${numberOfConfirmations}; Attempts left: ${maxAttempts};`)
        if (maxAttempts == 0) throw new Error(`Error: Waiting for transaction ${hash} confirmation timed out...`)
        let pollResult = await client.instance().poll(hash, { blocks: 10, interval: 10000 })
        logger.debug(`Transaction ${hash} poll result: %o`, pollResult)
        if (numberOfConfirmations > 0 && confirmationsTxTypes.includes(type)) {
            let currentHeight = await client.instance().waitForTxConfirm(hash, { confirm: numberOfConfirmations, interval: 10000, attempts: 20 })
            logger.debug(`Wait for ${hash} tx confirm result: ${currentHeight}`)
            let txInfo = await client.instance().tx(hash)
            logger.debug(`Fetched tx info again for ${hash}. Result: %o`, txInfo)
            if (txInfo.blockHeight === -1 || (currentHeight - txInfo.blockHeight) < numberOfConfirmations) {
                logger.warn(`Height does not look good for transaction ${hash}. Executing recursive call...`)
                return await waitForTxConfirm(hash, maxAttempts - 1)
            } else {
                return txInfo
            }
        } else {
            let txInfo = await client.instance().tx(hash)
            logger.debug(`Fetched tx info again for ${hash}. Result: %o`, txInfo)
            if (txInfo.blockHeight === -1) {
                logger.warn(`Height does not look good for transaction ${hash}. Executing recursive call...`)
                return await waitForTxConfirm(hash, maxAttempts - 1)
            } else {
                return txInfo
            }
        }
    } catch(err) {
        console.log(`Error while checking for transaction ${hash}. %o`, err)
        if (maxAttempts > 0) {
            return await waitForTxConfirm(hash, maxAttempts - 1)
        } else {
            throw new Error(`Error while checking for transaction ${hash}. 0 attempts left, giving up...`)
        }
    }
}

module.exports = { waitForTxConfirm }