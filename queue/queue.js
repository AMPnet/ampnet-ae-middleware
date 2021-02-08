const Queue = require('bull')
const { Crypto } = require('@aeternity/aepp-sdk')

const util  = require('../util/util')
const clients = require('../ae/client')
const contracts = require('../ae/contracts')
const queueClient = require('./queueClient')
const logger = require('../logger')(module)
const repo = require('../persistence/repository')
const enums = require('../enums/enums')
const txProcessor = require('../service/transaction-processor')
const config = require('../config')
const ws = require('../ws/server')
const walletServiceGrpcClient = require('../grpc/wallet-service')

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
        async function awaitNonce(publicKey, targetNonce) {
            let nonce = await clients.instance().getAccountNonce(publicKey)
            logger.info(`SUPERVISOR-QUEUE: ${publicKey} nonce is now ${nonce}`)
            if (nonce >= targetNonce) { return nonce }
            else {
                await util.sleep(500)
                return awaitNonce(publicKey, targetNonce)
            }
        }

        logger.info(`SUPERVISOR-QUEUE: Processing job with queue id ${job.id}`)
        let adminWallet = job.data.adminWallet
        let coopId = job.data.coopId
        let coopDeployerPublicKey = config.get().coopDeployer.publicKey
        let eurDeployerPublicKey = config.get().eurDeployer.publicKey

        logger.info(`SUPERVISOR-QUEUE: Creating cooperative with id ${coopId} and owner ${adminWallet}`)
        let coopDeployerBaseNonce = await clients.instance().getAccountNonce(coopDeployerPublicKey)
        let eurDeployerBaseNonce = await clients.instance().getAccountNonce(eurDeployerPublicKey)
        
        let coopInstance = await clients.coopDeployer().getContractInstance(contracts.coopSource)
        let coop = await coopInstance.deploy([], opt = { nonce: coopDeployerBaseNonce })
        logger.info(`SUPERVISOR-QUEUE: Coop deployed at ${coop.address}`)
        coopDeployerBaseNonce = await awaitNonce(coopDeployerPublicKey, coopDeployerBaseNonce + 1)

        let eurInstance = await clients.eurDeployer().getContractInstance(contracts.eurSource)
        let eur = await eurInstance.deploy([coop.address], opt = { nonce: eurDeployerBaseNonce })
        logger.info(`SUPERVISOR-QUEUE: EUR deployed at ${eur.address}`)
        eurDeployerBaseNonce = await awaitNonce(eurDeployerPublicKey, eurDeployerBaseNonce + 1)

        await coopInstance.call('set_token', [eur.address], opt = { nonce: coopDeployerBaseNonce })
        logger.info(`SUPERVISOR-QUEUE: EUR token registered in Coop contract`)
        coopDeployerBaseNonce = await awaitNonce(coopDeployerPublicKey, coopDeployerBaseNonce + 1)

        let activateAdminWalletResult = await coopInstance.call('add_wallet', [ adminWallet ], opt = { nonce: coopDeployerBaseNonce })
        logger.info(`SUPERVISOR-QUEUE: Admin wallet activated. Hash: ${activateAdminWalletResult.hash}`)
        coopDeployerBaseNonce = await awaitNonce(coopDeployerPublicKey, coopDeployerBaseNonce + 1)

        await coopInstance.call('transfer_ownership', [ adminWallet ], opt = { nonce: coopDeployerBaseNonce })
        logger.info(`SUPERVISOR-QUEUE: Coop ownership transferred to admin wallet.`)

        await eurInstance.call('transfer_ownership', [ adminWallet ], opt = { nonce: eurDeployerBaseNonce })
        logger.info(`SUPERVISOR-QUEUE: EUR ownership transferred to admin wallet.`)

        await repo.saveCooperative({
            id: coopId,
            coop_contract: coop.address,
            eur_contract: eur.address,
            coop_owner: adminWallet,
            eur_owner: adminWallet
        })
        logger.info(`SUPERVISOR-QUEUE: Cooperative info saved.`)
    
        let workerWallet = Crypto.generateKeyPair()
        let adminWalletCreateTx = {
            hash: activateAdminWalletResult.hash,
            from_wallet: activateAdminWalletResult.result.callerId,
            to_wallet: adminWallet,
            input: activateAdminWalletResult.txData.tx.callData,
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

        walletServiceGrpcClient.activateWallet(adminWallet, coopId, activateAdminWalletResult.hash)
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