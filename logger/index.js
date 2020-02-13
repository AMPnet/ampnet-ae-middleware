const path = require('path')
const { createLogger, format, transports } = require('winston')
const { combine, timestamp, splat, printf } = format
const DailyRotateFile = require('winston-daily-rotate-file')
const redact = require('redact-secrets')

const ServiceEnv = require('../enums/enums').ServiceEnv

const namespace = require('../cls')

const mainLogger = create(
    combine(
        timestamp(),
        splat(),
        printf(info => `${info.timestamp} ${info.level}: [${info.callingModule}] ${info.message}`)
    )
)

const clsLogger = create(
    combine(
        timestamp(),
        splat(),
        printf(info => `${info.timestamp} ${info.level} [${info.traceID}]: [${info.callingModule}] ${info.message}`)
    ) 
)

function create(format) {
    let env = process.env.ENV || ServiceEnv.DEV
    switch (env) {
        case ServiceEnv.DEV:
            return createLogger({
                level: 'debug',
                format: format,
                transports: [
                    new transports.Console()
                ]
            })
        case ServiceEnv.PROD:
            return createLogger({
                level: 'debug',
                format: format,
                transports: [
                    new transports.Console(),
                    new DailyRotateFile({
                        filename: 'ae-middleware-%DATE%.log',
                        dirname: '/var/log',
                        datePattern: 'YYYY-MM-DD',
                        zippedArchive: true,
                        maxSize: '20m',
                        maxFiles: '7d'
                    })
                ]
            })
    }
}

function getFilenameLabel(callingModule) {
    var parts = callingModule.filename.split(path.sep)
    let result = path.join(parts[parts.length - 2], parts.pop())
    return result
}

module.exports = function(mod) {
    if (!mod) {
        throw new Error('Must provide calling module param when requiring logger!')
    }
    return new Proxy(mainLogger, {
        get(target, property, receiver) {
            let callingModule = getFilenameLabel(mod)
            let traceID = namespace.getTraceID()
            let targetValue = traceID ? 
                Reflect.get(clsLogger.child({ traceID, callingModule }), property, receiver) : 
                Reflect.get(mainLogger.child({ callingModule }), property, receiver)
            if (typeof targetValue === 'function') {
                return function (...args) {
                    return targetValue.apply(this, args)
                }
            }
        }
    })
}