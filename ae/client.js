let url = require('url')
let { Transaction, MemoryAccount, ChainNode, ContractCompilerAPI, Contract, Universal } = require('@aeternity/aepp-sdk')

let config = require('../config')

async function init() {
    let ContractWithAE = await Contract
        .compose(ContractCompilerAPI)
        .compose(Transaction, MemoryAccount, ChainNode)

    aeInstance = await ContractWithAE({
        url: config.get().node.url,
        internalUrl: config.get().node.internalUrl,
        keypair: config.get().supervisor,
        compilerUrl: config.get().node.compilerUrl,
        networkId: config.get().networkId
    })

    aeSender = await Universal({
        url: config.get().node.url,
        internalUrl: config.get().node.internalUrl,
        keypair: config.get().supervisor,
        compilerUrl: config.get().node.compilerUrl,
        networkId: config.get().networkId
    })
}

function instance() {
    return aeInstance
}

function sender() {
    return aeSender
}

module.exports = {
    init,
    instance,
    sender
}