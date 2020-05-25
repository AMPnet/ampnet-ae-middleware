let path = require('path')
let chai = require('chai');
let assert = chai.assert;
let { Crypto, Universal, Node, MemoryAccount } = require('@aeternity/aepp-sdk')

let enums = require('../enums/enums')
let grpcServer = require('../grpc/server')
let supervisor = require('../supervisor')
let axios = require('axios')
let config = require('../config')


describe('Auto funding test', function() {

    beforeEach(async() => {
        await grpcServer.start()
    })

    afterEach(async() => {
        await grpcServer.stop()
        await supervisor.clearStorage()
        await supervisor.stop()
    })

    it('should', async () => {
        let summaryUrl = `http://0.0.0.0:${config.get().http.port}/summary`
        let response = (await axios.get(summaryUrl))
        assert.strictEqual(response.headers['access-control-allow-origin'], '*')
    })

})