let path = require('path')

let { Universal: Ae } = require('@aeternity/aepp-sdk')

let contracts = require('../../ae/contracts')
let Environment = require('../../enums/enums').Environment
let logger = require('../../logger')(module)

async function get() {
    process.env.NODE_ENV = process.env.NODE_ENV || Environment.LOCAL
    let node = {
        url: getNodeUrl(),
        internalUrl: getNodeInternalUrl(),
        compilerUrl: getCompilerUrl(),
        networkId: getNetworkId()
    }
    let supervisorKeypair = getSupervisorKeypair()
    let contracts = await getContracts(node, supervisorKeypair)
    let grpc = getGrpc()
    let http = getHttp()
    let db = getDb()
    let queueDb = getQueueDb()
    return {
        env: process.env.NODE_ENV,
        node: node,
        supervisor: supervisorKeypair,
        contracts: contracts,
        grpc: grpc,
        http: http,
        db: db,
        queueDb: queueDb,
        giftAmount: process.env.GIFT_AMOUNT || 0.3
    }
}

function getNodeUrl() {
    if (process.env.NODE_URL) { return process.env.NODE_URL }
    switch (process.env.NODE_ENV) {
        case Environment.LOCAL: return "http://localhost:3001/"
        case Environment.TESTNET: return "https://sdk-testnet.aepps.com/"
        case Environment.MAINNET: return "https://sdk-mainnet.aepps.com"
    }
}

function getNodeInternalUrl() {
    if (process.env.NODE_INTERNAL_URL) { return process.env.NODE_INTERNAL_URL }
    switch (process.env.NODE_ENV) {
        case Environment.LOCAL: return "http://localhost:3001/internal"
        case Environment.TESTNET: return "https://sdk-testnet.aepps.com"
        case Environment.MAINNET: return "https://sdk-mainnet.aepps.com"
    }
}
 
function getCompilerUrl() {
    if (process.env.COMPILER_URL) { return process.env.COMPILER_URL }
    switch (process.env.NODE_ENV) {
        case Environment.LOCAL: return "http://localhost:3080"
        case Environment.TESTNET: return "https://latest.compiler.aepps.com"
        case Environment.MAINNET: return "https://latest.compiler.aepps.com"
    }
}

function getNetworkId() {
    if (process.env.NETWORK_ID) { return process.env.NETWORK_ID }
    switch (process.env.NODE_ENV) {
        case Environment.LOCAL: return "ae_devnet"
        case Environment.TESTNET: return "ae_uat"
        case Environment.MAINNET: return "ae_mainnet"
    }
}

function getSupervisorKeypair() {
    let localKeypair = {
        publicKey: "ak_fUq2NesPXcYZ1CcqBcGC3StpdnQw3iVxMA3YSeCNAwfN4myQk",
        secretKey: "7c6e602a94f30e4ea7edabe4376314f69ba7eaa2f355ecedb339df847b6f0d80575f81ffb0a297b7725dc671da0b1769b1fc5cbe45385c7b5ad1fc2eaf1d609d"
    }
    let testnetKeypair = {
        publicKey: "ak_2rTfmU3BQHohJvLPoHzRKWijgqbFi4dwYmzVjyqgQrQAQmkhr6",
        secretKey: "2826a2b18d1bb2530341eb28e4e582613cd9d0687e7681c89a34159f39d554c3f40028b9aa6ee6fbcb53135799866edf08b8eb838fe9e56d9691d0963951358f"
    }
    if (process.env.SUPERVISOR_PUBLIC_KEY && process.env.SUPERVISOR_PRIVATE_KEY) {
        return {
            publicKey: process.env.SUPERVISOR_PUBLIC_KEY,
            secretKey: process.env.SUPERVISOR_PRIVATE_KEY
        }
    }
    switch (process.env.NODE_ENV) {
        case Environment.LOCAL: return localKeypair
        case Environment.TESTNET: return testnetKeypair
        case Environment.MAINNET: throw new Error("When deploying to mainnet, supervisor keypair should be provided as environment vars!")
    }
}

