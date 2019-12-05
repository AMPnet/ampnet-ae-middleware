const { Crypto } = require('@aeternity/aepp-sdk')

describe('Playground', function () {

    it('is a great place to be', async () => {
        let kp = Crypto.generateKeyPair()
        console.log("kp", kp)
    })

})