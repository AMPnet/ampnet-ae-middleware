function dateToUnixEpoch(date) {
    return (new Date(date)).getTime()
}

function arrayToJson(array) {
    let itemsCount = array.length
    if (itemsCount === 0) { return { } }
    
    let resultJson = {}
    for (var i = 0; i < itemsCount; ++i) {
        resultJson[array[i][0]] = array[i][1]
    }
    return resultJson
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { dateToUnixEpoch, arrayToJson, sleep }