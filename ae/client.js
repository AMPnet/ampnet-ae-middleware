let url = require('url')
let { Transaction, MemoryAccount, ChainNode, ContractCompilerAPI, Contract, Universal, Node } = require('@aeternity/aepp-sdk')

let config = require('../config')

async function init() {
    let node = await Node({
        url: config.get().node.url,
        internalUrl: config.get().node.internalUrl
    })
    let ContractWithAE = await Contract
        .compose(ContractCompilerAPI)
        .compose(Transaction, MemoryAccount, ChainNode)
    
    aeInstance = await ContractWithAE({
        nodes: [
            { name: "node", instance: node } 
        ],
        compilerUrl: config.get().node.compilerUrl,
        keypair: config.get().supervisor,
        accounts: [
            MemoryAccount({ keypair: config.get().supervisor })
        ],
        address: config.get().supervisor.publicKey,
        networkId: config.get().networkId
    })

    aeSender = await Universal({
        nodes: [
            { name: "node", instance: node } 
        ],
        compilerUrl: config.get().node.compilerUrl,
        accounts: [
            MemoryAccount({ keypair: config.get().supervisor })
        ],
        address: config.get().supervisor.publicKey,
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