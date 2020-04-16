let url = require('url')

let { Universal: Ae, Node, MemoryAccount } = require('@aeternity/aepp-sdk')
let config = require('../../config')
let accounts = require('./accounts')

let ownerClient
let bobClient
let aliceClient
let janeClient
let emptyClient

async function init() {
    let node = await Node({
        url: config.get().node.url,
        internalUrl: config.get().node.internalUrl
    })

    ownerClient = await Ae({
        nodes: [
            { name: "node", instance: node } 
        ],
        compilerUrl: config.get().node.compilerUrl,
        accounts: [
            MemoryAccount({ keypair: accounts.owner })
        ],
        address: accounts.owner.publicKey,
        networkId: config.get().node.networkId
    })

    bobClient = await Ae({
        nodes: [
            { name: "node", instance: node } 
        ],
        compilerUrl: config.get().node.compilerUrl,
        accounts: [
            MemoryAccount({ keypair: accounts.bob })
        ],
        address: accounts.bob.publicKey,
        networkId: config.get().node.networkId
    })

    aliceClient = await Ae({
        nodes: [
            { name: "node", instance: node } 
        ],
        compilerUrl: config.get().node.compilerUrl,
        accounts: [
            MemoryAccount({ keypair: accounts.alice })
        ],
        address: accounts.alice.publicKey,
        networkId: config.get().node.networkId
    })

    janeClient = await Ae({
        nodes: [
            { name: "node", instance: node } 
        ],
        compilerUrl: config.get().node.compilerUrl,
        accounts: [
            MemoryAccount({ keypair: accounts.jane })
        ],
        address: accounts.jane.publicKey,
        networkId: config.get().node.networkId
    })

    emptyClient = await Ae({
        nodes: [
            { name: "node", instance: node } 
        ],
        compilerUrl: config.get().node.compilerUrl,
        accounts: [
            MemoryAccount({ keypair: accounts.empty })
        ],
        address: accounts.empty.publicKey,
        networkId: config.get().node.networkId
    })
}

module.exports = {
    init,
    owner: function() { return ownerClient },
    bob: function() { return bobClient },
    alice: function() { return aliceClient },
    jane: function() { return janeClient },
    empty: function() { return emptyClient }
}