let WebSocket = require('ws')
let { Crypto } = require('@aeternity/aepp-sdk')
let { v4: uuid } = require('uuid')

let logger = require('../logger')(module)
let util = require('../ae/util')

let ws
let subscriptions = {}

async function start(server) {
    ws = new WebSocket.Server({ server })

    ws.on('connection', (socket) => {
        socket.id = uuid()
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
            addNewSubscriber(socket, wallet)
        })

    })
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

module.exports = { start, notifySubscribersForTransaction }