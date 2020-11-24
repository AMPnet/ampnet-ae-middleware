# Wallet API

Request and response examples.

## Get wallet balance

request:
```
method: GET
route:  /wallet/:walletTxHash/balance
```
response:
```
{
  wallet_hash: "th_27RdxGfJQ7udCUSRJL2UAXGDmKvhW9cNSwcQftptYcSm1ymc1t",
  balance: 0
}
```