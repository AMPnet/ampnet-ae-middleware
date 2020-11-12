# Project API

Request and response examples.

## Get project info

request:
```
method: GET
route:  /projects/:projectHash
```
response:
```
{
    projectHash: "th_NYFiUDirJPp3fWNngMwiTQ5p9YccHjaFozb1QiDkSoQP4R7Xy",
    minPerUserInvestment: 100,
    maxPerUserInvestment: 1000,
    investmentCap: 1000,
    endsAt: 1599211231714,
    totalFundsRaised: 0,
    payoutInProcess: false,
    balance: 0
}
```

## Get investment details

request:
```
method: GET
route:  /projects/:projectHash/investors/:investorHash/details
```
response:
```
{
  walletBalance: 0,
  amountInvested: 10000,
  totalFundsRaised: 10000,
  investmentCancelable: true,
  payoutInProcess: false
}
```

