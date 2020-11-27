let WebSocket = require('ws')
let { Crypto } = require('@aeternity/aepp-sdk')
let { v4: uuid } = require('uuid')

let logger = require('../logger')(module)
let util = require('../ae/util')
let config = require('../config')

let ws
let subscriptions = {}
let connections = {}

async function start(server) {
    let port = config.get().ws.port 
    ws = new WebSocket.Server({
        server: server,
        path: "/ws",
        port: port
    })
    logger.info(`WS server started at port ${port}`)

    ws.on('connection', (socket) => {
        socket.id = uuid()
        logger.info(`WS: Connection opened. ID: ${socket.id}`)
        socket.on('message', (data) => {
            let json
            
            try {
                json = JSON.parse(data)
            } catch(e) {
                logger.error(`WS: Could not parse received message to json: ${data}`)
                return
            }

            if (json.wallet === undefined) {
                logger.error(`WS: Expected wallet field in received json message: %o`, json)
                return
            }
            
            let wallet = util.enforceAkPrefix(json.wallet)

            if (!Crypto.isAddressValid(wallet)) {
                logger.error(`WS: Invalid wallet format provided in received json message: %o`, json)
                return
            }

            logger.info(`WS: Subscribing to transaction updates for wallet ${wallet}`)
            addNewConnection(socket, wallet)
            addNewSubscriber(socket, wallet)
        })
        socket.on('close', (e) => {
            let wallets = connections[socket.id] || []
            logger.info(`WS: Closing connection ${socket.id}. Connection tracks wallets: ${wallets}`)
            for (wallet of wallets) {
                let subs = subscriptions[wallet] || []
                subscriptions[wallet] = subs.filter(c => c.id !== socket.id)
                logger.info(`WS: Removing subscription for wallet ${wallet} and connection ${socket.id}`)
            }
            connections[socket.id] = undefined
            logger.info(`WS: Removed connection ${socket.id}`)
        })
    })
}

function addNewConnection(connection, wallet) {
    connections[connection.id] = connections[connection.id] || []
    if (!connections[connection.id].includes(wallet)) {
        connections[connection.id].push(wallet)
        logger.info(`WS: Added new connection with id: ${connection.id}. Connection tracks wallet ${wallet}`)
    }
}

function addNewSubscriber(connection, wallet) {
    subscriptions[wallet] = subscriptions[wallet] || []
    for (subscription of subscriptions[wallet]) {
        if (subscription.id === connection.id) {
            logger.info(`WS: Connection already subscribed to changes for wallet ${wallet}. Ignoring request.`)
            return
        }
    }
    subscriptions[wallet].push(connection)
    logger.info(`WS: Added new subscriber for transaction changes on wallet ${wallet}`)
}

function notifySubscribersForTransaction(tx) {
    notifiySubscribers(tx.from_wallet)
    notifiySubscribers(tx.to_wallet)
}

function notifiySubscribers(wallet) {
    let subscribers = subscriptions[wallet] || []
    let count = subscribers.length
    if (count > 0) {
        let i = count
        logger.info(`WS: Notifiyng total of ${count} subscriber(s) for a change on wallet ${wallet}`)
        while (i--) {
            let connection = subscribers[i]
            if (connection.readyState === WebSocket.CLOSED) {
                logger.info(`WS: Removing subscriber listening on changes for wallet ${wallet}`)
                subscribers.splice(i, 1)
            } else {
                logger.info(`WS: Notifying subscriber for change on wallet ${wallet}`)
                connection.send(JSON.stringify({
                    wallet: wallet
                }))
            }
            logger.info(`WS: Total of ${(subscriptions[wallet] || []).length} still listening on changes for wallet ${wallet}`)
        }
    }
}

async function stop() {
    return ws.close()
}

module.exports = { start, stop, notifySubscribersForTransaction, notifiySubscribers }