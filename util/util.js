function dateToUnixEpoch(date) {
    return (new Date(date)).getTime()
}

function arrayToJson(array) {
    console.log("array to map", array)
    let itemsCount = array.length
    if (itemsCount === 0) { return { } }
    
    let resultJson = {}
    for (var i = 0; i < itemsCount; ++i) {
        console.log("adding item ", array[i])
        resultJson[array[i][0]] = array[i][1]
    }
    console.log("resulting json ", resultJson)
    return resultJson
}

module.exports = { dateToUnixEpoch, arrayToJson }