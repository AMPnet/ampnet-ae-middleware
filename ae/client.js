let { Transaction, MemoryAccount, ChainNode, ContractCompilerAPI, Contract, Universal, Node, Crypto } = require('@aeternity/aepp-sdk')

let config = require('../config')

async function init() {
    let ContractWithAE = await Contract
        .compose(ContractCompilerAPI)
        .compose(Transaction, MemoryAccount, ChainNode)

    aeNode = await Node({
        url: config.get().node.url,
        internalUrl: config.get().node.internalUrl
    })

    aeChainNode = await ChainNode({
        nodes: [{ name: "node", instance: aeNode }]
    })

    let instanceKeypair = Crypto.generateKeyPair()
    aeInstance = await ContractWithAE({
        nodes: [
            { name: "node", instance: aeNode } 
        ],
        keypair: instanceKeypair,
        compilerUrl: config.get().node.compilerUrl,
        accounts: [
            MemoryAccount({ keypair: instanceKeypair })
        ],
        address: instanceKeypair.publicKey,
        networkId: config.get().networkId
    })
    
    deployerInstance = await Universal({
        nodes: [
            { name: "node", instance: aeNode } 
        ],
        compilerUrl: config.get().node.compilerUrl,
        accounts: [
            MemoryAccount({ keypair: config.get().deployer })
        ],
        address: config.get().deployer.publicKey,
        networkId: config.get().networkId
    })
}

function instance() {
    return aeInstance
}

function deployer() {
    return deployerInstance
}

function node() {
    return aeNode
}

function chainNode() {
    return aeChainNode
}

module.exports = {
    init,
    instance,
    deployer,
    node,
    chainNode
}