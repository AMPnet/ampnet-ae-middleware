function dateToUnixEpoch(date) {
    return (new Date(date)).getTime()
}

module.exports = { dateToUnixEpoch }