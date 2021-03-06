const Queue = require('bull')
const { Crypto } = require('@aeternity/aepp-sdk')

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
const { waitForTxConfirm } = require('../ae/tx-util')

let supervisorQueue
let txProcessorQueue 
let autoFunderQueueServer
let autoFunderQueueClient

async function init() {
    let redisConfig = {
        redis: config.get().redis
    }
    txProcessorQueue = new Queue("ampnet-ae-middleware-tx-processor-queue", {
        settings: {
            lockDuration: 600000
        },
        ...redisConfig
    })
    autoFunderQueueServer = new Queue("ampnet-auto-funder-queue-server", redisConfig)
    autoFunderQueueClient = new Queue("ampnet-auto-funder-queue-client", redisConfig)
    supervisorQueue = new Queue("ampnet-ae-supervisor-queue", {
        settings: {
            lockDuration: 1200000
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

    async function createCooperative(maxAttempts = 3) {
        try {
            logger.info(`SUPERVISOR-QUEUE: Processing job with queue id ${job.id}`)
            let adminWallet = job.data.adminWallet
            let coopId = job.data.coopId
    
            logger.info(`SUPERVISOR-QUEUE: Creating cooperative with id ${coopId} and owner ${adminWallet}; Attempts left: ${maxAttempts}`)
            let existingCooperatives = await repo.getCooperatives({
                id: job.data.coopId
            })
            if (existingCooperatives.length > 0) {
                logger.warn(`SUPERVISOR-QUEUE: Failed to create cooperative, ${job.data.coopId} already exists!`)
                return
            }
    
            let coopInstance = await clients.deployer().getContractInstance(contracts.coopSource, {
                opt: {
                    gasPrice: config.get().gasPrice
                }
            })
            let coopDeployResult = await coopInstance.deploy([ ])
            logger.info(`SUPERVISOR-QUEUE: Coop deployed at ${coopDeployResult.address}`)
    
            let eurInstance = await clients.deployer().getContractInstance(contracts.eurSource, {
                opt: {
                    gasPrice: config.get().gasPrice
                }
            })
            let eurDeployResult = await eurInstance.deploy([coopDeployResult.address])
            logger.info(`SUPERVISOR-QUEUE: EUR deployed at ${eurDeployResult.address}`)
    
            let coopInstanceDeployed = await clients.deployer().getContractInstance(contracts.coopSource, {
                contractAddress: coopDeployResult.address,
                opt: {
                    gasPrice: config.get().gasPrice
                }
            })
            let eurInstanceDeployed = await clients.deployer().getContractInstance(contracts.eurSource, {
                contractAddress: eurDeployResult.address,
                opt: {
                    gasPrice: config.get().gasPrice
                }
            })
    
            let setTokenResult = await coopInstanceDeployed.call('set_token', [eurDeployResult.address], {
                opt: {
                    gasPrice: config.get().gasPrice
                }
            })
            logger.info(`SUPERVISOR-QUEUE: EUR token registered in Coop contract`)
    
            let activateAdminWalletResult = await coopInstanceDeployed.call('add_wallet', [ adminWallet ], {
                opt: {
                    gasPrice: config.get().gasPrice
                }
            })
            logger.info(`SUPERVISOR-QUEUE: Admin wallet activated. Hash: ${activateAdminWalletResult.hash}`)
    
            let transferCoopOwnershipResult = await coopInstanceDeployed.call('transfer_ownership', [ adminWallet ], {
                opt: {
                    gasPrice: config.get().gasPrice
                }
            })
            logger.info(`SUPERVISOR-QUEUE: Coop ownership transferred to admin wallet.`)
    
            let transferEurOwnershipResult = await eurInstanceDeployed.call('transfer_ownership', [ adminWallet ], {
                opt: {
                    gasPrice: config.get().gasPrice
                }
            })
            logger.info(`SUPERVISOR-QUEUE: EUR ownership transferred to admin wallet.`)
    
            await repo.saveCooperative({
                id: coopId,
                coop_contract: coopDeployResult.address,
                eur_contract: eurDeployResult.address,
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

            return await Promise.all(
                [
                    coopDeployResult.transaction,
                    eurDeployResult.transaction,
                    setTokenResult.hash,
                    transferCoopOwnershipResult.hash,
                    transferEurOwnershipResult.hash
                ].map(hash => waitForTxConfirm(hash))
            )
        } catch(error) {
            if (error.verifyTx) {
                let verificationResult = await error.verifyTx()
                logger.warn(`SUPERVISOR-QUEUE: Error while creating new cooperative %o`, verificationResult)
            } else {
                logger.warn(`SUPERVISOR-QUEUE: Error while creating new cooperative %o`, error)
            }
            if (maxAttempts > 0) {
                return await createCooperative(maxAttempts - 1)    
            } else {
                throw new Error(`SUPERVISOR-QUEUE: Error while creating cooperative. 0 attempts left, giving up...`)
            }
        }
    }

    return await createCooperative()
}

async function supervisorQueueJobCompleteHandler(job, result) {
    logger.info(`Job ${job.id} complete!`)
}

async function txProcessorJobHandler(job) {
    logger.info(`PROCESSOR-QUEUE: Processing job with queue id ${job.id}`)
    let hash = job.data.hash
    let type = job.data.type
    return txProcessor.process(hash, type)
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