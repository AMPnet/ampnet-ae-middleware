let chai = require('chai');
let assert = chai.assert;

let grpcServer = require('../grpc/server')
let supervisor = require('../queue/queue')
let axios = require('axios')
let config = require('../config')


describe('CORS test', function() {

    beforeEach(async() => {
        process.env['DB_SCAN_ENABLED'] = "false"
        await grpcServer.start()
    })

    afterEach(async() => {
        await grpcServer.stop()
        await supervisor.stop()
    })

    it('summary http response should contain allowOrigin header', async () => {
        let summaryUrl = `http://0.0.0.0:${config.get().http.port}/summary`
        let response = (await axios.get(summaryUrl))
        assert.strictEqual(response.headers['access-control-allow-origin'], '*')
    })

})