let client = require('../ae/client')
let codec = require('../ae/codec')
let contracts = require('../ae/contracts')
let repo = require('../persistence/repository')
let util = require('../ae/util')
let err = require('../error/errors')
let functions = require('../enums/enums').functions
let config = require('../config')
let cache = require('../cache/redis')
let logger = require('../logger')(module)
let { Crypto } = require('@aeternity/aepp-sdk')

async function createProject(call, callback) {
    try {
        logger.info(`Received request to generate createProject transaction.\nCaller: ${call.request.fromTxHash}`)
        let fromWallet = (await repo.findByHashOrThrow(call.request.fromTxHash)).wallet
        logger.debug(`Caller address represented by given hash: ${fromWallet}`)
        let orgCreationTxInfo = await client.instance().getTxInfo(call.request.organizationTxHash)
        if (orgCreationTxInfo.blockHeight === -1) { throw err.generate(err.type.TX_NOT_MINED) }
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
            gasPrice: config.get().gasPrice,
            gas: config.get().contractCreateGasAmount,
            callData: callData
        })
        logger.info(`Successfully generated createProject transaction!`)
        callback(null, { tx: result.tx })
    } catch (error) {
        logger.error(`Error generating createProject transaction \n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

async function approveWithdraw(call, callback) {
    try {
        logger.info(`Received request to generate approveWithdrawProjectFunds transaction.\nCaller: ${call.request.fromTxHash} wants to withdraw ${call.request.amount} tokens from project with hash ${call.request.projectTxHash}`)
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
            gasPrice: config.get().gasPrice,
            callData: callData
        })
        logger.info(`Successfully generated approveWithdrawProjectFunds transaction!`)
        callback(null, { tx: tx })
    } catch(error) {
        logger.error(`Error while generating approveWithdrawProjectFunds transaction \n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

async function cancelInvestment(call, callback) {
    try {
        logger.info(`Received request to generate cancelInvestment transaction.\nCaller: ${call.request.fromTxHash} wants to cancel investment in project with hash ${call.request.projectTxHash}`)
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
            gasPrice: config.get().gasPrice,
            callData: callData
        })
        logger.info(`Successfully generated cancelInvestment transaction!`)
        callback(null, { tx: tx })
    } catch(error) {
        logger.error(`Error while generating cancelInvestment transaction \n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

async function startRevenueSharesPayout(call, callback) {
    try {
        logger.info(`Received request to generate startRevenueSharesPayout transaction.\nCaller: ${call.request.fromTxHash} wants to payout ${call.request.revenue} tokens to project with hash ${call.request.projectTxHash}`)
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
            gasPrice: config.get().gasPrice,
            callData: callData
        })
        logger.info(`Successfully generated startRevenueSharesPayout transaction!`)
        callback(null, { tx: tx })
    } catch(error) {
        logger.error(`Error while generating startRevenueSharesPayout transaction \n%o`, err.pretty(error))
        err.handle(error, callback)
    }
}

async function getInvestmentDetails(projectTxHash, investorTxHash) {
    logger.info(`Received request to fetch investment details.`)
    let investorWalletTx = await repo.findByHashOrThrow(investorTxHash) 
    let investorWallet = investorWalletTx.wallet
    logger.debug(`Investor wallet: ${investorWallet}`)
    let projectWallet = (await repo.findByHashOrThrow(projectTxHash)).wallet
    logger.debug(`Project: ${projectWallet}`)
    let investmentDetailsResult = await cache.getInvestmentDetails(
        investorWalletTx.coop_id,
        projectWallet,
        investorWallet,
        async () => {
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
            logger.info(`Successfully fetched investment details: %o`, decodedResult)
            return {
                walletBalance: util.tokenToEur(decodedResult[0]),
                amountInvested: util.tokenToEur(decodedResult[1]),
                totalFundsRaised: util.tokenToEur(decodedResult[2]),
                investmentCancelable: decodedResult[3],
                payoutInProcess: decodedResult[4]
            }
        }
    )
    return investmentDetailsResult
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
    logger.info(`Received request to generate activateSellOffer transaction.\nCaller ${fromTxHash} wants to activate sell offer ${sellOfferTxHash}`)
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
        gasPrice: config.get().gasPrice,
        callData: callData
    })
    logger.info(`Successfully generated activateSellOffer transaction!`)
    return tx
}

async function getProjectInfoByWallet(wallet, coopId) {
    logger.info(`Fetching info for project ${wallet}`)
    let projectInfoResult = await cache.getProjectInfo(
        coopId,
        wallet,
        async () => {
            let result = await client.instance().contractCallStatic(
                contracts.projSource,
                util.enforceCtPrefix(wallet),
                functions.proj.getInfo,
                [ ],
                {
                    callerId: Crypto.generateKeyPair().publicKey
                }
            )
            logger.debug(`Fetched result: %o`, result)
            let decoded = await result.decode()
            logger.info(`Decoded project info: %o`, decoded)
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
    )
    return projectInfoResult
}

async function getProjectInfoByHash(txHash) {
    logger.info(`Fetching info for project with hash ${txHash}`)
    let walletTx = await repo.findByHashOrThrow(txHash)
    let wallet = walletTx.wallet
    let coopId = walletTx.coop_id
    return getProjectInfoByWallet(wallet, coopId)
}

module.exports = { 
    createProject,
    approveWithdraw,
    cancelInvestment,
    getInvestmentDetails,
    startRevenueSharesPayout, 
    activateSellOffer,
    getProjectInfoByHash,
    getProjectInfoByWallet
}