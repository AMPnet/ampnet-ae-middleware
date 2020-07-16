let fs = require('fs')
let path = require('path')
let client = require('./client')

let coopSource = fs.readFileSync(path.join(__dirname, '..', 'contracts', 'Coop.aes')).toString()
let eurSource = fs.readFileSync(path.join(__dirname, '..', 'contracts', 'EUR.aes')).toString()
let orgSource = fs.readFileSync(path.join(__dirname, '..', 'contracts', 'Organization.aes')).toString()
let projSource = fs.readFileSync(path.join(__dirname, '..', 'contracts', 'Project.aes')).toString()
let sellOfferSource = fs.readFileSync(path.join(__dirname, '..', 'contracts', 'SellOffer.aes')).toString()

let coopCompiled
let eurCompiled
let orgCompiled
let projCompiled
let sellOfferCompiled

async function compile() {
    coopCompiled = await client.instance().contractCompile(coopSource, {
        backend: 'fate'
    })
    eurCompiled = await client.instance().contractCompile(eurSource, {
        backend: 'fate'
    })
    orgCompiled = await client.instance().contractCompile(orgSource, {
        backend: 'fate'
    })
    projCompiled = await client.instance().contractCompile(projSource, {
        backend: 'fate'
    })
    sellOfferCompiled = await client.instance().contractCompile(sellOfferSource, {
        backend: 'fate'
    })
}

function getCoopCompiled() { return coopCompiled }
function getEurCompiled() { return eurCompiled }
function getOrgCompiled() { return orgCompiled }
function getProjCompiled() { return projCompiled }
function getSellOfferCompiled() { return sellOfferCompiled }

module.exports = {
    coopSource,
    eurSource,
    orgSource,
    projSource,
    sellOfferSource,
    getCoopCompiled,
    getEurCompiled,
    getOrgCompiled,
    getProjCompiled,
    getSellOfferCompiled,
    compile
}