let path = require('path')

let { Universal: Ae, MemoryAccount, Node } = require('@aeternity/aepp-sdk')

let contracts = require('../../ae/contracts')
let { Environment, ServiceEnv } = require('../../enums/enums')
let logger = require('../../logger')(module)

async function get() {
    process.env.ENV = valueOrDefault(process.env.ENV, ServiceEnv.DEV)
    process.env.NODE_ENV = valueOrDefault(process.env.NODE_ENV, Environment.LOCAL)
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
    let ws = getWs()
    let db = getDb()
    let queueDb = getQueueDb()
    let dbScanEnabledString = valueOrDefault(process.env.DB_SCAN_ENABLED, "true")
    return {
        serviceEnv: process.env.ENV,
        env: process.env.NODE_ENV,
        node: node,
        supervisor: supervisorKeypair,
        contracts: contracts,
        grpc: grpc,
        http: http,
        ws: ws,
        db: db,
        queueDb: queueDb,
        giftAmount: Number(valueOrDefault(process.env.GIFT_AMOUNT, 0.3)),
        refundThreshold: Number(valueOrDefault(process.env.REFUND_THRESHOLD, 0.1)),
        contractCreateGasAmount: Number(valueOrDefault(process.env.CONTRACT_CREATE_GAS_AMOUNT, 50000)),
        contractCallGasAmount: Number(valueOrDefault(process.env.CONTRACT_CALL_GAS_AMOUNT, 10000)),
        dbScanEnabled: (dbScanEnabledString === "true"),
        dbScanPeriod: Number(valueOrDefault(process.env.DB_SCAN_PERIOD, 1)),
        dbScanOlderThan: Number(valueOrDefault(process.env.DB_SCAN_OLDER_THAN, 1)),
        numberOfConfirmations: Number(valueOrDefault(process.env.NUMBER_OF_CONFIRMATIONS, 1))
    }
}

function getNodeUrl() {
    if (process.env.NODE_URL !== undefined) { return process.env.NODE_URL }
    switch (process.env.NODE_ENV) {
        case Environment.LOCAL: return "http://localhost:3013/"
        case Environment.TESTNET: return "https://sdk-testnet.aepps.com/"
        case Environment.MAINNET: return "https://sdk-mainnet.aepps.com"
    }
}

function getNodeInternalUrl() {
    if (process.env.NODE_INTERNAL_URL !== undefined) { return process.env.NODE_INTERNAL_URL }
    switch (process.env.NODE_ENV) {
        case Environment.LOCAL: return "http://localhost:3113/"
        case Environment.TESTNET: return "https://sdk-testnet.aepps.com"
        case Environment.MAINNET: return "https://sdk-mainnet.aepps.com"
    }
}
 
function getCompilerUrl() {
    if (process.env.COMPILER_URL !== undefined) { return process.env.COMPILER_URL }
    switch (process.env.NODE_ENV) {
        case Environment.LOCAL: return "http://localhost:3080"
        case Environment.TESTNET: return "https://latest.compiler.aepps.com"
        case Environment.MAINNET: return "https://latest.compiler.aepps.com"
    }
}

function getNetworkId() {
    if (process.env.NETWORK_ID !== undefined) { return process.env.NETWORK_ID }
    switch (process.env.NODE_ENV) {
        case Environment.LOCAL: return "ae_docker"
        case Environment.TESTNET: return "ae_uat"
        case Environment.MAINNET: return "ae_mainnet"
    }
}

