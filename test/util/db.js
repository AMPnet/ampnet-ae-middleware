let config = require('../../config')

let knex

async function init() {
    knex = require('knex')(config.get().db)
    return new Promise(async resolve => {
        await knex.raw('TRUNCATE TABLE transaction;')
        resolve()
    })
}

async function insert(data) {
    return new Promise(resolve => {
        knex('transaction')
            .insert(data)
            .then(_ => {
                resolve()
            })
    })
}

async function getAll() { return getBy({}) }

async function getBy(constraints) {
    return new Promise(resolve => {
        knex('transaction')
            .join('coop', 'coop.id', 'transaction.coop_id')
            .where(constraints)
            .then(rows => {
                resolve(rows)
            })
    })
}

async function clearAll() {
    return new Promise(resolve => {
        knex.raw('TRUNCATE TABLE coop, transaction CASCADE').then(_ => {
            resolve()
        }).catch(err => {
            console.log("Truncate Coop err", err)
        })
    })
}

module.exports = {
    init,
    insert,
    getAll,
    getBy,
    clearAll
}
