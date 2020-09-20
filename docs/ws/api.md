# WebSocket API

## Subscribe to wallet notifications

### 1. Connect
```
protocol: ws
port:  8124
```

### 2. Subscribe

In order to subscribe to wallet changes after connection has been established, send stringified JSON message of the following format:
```
{
    "wallet": "ak_14F..."
}
```

### 3. Receive notifications

Every time something changes related to provided wallet in Step 2 (be it new transaction, or existing transaction state change), client will receive message of the following format:
```
{
    "wallet": "ak_14F..."
}
```
Message contains stringified json (example above), where wallet is the same from step 2. 