// requirements
let path = require('path')
let protoLoader = require('@grpc/proto-loader')
let grpc = require('grpc-middleware')
let express = require('express')
let actuator = require('express-actuator')
let prometheus = require('prom-client')
let uuid = require('uuid/v4')
let interceptors = require('@hpidcock/node-grpc-interceptors')

// initialize global namespace
let namespace = require('../cls')

// config
let config = require('../config')
let logger = require('../logger')(module)

// supervisor job queue
let supervisorQueue = require('../supervisor')

// services
let txSvc = require('../service/transaction')
let coopSvc = require('../service/coop')
let eurSvc = require('../service/eur')
let orgSvc = require('../service/org')
let projSvc = require('../service/project')

// repository
let repo = require('../persistence/repository')

// client
let client = require('../ae/client')

// contracts
let contracts = require('../ae/contracts')

// grpc service definition
let protoDefinition = protoLoader.loadSync(path.resolve(__dirname, '../proto/blockchain_service.proto'))
let packageDefinition = grpc.loadPackageDefinition(protoDefinition).com.ampnet.crowdfunding.proto

// holds running grpc server instance
let grpcServer
let httpServer

module.exports = {
    start: async function() {
        // Initialize namespace
        namespace.create()
        logger.info('Namespace initialized.')

        // Initialize config
        await config.init()
        logger.info('Config initialized: \n%o', config.get())

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

        // Initialize supervisor job queue
        await supervisorQueue.initAndStart({
            user: 'ae_middleware_local',
            password: 'password',
            database: 'ae_middleware_local_queue',
            host: 'localhost',
            port: '5432'
        })
        logger.info('Supervisor job queue initialized and started.')

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
            postTransaction: txSvc.postTransaction,
            getTransactionInfo: txSvc.getTransactionInfo,
            getPortfolio: txSvc.getPortfolio,
            getTransactions: txSvc.getTransactions,
            getProjectsInfo: projSvc.getInfo,
            getInvestmentsInProject: txSvc.getInvestmentsInProject
        });

        grpcServer.bind(config.get().grpc.url, grpc.ServerCredentials.createInsecure());
        await grpcServer.start()
        logger.info(`GRPC server started at ${config.get().grpc.url}`)

        let expr = express()
        expr.use(actuator())
        expr.get('/prometheus', (req, res) => {
            res.set('Content-Type', prometheus.register.contentType)
            res.end(prometheus.register.metrics())
        })
        prometheus.collectDefaultMetrics()
        httpServer = expr.listen(config.get().http.port)
        logger.info(`HTTP server started at port ${config.get().http.port}`)
        logger.info(`Prometheus metrics available at /prometheus`)
        logger.info(`Health info and basic metrics available at /info and /metrics`)
    },
    stop: async function() {
        await httpServer.close()
        return grpcServer.forceShutdown()
    }
}
