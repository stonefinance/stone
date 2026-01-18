# Quick Start Guide

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Access to a CosmWasm blockchain RPC endpoint
- Factory contract address deployed on the chain

## Step 1: Install Dependencies

```bash
cd indexer
npm install
```

## Step 2: Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Database - Replace with your PostgreSQL connection string
DATABASE_URL="postgresql://postgres:password@localhost:5432/stone_indexer?schema=public"

# Blockchain RPC - Use your testnet/mainnet RPC endpoint
RPC_ENDPOINT="https://rpc.testnet.example.com"
CHAIN_ID="testnet-1"

# Contracts - Get these from your deployment
FACTORY_ADDRESS="wasm1abc123..."
MARKET_CODE_ID="42"

# Indexer Configuration
START_BLOCK_HEIGHT=1000000        # Block to start indexing from
BATCH_SIZE=100                     # Blocks to process in one batch
POLL_INTERVAL_MS=1000              # Wait time when caught up (1 second)

# API Server (for future GraphQL API)
API_PORT=4000
ENABLE_SUBSCRIPTIONS=true

# Logging
LOG_LEVEL="info"                   # debug | info | warn | error
```

## Step 3: Setup Database

### Create PostgreSQL Database

```bash
# Using psql
createdb stone_indexer

# Or via SQL
psql -U postgres -c "CREATE DATABASE stone_indexer;"
```

### Generate Prisma Client

```bash
npm run db:generate
```

### Push Schema to Database

For development (quick setup):

```bash
npm run db:push
```

For production (with migrations):

```bash
npm run db:migrate
```

## Step 4: Verify Configuration

Make sure your RPC endpoint is accessible:

```bash
curl https://rpc.testnet.example.com/status
```

You should get a JSON response with blockchain info.

## Step 5: Run the Indexer

### Development Mode (with hot reload)

```bash
npm run dev
```

### Production Mode

```bash
npm run build
npm start
```

## What Happens Next

1. **Connection**: Indexer connects to database and blockchain RPC
2. **Load Markets**: Loads existing market addresses from database
3. **Checkpoint**: Checks last processed block (or starts from `START_BLOCK_HEIGHT`)
4. **Polling**: Starts polling for new blocks
5. **Processing**: For each block:
   - Extracts transactions
   - Filters wasm events
   - Identifies Factory/Market events
   - Writes to database
   - Updates checkpoint

## Monitoring

Watch the logs to see progress:

```
2024-01-18 10:00:00 [info]: Starting Stone Finance Indexer
2024-01-18 10:00:01 [info]: Database connected successfully
2024-01-18 10:00:01 [info]: Loaded market addresses { count: 5 }
2024-01-18 10:00:01 [info]: Indexer checkpoint { lastProcessedBlock: 1050000 }
2024-01-18 10:00:02 [info]: Processing block range { from: 1050001, to: 1050100 }
2024-01-18 10:00:05 [info]: Market created event detected { marketId: 'abc...', marketAddress: 'wasm1...' }
2024-01-18 10:00:10 [info]: Processing progress { height: 1050100, lag: 50, lagPercentage: '0.005%' }
```

## Key Metrics

- **lastProcessedBlock**: Last block fully indexed
- **currentHeight**: Current blockchain height
- **lag**: How many blocks behind (should be < 100 when caught up)
- **lagPercentage**: Percentage behind the chain

## Troubleshooting

### Database Connection Errors

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Fix**: Make sure PostgreSQL is running:

```bash
# macOS
brew services start postgresql

# Linux
sudo systemctl start postgresql
```

### RPC Connection Errors

```
Error: Failed to connect CosmWasm client
```

**Fix**:
- Check `RPC_ENDPOINT` is correct and accessible
- Verify network connectivity
- Try a different RPC node if available

### Missing Factory Address

```
Error: Missing required environment variable: FACTORY_ADDRESS
```

**Fix**: Add your factory contract address to `.env`:

```env
FACTORY_ADDRESS="wasm1yourfactoryaddresshere"
```

### Indexer Falls Behind

If lag keeps increasing:

1. **Increase batch size**: Process more blocks per batch
   ```env
   BATCH_SIZE=500
   ```

2. **Check RPC limits**: Some nodes rate-limit requests
3. **Optimize database**: Add more indexes if needed
4. **Use faster RPC node**: Archive nodes are often faster

### Blockchain Reorganization

```
[warn]: Blockchain reorg detected! { lastHeight: 1050000, expectedHash: 'abc...', actualHash: 'def...' }
[warn]: Handling blockchain reorganization { fromHeight: 1050000 }
```

This is normal on some chains. The indexer will:
1. Detect the reorg
2. Roll back affected data
3. Re-process from a safe height

## Database Inspection

Use Prisma Studio to inspect the database:

```bash
npm run db:studio
```

Opens at http://localhost:5555

## Stopping the Indexer

Press `Ctrl+C` for graceful shutdown. The indexer will:

1. Stop processing new blocks
2. Finish current block
3. Save checkpoint
4. Close database connections
5. Exit cleanly

## Next Steps

- Monitor logs for errors
- Check database for indexed data
- Verify events are being captured correctly
- Set up Phase 3 (GraphQL API) for querying data

## Production Deployment

For production, consider:

1. **Process Manager**: Use PM2, systemd, or Docker
2. **Monitoring**: Set up alerts for lag, errors, crashes
3. **Database Backups**: Regular PostgreSQL backups
4. **High Availability**: Multiple RPC endpoints, connection pooling
5. **Logging**: Ship logs to aggregation service (ELK, Datadog, etc.)

Example with PM2:

```bash
npm install -g pm2
pm2 start npm --name "stone-indexer" -- start
pm2 save
pm2 startup
```
