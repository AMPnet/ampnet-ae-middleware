const clsNamespace = require('cls-hooked')
const namespaceName = 'ampnet-ae-middleware'
const traceIdKey = 'traceID'

let namespace

function create() {
    namespace = clsNamespace.createNamespace(namespaceName)
}

function setTraceID(traceID) {
    return namespace.set(traceIdKey, traceID)
}

function getTraceID() {
    if (!namespace) {
        throw new Error('Trying to fetch TraceID from namespace but namespace to created!')
    }
    return namespace.get(traceIdKey)
}

async function run(callback) {
    return namespace.run(callback)
}

module.exports = {
    create,
    run,
    setTraceID,
    getTraceID
}