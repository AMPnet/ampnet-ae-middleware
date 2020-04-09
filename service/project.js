let client = require('../ae/client')
let codec = require('../ae/codec')
let contracts = require('../ae/contracts')
let repo = require('../persistence/repository')
let util = require('../ae/util')
let err = require('../error/errors')
let functions = require('../enums/enums').functions
let logger = require('../logger')(module)
let { Crypto } = require('@aeternity/aepp-sdk')

async function createProject(call, callback) {
    logger.debug(`Received request to generate createProject transaction.\nCaller: ${call.request.fromTxHash}`)
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
        logger.error(`Error generating createProject transaction \n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

async function approveWithdraw(call, callback) {
    try {
        logger.debug(`Received request to generate approveWithdrawProjectFunds transaction.\nCaller: ${call.request.fromTxHash} wants to withdraw ${call.request.amount} tokens from project with hash ${call.request.projectTxHash}`)
        let fromWallet = (await repo.findByHashOrThrow(call.request.fromTxHash)).wallet
        logger.debug(`Caller wallet: ${fromWallet}`)
        let amount = util.eurToToken(call.request.amount)
        logger.debug(`Tokens to withdraw: ${amount}`)
        let projectWallet = (await repo.findByHashOrThrow(call.request.projectTxHash)).wallet
        logger.debug(`Project: ${projectWallet}`)
        let callData = await codec.proj.encodeApproveWithdrawProjectFunds(amount)
        let tx = await client.instance().contractCallTx({
            callerId: fromWallet,
            contractId: util.enforceCtPrefix(projectWallet),
            amount: 0,
            gas: 10000,
            callData: callData
        })
        logger.debug(`Successfully generated approveWithdrawProjectFunds transaction: ${tx}`)
        callback(null, { tx: tx })
    } catch(error) {
        logger.error(`Error while generating approveWithdrawProjectFunds transaction \n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

async function cancelInvestment(call, callback) {
    try {
        logger.debug(`Received request to generate cancelInvestment transaction.\nCaller: ${call.request.fromTxHash} wants to cancel investment in project with hash ${call.request.projectTxHash}`)
        let fromWallet = (await repo.findByHashOrThrow(call.request.fromTxHash)).wallet
        logger.debug(`Caller wallet: ${fromWallet}`)
        let projectWallet = (await repo.findByHashOrThrow(call.request.projectTxHash)).wallet
        logger.debug(`Project: ${projectWallet}`)
        let callData = await codec.proj.encodeCancelInvestment()
        let tx = await client.instance().contractCallTx({
            callerId: fromWallet,
            contractId: util.enforceCtPrefix(projectWallet),
            amount: 0,
            gas: 10000,
            callData: callData
        })
        logger.debug(`Successfully generated cancelInvestment transaction: ${tx}`)
        callback(null, { tx: tx })
    } catch(error) {
        logger.error(`Error while generating cancelInvestment transaction \n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

async function isInvestmentCancelable(call, callback) {
    try {
        logger.debug(`Received request to check if investment is cancelable.`)
        let result = await canCancelInvestment(call.request.projectTxHash, call.request.investorTxHash)
        logger.debug(`Can cancel investment: ${result}`)
        callback(null, { canCancel: result })
    } catch(error) {
        logger.error(`Error while checking if investment is cancelable \n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

async function startRevenueSharesPayout(call, callback) {
    try {
        logger.debug(`Received request to generate startRevenueSharesPayout transaction.\nCaller: ${call.request.fromTxHash} wants to payout ${call.request.revenue} tokens to project with hash ${call.request.projectTxHash}`)
        let fromWallet = (await repo.findByHashOrThrow(call.request.fromTxHash)).wallet
        logger.debug(`Caller wallet: ${fromWallet}`)
        let revenue = util.eurToToken(call.request.revenue)
        logger.debug(`Revenue: ${revenue}`)
        let projectWallet = (await repo.findByHashOrThrow(call.request.projectTxHash)).wallet
        logger.debug(`Project: ${projectWallet}`)
        await checkSharePayoutPreconditions(fromWallet, projectWallet, revenue)
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
        logger.error(`Error while generating startRevenueSharesPayout transaction \n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

async function getInfo(call, callback) {
    try {
        logger.debug(`Received request to fetch statuses for projects: ${call.request.projectTxHashes}`)
        let walletToHashMap = new Map()
        let projectWallets = await Promise.all(
            call.request.projectTxHashes.map(async (projectTxHash) => {
                return new Promise((resolve, reject) => {
                    repo.findByHashOrThrow(projectTxHash).then(tx => { 
                        walletToHashMap.set(tx.wallet, projectTxHash)
                        resolve(tx.wallet) 
                    }).catch(error => {
                        reject(error)
                    })
                })
            })
        )        
        logger.debug(`Addresses represented by given hashes: ${projectWallets}`)

        let projectInfoResults = await Promise.all(
            projectWallets.map(wallet => {
                return new Promise((resolve, reject) => {
                    client.instance().contractCallStatic(
                        contracts.projSource,
                        util.enforceCtPrefix(wallet),
                        functions.proj.getInfo,
                        [ ],
                        {
                            callerId: Crypto.generateKeyPair().publicKey
                        }
                    ).then(result => {
                        result.decode().then(decoded => {
                            resolve({
                                projectTxHash: walletToHashMap.get(wallet),
                                minPerUserInvestment: util.tokenToEur(decoded[0]),
                                maxPerUserInvestment: util.tokenToEur(decoded[1]),
                                investmentCap: util.tokenToEur(decoded[2]),
                                endsAt: decoded[3],
                                totalFundsRaised: util.tokenToEur(decoded[4]),
                                payoutInProcess: decoded[5],
                            })
                        })
                    }).catch(error => {
                        reject(error)
                    })
                })
            })
        )
        logger.debug(`Projects info response fetched \n%o`, projectInfoResults)
        callback(null, { projects: projectInfoResults })
    } catch(error) {
        logger.error(`Error while fetching statuses for given projects list \n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

async function canCancelInvestment(projectTxHash, investorTxHash) {
    logger.debug(`Received request to check if investment is cancelable.`)
    let investorWallet = (await repo.findByHashOrThrow(investorTxHash)).wallet
    logger.debug(`Investor wallet: ${investorWallet}`)
    let projectWallet = (await repo.findByHashOrThrow(projectTxHash)).wallet
    logger.debug(`Project: ${projectWallet}`) 
    let result = await client.instance().contractCallStatic(
        contracts.projSource,
        util.enforceCtPrefix(projectWallet),
        functions.proj.isInvestmentCancelable,
        [ investorWallet ],
        {
            callerId: Crypto.generateKeyPair().publicKey
        }
    )
    return result.decode()
}

async function checkSharePayoutPreconditions(caller, project, revenue) {
    logger.debug(`Checking share payout preconditions`)
    let result = await client.instance().contractCallStatic(
        contracts.projSource,
        util.enforceCtPrefix(project),
        functions.proj.checkSharePayoutPreconditions,
        [ caller, revenue ],
        {
            callerId: Crypto.generateKeyPair().publicKey
        }
    )
    logger.debug(`Preconditions checklist result: %o`, result)
}   

module.exports = { 
    createProject,
    approveWithdraw,
    cancelInvestment,
    isInvestmentCancelable,
    canCancelInvestment,
    startRevenueSharesPayout, 
    getInfo 
}