# Stone Finance Indexer Development Plan

## Overview

This document outlines the architecture and implementation plan for the Stone Finance blockchain indexer. The indexer processes on-chain events from the Factory and Market contracts to provide a queryable API for the frontend.

## Technology Stack Options

### Option A: Cosmos-Native (Recommended)

**Indexer Framework:**
- [SubQuery](https://subquery.network/) - Cosmos indexing framework
- Or custom indexer using [CosmJS](https://github.com/cosmos/cosmjs) + [cosmwasm-js](https://github.com/CosmWasm/cosmwasm-js)

**Database:** PostgreSQL 14+

**API Layer:** GraphQL (via SubQuery) or REST API (custom)

**Real-time:** WebSocket subscriptions for live updates

**Deployment:** Docker containers + managed PostgreSQL

### Option B: Custom Indexer

**Event Listener:** CosmJS/CosmWasm RPC client

**Database:** PostgreSQL with Prisma ORM

**API:** tRPC or GraphQL (Apollo Server)

**Real-time:** WebSocket / Server-Sent Events

**Deployment:** Node.js application + PostgreSQL

## Architecture

```
┌─────────────────┐
│  Blockchain RPC │
│   (CosmWasm)    │
└────────┬────────┘
         │
         │ Events Stream
         ▼
┌─────────────────┐
│  Event Indexer  │
│   - Parser      │
│   - Validator   │
│   - Processor   │
└────────┬────────┘
         │
         │ Writes
         ▼
┌─────────────────┐
│   PostgreSQL    │
│   - Markets     │
│   - Positions   │
│   - Txns        │
│   - Snapshots   │
└────────┬────────┘
         │
         │ Queries
         ▼
┌─────────────────┐
│   GraphQL/REST  │
│      API        │
└────────┬────────┘
         │
         │ Requests
         ▼
┌─────────────────┐
│    Frontend     │
└─────────────────┘
```

## Database Schema

### Core Entities

#### Markets Table
```sql
CREATE TABLE markets (
    id VARCHAR(64) PRIMARY KEY,              -- market_id (hash)
    market_address VARCHAR(64) NOT NULL,
    curator VARCHAR(64) NOT NULL,
    collateral_denom VARCHAR(64) NOT NULL,
    debt_denom VARCHAR(64) NOT NULL,
    oracle VARCHAR(64) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    created_at_block BIGINT NOT NULL,

    -- Parameters (updated via UpdateParams)
    loan_to_value DECIMAL(20,18) NOT NULL,
    liquidation_threshold DECIMAL(20,18) NOT NULL,
    liquidation_bonus DECIMAL(20,18) NOT NULL,
    liquidation_protocol_fee DECIMAL(20,18) NOT NULL,
    close_factor DECIMAL(20,18) NOT NULL,
    interest_rate_model JSONB NOT NULL,
    protocol_fee DECIMAL(20,18) NOT NULL,
    curator_fee DECIMAL(20,18) NOT NULL,
    supply_cap NUMERIC(78,0),                -- Uint128 max
    borrow_cap NUMERIC(78,0),
    enabled BOOLEAN NOT NULL,
    is_mutable BOOLEAN NOT NULL,

    -- Current State (updated on every txn)
    borrow_index DECIMAL(20,18) NOT NULL,
    liquidity_index DECIMAL(20,18) NOT NULL,
    borrow_rate DECIMAL(20,18) NOT NULL,
    liquidity_rate DECIMAL(20,18) NOT NULL,
    total_supply_scaled NUMERIC(78,0) NOT NULL,
    total_debt_scaled NUMERIC(78,0) NOT NULL,
    total_collateral NUMERIC(78,0) NOT NULL,
    last_update BIGINT NOT NULL,

    -- Computed (derived fields)
    total_supply NUMERIC(78,0) GENERATED ALWAYS AS
        (FLOOR(total_supply_scaled::NUMERIC * liquidity_index)) STORED,
    total_debt NUMERIC(78,0) GENERATED ALWAYS AS
        (FLOOR(total_debt_scaled::NUMERIC * borrow_index)) STORED,
    utilization DECIMAL(20,18),              -- Computed: total_debt / total_supply
    available_liquidity NUMERIC(78,0),       -- Computed: total_supply - total_debt

    -- Indexes
    INDEX idx_markets_curator (curator),
    INDEX idx_markets_collateral (collateral_denom),
    INDEX idx_markets_debt (debt_denom),
    INDEX idx_markets_enabled (enabled)
);
```

#### User Positions Table
```sql
CREATE TABLE user_positions (
    id VARCHAR(128) PRIMARY KEY,             -- {market_id}:{user_address}
    market_id VARCHAR(64) NOT NULL REFERENCES markets(id),
    user_address VARCHAR(64) NOT NULL,

    -- Current balances (scaled)
    supply_scaled NUMERIC(78,0) NOT NULL DEFAULT 0,
    debt_scaled NUMERIC(78,0) NOT NULL DEFAULT 0,
    collateral NUMERIC(78,0) NOT NULL DEFAULT 0,

    -- Metadata
    first_interaction TIMESTAMP NOT NULL,
    last_interaction TIMESTAMP NOT NULL,

    -- Indexes
    INDEX idx_positions_market (market_id),
    INDEX idx_positions_user (user_address),
    INDEX idx_positions_debt (debt_scaled) WHERE debt_scaled > 0,
    UNIQUE INDEX idx_positions_market_user (market_id, user_address)
);
```

#### Transactions Table
```sql
CREATE TABLE transactions (
    id VARCHAR(128) PRIMARY KEY,             -- {tx_hash}:{log_index}
    tx_hash VARCHAR(64) NOT NULL,
    block_height BIGINT NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    market_id VARCHAR(64) NOT NULL REFERENCES markets(id),
    user_address VARCHAR(64) NOT NULL,
    action VARCHAR(32) NOT NULL,             -- Supply, Withdraw, Borrow, etc.

    -- Common fields (nullable)
    amount NUMERIC(78,0),
    scaled_amount NUMERIC(78,0),
    recipient VARCHAR(64),

    -- Liquidation-specific
    liquidator VARCHAR(64),
    borrower VARCHAR(64),
    debt_repaid NUMERIC(78,0),
    collateral_seized NUMERIC(78,0),
    protocol_fee NUMERIC(78,0),

    -- Market state snapshot at time of transaction
    total_supply NUMERIC(78,0),
    total_debt NUMERIC(78,0),
    total_collateral NUMERIC(78,0),
    utilization DECIMAL(20,18),

    -- Indexes
    INDEX idx_txns_block (block_height DESC),
    INDEX idx_txns_timestamp (timestamp DESC),
    INDEX idx_txns_market (market_id, timestamp DESC),
    INDEX idx_txns_user (user_address, timestamp DESC),
    INDEX idx_txns_action (action, timestamp DESC),
    INDEX idx_txns_hash (tx_hash)
);
```

#### Market Snapshots Table
```sql
CREATE TABLE market_snapshots (
    id VARCHAR(128) PRIMARY KEY,             -- {market_id}:{timestamp}
    market_id VARCHAR(64) NOT NULL REFERENCES markets(id),
    timestamp TIMESTAMP NOT NULL,
    block_height BIGINT NOT NULL,

    -- Snapshot all market state
    borrow_index DECIMAL(20,18) NOT NULL,
    liquidity_index DECIMAL(20,18) NOT NULL,
    borrow_rate DECIMAL(20,18) NOT NULL,
    liquidity_rate DECIMAL(20,18) NOT NULL,
    total_supply NUMERIC(78,0) NOT NULL,
    total_debt NUMERIC(78,0) NOT NULL,
    total_collateral NUMERIC(78,0) NOT NULL,
    utilization DECIMAL(20,18) NOT NULL,

    -- Snapshot all params (for historical tracking)
    loan_to_value DECIMAL(20,18) NOT NULL,
    liquidation_threshold DECIMAL(20,18) NOT NULL,
    enabled BOOLEAN NOT NULL,

    -- Indexes
    INDEX idx_snapshots_market_time (market_id, timestamp DESC),
    UNIQUE INDEX idx_snapshots_market_timestamp (market_id, timestamp)
);
```

#### Interest Accrual Events Table
```sql
CREATE TABLE interest_accrual_events (
    id VARCHAR(128) PRIMARY KEY,             -- {tx_hash}:{log_index}
    market_id VARCHAR(64) NOT NULL REFERENCES markets(id),
    tx_hash VARCHAR(64) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    block_height BIGINT NOT NULL,

    borrow_index DECIMAL(20,18) NOT NULL,
    liquidity_index DECIMAL(20,18) NOT NULL,
    borrow_rate DECIMAL(20,18) NOT NULL,
    liquidity_rate DECIMAL(20,18) NOT NULL,

    -- Indexes
    INDEX idx_accrual_market_time (market_id, timestamp DESC)
);
```

## Event Handlers

### Factory Events

#### MarketCreated
```typescript
async function handleMarketCreated(event: MarketCreatedEvent) {
    await db.markets.create({
        id: event.market_id,
        market_address: event.market_address,
        curator: event.curator,
        collateral_denom: event.collateral_denom,
        debt_denom: event.debt_denom,
        oracle: event.oracle,
        created_at: event.timestamp,
        created_at_block: event.block_height,

        // Initialize with default params (fetched from contract)
        // ... fetch params via contract query

        // Initialize state
        borrow_index: "1.0",
        liquidity_index: "1.0",
        borrow_rate: "0",
        liquidity_rate: "0",
        total_supply_scaled: "0",
        total_debt_scaled: "0",
        total_collateral: "0",
        last_update: event.timestamp,
    });
}
```

### Market Events

#### Supply
```typescript
async function handleSupply(event: SupplyEvent) {
    // Update market state
    await db.markets.update({
        where: { id: event.market_id },
        data: {
            total_supply_scaled: event.total_supply_scaled,
            // ... other state from event
        }
    });

    // Update user position
    await db.user_positions.upsert({
        where: { id: `${event.market_id}:${event.recipient}` },
        create: {
            market_id: event.market_id,
            user_address: event.recipient,
            supply_scaled: event.scaled_amount,
            first_interaction: event.timestamp,
            last_interaction: event.timestamp,
        },
        update: {
            supply_scaled: { increment: event.scaled_amount },
            last_interaction: event.timestamp,
        }
    });

    // Create transaction record
    await db.transactions.create({
        id: `${event.tx_hash}:${event.log_index}`,
        tx_hash: event.tx_hash,
        block_height: event.block_height,
        timestamp: event.timestamp,
        market_id: event.market_id,
        user_address: event.supplier,
        action: "Supply",
        amount: event.amount,
        scaled_amount: event.scaled_amount,
        recipient: event.recipient,
        total_supply: event.total_supply,
        total_debt: event.total_debt,
        utilization: event.utilization,
    });
}
```

#### Borrow
```typescript
async function handleBorrow(event: BorrowEvent) {
    // Update market state
    await db.markets.update({
        where: { id: event.market_id },
        data: {
            total_debt_scaled: event.total_debt_scaled,
            // ... other state from event
        }
    });

    // Update user position
    await db.user_positions.upsert({
        where: { id: `${event.market_id}:${event.borrower}` },
        create: {
            market_id: event.market_id,
            user_address: event.borrower,
            debt_scaled: event.scaled_amount,
            first_interaction: event.timestamp,
            last_interaction: event.timestamp,
        },
        update: {
            debt_scaled: { increment: event.scaled_amount },
            last_interaction: event.timestamp,
        }
    });

    // Create transaction record
    await db.transactions.create({
        // ... similar to Supply
        action: "Borrow",
    });
}
```

#### Repay
```typescript
async function handleRepay(event: RepayEvent) {
    // Update market state
    await db.markets.update({
        where: { id: event.market_id },
        data: {
            total_debt_scaled: { decrement: event.scaled_decrease },
            // ... other state
        }
    });

    // Update user position
    const position = await db.user_positions.findUnique({
        where: { id: `${event.market_id}:${event.borrower}` }
    });

    const newDebtScaled = Math.max(0, position.debt_scaled - event.scaled_decrease);

    await db.user_positions.update({
        where: { id: `${event.market_id}:${event.borrower}` },
        data: {
            debt_scaled: newDebtScaled,
            last_interaction: event.timestamp,
        }
    });

    // Create transaction record
    await db.transactions.create({
        // ... similar structure
        action: "Repay",
    });
}
```

#### Liquidate
```typescript
async function handleLiquidate(event: LiquidateEvent) {
    // Update market state
    await db.markets.update({
        where: { id: event.market_id },
        data: {
            total_debt_scaled: { decrement: event.scaled_debt_decrease },
            total_collateral: { decrement: event.collateral_seized },
            // ... other state
        }
    });

    // Update borrower position
    const position = await db.user_positions.findUnique({
        where: { id: `${event.market_id}:${event.borrower}` }
    });

    await db.user_positions.update({
        where: { id: `${event.market_id}:${event.borrower}` },
        data: {
            debt_scaled: { decrement: event.scaled_debt_decrease },
            collateral: { decrement: event.collateral_seized },
            last_interaction: event.timestamp,
        }
    });

    // Create transaction record
    await db.transactions.create({
        id: `${event.tx_hash}:${event.log_index}`,
        // ... common fields
        action: "Liquidate",
        liquidator: event.liquidator,
        borrower: event.borrower,
        debt_repaid: event.debt_repaid,
        collateral_seized: event.collateral_seized,
        protocol_fee: event.protocol_fee,
        total_supply: event.total_supply,
        total_debt: event.total_debt,
        total_collateral: event.total_collateral,
        utilization: event.utilization,
    });
}
```

#### AccrueInterest
```typescript
async function handleAccrueInterest(event: AccrueInterestEvent) {
    // Update market state
    await db.markets.update({
        where: { id: event.market_id },
        data: {
            borrow_index: event.borrow_index,
            liquidity_index: event.liquidity_index,
            borrow_rate: event.borrow_rate,
            liquidity_rate: event.liquidity_rate,
            last_update: event.last_update,
        }
    });

    // Create interest accrual event
    await db.interest_accrual_events.create({
        id: `${event.tx_hash}:${event.log_index}`,
        market_id: event.market_id,
        tx_hash: event.tx_hash,
        timestamp: event.timestamp,
        block_height: event.block_height,
        borrow_index: event.borrow_index,
        liquidity_index: event.liquidity_index,
        borrow_rate: event.borrow_rate,
        liquidity_rate: event.liquidity_rate,
    });

    // Optionally create snapshot if interval elapsed (e.g., hourly)
    if (shouldCreateSnapshot(event.timestamp)) {
        await createMarketSnapshot(event.market_id, event.timestamp);
    }
}
```

#### UpdateParams
```typescript
async function handleUpdateParams(event: UpdateParamsEvent) {
    // Update market params with full snapshot
    await db.markets.update({
        where: { id: event.market_id },
        data: {
            loan_to_value: event.final_ltv,
            liquidation_threshold: event.final_liquidation_threshold,
            liquidation_bonus: event.final_liquidation_bonus,
            liquidation_protocol_fee: event.final_liquidation_protocol_fee,
            close_factor: event.final_close_factor,
            protocol_fee: event.final_protocol_fee,
            curator_fee: event.final_curator_fee,
            supply_cap: event.final_supply_cap === "none" ? null : event.final_supply_cap,
            borrow_cap: event.final_borrow_cap === "none" ? null : event.final_borrow_cap,
            enabled: event.final_enabled,
            is_mutable: event.final_is_mutable,
        }
    });

    // Create snapshot to track parameter changes
    await createMarketSnapshot(event.market_id, event.timestamp);
}
```

## GraphQL API Schema

```graphql
type Market {
  id: ID!
  marketAddress: String!
  curator: String!
  collateralDenom: String!
  debtDenom: String!
  oracle: String!
  createdAt: DateTime!
  createdAtBlock: Int!

  # Parameters
  loanToValue: Decimal!
  liquidationThreshold: Decimal!
  liquidationBonus: Decimal!
  liquidationProtocolFee: Decimal!
  closeFactor: Decimal!
  interestRateModel: JSON!
  protocolFee: Decimal!
  curatorFee: Decimal!
  supplyCap: BigInt
  borrowCap: BigInt
  enabled: Boolean!
  isMutable: Boolean!

  # Current State
  borrowIndex: Decimal!
  liquidityIndex: Decimal!
  borrowRate: Decimal!
  liquidityRate: Decimal!
  totalSupply: BigInt!
  totalDebt: BigInt!
  totalCollateral: BigInt!
  utilization: Decimal!
  availableLiquidity: BigInt!
  lastUpdate: Int!

  # Relations
  positions: [UserPosition!]!
  transactions(limit: Int, offset: Int): [Transaction!]!
  snapshots(limit: Int, orderBy: SnapshotOrder): [MarketSnapshot!]!
}

type UserPosition {
  id: ID!
  market: Market!
  userAddress: String!

  # Balances
  supplyScaled: BigInt!
  debtScaled: BigInt!
  collateral: BigInt!

  # Computed (with current indices)
  supplyAmount: BigInt!
  debtAmount: BigInt!
  healthFactor: Decimal

  # Metadata
  firstInteraction: DateTime!
  lastInteraction: DateTime!

  # Relations
  transactions(limit: Int, offset: Int): [Transaction!]!
}

type Transaction {
  id: ID!
  txHash: String!
  blockHeight: Int!
  timestamp: DateTime!
  market: Market!
  userAddress: String!
  action: TransactionAction!

  # Common fields
  amount: BigInt
  scaledAmount: BigInt
  recipient: String

  # Liquidation-specific
  liquidator: String
  borrower: String
  debtRepaid: BigInt
  collateralSeized: BigInt
  protocolFee: BigInt

  # Market state at time of txn
  totalSupply: BigInt
  totalDebt: BigInt
  totalCollateral: BigInt
  utilization: Decimal
}

enum TransactionAction {
  SUPPLY
  WITHDRAW
  SUPPLY_COLLATERAL
  WITHDRAW_COLLATERAL
  BORROW
  REPAY
  LIQUIDATE
}

type MarketSnapshot {
  id: ID!
  market: Market!
  timestamp: DateTime!
  blockHeight: Int!

  borrowIndex: Decimal!
  liquidityIndex: Decimal!
  borrowRate: Decimal!
  liquidityRate: Decimal!
  totalSupply: BigInt!
  totalDebt: BigInt!
  totalCollateral: BigInt!
  utilization: Decimal!

  loanToValue: Decimal!
  liquidationThreshold: Decimal!
  enabled: Boolean!
}

type InterestAccrualEvent {
  id: ID!
  market: Market!
  txHash: String!
  timestamp: DateTime!
  blockHeight: Int!

  borrowIndex: Decimal!
  liquidityIndex: Decimal!
  borrowRate: Decimal!
  liquidityRate: Decimal!
}

# Queries

type Query {
  # Markets
  market(id: ID!): Market
  marketByAddress(address: String!): Market
  markets(
    limit: Int = 20
    offset: Int = 0
    curator: String
    collateralDenom: String
    debtDenom: String
    enabledOnly: Boolean = false
  ): [Market!]!
  marketCount: Int!

  # User Positions
  userPosition(marketId: ID!, userAddress: String!): UserPosition
  userPositions(
    userAddress: String!
    hasDebt: Boolean
  ): [UserPosition!]!

  # Liquidatable positions
  liquidatablePositions(
    limit: Int = 20
    offset: Int = 0
  ): [UserPosition!]!

  # Transactions
  transaction(id: ID!): Transaction
  transactions(
    limit: Int = 20
    offset: Int = 0
    marketId: ID
    userAddress: String
    action: TransactionAction
  ): [Transaction!]!

  # Snapshots
  marketSnapshots(
    marketId: ID!
    fromTime: DateTime
    toTime: DateTime
    limit: Int = 100
  ): [MarketSnapshot!]!

  # Interest accrual
  interestAccrualEvents(
    marketId: ID!
    fromTime: DateTime
    toTime: DateTime
    limit: Int = 100
  ): [InterestAccrualEvent!]!
}

# Subscriptions (for real-time updates)

type Subscription {
  marketUpdated(marketId: ID!): Market!
  newTransaction(marketId: ID): Transaction!
  positionUpdated(userAddress: String!): UserPosition!
}
```

## Computed Fields & Derived Data

Several values need to be computed on the fly or in background jobs:

### Real-time Calculations (via Oracle)

These require live oracle price queries:

```typescript
// Health factor calculation
async function calculateHealthFactor(position: UserPosition): Promise<Decimal | null> {
    const market = await db.markets.findUnique({ where: { id: position.market_id } });

    // Get current debt
    const debtAmount = position.debt_scaled * market.borrow_index;
    if (debtAmount === 0) return null;

    // Query oracle for prices
    const collateralPrice = await queryOraclePrice(market.oracle, market.collateral_denom);
    const debtPrice = await queryOraclePrice(market.oracle, market.debt_denom);

    const collateralValue = position.collateral * collateralPrice;
    const debtValue = debtAmount * debtPrice;

    return (collateralValue * market.liquidation_threshold) / debtValue;
}

// Liquidation price
async function calculateLiquidationPrice(position: UserPosition): Promise<Decimal> {
    const market = await db.markets.findUnique({ where: { id: position.market_id } });
    const debtAmount = position.debt_scaled * market.borrow_index;
    const debtPrice = await queryOraclePrice(market.oracle, market.debt_denom);

    const debtValue = debtAmount * debtPrice;

    // Price where health factor = 1.0
    return debtValue / (position.collateral * market.liquidation_threshold);
}

// Available to borrow
async function calculateAvailableToBorrow(position: UserPosition): Promise<BigInt> {
    const market = await db.markets.findUnique({ where: { id: position.market_id } });

    const collateralPrice = await queryOraclePrice(market.oracle, market.collateral_denom);
    const debtPrice = await queryOraclePrice(market.oracle, market.debt_denom);

    const collateralValue = position.collateral * collateralPrice;
    const maxBorrowValue = collateralValue * market.loan_to_value;

    const currentDebt = position.debt_scaled * market.borrow_index;
    const currentDebtValue = currentDebt * debtPrice;

    const availableValue = maxBorrowValue - currentDebtValue;
    return availableValue / debtPrice;
}
```

### Background Jobs

#### Snapshot Creation
```typescript
// Create hourly snapshots
async function createHourlySnapshots() {
    const markets = await db.markets.findMany();
    const now = new Date();

    for (const market of markets) {
        await db.market_snapshots.create({
            id: `${market.id}:${now.toISOString()}`,
            market_id: market.id,
            timestamp: now,
            block_height: await getCurrentBlockHeight(),

            // Copy all current market state
            borrow_index: market.borrow_index,
            liquidity_index: market.liquidity_index,
            // ... etc
        });
    }
}

// Run every hour
setInterval(createHourlySnapshots, 60 * 60 * 1000);
```

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- [ ] Set up PostgreSQL database
- [ ] Create database schema & migrations
- [ ] Set up blockchain RPC connection
- [ ] Implement event parser for Factory & Market events
- [ ] Create basic event handlers (no DB writes yet)

### Phase 2: Event Processing (Week 2)
- [ ] Implement all event handlers with DB writes
- [ ] Add transaction handling & rollback support
- [ ] Implement reorg detection & handling
- [ ] Add comprehensive error handling & logging
- [ ] Test with historical blockchain data

### Phase 3: API Layer (Week 2-3)
- [ ] Set up GraphQL server (Apollo)
- [ ] Implement all queries from schema
- [ ] Add pagination, filtering, sorting
- [ ] Implement WebSocket subscriptions
- [ ] Add caching layer (Redis)

### Phase 4: Advanced Features (Week 3-4)
- [ ] Implement oracle price integration
- [ ] Add computed fields (health factor, etc.)
- [ ] Create snapshot background jobs
- [ ] Add liquidation opportunity detection
- [ ] Implement rate limiting & monitoring

### Phase 5: Testing & Deployment (Week 4)
- [ ] Write integration tests
- [ ] Load testing & optimization
- [ ] Set up monitoring & alerts
- [ ] Deploy to staging
- [ ] Deploy to production

## Performance Considerations

### Indexing Strategy
- **Parallel Processing:** Process independent events in parallel
- **Batch Inserts:** Batch database writes when possible
- **Checkpoint System:** Track last processed block for restart recovery

### Database Optimization
- **Indexes:** Add indexes on frequently queried fields
- **Partitioning:** Partition transactions table by time
- **Materialized Views:** Use for complex aggregations
- **Connection Pooling:** Configure appropriate pool size

### Caching Strategy
- **Redis:** Cache frequently accessed data (markets, positions)
- **TTL:** Short TTL for dynamic data (30s-60s)
- **Invalidation:** Cache invalidation on updates via subscriptions

### Query Optimization
- **Data Loader:** Use DataLoader pattern to batch queries
- **Query Limits:** Enforce reasonable limits on paginated queries
- **Cursor Pagination:** Use cursor-based pagination for large datasets

## Monitoring & Observability

### Metrics to Track
- Events processed per second
- Database query latency
- API response times
- Cache hit rate
- Block processing lag (current block vs indexed block)

### Alerts
- Indexer stopped/crashed
- Block processing lag > 100 blocks
- Database connection failures
- API error rate > threshold

### Logging
- Structured JSON logging
- Log levels: DEBUG, INFO, WARN, ERROR
- Include trace IDs for request tracking

## Security Considerations

- **Input Validation:** Validate all blockchain data before DB insertion
- **Rate Limiting:** Protect API from abuse
- **SQL Injection:** Use parameterized queries (handled by ORM)
- **DoS Protection:** Limit query complexity & depth
- **Access Control:** Consider API authentication for write operations

## Next Steps

1. Choose indexer framework (SubQuery vs Custom)
2. Set up development environment
3. Deploy PostgreSQL database
4. Begin Phase 1 implementation

---

**Document Version:** 1.0
**Last Updated:** 2026-01-18
**Maintainer:** Development Team
