const Queue = require('bull')
const { Crypto, TxBuilder } = require('@aeternity/aepp-sdk')

const clients = require('../ae/client')
const contracts = require('../ae/contracts')
const queueClient = require('./queueClient')
const logger = require('../logger')(module)
const repo = require('../persistence/repository')
const enums = require('../enums/enums')
const txProcessor = require('../service/transaction-processor')
const config = require('../config')
const ws = require('../ws/server')
const amqp = require('../amqp/amqp')

let supervisorQueue
let txProcessorQueue 
let autoFunderQueueServer
let autoFunderQueueClient

async function init() {
    let redisConfig = {
        redis: config.get().redis
    }
    txProcessorQueue = new Queue("ampnet-ae-middleware-tx-processor-queue", redisConfig)
    autoFunderQueueServer = new Queue("ampnet-auto-funder-queue-server", redisConfig)
    autoFunderQueueClient = new Queue("ampnet-auto-funder-queue-client", redisConfig)
    supervisorQueue = new Queue("ampnet-ae-supervisor-queue", {
        settings: {
            lockDuration: 500000
        },
        ...redisConfig
    })

    txProcessorQueue.process(10, txProcessorJobHandler)
    txProcessorQueue.on('completed', txProcessorJobCompleteHandler)
    supervisorQueue.process(supervisorQueueJobHandler)
    supervisorQueue.on('completed', supervisorQueueJobCompleteHandler)
    supervisorQueue.on('failed', function(job, err) {
        logger.warn(`SUPERVISOR-QUEUE: Job ${job.id} failed with error %o`, err)
    })
    supervisorQueue.on('error', function(err) {
        logger.warn(`SUPERVISOR-QUEUE: Error %o`, err)
    })

    autoFunderQueueClient.process(autoFunderJobCompleteHandler)
    
    logger.info("Queue initialized successfully!")

    queueClient.init(autoFunderQueueServer, txProcessorQueue, supervisorQueue)
    logger.info("Queue Client initialized successfully!")
}

async function supervisorQueueJobHandler(job) {
    try {
        logger.info(`SUPERVISOR-QUEUE: Processing job with queue id ${job.id}`)
        let adminWallet = job.data.adminWallet
        let coopId = job.data.coopId

        logger.info(`SUPERVISOR-QUEUE: Creating cooperative with id ${coopId} and owner ${adminWallet}`)
        let existingCooperatives = await repo.getCooperatives({
            id: job.data.coopId
        })
        if (existingCooperatives.length > 0) {
            logger.warn(`SUPERVISOR-QUEUE: Failed to create cooperative, ${job.data.coopId} already exists!`)
            return
        }

        let coopInstance = await clients.deployer().getContractInstance(contracts.coopSource, {
            opt: {
                verify: false
            }
        })
        let coopDeployResult = await executeUntilNonceOk(() => coopInstance.deploy([ ]))
        logger.info(`SUPERVISOR-QUEUE: Coop deployed at ${coopDeployResult.contractId}`)

        let eurInstance = await clients.deployer().getContractInstance(contracts.eurSource, {
            opt: {
                verify: false
            }
        })
        let eurDeployResult = await executeUntilNonceOk(() => eurInstance.deploy([coopDeployResult.contractId]))
        logger.info(`SUPERVISOR-QUEUE: EUR deployed at ${eurDeployResult.contractId}`)

        let coopInstanceDeployed = await clients.deployer().getContractInstance(contracts.coopSource, {
            contractAddress: coopDeployResult.contractId,
            opt: {
                verify: false
            }
        })
        let eurInstanceDeployed = await clients.deployer().getContractInstance(contracts.eurSource, {
            contractAddress: eurDeployResult.contractId,
            opt: {
                verify: false
            }
        })

        await executeUntilNonceOk(() => coopInstanceDeployed.call('set_token', [eurDeployResult.contractId]))
        logger.info(`SUPERVISOR-QUEUE: EUR token registered in Coop contract`)

        let activateAdminWalletResult = await executeUntilNonceOk(() => coopInstanceDeployed.call('add_wallet', [ adminWallet ]))
        logger.info(`SUPERVISOR-QUEUE: Admin wallet activated. Hash: ${activateAdminWalletResult.hash}`)

        await executeUntilNonceOk(() => coopInstanceDeployed.call('transfer_ownership', [ adminWallet ]))
        logger.info(`SUPERVISOR-QUEUE: Coop ownership transferred to admin wallet.`)

        await executeUntilNonceOk(() => eurInstanceDeployed.call('transfer_ownership', [ adminWallet ]))
        logger.info(`SUPERVISOR-QUEUE: EUR ownership transferred to admin wallet.`)

        await repo.saveCooperative({
            id: coopId,
            coop_contract: coopDeployResult.contractId,
            eur_contract: eurDeployResult.contractId,
            coop_owner: adminWallet,
            eur_owner: adminWallet
        })
        logger.info(`SUPERVISOR-QUEUE: Cooperative info saved.`)
    
        let workerWallet = Crypto.generateKeyPair()
        let adminWalletCreateTx = {
            hash: activateAdminWalletResult.hash,
            from_wallet: activateAdminWalletResult.callerId,
            to_wallet: adminWallet,
            input: activateAdminWalletResult.callData,
            supervisor_status: enums.SupervisorStatus.REQUIRED,
            type: enums.TxType.WALLET_CREATE,
            wallet: adminWallet,
            wallet_type: enums.WalletType.USER,
            state: enums.TxState.MINED,
            created_at: new Date(),
            worker_public_key: workerWallet.publicKey,
            worker_secret_key: workerWallet.secretKey,
            coop_id: coopId
        }
        await repo.saveTransaction(adminWalletCreateTx)
        logger.info(`SUPERVISOR-QUEUE: Admin wallet creation transaction info saved.`)

        queueClient.publishJobFromTx(adminWalletCreateTx)
        amqp.sendMessage(amqp.QUEUE_MIDDLEWARE_ACTIVATE_WALLET, { address: adminWallet, coop: coopId, hash: activateAdminWalletResult.hash})
    } catch(error) {
        if (error.verifyTx) {
            let verificationResult = await error.verifyTx()
            logger.warn(`SUPERVISOR-QUEUE: Error while creating new cooperative %o`, verificationResult)
        } else {
            logger.warn(`SUPERVISOR-QUEUE: Error while creating new cooperative %o`, error)
        }
    }
}

