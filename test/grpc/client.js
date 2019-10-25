let path = require('path')
let protoLoader = require('@grpc/proto-loader')
let grpc = require('grpc')

let config = require('../../config')

module.exports = {
    start: async function() {
        let protoPath = path.resolve(__dirname, '../../proto/blockchain_service.proto');
        let protoDefinition = protoLoader.loadSync(protoPath);
        let packageDefinition = grpc.loadPackageDefinition(protoDefinition).com.ampnet.crowdfunding.proto;
        client = await new packageDefinition.BlockchainService(config.get().grpc.url, grpc.credentials.createInsecure());
        return client
    },
    generateAddWalletTx: async function(wallet) {
        return new Promise(resolve => {
            client.generateAddWalletTx({
                wallet: wallet
            }, (err, result) => {
                if (err != null) {
                    resolve(err)
                } else {
                    resolve(result.tx)
                }
            })
        })
    },
    generateCreateOrganizationTx: async function(fromTxHash) {
        return new Promise(resolve => {
            client.generateCreateOrganizationTx({
                fromTxHash: fromTxHash
            }, (err, result) => {
                if (err != null) {
                    resolve(err)
                } else {
                    resolve(result.tx)
                }
            })
        })
    },
    generateMintTx: async function(toTxHash, amount) {
        return new Promise(resolve => {
            client.generateMintTx({
                toTxHash: toTxHash,
                amount: amount
            }, (err, result) => {
                if (err != null) {
                    resolve(err)
                } else {
                    resolve(result.tx)
                }
            })
        })
    },
    generateApproveWithdrawTx: async function(fromTxHash, amount) {
        return new Promise(resolve => {
            client.generateApproveWithdrawTx({
                fromTxHash: fromTxHash,
                amount: amount
            }, (err, result) => {
                if (err != null) {
                    resolve(err)
                } else {
                    resolve(result.tx)
                }
            })
        })
    },
    generateBurnFromTx: async function(burnFromTxHash) {
        return new Promise(resolve => {
            client.generateBurnFromTx({
                burnFromTxHash: burnFromTxHash
            }, (err, result) => {
                if (err != null) {
                    resolve(err)
                } else {
                    resolve(result.tx)
                }
            })
        })
    },
    generateInvestTx: async function(fromTxHash, projectTxHash, amount) {
        return new Promise(resolve => {
            client.generateInvestTx({
                fromTxHash: fromTxHash,
                projectTxHash: projectTxHash,
                amount: amount
            }, (err, result) => {
                if (err != null) {
                    resolve(err)
                } else {
                    resolve(result.tx)
                }
            })
        })
    },
    getBalance: async function(walletTxHash) {
        return new Promise(resolve => {
            client.getBalance({
                walletTxHash: walletTxHash
            }, (err, result) => {
                if (err != null) {
                    resolve(err)
                } else {
                    resolve(Number(result.balance))
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
                    resolve(err)
                } else {
                    resolve(result.active)
                }
            })
        })
    },
    generateCreateProjectTx: async function(fromTxHash, orgTxHash, minInvestment, maxInvestment, investmentCap, endsAt) {
        return new Promise(resolve => {
            client.generateCreateProjectTx({
                fromTxHash: fromTxHash,
                organizationTxHash: orgTxHash,
                maxInvestmentPerUser: maxInvestment,
                minInvestmentPerUser: minInvestment,
                investmentCap: investmentCap,
                endInvestmentTime: endsAt
            }, (err, result) => {
                if (err != null) {
                    console.log("err", err)
                    resolve(err)
                } else {
                    resolve(result.tx)
                }
            })
        })
    },
    generateStartRevenueSharesPayoutTx: async function(fromTxHash, projectTxHash, revenue) {
        return new Promise(resolve => {
            client.generateStartRevenueSharesPayoutTx({
                fromTxHash,
                projectTxHash,
                revenue
            }, (err, result) => {
                if (err != null) {
                    resolve(err)
                } else {
                    resolve(result.tx)
                }
            })
        })
    },
    postTransaction: async function(data) {
        return new Promise(resolve => {
            client.postTransaction({
                data: data
            }, (err, result) => {
                if (err != null) {
                    resolve(err)
                } else {
                    resolve(result.txHash)
                }
            })
        })
    },
    getTransactionInfo: async function(txHash) {
        return new Promise(resolve => {
            client.getTransactionInfo({
                txHash
            }, (err, result) => {
                if (err != null) {
                    resolve(err)
                } else {
                    resolve(result)
                }
            })
        })
    },
    getPortfolio: async function(txHash) {
        return new Promise(resolve => {
            client.getPortfolio({
                txHash: txHash
            }, (err, result) => {
                if (err != null) {
                    resolve(err)
                } else {
                    resolve(result.portfolio)
                }
            })
        })
    },
    getTransactions: async function(txHash) {
        return new Promise(resolve => {
            client.getTransactions({
                txHash: txHash
            }, (err, result) => {
                if (err != null) {
                    resolve(err)
                } else {
                    resolve(result.transactions)
                }
            })
        })
    },
    getProjectsInfo: async function(txHashes) {
        return new Promise(resolve => {
            client.getProjectsInfo({
                projectTxHashes: txHashes
            }, (err, result) => {
                if (err != null) {
                    resolve(err)
                } else {
                    resolve(result.projects)
                }
            })
        })
    },
    getInvestmentsInProject: async function(fromTxHash, projectTxHash) {
        return new Promise(resolve => {
            client.getInvestmentsInProject({
                fromTxHash: fromTxHash,
                projectTxHash: projectTxHash
            }, (err, result) => {
                if (err != null) {
                    resolve(err)
                } else {
                    resolve(result.transactions)
                }
            })
        })
    }
}