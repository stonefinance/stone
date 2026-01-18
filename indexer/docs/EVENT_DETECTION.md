# Event Detection in CosmWasm Indexers

## Overview

Unlike traditional web applications that use WebSockets for real-time events, blockchain indexers work differently. CosmWasm blockchains don't push events to clients - instead, indexers must **poll** the blockchain and extract events from blocks.

## How It Works

### 1. Block Polling

The indexer continuously polls the blockchain RPC endpoint to fetch new blocks:

```typescript
// Get current blockchain height
const currentHeight = await getCurrentBlockHeight();

// Process blocks sequentially
for (let height = lastProcessed + 1; height <= currentHeight; height++) {
  await processBlock(height);
}
```

### 2. Event Extraction Flow

```
┌─────────────────┐
│  Blockchain RPC │
│   (Tendermint)  │
└────────┬────────┘
         │
         │ 1. Poll for new blocks
         ▼
┌─────────────────┐
│   Get Block     │ ← block(height)
│   Get TxResults │
└────────┬────────┘
         │
         │ 2. Extract transactions
         ▼
┌─────────────────┐
│  For each TX:   │
│  - Check status │
│  - Get events   │
└────────┬────────┘
         │
         │ 3. Filter wasm events
         ▼
┌─────────────────┐
│  Wasm Events    │
│  (type="wasm")  │
└────────┬────────┘
         │
         │ 4. Check contract address
         ▼
┌─────────────────────────┐
│ Is Factory or Market?   │
│ - Factory Address       │
│ - Market Addresses Set  │
└────────┬────────────────┘
         │
         │ 5. Parse & Handle
         ▼
┌─────────────────┐
│ Event Handlers  │
│ Write to DB     │
└─────────────────┘
```

### 3. Event Structure in CosmWasm

Events in CosmWasm transactions look like this:

```json
{
  "type": "wasm",
  "attributes": [
    {
      "key": "X2NvbnRyYWN0X2FkZHJlc3M=",  // base64: "_contract_address"
      "value": "d2FzbTE..."              // base64: contract address
    },
    {
      "key": "YWN0aW9u",                 // base64: "action"
      "value": "c3VwcGx5"                // base64: "supply"
    },
    {
      "key": "YW1vdW50",                 // base64: "amount"
      "value": "MTAwMA=="                // base64: "1000"
    }
  ]
}
```

**Important:** Event attributes are base64-encoded, so we need to decode them:

```typescript
function parseEventAttributes(event: Event): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const attr of event.attributes) {
    const key = Buffer.from(attr.key).toString('utf-8');
    const value = Buffer.from(attr.value).toString('utf-8');
    attributes[key] = value;
  }
  return attributes;
}
```

### 4. Filtering Events by Contract

We only care about events from our contracts:

```typescript
// Factory events
if (contractAddress === config.contracts.factoryAddress) {
  await processFactoryEvent(...);
}

// Market events
if (marketAddresses.has(contractAddress)) {
  await processMarketEvent(...);
}
```

The `marketAddresses` set is built from:
1. Markets already in our database (loaded at startup)
2. New markets created via `MarketCreated` events

### 5. Event Routing

Once we've identified a relevant event, we route it to the appropriate handler:

```typescript
switch (action) {
  case 'supply':
    await handleSupply(event, marketId);
    break;
  case 'borrow':
    await handleBorrow(event, marketId);
    break;
  // ... etc
}
```

## Why Not WebSockets?

### WebSocket Limitations

1. **Not Standard in Cosmos SDK**: While some RPC nodes offer WebSocket subscriptions, they're:
   - Not reliable across all node implementations
   - Can miss events during connection issues
   - Don't provide historical data for recovery

2. **No Guaranteed Delivery**: WebSockets can:
   - Drop connections
   - Miss events during reconnection
   - Provide no way to verify you got all events

### Block Polling Advantages

1. **Reliability**: You control the flow and can verify every block was processed
2. **Recoverability**: Can resume from any block height after crashes
3. **Reorg Handling**: Can detect and handle blockchain reorganizations
4. **Historical Sync**: Can index from genesis or any starting block
5. **Consistency**: Sequential processing ensures correct ordering

## Performance Considerations

### Batch Processing

Instead of processing one block at a time, we process in batches:

