# Testing the Indexer & GraphQL API

## Quick Start

### 1. Install Dependencies

```bash
cd indexer
npm install
```

### 2. Setup Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/stone_indexer"
RPC_ENDPOINT="https://rpc.testnet.cosmwasm.com"
CHAIN_ID="testnet-1"
FACTORY_ADDRESS="wasm1..."  # Your factory contract address
START_BLOCK_HEIGHT=1000000
```

### 3. Setup Database

```bash
npm run db:generate
npm run db:push
```

### 4. Start Indexer

```bash
npm run dev
```

You should see:
```
[info]: Starting Stone Finance Indexer
[info]: Database connected successfully
[info]: GraphQL API server started { url: 'http://localhost:4000/graphql' }
[info]: Indexer checkpoint { lastProcessedBlock: 1000000 }
```

## Testing the GraphQL API

### Open GraphQL Playground

Navigate to: **http://localhost:4000/graphql**

### Test Query 1: List Markets

```graphql
query {
  markets(limit: 10) {
    id
    collateralDenom
    debtDenom
    totalSupply
    totalDebt
    borrowRate
    liquidityRate
    utilization
    enabled
  }
}
```

Expected: List of markets (empty if none indexed yet)

### Test Query 2: Get Market Count

```graphql
query {
  marketCount
}
```

Expected: Number of markets indexed

### Test Query 3: Get Specific Market

```graphql
query {
  market(id: "your-market-id-here") {
    id
    collateralDenom
    debtDenom
    curator
    oracle
    totalSupply
    totalDebt
    borrowRate

    # Nested: recent transactions
    transactions(limit: 5) {
      txHash
      action
      amount
      timestamp
    }
  }
}
```

### Test Query 4: User Positions

```graphql
query {
  userPositions(userAddress: "wasm1...") {
    id
    market {
      collateralDenom
      debtDenom
    }
    supplyScaled
    debtScaled
    collateral
    supplyAmount
    debtAmount
    healthFactor
  }
}
```

### Test Query 5: Recent Transactions

```graphql
query {
  transactions(limit: 20) {
    id
    txHash
    timestamp
    action
    userAddress
    amount
    market {
      collateralDenom
      debtDenom
    }
  }
}
```

### Test Query 6: Market History

```graphql
query {
  marketSnapshots(
    marketId: "your-market-id"
    limit: 100
  ) {
    timestamp
    totalSupply
    totalDebt
    utilization
    borrowRate
    liquidityRate
  }
}
```

## Testing WebSocket Subscriptions

### In GraphQL Playground

1. Click "SUBSCRIPTION" tab
2. Enter subscription:

```graphql
subscription {
  marketUpdated(marketId: "your-market-id") {
    id
    totalSupply
    totalDebt
    utilization
    borrowRate
  }
}
```

3. Click "Play" button
4. Should show "Listening..."
5. When market updates occur, you'll see real-time data

### Test New Transaction Subscription

```graphql
subscription {
  newTransaction {
    txHash
    action
    amount
    market {
      collateralDenom
      debtDenom
    }
  }
}
```

### Test Position Updates

```graphql
subscription {
  positionUpdated(userAddress: "wasm1...") {
    supplyAmount
    debtAmount
    collateral
  }
}
```

## Testing with cURL

### Query via HTTP POST

```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ marketCount }"
  }'
```

### Health Check

```bash
curl http://localhost:4000/health
```

Expected: `{"status":"ok"}`

## Monitoring Logs

Watch indexer logs:

```bash
npm run dev | grep -E 'info|error|warn'
```

Look for:
- `Processing block range` - Indexer is working
- `Market created event detected` - New market found
- `Supply event processed` - Transaction indexed
- `GraphQL API server started` - API is running

## Common Issues

### "Market not found"

**Cause**: No markets indexed yet
**Fix**: Wait for indexer to process blocks with market creation events

### "Connection refused"

**Cause**: Database not running
**Fix**: Start PostgreSQL

```bash
# macOS
brew services start postgresql

# Linux
sudo systemctl start postgresql
```

### "No data returned"

**Cause**: Indexer hasn't processed any blocks yet
**Fix**: Check logs, ensure RPC endpoint is correct

### WebSocket subscription not working

**Cause**: CORS or WebSocket connection issue
**Fix**: Check browser console, ensure port 4000 is accessible

## Verifying Data

### Check Database Directly

```bash
npm run db:studio
```

Opens Prisma Studio at http://localhost:5555

Browse tables:
- Markets
- UserPositions
- Transactions
- MarketSnapshots

### Run Raw SQL

```bash
psql stone_indexer

# Count markets
SELECT COUNT(*) FROM markets;

# List recent transactions
SELECT * FROM transactions ORDER BY timestamp DESC LIMIT 10;

# Check indexer state
SELECT * FROM indexer_state;
```

## Performance Testing

### Stress Test Queries

Run many concurrent queries:

```bash
# Install autocannon
npm install -g autocannon

# Stress test
autocannon -c 10 -d 30 \
  -m POST \
  -H "Content-Type: application/json" \
  -b '{"query":"{ marketCount }"}' \
  http://localhost:4000/graphql
```

Check:
- Requests per second
- Latency (p50, p99)
- Error rate

### Monitor Database

Watch slow queries:

```sql
-- Enable logging
ALTER SYSTEM SET log_min_duration_statement = 100;
SELECT pg_reload_conf();

-- View logs
tail -f /var/log/postgresql/postgresql.log
```

## Integration Testing

### With Frontend

1. Start indexer: `npm run dev`
2. Start frontend: `cd frontend && npm start`
3. Frontend should connect to `http://localhost:4000/graphql`
4. Verify queries work
5. Test subscriptions update UI in real-time

### With Blockchain

1. Deploy factory and market contracts to testnet
2. Configure indexer with contract addresses
3. Execute transactions (supply, borrow, etc.)
4. Verify events are indexed within seconds
5. Check GraphQL API returns correct data

## Success Criteria

✅ GraphQL Playground loads
✅ Queries return data (or empty arrays if no data)
✅ Subscriptions show "Listening..."
✅ Indexer logs show block processing
✅ Database contains data
✅ No errors in logs
✅ Health check returns 200 OK

When all criteria pass: **System is working correctly!** ✨
