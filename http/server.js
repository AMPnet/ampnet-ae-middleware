let express = require('express')
let cors = require('cors')
let actuator = require('express-actuator')
let prometheus = require('prom-client')

let projSvc = require('../service/project')
let platformSvc = require('../service/platform')
let logger = require('../logger')(module)

var expr;
var httpServer;

async function start(config) {
    expr = express()

    configureCors()
    configureHealthAndMetrics()
    addInvestmentCancelableRoute()
    addPlatformSummaryRoute()
    
    await startServer(config)
}

async function stop() {
    return httpServer.close()
}

function configureCors() {
    expr.use(cors())
}

function addInvestmentCancelableRoute() {
    expr.get('/projects/:projectHash/investors/:investorHash/cancelable', async (req, res) => {
        let result = await projSvc.canCancelInvestment(req.params.projectHash, req.params.investorHash)
        let response = {
            can_cancel: result
        }
        res.writeHead(200, { "Content-Type" : "application/json" })
        res.write(JSON.stringify(response))
        res.end()
    })
}

function addPlatformSummaryRoute() {
    expr.get('/summary', async (req, res) => {
        let result = await platformSvc.getSummary()
        res.json(result)
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