# Stone Finance Indexer

A blockchain indexer for Stone Finance's isolated lending markets. Indexes Factory and Market contract events to provide a queryable GraphQL API.

## Architecture

```
Blockchain RPC → Event Indexer → PostgreSQL → GraphQL API → Frontend
```

## Features

- **Real-time Event Processing**: Monitors Factory and Market contract events
- **PostgreSQL Database**: Stores markets, positions, transactions, and snapshots
- **GraphQL API**: Query markets, positions, and transaction history
- **TypeScript**: Fully typed with strict mode enabled
- **Prisma ORM**: Type-safe database access and migrations

## Project Structure

```
indexer/
├── src/
│   ├── api/           # GraphQL API ✅
│   │   ├── schema.graphql    # GraphQL schema
│   │   ├── server.ts         # Apollo Server
│   │   ├── context.ts        # GraphQL context
│   │   ├── scalars.ts        # Custom scalars
│   │   └── resolvers/        # Query, mutation, subscription resolvers
│   ├── config/        # Configuration management
│   ├── db/            # Database client and utilities
│   ├── events/        # Event types, parsers, and handlers
│   ├── indexer/       # Block processor and event extraction
│   ├── utils/         # Utilities (logger, blockchain client)
│   └── index.ts       # Main entry point ✅
├── prisma/
│   └── schema.prisma  # Database schema
├── docs/              # Documentation
├── package.json
└── tsconfig.json
```

## Quick Start with E2E Stack

The easiest way to run the indexer is with the full E2E stack using Docker Compose.

### Start the Stack

From the repository root:

```bash
# Build contracts and start all services
make e2e-up
```

This starts:
- **wasmd**: Local CosmWasm blockchain at `http://localhost:26657`
- **postgres**: PostgreSQL database at `localhost:5432`
- **deployer**: Deploys contracts and creates test markets
- **indexer**: GraphQL API at `http://localhost:4000/graphql`

### Access the Indexer

- **GraphQL Playground**: Open `http://localhost:4000/graphql` in your browser
- **Health Check**: `curl http://localhost:4000/health`

### View Logs

```bash
# All services
make e2e-logs

# Indexer only
docker logs -f stone-indexer
```

### Stop the Stack

```bash
make e2e-down
```

---

## Manual Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- A CosmWasm RPC endpoint

### Installation

```bash
cd indexer
npm install
```

### Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/stone_indexer?schema=public"

# Blockchain RPC
RPC_ENDPOINT="https://rpc.testnet.example.com"
CHAIN_ID="testnet-1"

# Contracts
FACTORY_ADDRESS="wasm1..."
MARKET_CODE_ID="1"

# Indexer Configuration
START_BLOCK_HEIGHT=1
BATCH_SIZE=100
POLL_INTERVAL_MS=1000

# API Server
API_PORT=4000
ENABLE_SUBSCRIPTIONS=true

# Logging
LOG_LEVEL="info"
```

### Database Setup

Generate Prisma client:

```bash
npm run db:generate
```

Push schema to database (for development):

```bash
npm run db:push
```

Or create and run migrations (for production):

```bash
npm run db:migrate
```

## Development

Start the indexer in development mode:

```bash
npm run dev
```

This starts both the block indexer and GraphQL API server.

## GraphQL API

The indexer exposes a GraphQL API for querying indexed data.

**Endpoint:** `http://localhost:4000/graphql`
**Playground:** Open the endpoint in browser for interactive queries
**Subscriptions:** `ws://localhost:4000/graphql`

### Example Queries

**Get all markets:**
```graphql
query {
  markets(limit: 10) {
    id
    collateralDenom
    debtDenom
    totalSupply
    totalDebt
    borrowRate
  }
}
```

**Get user positions:**
```graphql
query {
  userPositions(userAddress: "wasm1...") {
    market {
      collateralDenom
      debtDenom
    }
    supplyAmount
    debtAmount
    healthFactor
  }
}
```

**Subscribe to market updates (WebSocket):**
```graphql
subscription {
  marketUpdated(marketId: "abc123") {
    totalSupply
    totalDebt
    utilization
  }
}
```

See [docs/API_DESIGN.md](./docs/API_DESIGN.md) for full API documentation.

## Database Schema

### Core Tables

- **markets**: Market configurations and state
- **user_positions**: User supply/borrow/collateral positions
- **transactions**: All market transactions
- **market_snapshots**: Historical market state snapshots
- **interest_accrual_events**: Interest rate updates
- **indexer_state**: Track last processed block

## Event Handlers

The indexer processes the following events:

### Factory Events
- `market_instantiated`: New market creation

### Market Events
- `supply`: User supplies debt asset
- `withdraw`: User withdraws debt asset
- `supply_collateral`: User supplies collateral
- `withdraw_collateral`: User withdraws collateral
- `borrow`: User borrows debt asset
- `repay`: User repays debt
- `liquidate`: Liquidation event
- `accrue_interest`: Interest rate update
- `update_params`: Market parameter changes

## Scripts

- `npm run dev` - Start in development mode with hot reload
- `npm run build` - Build for production
- `npm start` - Start production build
- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push schema to database
- `npm run db:migrate` - Create and run migrations
- `npm run db:studio` - Open Prisma Studio
- `npm run lint` - Lint code
- `npm run format` - Format code

## How Event Detection Works

**Important:** This indexer does NOT use WebSockets. CosmWasm indexers work by:

1. **Polling blocks** from the blockchain RPC endpoint
2. **Extracting transactions** from each block sequentially
3. **Parsing wasm events** from transaction results
4. **Filtering by contract address** (Factory or Market contracts)
5. **Processing events** and writing to database

See [docs/EVENT_DETECTION.md](./docs/EVENT_DETECTION.md) for detailed explanation.

## Current Status

### Phase 1: Core Infrastructure ✅
- [x] Project structure setup
- [x] Database schema and Prisma configuration
- [x] Blockchain RPC connection
- [x] Event parser for Factory & Market events
- [x] Basic event handlers with DB writes

### Phase 2: Event Processing ✅
- [x] Main indexer loop with block polling
- [x] Transaction handling & rollback support
- [x] Reorg detection & handling
- [x] Comprehensive error handling & logging
- [x] Graceful shutdown
- [ ] Testing with historical data

### Phase 3: API Layer ✅
- [x] GraphQL server setup (Apollo Server 4)
- [x] Implement queries (markets, positions, transactions, snapshots)
- [x] Pagination, filtering, sorting
- [x] WebSocket subscriptions (real-time updates)
- [x] DataLoader optimization
- [ ] Redis caching layer (optional enhancement)

### Phase 4: Advanced Features (TODO)
- [ ] Oracle price integration
- [ ] Computed fields (health factor, etc.)
- [ ] Snapshot background jobs
- [ ] Liquidation opportunity detection
- [ ] Rate limiting & monitoring

## License

MIT
