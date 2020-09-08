let config = require('../config')
let client = require('./client')
let contracts = require('./contracts')
let functions = require('../enums/enums').functions
let util = require('./util')

async function encodeAddWallet(wallet) {
    return contracts.getCoopCompiled().encodeCall(functions.coop.addWallet, [ wallet ])
}

async function encodeCreateOrganization() {
    return contracts.getOrgCompiled().encodeCall("init", [ config.get().contracts.coop.address ])
}

async function encodeCreateProject(org, minInvestment, maxInvestment, investmentCap, endsAt) {
    return contracts.getProjCompiled().encodeCall(
        "init", 
        [
            org,
            minInvestment,
            maxInvestment,
            investmentCap,
            endsAt
        ]
    )
}

async function encodeCreateSellOffer(proj, shares, price) {
    return contracts.getSellOfferCompiled().encodeCall(
        "init",
        [
            proj,
            shares,
            price
        ]
    )
}

async function encodeAcceptCounterOffer(buyer) {
    return contracts.getSellOfferCompiled().encodeCall(
        functions.sellOffer.acceptCounterOffer,
        [ buyer ]
    )
}

async function encodeGetProjectInfo() {
    return contracts.getProjCompiled().encodeCall(functions.proj.getInfo, [ ])
}

async function encodeApproveWithdrawProjectFunds(amount) {
    return contracts.getProjCompiled().encodeCall(functions.proj.withdraw, [ amount ])
}

async function encodeCancelInvestment() {
    return contracts.getProjCompiled().encodeCall(functions.proj.cancelInvestment, [ ])
}

async function encodeIsInvestmentCancelable(investor) {
    return contracts.getProjCompiled().encodeCall(functions.proj.isInvestmentCancelable, [ investor ])
}

async function decodeGetProjectInfoResult(result) {
    let decoded = await client.instance().contractDecodeData(
        contracts.projSource,
        functions.proj.getInfo,
        result.returnValue,
        result.returnType
    )
    return {
        project: result.contractId,
        info: {
            totalFundsRaised: util.tokenToEur(decoded[0]),
            investmentCap: util.tokenToEur(decoded[1]),
            minPerUserInvestment: util.tokenToEur(decoded[2]),
            maxPerUserInvestment: util.tokenToEur(decoded[3]),
            endsAt: decoded[4]
        }
    }
}

async function encodeStartRevenueSharesPayout(revenue) {
    return contracts.getProjCompiled().encodeCall(
        functions.proj.startRevenueSharesPayout,
        [ revenue ]
    )
}

async function encodeActivateSellOffer(sellOffer) {
    return contracts.getProjCompiled().encodeCall(
        functions.proj.activateSellOffer,
        [ sellOffer ]
    )
}

async function encodeMint(address, amount) {
    return contracts.getEurCompiled().encodeCall(functions.eur.mint, [ address, amount ])
}

async function encodeApprove(spender, amount) {
    return contracts.getEurCompiled().encodeCall(functions.eur.approve, [ spender, amount ])
}

async function encodeBurnFrom(address, amount) {
    return contracts.getEurCompiled().encodeCall(functions.eur.burnFrom, [ address, amount ])
}

async function encodeTransferCoopOwnership(newOwnerAddress) {
    return contracts.getCoopCompiled().encodeCall(functions.coop.transferOwnership, [ newOwnerAddress ])
}

async function encodeTransferEurOwnership(newOwnerAddress) {
    return contracts.getEurCompiled().encodeCall(functions.eur.transferOwnership, [ newOwnerAddress ])
}

async function decodeDataBySource(source, fn, value) {
    return client.instance().contractDecodeCallDataBySourceAPI(source, fn, value, {
        backend: 'fate'
    })
}

async function decodeDataByBytecode(bytecode, data) {
    return client.instance().contractDecodeCallDataByCodeAPI(bytecode, data, 'fate')
}

module.exports = {
    coop: {
        encodeAddWallet,
        encodeTransferCoopOwnership
    },
    org: {
        encodeCreateOrganization
    },
    eur: {
        encodeMint,
        encodeApprove,
        encodeBurnFrom,
        encodeTransferEurOwnership
    },
    proj: {
        encodeCreateProject,
        encodeGetProjectInfo,
        decodeGetProjectInfoResult,
        encodeStartRevenueSharesPayout,
        encodeApproveWithdrawProjectFunds,
        encodeCancelInvestment,
        encodeIsInvestmentCancelable,
        encodeActivateSellOffer
    },
    sellOffer: {
        encodeCreateSellOffer,
        encodeAcceptCounterOffer
    },
    decodeDataBySource,
    decodeDataByBytecode
}