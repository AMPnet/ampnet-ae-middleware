let util = require('../ae/util')

let TxType = {
    WALLET_CREATE: "WALLET_CREATE",
    ORG_CREATE: "ORG_CREATE",
    DEPOSIT: "DEPOSIT",
    APPROVE: "APPROVE",
    APPROVE_INVESTMENT: "APPROVE_INVESTMENT",
    APPROVE_USER_WITHDRAW: "APPROVE_USER_WITHDRAW",
    PENDING_ORG_WITHDRAW: "PENDGING_ORG_WITHDRAW",
    PENDING_PROJ_WITHDRAW: "PENDING_PROJ_WITHDRAW",
    WITHDRAW: "WITHDRAW",
    INVEST: "INVEST",
    TRANSFER: "TRANSFER",
    ORG_ADD_MEMBER: "ORG_ADD_MEMBER",
    PROJ_CREATE: "PROJ_CREATE",
    ORG_ACTIVATE: "ORG_ACTIVATE",
    START_REVENUE_PAYOUT: "START_REVENUE_PAYOUT",
    SHARE_PAYOUT: "SHARE_PAYOUT",
    WITHDRAW_INVESTMENT: "WITHDRAW_INVESTMENT"
}

let events = new Map([
    [util.blake2b('WalletAdded'), TxType.WALLET_CREATE],
    [util.blake2b('RevenueSharePayout'), TxType.SHARE_PAYOUT],
    [util.blake2b('OrganizationCreated'), TxType.ORG_CREATE],
    [util.blake2b('TokensMinted'), TxType.DEPOSIT],
    [util.blake2b('ApproveSpender'), TxType.APPROVE],
    [util.blake2b('TokensBurned'), TxType.WITHDRAW],
    [util.blake2b('ProjectCreated'), TxType.PROJ_CREATE],
    [util.blake2b('StartRevenuePayout'), TxType.START_REVENUE_PAYOUT],
    [util.blake2b('NewInvestment'), TxType.INVEST]
])

let TxState = {
    MINED: "MINED",
    PENDING: "PENDING",
    FAILED: "FAILED"
}

let WalletType = {
    USER: "USER",
    ORGANIZATION: "ORGANIZATION",
    PROJECT: "PROJECT"
}

let SupervisorStatus = {
    NOT_REQUIRED: "NOT_REQUIRED",
    REQUIRED: "REQUIRED",
    PROCESSED: "PROCESSED"
}

let functions = {
    coop: {
        addWallet: "add_wallet",
        isWalletActive: "is_wallet_active"
    },
    eur: {
        mint: "mint",
        allowance: "allowance",
        balanceOf: "balance_of",
        burnFrom: "burn",
        approve: "approve"
    },
    proj: {
        invest: "invest",
        startRevenueSharesPayout: "start_revenue_shares_payout",
        payoutRevenueSharesBatch: "payout_revenue_shares",
        getInfo: "get_info"
    }
}

let txTypeValues = Object.values(TxType)
let txStateValues = Object.values(TxState)
let walletTypeValues = Object.values(WalletType)
let supervisorStatusValues = Object.values(SupervisorStatus)

function fromEvent(event) {
    let eventHex = util.bigNumberToHex(event)
    if (events.has(eventHex)) {
        return events.get(eventHex)
    } else {
        throw new Error(`Could not convert event ${event} to transaction type!`)
    }
}

function txTypeToGrpc(type) {
    switch (type) {
        case TxType.DEPOSIT:        return 0
        case TxType.WITHDRAW:       return 1
        case TxType.INVEST:         return 2
        case TxType.SHARE_PAYOUT:   return 3
        default: throw new Error(`Cannot convert ${type} to GRPC type!`)
    }
}

module.exports = {
    TxType,
    TxState,
    WalletType,
    SupervisorStatus,
    txTypeValues,
    txStateValues,
    supervisorStatusValues,
    walletTypeValues,
    functions,
    fromEvent,
    txTypeToGrpc
}