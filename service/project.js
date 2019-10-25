let client = require('../ae/client')
let codec = require('../ae/codec')
let contracts = require('../ae/contracts')
let repo = require('../persistence/repository')
let util = require('../ae/util')
let err = require('../error/errors')
let functions = require('../enums/enums').functions
let logger = require('../logger')(module)

async function createProject(call, callback) {
    logger.debug(`Received request to generate createProject transaction.\Caller: ${call.request.fromTxHash}`)
    try {
        let fromWallet = (await repo.findByHashOrThrow(call.request.fromTxHash)).wallet
        logger.debug(`Caller address represented by given hash: ${fromWallet}`)
        let orgContract = util.enforceCtPrefix(
            (await repo.findByHashOrThrow(call.request.organizationTxHash)).wallet
        )
        logger.debug(`Address of organization which controls this project: ${orgContract}`)
        let callData = await codec.proj.encodeCreateProject(
            orgContract,
            util.eurToToken(call.request.minInvestmentPerUser),
            util.eurToToken(call.request.maxInvestmentPerUser),
            util.eurToToken(call.request.investmentCap),
            call.request.endInvestmentTime
        )
        let result = await client.instance().contractCreateTx({
            ownerId: fromWallet,
            code: contracts.getProjCompiled().bytecode,
            abiVersion: 3,
            deposit: 0,
            amount: 0,
            gas: 50000,
            callData: callData
        })
        logger.debug(`Successfully generated createProject transaction!`)
        callback(null, { tx: result.tx })
    } catch (error) {
        logger.error(`Error generating createProject transaction \n%o`, error)
        err.handle(error, callback)
    }
}

async function startRevenueSharesPayout(call, callback) {
    try {
        logger.debug(`Received request to generate startRevenueSharesPayout transaction.\Caller: ${call.request.fromTxHash} wants to payout ${call.request.revenue} tokens to project with hash ${call.request.projectTxHash}`)
        let fromWallet = (await repo.findByHashOrThrow(call.request.fromTxHash)).wallet
        logger.debug(`Caller wallet: ${fromWallet}`)
        let revenue = util.eurToToken(call.request.revenue)
        logger.debug(`Revenue: ${revenue}`)
        let projectWallet = (await repo.findByHashOrThrow(call.request.projectTxHash)).wallet
        logger.debug(`Project: ${projectWallet}`)
        let callData = await codec.proj.encodeStartRevenueSharesPayout(revenue)
        let tx = await client.instance().contractCallTx({
            callerId: fromWallet,
            contractId: util.enforceCtPrefix(projectWallet),
            amount: 0,
            gas: 10000,
            callData: callData
        })
        logger.debug(`Successfully generated startRevenueSharesPayout transaction: ${tx}`)
        callback(null, { tx: tx })
    } catch(error) {
        logger.error(`Error while generating startRevenueSharesPayout transaction \n%o`, error)
        err.handle(error, callback)
    }
}

async function getInfo(call, callback) {
    try {
        logger.debug(`Received request to fetch statuses for projects: ${call.request.projectTxHashes}`)
        let walletToHashMap = new Map()
        let projectWallets = await Promise.all(
            call.request.projectTxHashes.map(async (projectTxHash) => {
                return new Promise(resolve => {
                    repo.findByHashOrThrow(projectTxHash).then(tx => { 
                        walletToHashMap.set(tx.wallet, projectTxHash)
                        resolve(tx.wallet) 
                    })
                })
            })
        )        
        logger.debug(`Addresses represented by given hashes: ${projectWallets}`)

        let projectInfoResults = await Promise.all(
            projectWallets.map(wallet => {
                return new Promise(resolve => {
                    client.instance().contractCallStatic(
                        contracts.projSource,
                        util.enforceCtPrefix(wallet),
                        functions.proj.getInfo,
                        [ ]
                    ).then(result => {
                        result.decode().then(decoded => {
                            resolve({
                                projectTxHash: walletToHashMap.get(wallet),
                                totalFundsRaised: util.tokenToEur(decoded[0]),
                                investmentCap: util.tokenToEur(decoded[1]),
                                minPerUserInvestment: util.tokenToEur(decoded[2]),
                                maxPerUserInvestment: util.tokenToEur(decoded[3]),
                                endsAt: decoded[4]
                            })
                        })
                    })
                })
            })
        )
        logger.debug(`Projects info response fetched \n%o`, projectInfoResults)
        callback(null, { projects: projectInfoResults })
    } catch(error) {
        logger.error(`Error while fetching statuses for given projects list \n%o`, error)
        err.handle(error, callback)
    }
}

module.exports = { createProject, startRevenueSharesPayout, getInfo }