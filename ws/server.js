let WebSocket = require('ws')
let logger = require('../logger')(module)
let { Crypto } = require('@aeternity/aepp-sdk')
let util = require('../ae/util')

let ws
let subscriptions = {}

async function start(server) {
    ws = new WebSocket.Server({ server })

    ws.on('connection', (socket) => {

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
    subscriptions[wallet].push(connection)
}

function notifiySubscribers(wallet) {
    let subscribers = subscriptions[wallet] || []
    let count = subscribers.length
    if (count > 0) {
        let i = count
        while (i--) {
            let connection = subscribers[i]
            if (connection.readyState === WebSocket.CLOSED) {
                subscribers.splice(i, 1)
            } else {
                connection.send(JSON.stringify({
                    wallet: wallet
                }))
            }
        }
    }
}

module.exports = { start, notifiySubscribers }