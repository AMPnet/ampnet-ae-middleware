let path = require('path')
let protoLoader = require('@grpc/proto-loader')
let grpc = require('grpc')

let config = require('../../env.json')[process.env.NODE_ENV || 'development']

let client

module.exports = {
    start: async function() {
        let protoPath = path.resolve(__dirname, '../../proto/blockchain-service.proto');
        let protoDefinition = protoLoader.loadSync(protoPath);
        let packageDefinition = grpc.loadPackageDefinition(protoDefinition).com.ampnet.crowdfunding.proto;
        client = await new packageDefinition.BlockchainService(config.grpc.url, grpc.credentials.createInsecure());
        return client
    },
    generateAddWalletTx: async function(from, wallet) {
        return new Promise(resolve => {
            client.generateAddWalletTx({
                from: from,
                wallet: wallet
            }, (err, result) => {
                if (err != null) {
                    throw new Error(err)
                } else {
                    resolve(result)
                }
            })
        })
    },
    isWalletActive: async function(walletTxHash) {
        return new Promise(resolve => {
            client.isWalletActive({
                walletTxHash: walletTxHash
            }, (err, result) => {
                if (err != null) {
                    console.log("err", err)
                    throw new Error(err)
                } else {
                    resolve(result)
                }
            })
        })
    },
    postTransaction: async function(data, txType) {
        return new Promise(resolve => {
            client.postTransaction({
                data: data,
                txType: txType
            }, (err, result) => {
                if (err != null) {
                    throw new Error(err)
                } else {
                    resolve(result)
                }
            })
        })
    }
}