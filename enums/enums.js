let util = require('../ae/util')

let ClsNamespace = "ampnet-ae-middleware"

let ServiceEnv = {
    DEV: "dev",
    PROD: "prod"
}

let Environment = {
    LOCAL: "local",
    TESTNET: "testnet",
    MAINNET: "mainnet"
}

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
    WITHDRAW_INVESTMENT: "WITHDRAW_INVESTMENT",
    CANCEL_INVESTMENT: "CANCEL_INVESTMENT",
    COOP_OWNERSHIP_TRANSFER: "COOP_OWNERSHIP_TRANSFER",
    EUR_OWNERSHIP_TRANSFER: "EUR_OWNERSHIP_TRANSFER",
    SELL_OFFER_CREATE: "SELL_OFFER_CREATE",
    APPROVE_COUNTER_OFFER: "APPROVE_COUNTER_OFFER",
    COUNTER_OFFER_PLACED: "COUNTER_OFFER_PLACED",
    COUNTER_OFFER_REMOVED: "COUNTER_OFFER_REMOVED",
    SHARES_SOLD: "SHARES_SOLD"
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
    [util.blake2b('NewInvestment'), TxType.INVEST],
    [util.blake2b('ApproveWithdrawProjectFunds'), TxType.PENDING_PROJ_WITHDRAW],
    [util.blake2b('InvestmentCanceled'), TxType.CANCEL_INVESTMENT],
    [util.blake2b('CoopOwnershipChanged'), TxType.COOP_OWNERSHIP_TRANSFER],
    [util.blake2b('EurOwnershipChanged'), TxType.EUR_OWNERSHIP_TRANSFER],
    [util.blake2b('SellOfferCreated'), TxType.SELL_OFFER_CREATE],
    [util.blake2b('CounterOfferPlaced'), TxType.COUNTER_OFFER_PLACED],
    [util.blake2b('CounterOfferRemoved'), TxType.COUNTER_OFFER_REMOVED],
    [util.blake2b('SharesSold'), TxType.SHARES_SOLD]
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

let JobType = {
    SEND_FUNDS: "SEND_FUNDS",
    PROCESS_TX: "PROCESS_TX"
}

let SupervisorStatus = {
    NOT_REQUIRED: "NOT_REQUIRED",
    REQUIRED: "REQUIRED",
    PROCESSED: "PROCESSED"
}

let functions = {
    coop: {
        addWallet: "add_wallet",
        isWalletActive: "is_wallet_active",
        getOwner: "owner",
        transferOwnership: "transfer_ownership"
    },
    eur: {
        mint: "mint",
        allowance: "allowance",
        balanceOf: "balance_of",
        burnFrom: "burn",
        approve: "approve",
        getOwner: "owner",
        transferOwnership: "transfer_ownership"
    },
    proj: {
        invest: "invest",
        startRevenueSharesPayout: "start_revenue_shares_payout",
        payoutRevenueSharesBatch: "payout_revenue_shares",
        getInfo: "get_project_info",
        withdraw: "withdraw",
        cancelInvestment: "cancel_investment",
        isInvestmentCancelable: "can_cancel_investment",
        checkInvestmentPreconditions: "check_investment_preconditions",
        checkSharePayoutPreconditions: "check_share_payout_preconditions",
    },
    sellOffer: {
        tryToSettle: "try_to_settle",
        acceptCounterOffer: "accept_counter_offer",
        cancelOffer: "cancel_offer",
        getOffer: "get_offer"
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
        case TxType.DEPOSIT:                    return 0
        case TxType.WITHDRAW:                   return 1
        case TxType.INVEST:                     return 2
        case TxType.SHARE_PAYOUT:               return 3
        case TxType.CANCEL_INVESTMENT:          return 4
        case TxType.APPROVE_INVESTMENT:         return 5
        case TxType.WALLET_CREATE:              return 6
        case TxType.ORG_CREATE:                 return 7
        case TxType.PROJ_CREATE:                return 8
        case TxType.SELL_OFFER_CREATE:          return 9
        case TxType.APPROVE_USER_WITHDRAW:      return 10
        case TxType.PENDING_PROJ_WITHDRAW:      return 11
        case TxType.APPROVE_COUNTER_OFFER:      return 12
        case TxType.START_REVENUE_PAYOUT:       return 13
        case TxType.COOP_OWNERSHIP_TRANSFER:    return 14
        case TxType.EUR_OWNERSHIP_TRANSFER:     return 15
        case TxType.COUNTER_OFFER_PLACED:       return 16
        case TxType.COUNTER_OFFER_REMOVED:      return 17
        case TxType.SHARES_SOLD:                return 18
        default: throw new Error(`Cannot convert ${type} to GRPC type!`)
    }
}

function txStateToGrpc(state) {
    switch(state) {
        case TxState.MINED:     return 0
        case TxState.PENDING:   return 1
        case TxState.FAILED:    return 2
        default: throw new Error(`Cannot convert ${state} to GRPC type!`)
    }
}

module.exports = {
    Environment,
    ServiceEnv,
    ClsNamespace,
    TxType,
    TxState,
    WalletType,
    JobType,
    SupervisorStatus,
    txTypeValues,
    txStateValues,
    supervisorStatusValues,
    walletTypeValues,
    functions,
    fromEvent,
    txTypeToGrpc,
    txStateToGrpc
}