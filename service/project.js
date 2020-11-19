let client = require('../ae/client')
let codec = require('../ae/codec')
let contracts = require('../ae/contracts')
let repo = require('../persistence/repository')
let util = require('../ae/util')
let err = require('../error/errors')
let functions = require('../enums/enums').functions
let config = require('../config')
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
        logger.debug(`Encoded call data: ${callData}`)
        let result = await client.instance().contractCreateTx({
            ownerId: fromWallet,
            code: contracts.getProjCompiled().bytecode,
            abiVersion: 3,
            deposit: 0,
            amount: 0,
            gas: config.get().contractCreateGasAmount,
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
        logger.debug(`Encoded call data: ${callData}`)
        let tx = await client.instance().contractCallTx({
            callerId: fromWallet,
            contractId: util.enforceCtPrefix(projectWallet),
            amount: 0,
            gas: config.get().contractCallGasAmount,
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
        logger.debug(`Encoded call data: ${callData}`)
        let tx = await client.instance().contractCallTx({
            callerId: fromWallet,
            contractId: util.enforceCtPrefix(projectWallet),
            amount: 0,
            gas: config.get().contractCallGasAmount,
            callData: callData
        })
        logger.debug(`Successfully generated cancelInvestment transaction: ${tx}`)
        callback(null, { tx: tx })
    } catch(error) {
        logger.error(`Error while generating cancelInvestment transaction \n%o`, err.pretty(error))
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
        logger.debug(`Encoded call data: ${callData}`)
        let tx = await client.instance().contractCallTx({
            callerId: fromWallet,
            contractId: util.enforceCtPrefix(projectWallet),
            amount: 0,
            gas: config.get().contractCallGasAmount,
            callData: callData
        })
        logger.debug(`Successfully generated startRevenueSharesPayout transaction: ${tx}`)
        callback(null, { tx: tx })
    } catch(error) {
        logger.error(`Error while generating startRevenueSharesPayout transaction \n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

async function getProjectsInfo(call, callback) {
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
                    getProjectInfo(wallet).then(info => {
                        resolve({
                            projectTxHash: walletToHashMap.get(wallet),
                            ...info
                        })
                    }).catch(err =>
                        reject(err)
                    )
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

async function getInvestmentDetails(projectTxHash, investorTxHash) {
    logger.debug(`Received request to fetch investment details.`)
    let investorWallet = (await repo.findByHashOrThrow(investorTxHash)).wallet
    logger.debug(`Investor wallet: ${investorWallet}`)
    let projectWallet = (await repo.findByHashOrThrow(projectTxHash)).wallet
    logger.debug(`Project: ${projectWallet}`) 
    let result = await client.instance().contractCallStatic(
        contracts.projSource,
        util.enforceCtPrefix(projectWallet),
        functions.proj.getInvestmentDetails,
        [ investorWallet ],
        {
            callerId: Crypto.generateKeyPair().publicKey
        }
    )
    let decodedResult = await result.decode()
    return {
        walletBalance: util.tokenToEur(decodedResult[0]),
        amountInvested: util.tokenToEur(decodedResult[1]),
        totalFundsRaised: util.tokenToEur(decodedResult[2]),
        investmentCancelable: decodedResult[3],
        payoutInProcess: decodedResult[4]
    }
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

async function activateSellOffer(fromTxHash, sellOfferTxHash) {
    logger.debug(`Received request to generate activateSellOffer transaction.\nCaller ${fromTxHash} wants to activate sell offer ${sellOfferTxHash}`)
    let fromWallet = (await repo.findByHashOrThrow(fromTxHash)).wallet
    logger.debug(`Caller wallet: ${fromWallet}`)
    let sellOfferCreateRecord = await repo.findByHashOrThrow(sellOfferTxHash)
    let sellOfferContract = util.enforceCtPrefix(sellOfferCreateRecord.to_wallet)
    logger.debug(`SellOffer contract: ${sellOfferContract}`)
    let bytecode = contracts.getSellOfferCompiled().bytecode
    let sellOfferCreateCallData = await codec.decodeDataByBytecode(bytecode, sellOfferCreateRecord.input)
    let projectContract = util.enforceCtPrefix(sellOfferCreateCallData.arguments[0].value)
    logger.debug(`Project contract: ${projectContract}`)
    let callData = await codec.proj.encodeActivateSellOffer(sellOfferContract)
    let tx = await client.instance().contractCallTx({
        callerId: fromWallet,
        contractId: projectContract,
        amount: 0,
        gas: config.get().contractCallGasAmount,
        callData: callData
    })
    logger.debug(`Successfully generated activateSellOffer transaction: ${tx}`)
    return tx
}

async function getProjectInfo(wallet) {
    logger.debug(`Fetching info for project ${wallet}`)
    var contract = await repo.addressFromWalletData(wallet)
    let result = await client.instance().contractCallStatic(
        contracts.projSource,
        util.enforceCtPrefix(contract),
        functions.proj.getInfo,
        [ ],
        {
            callerId: Crypto.generateKeyPair().publicKey
        }
    )
    logger.debug(`Fetched result: %o`, result)
    let decoded = await result.decode()
    logger.debug(`Decoded project info: %o`, )
    return {
        minPerUserInvestment: util.tokenToEur(decoded[0]),
        maxPerUserInvestment: util.tokenToEur(decoded[1]),
        investmentCap: util.tokenToEur(decoded[2]),
        endsAt: decoded[3],
        totalFundsRaised: util.tokenToEur(decoded[4]),
        payoutInProcess: decoded[5],
        balance: util.tokenToEur(decoded[6])
    }
}

module.exports = { 
    createProject,
    approveWithdraw,
    cancelInvestment,
    getInvestmentDetails,
    startRevenueSharesPayout, 
    getProjectsInfo,
    activateSellOffer,
    getProjectInfo
}