function getSupervisorKeypair() {
    let localKeypair = {
        publicKey: "ak_2mwRmUeYmfuW93ti9HMSUJzCk1EYcQEfikVSzgo6k2VghsWhgU",
        secretKey: "bb9f0b01c8c9553cfbaf7ef81a50f977b1326801ebf7294d1c2cbccdedf27476e9bbf604e611b5460a3b3999e9771b6f60417d73ce7c5519e12f7e127a1225ca"
    }
    let testnetKeypair = {
        publicKey: "ak_2rTfmU3BQHohJvLPoHzRKWijgqbFi4dwYmzVjyqgQrQAQmkhr6",
        secretKey: "2826a2b18d1bb2530341eb28e4e582613cd9d0687e7681c89a34159f39d554c3f40028b9aa6ee6fbcb53135799866edf08b8eb838fe9e56d9691d0963951358f"
    }
    if (process.env.SUPERVISOR_PUBLIC_KEY !== undefined && process.env.SUPERVISOR_PRIVATE_KEY !== undefined) {
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
    let nodeInstance = await Node({
        url: node.url,
        internalUrl: node.internalUrl
    })
    client = await Ae({
        nodes: [
            { name: "node", instance: nodeInstance } 
        ],
        compilerUrl: node.compilerUrl,
        accounts: [
            MemoryAccount({ keypair: supervisorKeypair })
        ],
        address: supervisorKeypair.publicKey,
        networkId: node.networkId
    })
    if (process.env.COOP_ADDRESS !== undefined && process.env.EUR_ADDRESS !== undefined) {
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
        logger.info(`Fetched Coop owner: ${coopOwner}`)
        logger.info(`Fetched EUR owner: ${eurOwner}`)
        return {
            coop: {
                address: process.env.COOP_ADDRESS,
                owner: async () => {
                    let result = await coopInstance.call('owner', [], { callStatic: true })
                    return result.decode()
                }
            },
            eur: {
                address: process.env.EUR_ADDRESS,
                owner: async () => {
                    let result = await eurInstance.call('owner', [], { callStatic: true })
                    return result.decode()
                }
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
 
        if (process.env.COOP_OWNER !== undefined) {
            logger.info(`Transferring Coop contract ownership to ${process.env.COOP_OWNER}`)
            await coopInstance.call('transfer_ownership', [process.env.COOP_OWNER])
            logger.info(`Ownership transferred.`)
        }

        if (process.env.EUR_OWNER !== undefined) {
            logger.info(`Transferring EUR contract ownership to ${process.env.EUR_OWNER}`)
            await eurInstance.call('transfer_ownership', [process.env.EUR_OWNER])
            logger.info(`Ownership transferred.`)
        }

        return {
            coop: {
                address: coop.address,
                owner: async () => {
                    let result = await coopInstance.call('owner', [], { callStatic: true })
                    return result.decode()
                }
            },
            eur: {
                address: eur.address,
                owner: async () => {
                    let result = await eurInstance.call('owner', [], { callStatic: true })
                    return result.decode()
                }
            }
        }
    }
}

function getGrpc() {
    if (process.env.GRPC_URL !== undefined) {
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
        port: Number(valueOrDefault(process.env.HTTP_PORT, 8124))
    }
}

function getWs() {
    return {
        port: Number(valueOrDefault(process.env.WS_PORT, 8125))
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
    var poolMax = Number(process.env.DB_MAX_POOL_SIZE) || 5
    var idleTimeoutMillis = 30000
    
    host = valueOrDefault(process.env.DB_HOST, "localhost")
    port = valueOrDefault(process.env.DB_PORT, "5432")

    switch (process.env.NODE_ENV) {
        case Environment.LOCAL:
            poolMin = 0
            idleTimeoutMillis = 500
            user = valueOrDefault(process.env.DB_USER, "ae_middleware_local")
            password = valueOrDefault(process.env.DB_PASSWORD, "password")
            database = valueOrDefault(process.env.DB_NAME, "ae_middleware_local")
            break
        case Environment.TESTNET:
            user = valueOrDefault(process.env.DB_USER, "ae_middleware_testnet")
            password = valueOrDefault(process.env.DB_PASSWORD, "password")
            database = valueOrDefault(process.env.DB_NAME, "ae_middleware_testnet")
            break
        case Environment.MAINNET:
            user = valueOrDefault(process.env.DB_USER, "ae_middleware_mainnet")
            password = valueOrDefault(process.env.DB_PASSWORD, "password")
            database = valueOrDefault(process.env.DB_NAME, "ae_middleware_mainnet")
            break
    }
    sslString = valueOrDefault(process.env.DB_SSL, "false")
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
    
    host = valueOrDefault(process.env.QUEUE_DB_HOST, "localhost")
    port = valueOrDefault(process.env.QUEUE_DB_PORT, "5432")

    switch (process.env.NODE_ENV) {
        case Environment.LOCAL:
            user = valueOrDefault(process.env.QUEUE_DB_USER, "ae_middleware_local_queue")
            password = valueOrDefault(process.env.QUEUE_DB_PASSWORD, "password")
            database = valueOrDefault(process.env.QUEUE_DB_NAME, "ae_middleware_local_queue")
            break
        case Environment.TESTNET:
            user = valueOrDefault(process.env.QUEUE_DB_USER, "ae_middleware_testnet_queue")
            password = valueOrDefault(process.env.QUEUE_DB_PASSWORD, "password")
            database = valueOrDefault(process.env.QUEUE_DB_NAME, "ae_middleware_testnet_queue")
            break
        case Environment.MAINNET:
            user = valueOrDefault(process.env.QUEUE_DB_USER, "ae_middleware_mainnet_queue")
            password = valueOrDefault(process.env.QUEUE_DB_PASSWORD, "password")
            database = valueOrDefault(process.env.QUEUE_DB_NAME, "ae_middleware_mainnet_queue")
            break
    }

    sslString = valueOrDefault(process.env.QUEUE_DB_SSL, "false")
    ssl = (sslString == "true")
    return {
        host: host,
        user: user,
        password: password,
        port: port,
        database: database,
        max: Number(valueOrDefault(process.env.QUEUE_DB_MAX_POOL_SIZE, 1)),
        ssl: ssl
    }
}

function valueOrDefault(value, defaultValue) {
    return (value !== undefined) ? value : defaultValue
}

module.exports = { get }