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
    return new Promise( resolve => {
        knex('transaction')
            .where(constraints)
            .then(rows => {
                resolve(rows)
            })
    })
}

module.exports = {
    init,
    insert,
    getAll,
    getBy
}
