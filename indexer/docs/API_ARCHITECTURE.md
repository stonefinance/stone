# API Architecture Recommendation

## Overview

Based on the use cases (real-time data + historical analytics/PnL), we recommend a **hybrid architecture**:

- **GraphQL** for flexible, real-time queries
- **REST** for analytics and heavy computations
- **Background jobs** for pre-calculated metrics

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend App                          │
└──────────────────┬────────────────────┬─────────────────────┘
                   │                    │
         GraphQL   │                    │  REST
         (real-time)                    │  (analytics)
                   │                    │
                   ▼                    ▼
┌──────────────────────────┐  ┌─────────────────────────┐
│   GraphQL API Server     │  │   REST API Server       │
│   (Apollo Server)        │  │   (Express)             │
│                          │  │                         │
│  - Markets               │  │  - /api/v1/pnl         │
│  - Positions             │  │  - /api/v1/analytics   │
│  - Transactions          │  │  - /api/v1/leaderboard │
│  - Real-time updates     │  │  - /api/v1/stats       │
└──────────────────┬───────┘  └────────┬────────────────┘
                   │                   │
                   └─────────┬─────────┘
                             │
                             ▼
                   ┌──────────────────┐
                   │   PostgreSQL     │
                   │                  │
                   │  - Raw data      │
                   │  - Computed      │
                   │    metrics       │
                   └──────────────────┘
                             ▲
                             │
                   ┌─────────┴─────────┐
                   │  Background Jobs  │
                   │                   │
                   │  - PnL calc       │
                   │  - Stats update   │
                   │  - Leaderboard    │
                   └───────────────────┘
```

## API Split

### GraphQL API (Port 4000)

**Endpoint**: `http://localhost:4000/graphql`

**Use Cases:**
- Display market list
- Show market details
- User position details
- Recent transaction feed
- Real-time updates (WebSocket)

**Example:**
```graphql
query {
  markets(limit: 10) {
    id
    collateralDenom
    totalSupply
    borrowRate
  }

  userPositions(userAddress: "wasm1...") {
    market { id }
    supplyAmount
    debtAmount
    healthFactor
  }
}
```

**Why GraphQL:**
- Flexible queries
- Real-time subscriptions
- Nested data fetching
- Type safety

### REST API (Port 4001)

**Endpoint**: `http://localhost:4001/api/v1`

**Use Cases:**
- User PnL calculations
- Historical analytics
- Leaderboards
- Market statistics
- Export data (CSV, JSON)

**Endpoints:**

#### User Analytics
```
GET /api/v1/users/{address}/pnl
GET /api/v1/users/{address}/pnl/{marketId}
GET /api/v1/users/{address}/history?from=X&to=Y&interval=1h
GET /api/v1/users/{address}/summary
```

**Response:**
```json
{
  "address": "wasm1...",
  "totalPnl": "1234.56",
  "realizedPnl": "800.00",
  "unrealizedPnl": "434.56",
  "byMarket": [
    {
      "marketId": "abc123",
      "collateralDenom": "uatom",
      "debtDenom": "uusdc",
      "pnl": "500.00",
      "roi": "0.15"
    }
  ],
  "calculatedAt": "2024-01-18T10:00:00Z"
}
```

#### Market Analytics
```
GET /api/v1/markets/{id}/stats
GET /api/v1/markets/{id}/history?from=X&to=Y&interval=1h
GET /api/v1/markets/{id}/top-suppliers
GET /api/v1/markets/{id}/top-borrowers
```

**Response:**
```json
{
  "marketId": "abc123",
  "stats": {
    "totalSupply": "1000000",
    "totalDebt": "800000",
    "utilization": "0.80",
    "avgBorrowRate24h": "0.05",
    "volume24h": "50000",
    "uniqueUsers": 42
  },
  "timeSeries": [
    {
      "timestamp": "2024-01-18T00:00:00Z",
      "totalSupply": "950000",
      "totalDebt": "750000",
      "borrowRate": "0.048"
    }
  ]
}
```

#### Platform Analytics
```
GET /api/v1/stats/platform
GET /api/v1/leaderboard/suppliers?limit=100
GET /api/v1/leaderboard/borrowers?limit=100
GET /api/v1/leaderboard/liquidators?limit=100
```

**Response:**
```json
{
  "platform": {
    "totalValueLocked": "5000000",
    "totalMarkets": 12,
    "totalUsers": 1234,
    "volume24h": "150000"
  },
  "topSuppliers": [
    {
      "address": "wasm1...",
      "totalSupplied": "100000",
      "marketsCount": 5
    }
  ]
}
```

**Why REST:**
- Optimized for specific use cases
- Easier to cache (CDN, Redis)
- Standard HTTP caching headers
- Better for exports/downloads

## PnL Calculation Strategy

### Approach 1: On-Demand (Simple, Slower)

Calculate when requested:

