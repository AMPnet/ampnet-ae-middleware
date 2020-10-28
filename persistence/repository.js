let config = require('../config')
let aeUtil = require('../ae/util')
let util = require('../util/util')
let err = require('../error/errors')
let ErrorType = err.type
let { TxState, TxType, WalletType, SupervisorStatus } = require('../enums/enums')

let knex

function init() {
    knex = require('knex')(config.get().db)
}

async function addressFromWalletData(walletData) {
    if (walletData.startsWith("ak_") || walletData.startsWith("ct_")) { return aeUtil.enforceAkPrefix(walletData) }
    return (await findByHashOrThrow(walletData)).wallet
}

async function findByHashOrThrow(txHash) {
    return new Promise((resolve, reject) => {
        knex('transaction')
        .where({ hash: txHash })
        .then(rows => {
            if (rows.length == 0) { reject(err.generate(ErrorType.WALLET_NOT_FOUND)) }
            else {
                let record = rows[0]
                switch (record.type) {
                    case TxType.SELL_OFFER_CREATE:
                    case TxType.WALLET_CREATE:
                        switch (record.state) {
                            case TxState.MINED:
                                resolve(record)
                                break
                            case TxState.PENDING:
                                reject(err.generate(ErrorType.WALLET_CREATION_PENDING))
                                break
                            case TxState.FAILED:
                                reject(err.generate(ErrorType.WALLET_CREATION_FAILED))
                        }
                        break
                    default:
                        reject(err.generate(ErrorType.GENERIC_ERROR, "Given hash does not represent wallet creation transaction!"))
                }
            }

        })
    })
}

async function findFirstByWallet(wallet) {
    let akWallet = aeUtil.enforceAkPrefix(wallet)
    return new Promise( (resolve, reject) => {
        knex('transaction')
        .where({ wallet: akWallet })
        .then((rows) => { resolve(rows[0]) })
    })
}

async function findByWalletOrThrow(wallet) {
    let akWallet = aeUtil.enforceAkPrefix(wallet)
    return new Promise( (resolve, reject) => {
        knex('transaction')
        .where({ wallet: akWallet })
        .then((rows) => {
            if (rows.length == 0) { reject(err.generate(ErrorType.WALLET_NOT_FOUND)) }
            else if (rows.length > 1) { reject(err.generate(ErrorType.GENERIC_ERROR, `Incosistent data. Multiple tx records found with wallet ${akWallet}`)) }
            else {
                record = rows[0]
                switch (record.state) {
                    case TxState.MINED:
                        resolve(record)
                    case TxState.PENDING:
                        reject(err.generate(ErrorType.WALLET_CREATION_PENDING))
                    case TxState.FAILED:
                        reject(err.generate(ErrorType.WALLET_CREATION_FAILED))
                }
            }
        })
    })
}

async function getWalletTypeOrThrow(address) {
    return new Promise(resolve => {
        knex('transaction')
            .where('type', 'in', [TxType.ORG_CREATE, TxType.PROJ_CREATE])
            .andWhere({to_wallet: address})
            .then(rows => {
                switch (rows.length) {
                    case 0:
                        resolve(WalletType.USER)
                        break
                    case 1:
                        if(rows[0].type == TxType.ORG_CREATE) resolve(WalletType.ORGANIZATION)
                        else resolve(WalletType.PROJECT)
                        break
                    default:
                        throw new Error("Expected at max 1 row for searching org/proj creation with given wallet.")
                }
            })
    })
}

async function saveHash(hash) {
    return new Promise(resolve => {
        knex('transaction')
            .insert({
                hash: hash,
                state: TxState.PENDING,
                created_at: new Date()
            })
            .then(_ => {
                resolve()
            })
    })
}

async function saveTransaction(tx) {
    return new Promise( resolve => {
        knex('transaction')
            .insert(tx)
            .then(() => {
                resolve()
            })
    })
}

async function get(filter) {
    return new Promise(resolve => {
        knex('transaction')
            .where(filter)
            .then(records => {
                resolve(records)
            })
    })
}

async function getAsc(filter) {
    return new Promise(resolve => {
        knex('transaction')
            .where(filter)
            .orderBy('created_at')
            .then(records => {
                resolve(records)
            })
    }) 
}

