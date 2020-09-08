# Marketplace API

Request and response examples.

NOTE: <i>sellOfferTxHash</i> in all requests represents SellOffer creation transaction. 

## Create sell offer

request:
```
method: GET
route:  /market/create-offer
query:  fromTxHash=th_x1y2z3...
        projectTxHash=th_x1y2z3...
        shares=10000
        price=300
```
response:
```
{
    tx: "tx_x1y2z3..."
}
```

## Accept sell offer

If counterOfferPrice == sellOfferPrice trade is automatically executed.

If counterOfferPrice <  sellOfferPrice counter offer is placed.

request:
```
method: GET
route:  /market/accept-sell-offer
query:  fromTxHash=th_x1y2z3...
        sellOfferTxHash=th_x1y2z3...
        counterOfferPrice=500
```
response:
```
{
    tx: "tx_x1y2z3..."
}
```

## Accept counter offer

request:
```
method: GET
route:  /market/accept-counter-offer
query:  fromTxHash=th_x1y2z3...
        sellOfferTxHash=th_x1y2z3...
        buyerTxHash=tx_x1y2z3...
```
response:
```
{
    tx: "tx_x1y2z3..."
}
```

## Post signed transaction

request:
```
method: POST
route: /transactions
body: 
        {
            data: tx_x1y2z3...
        }
```
response:
```
{
    tx_hash: th_x1y2z3...
}
```



