let path = require('path')

let { Environment, ServiceEnv } = require('../../enums/enums')

function get() {
    process.env.ENV = valueOrDefault(process.env.ENV, ServiceEnv.DEV)
    process.env.NODE_ENV = valueOrDefault(process.env.NODE_ENV, Environment.LOCAL)
    let node = {
        url: getNodeUrl(),
        internalUrl: getNodeInternalUrl(),
        compilerUrl: getCompilerUrl(),
        networkId: getNetworkId()
    }
    let deployer = getDeployer()
    let grpc = getGrpc()
    let amqp = valueOrDefault(process.env.AMQP_URL, 'amqp://user:password@localhost')
    let http = getHttp()
    let ws = getWs()
    let db = getDb()
    let redis = getRedis()
    let dbScanEnabledString = valueOrDefault(process.env.DB_SCAN_ENABLED, "true")
    let autoFundString = valueOrDefault(process.env.AUTO_FUND, "true")
    return {
        serviceEnv: process.env.ENV,
        env: process.env.NODE_ENV,
        node: node,
        deployer: deployer,
        grpc: grpc,
        amqp: amqp,
        http: http,
        ws: ws,
        db: db,
        redis: redis,
        autoFund: (autoFundString === "true"),
        refundThreshold: Number(valueOrDefault(process.env.REFUND_THRESHOLD, 0.1)),
        contractCreateGasAmount: Number(valueOrDefault(process.env.CONTRACT_CREATE_GAS_AMOUNT, 50000)),
        contractCallGasAmount: Number(valueOrDefault(process.env.CONTRACT_CALL_GAS_AMOUNT, 10000)),
        dbScanEnabled: (dbScanEnabledString === "true"),
        dbScanPeriod: Number(valueOrDefault(process.env.DB_SCAN_PERIOD, 1)),
        dbScanOlderThan: Number(valueOrDefault(process.env.DB_SCAN_OLDER_THAN, 1))
    }
}

function getNodeUrl() {
    if (process.env.NODE_URL !== undefined) { return process.env.NODE_URL }
    switch (process.env.NODE_ENV) {
        case Environment.LOCAL: return "http://localhost:3013/"
        case Environment.TESTNET: return "https://testnet.aeternity.io/"
        case Environment.MAINNET: return "https://mainnet.aeternity.io/"
    }
}

function getNodeInternalUrl() {
    if (process.env.NODE_INTERNAL_URL !== undefined) { return process.env.NODE_INTERNAL_URL }
    switch (process.env.NODE_ENV) {
        case Environment.LOCAL: return "http://localhost:3113/"
        case Environment.TESTNET: return "https://testnet.aeternity.io/"
        case Environment.MAINNET: return "https://mainnet.aeternity.io/"
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

function getDeployer() {
    let localKeypair = {
        publicKey: "ak_B9BENA4p6hxcfpmbBr8iJEcnQacPjcSwpT2C1n4XxSbKL7aWt",
        secretKey: "414833cf1f3b659af9c7509e58d8efdd55e189a058d9fe6c54d3c8029d2c0de51706bcc56c75cf55e0a3b25085bbdfc928bc893fc2972393c76e40bbfe8f9480"
    }
    let testnetKeypair = {
        publicKey: "ak_B9BENA4p6hxcfpmbBr8iJEcnQacPjcSwpT2C1n4XxSbKL7aWt",
        secretKey: "414833cf1f3b659af9c7509e58d8efdd55e189a058d9fe6c54d3c8029d2c0de51706bcc56c75cf55e0a3b25085bbdfc928bc893fc2972393c76e40bbfe8f9480"
    }
    if (process.env.COOP_DEPLOYER_PUBLIC_KEY !== undefined && process.env.COOP_DEPLOYER_PRIVATE_KEY !== undefined) {
        return {
            publicKey: process.env.COOP_DEPLOYER_PUBLIC_KEY,
            secretKey: process.env.COOP_DEPLOYER_PRIVATE_KEY
        }
    }
    switch (process.env.NODE_ENV) {
        case Environment.LOCAL: return localKeypair
        case Environment.TESTNET: return testnetKeypair
        case Environment.MAINNET: throw new Error("When deploying to mainnet, coop deployer keypair should be provided as environment vars!")
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

function getRedis() {
    return {
        host: valueOrDefault(process.env.REDIS_HOST, '127.0.0.1'),
        port: Number(valueOrDefault(process.env.REDIS_PORT, 6379)),
        cacheTimeoutSeconds: Number(valueOrDefault(process.env.CACHE_TIMEOUT_SECONDS, 180))
    }
}

function valueOrDefault(value, defaultValue) {
    return (value !== undefined) ? value : defaultValue
}

module.exports = { get }
