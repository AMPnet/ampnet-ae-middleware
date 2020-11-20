let chai = require('chai');
let assert = chai.assert;
let axios = require('axios')
let config = require('../config')

let db = require('./util/db')

describe('CORS test', function() {
    
    before(async () => {
        await db.clearTransactions(adminWalletTx.hash)
    })

    it('summary http response should contain allowOrigin header', async () => {
        let summaryUrl = `http://0.0.0.0:${config.get().http.port}/summary`
        let response = (await axios.get(summaryUrl, {
            params: {
                coop: coopId
            }
        }))
        console.log("platform summary", response.data)
        assert.strictEqual(response.headers['access-control-allow-origin'], '*')
    })

})