const redis = require('redis')
const async = require('async')
redis.RedisClient.prototype.delWildcard = function(key, callback) {
	var redis = this
 
	redis.keys(key, function(err, rows) {
		async.each(rows, function(row, callbackDelete) {
            redis.del(row, callbackDelete)
		}, callback)
	});
}
const config = require('../config')
const logger = require('../logger')(module)

var client
var CACHE_TIMEOUT_SECONDS

const WALLET_ACTIVE_FN_ID = "wallet-active"
const BALANCE_FN_ID = "balance"
const INVESTMENT_DETAILS_FN_ID = "investment-details"
const GET_PROJECT_INFO_FN_ID = "get-project-info"

function init() {
    let redisHost = config.get().redis.host
    let redisPort = config.get().redis.port
    client = redis.createClient(redisPort, redisHost)
    CACHE_TIMEOUT_SECONDS = config.get().redis.cacheTimeoutSeconds
}

async function walletActive(coopId, wallet, fetchData) {
    let key = buildKey(coopId, WALLET_ACTIVE_FN_ID, wallet)
    return fetchAndCache(key, fetchData)
}

async function balances(coopId, fetchData) {
    let balancesId = "balances"
    let key = buildKey(coopId, BALANCE_FN_ID, balancesId)
    return fetchAndCache(key, fetchData)
}

async function getInvestmentDetails(coopId, projectWallet, investorWallet, fetchData) {
    let key = buildKey(coopId, INVESTMENT_DETAILS_FN_ID, `${projectWallet}-${investorWallet}`)
    return fetchAndCache(key, fetchData)
}

async function getProjectInfo(coopId, wallet, fetchData) {
    let key = buildKey(coopId, GET_PROJECT_INFO_FN_ID, wallet)
    return fetchAndCache(key, fetchData)
}

function invalidateCacheForCooperative(coopId) {
    let key = `${coopId}-*`
    logger.info(`REDIS-CACHE: Received request do delete cache entries for key pattern ${key}`)
    return new Promise(resolve => {
        client.delWildcard(key, function() {
            logger.info(`REDIS-CACHE: Successfully deleted cache entries for key pattern ${key}`)
            resolve()
        })
    })
}

function fetchAndCache(key, fetchData) {
    return new Promise(resolve => {
        client.get(key, async (err, data) => {
            if (err) {
                logger.warn(`REDIS-CACHE: Error while fetching value for key ${key}`)
                let fetchedData = await fetchData() 
                logger.info(`REDIS-CACHE: Fetched data from real source: %o`, fetchedData)
                cache(key, fetchedData)
                resolve(fetchedData)
            } else {
                if (data !== null) {
                    let dataJson = JSON.parse(data)
                    logger.info(`REDIS-CACHE: Found cached value for key ${key}: %o`, dataJson)
                    resolve(dataJson)
                } else {
                    logger.info(`REDIS-CACHE: No cached data found for key ${key}`)
                    let fetchedData = await fetchData() 
                    logger.info(`REDIS-CACHE: Fetched data from real source: %o`, fetchedData)
                    cache(key, fetchedData)
                    resolve(fetchedData)
                }
            }
        })
    })
}

async function cache(key, data) {
    client.setex(key, CACHE_TIMEOUT_SECONDS, JSON.stringify(data), function(err) {
        if (err) {
            logger.warn(`REDIS-CACHE: Error while storing data with key ${key}: %o`, err)
        } else {
            logger.info(`REDIS-CACHE: Stored data with key ${key} and value %o`, data)
        }
    })
}

function buildKey(coopId, fnId, entryId) {
    return `${coopId}-${fnId}-${entryId}`
}

function stop() {
    return new Promise(resolve => {
        client.quit(function() {
            resolve()
        })
    })
}

module.exports = { 
    init,
    stop,
    walletActive,
    balances,
    getInvestmentDetails,
    getProjectInfo,
    invalidateCacheForCooperative 
}

