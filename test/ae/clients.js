let url = require('url')

let { Universal: Ae } = require('@aeternity/aepp-sdk')
let config = require('../../config')
let accounts = require('./accounts')

let ownerClient
let bobClient
let aliceClient
let emptyClient

async function init() {
    ownerClient = await Ae({
        url: config.get().node.url,
        internalUrl: config.get().node.internalUrl,
        keypair: accounts.owner,
        networkId: config.get().node.networkId,
        compilerUrl: config.get().node.compilerUrl
    })

    bobClient = await Ae({
        url: config.get().node.url,
        internalUrl: config.get().node.internalUrl,
        keypair: accounts.bob,
        networkId: config.get().node.networkId,
        compilerUrl: config.get().node.compilerUrl
    })

    aliceClient = await Ae({
        url: config.get().node.url,
        internalUrl: config.get().node.internalUrl,
        keypair: accounts.alice,
        networkId: config.get().node.networkId,
        compilerUrl: config.get().node.compilerUrl
    })

    emptyClient = await Ae({
        url: config.get().node.url,
        internalUrl: config.get().node.internalUrl,
        keypair: accounts.empty,
        networkId: config.get().node.networkId,
        compilerUrl: config.get().node.compilerUrl
    })
}

module.exports = {
    init,
    owner: function() { return ownerClient },
    bob: function() { return bobClient },
    alice: function() { return aliceClient },
    empty: function() { return emptyClient }
}