async function getPendingOlderThan(minutes) {
    let MS_PER_MINUTE = 60000
    let now = new Date()
    let threshold = (new Date(now - minutes * MS_PER_MINUTE)).toISOString()
    return new Promise(resolve => {
        knex.raw(`
            select * from transaction t
            where t.created_at < '${threshold}' and t.state = '${TxState.PENDING}'
        `).then(result => {
            resolve(result.rows)
        })
    })
}

async function getSupervisorRequiredOlderThan(minutes) {
    let MS_PER_MINUTE = 60000
    let now = new Date()
    let threshold = (new Date(now - minutes * MS_PER_MINUTE)).toISOString()
    return new Promise(resolve => {
        knex.raw(`
            select * from transaction t
            where t.created_at < '${threshold}' and t.state = '${TxState.MINED}' and t.supervisor_status = '${SupervisorStatus.REQUIRED}'
        `).then(result => {
            resolve(result.rows)
        })
    })
}

async function getUserTransactions(wallet) {
    let parsedWallet = aeUtil.enforceAkPrefix(wallet)
    return new Promise(resolve => {
        knex('transaction')
            .where({ from_wallet: parsedWallet })
            .orWhere({ to_wallet: parsedWallet })
            .then(records => {
                let processedRecords = records.map(r => {
                    return {
                        hash: r.hash,
                        from_wallet: r.from_wallet,
                        to_wallet: r.to_wallet,
                        amount: r.amount,
                        type: r.type,
                        date: (r.state == TxState.PENDING) ? util.dateToUnixEpoch(r.created_at) : util.dateToUnixEpoch(r.processed_at),
                        state: r.state
                    }
                })
                resolve(processedRecords)
            })
    })
}

async function getUserUncanceledInvestments(wallet) {
    let parsedWallet = aeUtil.enforceAkPrefix(wallet)
    return new Promise(resolve => {
        knex.raw(`
            select * from transaction t
            where 
                t.from_wallet='${parsedWallet}' and 
                t.type='${TxType.INVEST}' and 
                t.state='${TxState.MINED}' and 
                t.created_at > COALESCE(
                    (
                        select max(created_at) from transaction
                        where 
                            type='${TxType.CANCEL_INVESTMENT}' and 
                            state='${TxState.MINED}' and 
                            from_wallet=t.to_wallet and 
                            to_wallet=t.from_wallet
                    ),
                    to_timestamp(0)
                )
        `).then(result => {
            resolve(result.rows)
        })
    })
}

async function getUserMarketTransactions(wallet) {
    return new Promise(resolve => {
        knex.raw(`
            select * from transaction t
            where
                (t.from_wallet='${wallet}' or t.to_wallet='${wallet}') and
                t.type='${TxType.SHARES_SOLD}' and
                t.state='${TxState.MINED}'
        `).then(result => {
            resolve(result.rows)
        })
    })
}

async function getProjectTransactions(projectWallet) {
    return new Promise(resolve => {
        knex('transaction')
            .where({
                state: TxState.MINED,
                type: TxType.INVEST,
                to_wallet: projectWallet
            })
            .orWhere({
                state: TxState.MINED,
                type: TxType.CANCEL_INVESTMENT,
                from_wallet: projectWallet
            })
            .orderBy('processed_at', 'asc')
            .then(result => {
                resolve(result)
            })
    })
}

async function update(filter, data) {
    return new Promise(resolve => {
        knex('transaction')
            .returning('*')
            .where(filter)
            .update(data)
            .then(rows => {
                resolve(rows)
            })
    })
}

async function runMigrations() {
    return knex.migrate.latest()
}

module.exports = {
    addressFromWalletData,
    findByHashOrThrow,
    findByWalletOrThrow,
    findFirstByWallet,
    getWalletTypeOrThrow,
    get,
    getAsc,
    getPendingOlderThan,
    getSupervisorRequiredOlderThan,
    getUserTransactions,
    getProjectTransactions,
    getUserUncanceledInvestments,
    getUserMarketTransactions,
    saveTransaction,
    update,
    saveHash,
    runMigrations,
    init
}