```typescript
const batchSize = 100;
const toHeight = Math.min(lastProcessed + batchSize, currentHeight);

for (let height = lastProcessed + 1; height <= toHeight; height++) {
  await processBlock(height);
}
```

### Polling Interval

When caught up with the chain, we wait before polling again:

```typescript
if (lastProcessed >= currentHeight) {
  // Caught up, wait before checking again
  await sleep(pollIntervalMs); // e.g., 1000ms
  continue;
}
```

### Parallel Processing (Advanced)

For even better performance, you can:
- Fetch multiple blocks in parallel
- Process non-dependent events concurrently
- Use multiple database connections

However, be careful to maintain:
- Sequential block processing for consistency
- Transaction atomicity for each event
- Proper error handling and rollback

## Handling Edge Cases

### 1. Failed Transactions

Skip transactions with `code !== 0`:

```typescript
if (tx.code !== 0) {
  // Transaction failed, skip
  return;
}
```

### 2. Blockchain Reorganizations

Detect when a previously processed block has changed:

```typescript
const block = await tmClient.block(lastHeight);
const currentHash = Buffer.from(block.blockId.hash).toString('hex');

if (currentHash !== state.lastProcessedHash) {
  // Reorg detected! Rollback and re-process
  await handleReorg(lastHeight);
}
```

### 3. Missing Events

If you expect an event but don't see it:
- Check the transaction succeeded (`code === 0`)
- Verify the contract address matches
- Confirm the event type is "wasm"
- Check attribute parsing (base64 decoding)

### 4. Checkpointing

Always save progress after processing blocks:

```typescript
await updateLastProcessedBlock(blockHeight, blockHash);
```

This allows recovery after crashes or restarts.

## Comparison: WebSocket vs Polling

| Feature | WebSocket | Block Polling |
|---------|-----------|---------------|
| Real-time | ~instant | 1-6s delay (configurable) |
| Reliability | Can miss events | Guaranteed complete |
| Recovery | Complex | Simple (resume from checkpoint) |
| Reorg handling | Difficult | Built-in |
| Historical sync | Not available | Full support |
| Node requirements | WS support needed | Any RPC node |
| Complexity | High | Medium |

## Example: Full Event Flow

1. **New market created on Factory contract**
   ```
   Block 1000 → TX abc123 → wasm event → action=market_instantiated
   ```

2. **Indexer polls and finds block 1000**
   ```typescript
   await processBlock(1000);
   ```

3. **Extract transaction abc123**
   ```typescript
   const tx = await client.getTx('abc123');
   ```

4. **Find wasm events**
   ```typescript
   for (const event of tx.events) {
     if (event.type === 'wasm') {
       // Process this event
     }
   }
   ```

5. **Parse attributes**
   ```typescript
   const attributes = parseEventAttributes(event);
   // { action: 'market_instantiated', market_id: 'xyz', ... }
   ```

6. **Check contract address**
   ```typescript
   if (contractAddress === factoryAddress) {
     // This is our Factory!
   }
   ```

7. **Handle event**
   ```typescript
   await handleMarketCreated(event);
   ```

8. **Update checkpoint**
   ```typescript
   await updateLastProcessedBlock(1000, blockHash);
   ```

9. **Continue to next block**
   ```typescript
   await processBlock(1001);
   ```

## Best Practices

1. **Always checkpoint**: Save progress frequently
2. **Handle reorgs**: Check block hashes, rollback when needed
3. **Idempotent handlers**: Events might be reprocessed after crashes
4. **Transaction safety**: Use database transactions for consistency
5. **Error handling**: Retry transient failures, log permanent ones
6. **Monitoring**: Track indexer lag (current height - processed height)
7. **Graceful shutdown**: Handle SIGTERM/SIGINT properly

## Monitoring Your Indexer

Key metrics to track:

```typescript
const lag = currentHeight - lastProcessedHeight;
const lagPercentage = (lag / currentHeight) * 100;

logger.info('Indexer status', {
  lastProcessed: lastProcessedHeight,
  currentHeight,
  lag,
  lagPercentage: lagPercentage.toFixed(2) + '%',
});
```

A healthy indexer should have:
- Lag < 100 blocks when caught up
- Consistent processing rate
- No reorg events (unless chain is actually reorging)
- All transactions processed successfully
