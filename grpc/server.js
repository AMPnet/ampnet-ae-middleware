// requirements
let path = require('path')
let protoLoader = require('@grpc/proto-loader')
let grpc = require('grpc-middleware')
let { v4: uuid } = require('uuid')
let interceptors = require('@hpidcock/node-grpc-interceptors')
let ServiceEnv = require('../enums/enums').ServiceEnv

// initialize global namespace
let namespace = require('../cls')

// config
let config = require('../config')
let logger = require('../logger')(module)

// http server
let httpServer = require('../http/server')

// ws server
let wsServer = require('../ws/server')

// supervisor job queue
let queue = require('../queue/queue')
let cron = require('../supervisor')

// services
let txSvc = require('../service/transaction')
let coopSvc = require('../service/coop')
let eurSvc = require('../service/eur')
let orgSvc = require('../service/org')
let projSvc = require('../service/project')
let sellOfferSvc = require('../service/selloffer')

// repository
let repo = require('../persistence/repository')

// client
let client = require('../ae/client')

// cache
let cache = require('../cache/redis')

// contracts
let contracts = require('../ae/contracts')

// grpc service definition
let protoDefinition = protoLoader.loadSync(path.resolve(__dirname, '../proto/blockchain_service.proto'))
let packageDefinition = grpc.loadPackageDefinition(protoDefinition).com.ampnet.crowdfunding.proto

// holds running grpc server instance
let grpcServer

module.exports = {
    start: async function(envOverrides, checkDbConsistency = true) {
        // Initialize namespace
        namespace.create()
        logger.info('Namespace initialized.')

        // Load ENV overrides if any
        if (typeof envOverrides !== 'undefined') {
            logger.info('Parsing ENV overrides.')
            for (const k in envOverrides) {
                process.env[k] = envOverrides[k]
                logger.info(`${k}=${envOverrides[k]}`)
            }
            logger.info('ENV overrides loaded.')
        } else {
            logger.info('No ENV overrides detected.')
        }

        // Initialize config
        await config.init()
        if (config.get().serviceEnv != ServiceEnv.PROD) {
            logger.info('Config initialized: \n%o', config.get())
        }

        // Initialize database and run migrations
        repo.init()
        logger.info('Repository initialized.')
        await repo.runMigrations()
        logger.info('Migrations processed.')

        // Initiallize Aeternity client
        await client.init()
        logger.info('Aeternity client initialized.')
        await contracts.compile()
        logger.info('Contracts compiled.')

        // Initialize queue
        await queue.init()
        logger.info('Queue initialized and started.')

        // Initialize Grpc server
        grpcServer = interceptors.serverProxy(new grpc.Server())
        grpcServer.use((context, next) => {
            namespace.run(() => {
                namespace.setTraceID(uuid())
                next()
            })
        })

        // gRPC services
        grpcServer.addService(packageDefinition.BlockchainService.service, {
            generateAddWalletTx: coopSvc.addWallet,
            isWalletActive: coopSvc.walletActive,
            generateMintTx: eurSvc.mint,
            generateBurnFromTx: eurSvc.burnFrom,
            generateApproveWithdrawTx: eurSvc.approveWithdraw,
            getBalance: eurSvc.balance,
            generateCreateOrganizationTx: orgSvc.createOrganization,
            generateCreateProjectTx: projSvc.createProject,
            generateInvestTx: eurSvc.invest,
            generateStartRevenueSharesPayoutTx: projSvc.startRevenueSharesPayout,
            postTransaction: txSvc.postTransactionGrpc,
            getTransactionInfo: txSvc.getTransactionInfo,
            getPortfolio: txSvc.getPortfolio,
            getTransactions: txSvc.getTransactions,
            getInvestmentsInProject: txSvc.getInvestmentsInProject,
            generateCancelInvestmentTx: projSvc.cancelInvestment,
            generateApproveProjectWithdrawTx: projSvc.approveWithdraw,
            getPlatformManager: coopSvc.getPlatformManager,
            getTokenIssuer: eurSvc.getTokenIssuer,
            generateTransferPlatformManagerOwnershipTx: coopSvc.transferOwnership,
            generateTransferTokenIssuerOwnershipTx: eurSvc.transferOwnership,
            getActiveSellOffers: sellOfferSvc.getActiveSellOffers,
            createCooperative: coopSvc.createCooperative,
        });

        // Bind GRPC server
        grpcServer.bind(config.get().grpc.url, grpc.ServerCredentials.createInsecure());
        await grpcServer.start()
        logger.info(`GRPC server started at ${config.get().grpc.url}`)

        // Bind HTTP server
        let server = await httpServer.start(config.get())

        // Bind WS server
        wsServer.start(server)

        // Start db consistency cronjob
        cron.start()

        // Initialize Redis cache
        cache.init()
    },
    stop: async function() {
        cron.stop()
        await httpServer.stop()
        await wsServer.stop()
        await queue.stop()
        await cache.stop()
        return grpcServer.forceShutdown()
    }
}
