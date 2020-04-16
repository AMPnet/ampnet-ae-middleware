let logger = require('../logger')(module)
let repository = require('../persistence/repository')
let contracts = require('../ae/contracts')
let codec = require('../ae/codec')
let util = require('../ae/util')
let { TxState, TxType, WalletType } = require('../enums/enums')


async function getSummary() {
    var projectCapsSum = 0
    var projectsCount = 0
    var investmentsCount = 0
    var investmentAmountsSum = 0
    var fundedProjectsCount = 0
    var fundedProjectCapsSum = 0

    let projectWalletCreateRecords = await repository.get({
        type: TxType.WALLET_CREATE,
        state: TxState.MINED,
        wallet_type: WalletType.PROJECT
    })

    let projectWalletCreateRecordsSize = projectWalletCreateRecords.length
    for (i = 0; i < projectWalletCreateRecordsSize; i++) {
        let projectWalletCreateRecord = projectWalletCreateRecords[i]
        let projectWallet = projectWalletCreateRecord.wallet
        let projectCreateRecords = await repository.get({
            type: TxType.PROJ_CREATE,
            state: TxState.MINED,
            to_wallet: projectWallet
        })
        if (projectCreateRecords.length == 0) {
            logger.warn(`Unexpected error occured while processing project. Could not find matching PROJ_CREATE transaction for given WALLET_CREATE transaction (${projectWalletCreateRecord.hash})`)
            logger.warn(`Ignoring this project while calculating platform summary.`)
            continue
        } 
        if (projectCreateRecords.length > 1) {
            logger.warn(`Unexpected error occured while while processing project. Found more than 1 matching PROJ_CREATE transaction for given WALLET_CREATE transaction (${projectWalletCreateRecord.hash})`)
            logger.warn(`Ignoring this project while calculating platform summary.`)
            continue
        }

        let investmentRecords = await repository.getProjectTransactions(projectWallet)
        let investmentRecordsSize = investmentRecords.length

        if (investmentRecordsSize == 0) {
            logger.info(`Ingoring project ${projectWallet} while calculating summary. Project has active wallet but 0 transactions so far.`)
            continue
        }

        let projectCreateRecord = projectCreateRecords[0]
        let projectData = await codec.decodeDataBySource(contracts.projSource, "init", projectCreateRecord.input)
        
        let projectInvestmentCap = util.tokenToEur(projectData.arguments[3].value)
        projectCapsSum += projectInvestmentCap
        projectsCount++

        let investmentsSum = 0
        for (j = 0; j < investmentRecordsSize; j++) {
            let record = investmentRecords[j]
            switch (record.type) {
                case TxType.INVEST:
                    amount = Number(record.amount)
                    investmentsSum += amount
                    investmentsCount++
                    investmentAmountsSum += amount
                    break;
                case TxType.CANCEL_INVESTMENT:
                    amount = Number(record.amount)
                    investmentsSum -= amount
                    investmentsCount--
                    investmentAmountsSum -= amount
                    break;
            }
        }
        if (investmentsSum == projectInvestmentCap) {
            fundedProjectsCount++
            fundedProjectCapsSum += projectInvestmentCap
        }
    }

    return {
        number_of_funded_projects: fundedProjectsCount,
        average_project_size: (projectsCount == 0) ? 0 : Math.floor(projectCapsSum / projectsCount),
        average_funded_project_size: (fundedProjectsCount == 0) ? 0 : Math.floor(fundedProjectCapsSum / fundedProjectsCount),
        average_user_investment: (investmentsCount == 0) ? 0 : Math.floor(investmentAmountsSum / investmentsCount),
        total_money_raised: investmentAmountsSum
    }
}

module.exports = { getSummary }