async function getContracts(node, supervisorKeypair) {
    client = await Ae({
        url: node.url,
        internalUrl: node.internalUrl,
        keypair: supervisorKeypair,
        networkId: node.networkId,
        compilerUrl: node.compilerUrl
    })
    if (process.env.COOP_ADDRESS && process.env.EUR_ADDRESS) {
        logger.info("Base contracts pre-deployed.")
        logger.info(`Coop: ${process.env.COOP_ADDRESS}`)
        logger.info(`EUR: ${process.env.EUR_ADDRESS}`)
        coopInstance = await client.getContractInstance(contracts.coopSource, {
            contractAddress: process.env.COOP_ADDRESS
        })
        coopOwner = await (await coopInstance.call('owner', [])).decode()
        eurInstance = await client.getContractInstance(contracts.eurSource, {
            contractAddress: process.env.EUR_ADDRESS
        })
        eurOwner = await (await eurInstance.call('owner', [])).decode()
        contracts.setCoopAddress(process.env.COOP_ADDRESS)
        contracts.setEurAddress(process.env.EUR_ADDRESS)
        logger.info(`Fetched Coop owner: ${coopOwner}`)
        logger.info(`Fetched EUR owner: ${eurOwner}`)
        return {
            coop: {
                address: process.env.COOP_ADDRESS,
                owner: coopOwner
            },
            eur: {
                address: process.env.EUR_ADDRESS,
                owner: eurOwner
            }
        }
    } else {
        logger.info("Base contracts not deployed. Starting deployment.")
        
        coopInstance = await client.getContractInstance(contracts.coopSource)
        coop = await coopInstance.deploy()
        logger.info(`Coop deployed at ${coop.address}`)

        eurInstance = await client.getContractInstance(contracts.eurSource)
        eur = await eurInstance.deploy([coop.address])
        logger.info(`EUR deployed at ${eur.address}`)

        await coopInstance.call('set_token', [eur.address])
        logger.info(`EUR token registered in Coop contract`)
 
        if (process.env.COOP_OWNER) {
            logger.info(`Transferring Coop contract ownership to ${process.env.COOP_OWNER}`)
            coopInstance.call('transfer_ownership', [process.env.COOP_OWNER])
            logger.info(`Ownership transferred.`)
        }

        if (process.env.EUR_OWNER) {
            logger.info(`Transferring EUR contract ownership to ${process.env.EUR_OWNER}`)
            eurInstance.call('transfer_ownership', [process.env.EUR_OWNER])
            logger.info(`Ownership transferred.`)
        }

        coopOwner = await (await coopInstance.call('owner', [])).decode()
        eurOwner = await (await eurInstance.call('owner', [])).decode()

        return {
            coop: {
                address: coop.address,
                owner: coopOwner
            },
            eur: {
                address: eur.address,
                owner: eurOwner
            }
        }
    }
}

function getGrpc() {
    if (process.env.GRPC_URL) {
        return {
            url: process.env.GRPC_URL
        }
    }
    return {
        url: "0.0.0.0:8224"
    }
}

function getHttp() {
    return {
        port: process.env.HTTP_PORT || 8124
    }
}

function getDb() {
    var host
    var user
    var password
    var port
    var database
    var ssl
    
    var poolMin = 2
    var poolMax = process.env.DB_MAX_POOL_SIZE || 5
    var idleTimeoutMillis = 30000
    
    host = process.env.DB_HOST || "localhost"
    port = process.env.DB_PORT || "5432"

    switch (process.env.NODE_ENV) {
        case Environment.LOCAL:
            poolMin = 0
            idleTimeoutMillis = 500
            user = process.env.DB_USER || "ae_middleware_local"
            password = process.env.DB_PASSWORD || "password"
            database = process.env.DB_NAME || "ae_middleware_local"
            break
        case Environment.TESTNET:
            user = process.env.DB_USER || "ae_middleware_testnet"
            password = process.env.DB_PASSWORD || "password"
            database = process.env.DB_NAME || "ae_middleware_testnet"
            break
        case Environment.MAINNET:
            user = process.env.DB_USER || "ae_middleware_mainnet"
            password = process.env.DB_PASSWORD || "password"
            database = process.env.DB_NAME || "ae_middleware_mainnet"
            break
    }
    sslString = process.env.DB_SSL || "false"
    ssl = (sslString == "true")

    return {
        client: 'postgresql',
        connection: {
            host: host,
            user: user,
            password: password,
            port: port,
            database: database,
            ssl: ssl
        },
        pool: {
            min: poolMin,
            max: poolMax,
            idleTimeoutMillis: idleTimeoutMillis
        },
        migrations: {
            directory: path.join(__dirname, '..', '..', 'db', 'migrations'),
        }
    }
}

function getQueueDb() {
    var host
    var user
    var password
    var port
    var database
    
    host = process.env.QUEUE_DB_HOST || ((process.env.NODE_ENV == Environment.LOCAL) ? "localhost" : "db")
    port = process.env.QUEUE_DB_PORT || "5432"

    switch (process.env.NODE_ENV) {
        case Environment.LOCAL:
            user = process.env.QUEUE_DB_USER || "ae_middleware_local"
            password = process.env.QUEUE_DB_PASSWORD || "password"
            database = process.env.QUEUE_DB_NAME || "ae_middleware_local"
            break
        case Environment.TESTNET:
            user = process.env.QUEUE_DB_USER || "ae_middleware_testnet"
            password = process.env.QUEUE_DB_PASSWORD || "password"
            database = process.env.QUEUE_DB_NAME || "ae_middleware_testnet"
            break
        case Environment.MAINNET:
            user = process.env.QUEUE_DB_USER || "ae_middleware_mainnet"
            password = process.env.QUEUE_DB_PASSWORD || "password"
            database = process.env.QUEUE_DB_NAME || "ae_middleware_mainnet"
            break
    }

    return {
        host: host,
        user: user,
        password: password,
        port: port,
        database: database
    }
}

module.exports = { get }