async function supervisorQueueJobCompleteHandler(job, result) {
    logger.info(`Job ${job.id} complete!`)
}

async function txProcessorJobHandler(job) {
    logger.info(`PROCESSOR-QUEUE: Processing job with queue id ${job.id}`)
    let hash = job.data.hash
    return txProcessor.process(hash)
}

async function txProcessorJobCompleteHandler(job, result) {
    logger.info(`PROCESSOR-QUEUE: Job ${job.id} completed. Result: %o`, result)
}

async function autoFunderJobCompleteHandler(job) {
    let jobData = job.data
    if (jobData.originTxHash === undefined) {
        logger.info(`FUNDER-QUEUE: Job ${job.id} completed!`)
        return
    }
    logger.info(`FUNDER-QUEUE: Job ${job.id} completed!`)
    for (wallet of job.data.wallets) {
        ws.notifiySubscribers(wallet)
    }
    repo.update({
        hash: jobData.originTxHash
    },
    { supervisor_status: enums.SupervisorStatus.PROCESSED })
}

function executeUntilNonceOk(aeRunnable, maxCalls = 100) {
    return new Promise((resolve, reject) => {
        if (maxCalls === 0) {
            logger.warn(`NONCE-EXECUTOR: Reached max calls. Giving up.`)
            reject(new Error("NONCE-EXECUTOR: Waiting for Ae call execution timed out.")) 
        }
        else {
            aeRunnable()
            .then(response => { 
                logger.info(`NONCE-EXECUTOR: Call executed successfully!`)
                let additionalInfo = {
                    hash: (response.hash ? response.hash : response.transaction),
                    callData: ((response.txData && response.txData.tx) ? response.txData.tx.callData : undefined)
                }
                resolve({
                    ...response.result,
                    ...additionalInfo
                })
            })
            .catch(err => {
                if (err.verifyTx) {
                    err.verifyTx().then(async verificationResult => {
                        if (Array.isArray(verificationResult.validation)) {
                            if (verificationResult.validation.length === 0 || (verificationResult.validation[0].txKey && verificationResult.validation[0].txKey === 'nonce')) {
                                let hash = TxBuilder.buildTxHash(err.rawTx)
                                logger.warn(`NONCE-EXECUTOR: Nonce issue detected. Will attempt to wait for for transaction, hash is ${hash}`)
                                clients.instance().poll(hash, { blocks: 10 })
                                    .then(pollResult => {
                                        if (pollResult.returnType === 'ok') { 
                                            let pollResultProcessed = {
                                                hash: pollResult.hash,
                                                callerId: pollResult.callerId,
                                                contractId: pollResult.contractId,
                                                callData: pollResult.tx.callData
                                            }
                                            resolve(pollResultProcessed)  
                                        }
                                        else {
                                            logger.warn(`NONCE-EXECUTOR: Attempt to wait for transaction failed. Executing recursive call...`)
                                            executeUntilNonceOk(aeRunnable, maxCalls - 1)
                                                .then(resolve)
                                                .catch(reject)
                                        }
                                    }).catch(_ => {
                                        logger.warn(`NONCE-EXECUTOR: Attempt to wait for transaction failed. Executing recursive call...`)
                                        executeUntilNonceOk(aeRunnable, maxCalls - 1)
                                            .then(resolve)
                                            .catch(reject)
                                    })
                            } else {
                                logger.warn(`NONCE-EXECUTOR: Detected issue not related to nonce. Giving up...`)
                                reject(err)
                            }
                        } else {
                            logger.warn(`NONCE-EXECUTOR: Detected issue not related to nonce. Giving up...`)
                            reject(err)
                        }
                    }).catch(_ => {
                        logger.warn(`NONCE-EXECUTOR: Detected an issue but verifyTx() failed. Giving up...`)
                        reject(err)
                    })
                } else {
                    logger.warn(`NONCE-EXECUTOR: Detected an issue but verifyTx() function not provided. Giving up...`)
                    reject(err)
                }
            })
        }
    })
}

async function stop() {
    await txProcessorQueue.close()
    await autoFunderQueueServer.close()
    await autoFunderQueueClient.close()
    await supervisorQueue.close()
}

async function clearAll() {
    await txProcessorQueue.empty()
    await supervisorQueue.empty()
}

module.exports = { init, stop, clearAll }