```typescript
GET /api/v1/users/{address}/pnl

// Pseudocode
1. Fetch all user transactions
2. For each market:
   - Track deposits/withdrawals
   - Track borrows/repays
   - Get current position
   - Calculate current value (using oracle prices)
3. Sum up: Current Value - Total Invested = PnL
```

**Pros:**
- ✅ Always accurate
- ✅ Simple to implement
- ✅ No storage overhead

**Cons:**
- ❌ Slow for users with many transactions
- ❌ Expensive oracle calls
- ❌ Can't cache effectively

### Approach 2: Pre-Computed (Complex, Faster)

Background job calculates periodically:

```sql
-- New table
CREATE TABLE user_pnl_cache (
  user_address VARCHAR(64),
  market_id VARCHAR(64),

  -- Invested
  total_supplied DECIMAL,
  total_withdrawn DECIMAL,
  total_borrowed DECIMAL,
  total_repaid DECIMAL,

  -- Current (from positions table)
  current_supply DECIMAL,
  current_debt DECIMAL,
  current_collateral DECIMAL,

  -- Computed
  realized_pnl DECIMAL,
  unrealized_pnl DECIMAL,
  total_pnl DECIMAL,
  roi DECIMAL,

  last_calculated TIMESTAMP,
  PRIMARY KEY (user_address, market_id)
);
```

**Background Job (runs every 5 minutes):**
```typescript
1. Get all users with positions
2. For each user:
   - Calculate PnL from transactions
   - Get current position value (oracle)
   - Store in cache table
3. Update timestamp
```

**API reads from cache:**
```typescript
GET /api/v1/users/{address}/pnl
→ SELECT * FROM user_pnl_cache WHERE user_address = ?
```

**Pros:**
- ✅ Very fast queries
- ✅ Scalable
- ✅ Can add complex metrics

**Cons:**
- ❌ Stale data (5-10 min lag)
- ❌ More complex
- ❌ Storage overhead

### Approach 3: Hybrid (Recommended)

Combine both approaches:

```typescript
GET /api/v1/users/{address}/pnl?refresh=false

if (refresh === true || cache is stale) {
  // Calculate on-demand
  calculatePnL(address)
  updateCache(address)
} else {
  // Return cached
  return cachedPnl(address)
}
```

**Pros:**
- ✅ Fast for most requests (cached)
- ✅ Accurate when needed (refresh)
- ✅ User can choose speed vs accuracy

## Implementation Plan

### Phase 3A: GraphQL API
1. Set up Apollo Server
2. Implement core queries (markets, positions, transactions)
3. Add WebSocket subscriptions
4. DataLoader for optimization

### Phase 3B: REST API
1. Set up Express server
2. Implement basic analytics endpoints
3. Add PnL calculation (on-demand)
4. Add caching (Redis)

### Phase 3C: Background Jobs
1. Create PnL calculation job
2. Pre-compute common metrics
3. Schedule regular updates
4. Add leaderboard generation

### Phase 3D: Optimization
1. Add database indexes for analytics
2. Implement CDN for static responses
3. Add rate limiting
4. Add monitoring/alerting

## Tech Stack

### GraphQL Server
- **Apollo Server** - GraphQL server
- **@graphql-tools/schema** - Schema building
- **graphql-subscriptions** - WebSocket support
- **dataloader** - Batching and caching

### REST Server
- **Express** - HTTP server
- **express-validator** - Input validation
- **express-rate-limit** - Rate limiting
- **compression** - Response compression

### Background Jobs
- **node-cron** - Job scheduling
- **bull** - Job queue (Redis-based)

### Caching
- **ioredis** - Redis client
- **cache-manager** - Multi-layer caching

### Monitoring
- **prom-client** - Prometheus metrics
- **winston** - Logging

## Deployment

Both servers can run in the same process or separately:

### Option 1: Combined (Development)
```typescript
// src/index.ts
startIndexer()  // Block processor
startGraphQL()  // GraphQL API on :4000
startREST()     // REST API on :4001
startJobs()     // Background jobs
```

### Option 2: Separate (Production)
```bash
# Service 1: Indexer only
npm run start:indexer

# Service 2: APIs + Jobs
npm run start:api

# Service 3: Jobs only (optional)
npm run start:jobs
```

## Which Should We Build First?

**Priority Order:**

1. **GraphQL API** (Phase 3A)
   - Most important for basic frontend
   - Markets, positions, transactions
   - Real-time updates

2. **REST Analytics** (Phase 3B)
   - PnL calculation (on-demand)
   - Basic stats

3. **Background Jobs** (Phase 3C)
   - Pre-computed PnL
   - Leaderboards

Would you like me to:
- **A)** Build GraphQL API first (Phase 3A)
- **B)** Build REST API for analytics (Phase 3B)
- **C)** Build both in hybrid architecture
- **D)** Use pure REST instead of GraphQL
