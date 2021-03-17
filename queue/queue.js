const Queue = require('bull')
const { Crypto, TxBuilder, MemoryAccount, Universal, Node } = require('@aeternity/aepp-sdk')

const clients = require('../ae/client')
const contracts = require('../ae/contracts')
const { waitForTxConfirm } = require('../ae/util')
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
        let funds = 1000000000000000000
        let deployer = await Crypto.generateKeyPair()
        await clients.deployer().spend(funds, deployer.publicKey)
        let balance = await clients.deployer().balance(deployer.publicKey)
        if (balance != funds) { throw new Error("Funding deployer failed!") }
        createCooperative(job.data.coopId, job.data.adminWallet, deployer)
    } catch(error) {
        if (error.verifyTx) {
            let verificationResult = await error.verifyTx()
            logger.warn(`SUPERVISOR-QUEUE: Error while creating new cooperative %o`, verificationResult)
        } else {
            logger.warn(`SUPERVISOR-QUEUE: Error while creating new cooperative %o`, error)
        }
    }
}

async function createCooperative(coopId, adminWallet, deployerKeypair, attempts = 3) {
    try {
        let aeNode = await Node({
            url: config.get().node.url,
            internalUrl: config.get().node.internalUrl
        })
        let deployer = await Universal({
            nodes: [
                { name: "node", instance: aeNode } 
            ],
            compilerUrl: config.get().node.compilerUrl,
            accounts: [
                MemoryAccount({ keypair: deployerKeypair })
            ],
            address: deployerKeypair.publicKey,
            networkId: config.get().networkId
        })

        logger.info(`COOP-DEPLOYER: Creating cooperative with id ${coopId} and owner ${adminWallet}`)
        let existingCooperatives = await repo.getCooperatives({
            id: coopId
        })
        if (existingCooperatives.length > 0) {
            logger.warn(`COOP-DEPLOYER: Failed to create cooperative, ${job.data.coopId} already exists!`)
            return
        }

        let coopInstance = await deployer.getContractInstance(contracts.coopSource)
        let coopDeployResult = await coopInstance.deploy([ ])
        let coopDeployInfo = await waitForTxConfirm(coopDeployResult.transaction)
        logger.info(`COOP-DEPLOYER: Coop deployed at ${coopDeployInfo.contractId}`)

        let eurInstance = await deployer.getContractInstance(contracts.eurSource)
        let eurDeployResult = await eurInstance.deploy([coopDeployInfo.contractId])
        let eurDeployInfo = await waitForTxConfirm(eurDeployResult.transaction)
        logger.info(`COOP-DEPLOYER: EUR deployed at ${eurDeployInfo.contractId}`)

        let setTokenResult = await coopInstance.call('set_token', [ eurDeployInfo.contractId ])
        let setTokenInfo = await waitForTxConfirm(setTokenResult.hash)
        logger.info(`COOP-DEPLOYER: EUR token registered in Coop contract`)

        let activateAdminWalletResult = await coopInstance.call('add_wallet', [ adminWallet ])
        let activateAdminWalletInfo = await waitForTxConfirm(activateAdminWalletResult.hash)
        logger.info(`COOP-DEPLOYER: Admin wallet activated. Hash: ${activateAdminWalletResult.hash}`)

        let transferCoopOwnershipResult = await coopInstance.call('transfer_ownership', [ adminWallet ])
        let transferCoopOwnershipInfo = await waitForTxConfirm(transferCoopOwnershipResult.hash)
        logger.info(`COOP-DEPLOYER: Coop ownership transferred to admin wallet.`)

        let transferEurOwnershipResult = await eurInstance.call('transfer_ownership', [ adminWallet ])
        let transferEurOwnershipInfo = await waitForTxConfirm(transferEurOwnershipResult.hash)
        logger.info(`COOP-DEPLOYER: EUR ownership transferred to admin wallet.`)

        await repo.saveCooperative({
            id: coopId,
            coop_contract: coopDeployInfo.contractId,
            eur_contract: eurDeployInfo.contractId,
            coop_owner: adminWallet,
            eur_owner: adminWallet
        })
        logger.info(`COOP-DEPLYOER: Cooperative info saved.`)

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
        logger.info(`COOP-DEPLOYER: Admin wallet creation transaction info saved.`)

        queueClient.publishJobFromTx(adminWalletCreateTx)
        amqp.sendMessage(amqp.QUEUE_MIDDLEWARE_ACTIVATE_WALLET, { address: adminWallet, coop: coopId, hash: activateAdminWalletResult.hash})
    } catch(err) {
        logger.warn(`COOP-DEPLOYER: Error while creating cooperative ${coopId}: %o`, err)
        if (attempts > 0) {
            logger.warn(`COOP-DEPLOYER: ${attempts} attempts left, trying again.`)
            createCooperative(coopId, adminWallet, deployerKeypair, attempts - 1)
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