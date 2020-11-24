let chai = require('chai');
let assert = chai.assert;

let grpcClient = require('./grpc/client')
let db = require('./util/db')

describe('Test role routes', function() {

    before(async () => {
        await db.clearTransactions(adminWalletTx.hash)
    })

    it('Should be able to fetch token issuer wallet', async () => {
        let tokenIssuer = await grpcClient.getTokenIssuer(coopId)
        assert.equal(tokenIssuer, adminWalletTx.wallet)
    })

    it('Should be able to fetch platform manager wallet', async () => {
        let platformManager = await grpcClient.getPlatformManager(coopId)
        assert.equal(platformManager, adminWalletTx.wallet)
    })

})
