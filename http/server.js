let express = require('express')
let cors = require('cors')
let actuator = require('express-actuator')
let prometheus = require('prom-client')

let projSvc = require('../service/project')
let platformSvc = require('../service/platform')
let eurSvc = require('../service/eur')
let sellOfferSvc = require('../service/selloffer')
let logger = require('../logger')(module)
let err = require('../error/errors')

var expr;
var httpServer;

async function start(config) {
    expr = express()

    configureCors()
    configureHealthAndMetrics()
    addInvestmentCancelableRoute()
    addPlatformSummaryRoute()
    addGetBalanceRoute()

    addCreateSellOfferRoute()
    addActivateSellOfferRoute()
    addAcceptSellOfferRoute()
    addAcceptCounterOfferRoute()
    
    await startServer(config)
}

async function stop() {
    return httpServer.close()
}

function configureCors() {
    expr.use(cors())
}

function addGetBalanceRoute() {
    expr.get('/wallet/:walletHash/balance', async (req, res) => {
        eurSvc.getBalance(req.params.walletHash)
            .then((result) => {
                res.json({
                    wallet_hash: req.params.walletHash,
                    balance: result
                })
            })
            .catch((reason) => {
                console.log("Could not resolve getBalance", reason)
                res.status(404).json(reason)
            })
    })
}

function addInvestmentCancelableRoute() {
    expr.get('/projects/:projectHash/investors/:investorHash/cancelable', async (req, res) => {
        projSvc.canCancelInvestment(req.params.projectHash, req.params.investorHash)
            .then(result => {
                let response = {
                    can_cancel: result
                }
                res.writeHead(200, { "Content-Type" : "application/json" })
                res.write(JSON.stringify(response))
                res.end()
            })
            .catch(reason => {
                console.log("Could not resolve canCancelInvestment", reason)
                res.status(404).send(reason)
            })
    })
}

function addPlatformSummaryRoute() {
    expr.get('/summary', async (req, res) => {
        let result = await platformSvc.getSummary()
        res.json(result)
    })
}

function addCreateSellOfferRoute() {
    expr.get('/market/create-offer', async (req, res) => {
        sellOfferSvc.createSellOffer(
            req.params.fromTxHash,
            req.params.projectTxHash,
            req.params.shares,
            req.params.price
        ).then(tx => {
            res.json({
                tx: tx
            })
        }).catch(error => {
            err.handle(error, function(msg, result) {
                res.status(404).send(msg)
            })
        })
    })
}

function addActivateSellOfferRoute() {
    expr.get('/market/activate-offer', async (req, res) => {
        projSvc.activateSellOffer(
            req.params.fromTxHash,
            req.params.sellOfferTxHash
        ).then(tx => {
            res.json({
                tx: tx
            })
        }).catch(error => {
            err.handle(error, function(msg, result) {
                res.status(404).send(msg)
            })
        })
    })
}

function addAcceptSellOfferRoute() {
    expr.get('/market/accept-sell-offer', async (req, res) => {
        eurSvc.acceptSellOffer(
            req.params.fromTxHash,
            req.params.sellOfferTxHash,
            req.params.counterOfferPrice
        ).then(tx => {
            res.json({
                tx: tx
            })
        }).catch(error => {
            err.handle(error, function(msg, result) {
                res.status(404).send(msg)
            })
        })
    })  
}

function addAcceptCounterOfferRoute() {
    expr.get('/market/accept-counter-offer', async (req, res) => {
        sellOfferSvc.acceptCounterOffer(
            req.params.fromTxHash,
            req.params.sellOfferTxHash,
            req.params.buyerWallet
        ).then(tx => {
            res.json({
                tx: tx
            })
        }).catch(error => {
            err.handle(error, function(msg, result) {
                res.status(404).send(msg)
            })
        })
    })
}

function configureHealthAndMetrics() {
    expr.use(actuator())
    logger.info(`Health info and basic metrics available at /info and /metrics`)
    
    prometheus.collectDefaultMetrics()
    expr.get('/prometheus', (req, res) => {
        res.set('Content-Type', prometheus.register.contentType)
        res.end(prometheus.register.metrics())
    })
}

async function startServer(config) {
    httpServer = await expr.listen(config.http.port)
    logger.info(`HTTP server started at port ${config.http.port}`)
}

module.exports = { start, stop }