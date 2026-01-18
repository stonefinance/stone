# Stone Finance Indexer API Design

## Overview

The indexer exposes a **GraphQL API** that allows the frontend to query indexed blockchain data. The API provides real-time and historical data about markets, user positions, transactions, and more.

## Why GraphQL?

- **Flexible queries**: Frontend can request exactly the data it needs
- **Type safety**: Schema provides strong typing for all data
- **Nested queries**: Can fetch related data in a single request
- **Real-time subscriptions**: WebSocket support for live updates
- **Great tooling**: GraphQL Playground, Apollo Client, etc.

## API Endpoints

### Base URL
```
http://localhost:4000/graphql  (development)
https://api.example.com/graphql (production)
```

### GraphQL Playground
```
http://localhost:4000/graphql
```
Browser-based IDE for testing queries

## Main Queries

### 1. Market Queries

#### Get Single Market
```graphql
query GetMarket {
  market(id: "abc123...") {
    id
    marketAddress
    curator
    collateralDenom
    debtDenom
    oracle

    # Current state
    totalSupply
    totalDebt
    totalCollateral
    utilization
    borrowRate
    liquidityRate

    # Parameters
    loanToValue
    liquidationThreshold
    enabled
  }
}
```

**Use case**: Display market details page

#### Get Market by Address
```graphql
query GetMarketByAddress {
  marketByAddress(address: "wasm1...") {
    id
    collateralDenom
    debtDenom
    totalSupply
    totalDebt
  }
}
```

**Use case**: Look up market when you have contract address

#### List All Markets
```graphql
query ListMarkets {
  markets(
    limit: 20
    offset: 0
    enabledOnly: true
  ) {
    id
    collateralDenom
    debtDenom
    totalSupply
    totalDebt
    utilization
    borrowRate
    liquidityRate
  }
}
```

**Use case**: Display markets list on homepage

#### Filter Markets by Curator
```graphql
query MarketsByCurator {
  markets(curator: "wasm1curator...") {
    id
    collateralDenom
    debtDenom
    curator
  }
}
```

**Use case**: Show all markets created by a specific curator

#### Filter Markets by Asset
```graphql
query MarketsByCollateral {
  markets(collateralDenom: "uatom") {
    id
    debtDenom
    totalCollateral
    enabled
  }
}
```

**Use case**: Find all markets using ATOM as collateral

### 2. User Position Queries

#### Get User Position in Market
```graphql
query GetUserPosition {
  userPosition(
    marketId: "abc123..."
    userAddress: "wasm1user..."
  ) {
    supplyScaled
    debtScaled
    collateral

    # Computed values
    supplyAmount
    debtAmount
    healthFactor

    # Market context
    market {
      collateralDenom
      debtDenom
      borrowIndex
      liquidityIndex
    }
  }
}
```

**Use case**: Show user's position in a specific market

#### Get All User Positions
```graphql
query GetUserPositions {
  userPositions(userAddress: "wasm1user...") {
    id
    market {
      id
      collateralDenom
      debtDenom
    }
    supplyAmount
    debtAmount
    collateral
    healthFactor
  }
}
```

**Use case**: Dashboard showing all user's positions across markets

#### Get Positions with Debt
```graphql
query GetBorrowPositions {
  userPositions(
    userAddress: "wasm1user..."
    hasDebt: true
  ) {
    market {
      collateralDenom
      debtDenom
    }
    debtAmount
    collateral
    healthFactor
  }
}
```

**Use case**: Show only positions where user has borrowed

#### Find Liquidatable Positions
```graphql
query LiquidatablePositions {
  liquidatablePositions(limit: 20) {
    userAddress
    market {
      id
      collateralDenom
      debtDenom
      liquidationBonus
    }
    debtAmount
    collateral
    healthFactor
  }
}
```

**Use case**: Liquidation bot finding opportunities

### 3. Transaction Queries

#### Get Transaction Details
```graphql
query GetTransaction {
  transaction(id: "txhash:0") {
    txHash
    blockHeight
    timestamp
    action
    userAddress
    amount

    market {
      collateralDenom
      debtDenom
    }

    # State snapshot
    totalSupply
    totalDebt
    utilization
  }
}
```

**Use case**: Transaction detail page

#### List Recent Transactions
```graphql
query RecentTransactions {
  transactions(limit: 50, offset: 0) {
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

**Use case**: Activity feed on homepage

#### Filter Transactions by Market
```graphql
query MarketTransactions {
  transactions(marketId: "abc123...", limit: 100) {
    timestamp
    action
    userAddress
    amount
    totalSupply
    totalDebt
  }
}
```

**Use case**: Market activity history

#### Filter Transactions by User
```graphql
query UserTransactions {
  transactions(userAddress: "wasm1user...", limit: 100) {
    timestamp
    action
    amount
    market {
      collateralDenom
      debtDenom
    }
  }
}
```

**Use case**: User transaction history

#### Filter Transactions by Action Type
```graphql
query LiquidationTransactions {
  transactions(action: LIQUIDATE, limit: 20) {
    timestamp
    liquidator
    borrower
    debtRepaid
    collateralSeized
    protocolFee
    market {
      collateralDenom
      debtDenom
    }
  }
}
```

**Use case**: Liquidation activity tracking

### 4. Historical Data Queries

#### Market Snapshots (Time Series)
```graphql
query MarketHistory {
  marketSnapshots(
    marketId: "abc123..."
    fromTime: "2024-01-01T00:00:00Z"
    toTime: "2024-01-31T23:59:59Z"
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

**Use case**: Charts showing market metrics over time

#### Interest Rate History
```graphql
query InterestRateHistory {
  interestAccrualEvents(
    marketId: "abc123..."
    fromTime: "2024-01-01T00:00:00Z"
    limit: 1000
  ) {
    timestamp
    borrowIndex
    liquidityIndex
    borrowRate
    liquidityRate
  }
}
```

**Use case**: Interest rate charts, APY calculations

### 5. Aggregate Queries

#### Market Count
```graphql
query MarketStats {
  marketCount
}
```

**Use case**: "Total markets: 42"

## Subscriptions (Real-time Updates)

### Subscribe to Market Updates
```graphql
subscription WatchMarket {
  marketUpdated(marketId: "abc123...") {
    totalSupply
    totalDebt
    utilization
    borrowRate
    liquidityRate
  }
}
```

**Use case**: Live-updating market metrics on UI

### Subscribe to New Transactions
```graphql
subscription WatchTransactions {
  newTransaction(marketId: "abc123...") {
    action
    userAddress
    amount
    timestamp
  }
}
```

**Use case**: Real-time activity feed

### Subscribe to Position Updates
```graphql
subscription WatchUserPosition {
  positionUpdated(userAddress: "wasm1user...") {
    market {
      id
      collateralDenom
      debtDenom
    }
    supplyAmount
    debtAmount
    healthFactor
  }
}
```

**Use case**: Live updates when user's position changes

## Example Use Cases

### 1. Market Details Page
```graphql
query MarketDetailsPage($marketId: ID!) {
  market(id: $marketId) {
    # Basic info
    collateralDenom
    debtDenom
    curator
    oracle

    # Current state
    totalSupply
    totalDebt
    totalCollateral
    utilization
    borrowRate
    liquidityRate
    availableLiquidity

    # Parameters
    loanToValue
    liquidationThreshold
    liquidationBonus
    supplyCap
    borrowCap
    enabled

    # Recent transactions
    transactions(limit: 10) {
      timestamp
      action
      userAddress
      amount
    }
  }

  # Historical data for charts
  marketSnapshots(
    marketId: $marketId
    limit: 100
  ) {
    timestamp
    totalSupply
    totalDebt
    utilization
    borrowRate
  }
}
```

### 2. User Dashboard
```graphql
query UserDashboard($userAddress: String!) {
  # All user positions
  userPositions(userAddress: $userAddress) {
    market {
      id
      collateralDenom
      debtDenom
      borrowRate
      liquidityRate
    }
    supplyAmount
    debtAmount
    collateral
    healthFactor
  }

  # Recent user transactions
  transactions(userAddress: $userAddress, limit: 20) {
    timestamp
    action
    amount
    market {
      collateralDenom
      debtDenom
    }
  }
}
```

### 3. Liquidation Bot
```graphql
query LiquidationOpportunities {
  liquidatablePositions(limit: 50) {
    userAddress
    market {
      id
      marketAddress
      collateralDenom
      debtDenom
      liquidationBonus
      liquidationProtocolFee
      closeFactor
    }
    debtAmount
    collateral
    healthFactor
  }
}
```

### 4. Analytics Page
```graphql
query PlatformAnalytics {
  # Total markets
  marketCount

  # All markets with stats
  markets(limit: 100) {
    collateralDenom
    debtDenom
    totalSupply
    totalDebt
    totalCollateral
    utilization
    borrowRate
    liquidityRate
  }

  # Recent platform activity
  transactions(limit: 100) {
    timestamp
    action
    amount
    market {
      collateralDenom
      debtDenom
    }
  }
}
```

## Nested Queries

One of GraphQL's strengths is nested data fetching:

```graphql
query ComplexQuery {
  market(id: "abc123...") {
    collateralDenom
    debtDenom

    # Nested: positions in this market
    positions {
      userAddress
      supplyAmount
      debtAmount

      # Nested: user's transactions
      transactions(limit: 5) {
        action
        amount
        timestamp
      }
    }
  }
}
```

## Computed Fields

Some fields are computed on-the-fly (not stored in DB):

### `supplyAmount` (UserPosition)
```
supplyAmount = supplyScaled * market.liquidityIndex
```

### `debtAmount` (UserPosition)
```
debtAmount = debtScaled * market.borrowIndex
```

### `healthFactor` (UserPosition)
```
collateralValue = collateral * collateralPrice (from oracle)
debtValue = debtAmount * debtPrice (from oracle)
healthFactor = (collateralValue * liquidationThreshold) / debtValue
```

### `availableLiquidity` (Market)
```
totalSupply = totalSupplyScaled * liquidityIndex
totalDebt = totalDebtScaled * borrowIndex
availableLiquidity = totalSupply - totalDebt
```

## Pagination

All list queries support pagination:

```graphql
query PaginatedMarkets {
  markets(limit: 20, offset: 40) {
    id
    collateralDenom
  }
}
```

For better performance with large datasets, consider cursor-based pagination (future enhancement).

## Error Handling

GraphQL errors are returned in a standard format:

```json
{
  "errors": [
    {
      "message": "Market not found",
      "path": ["market"],
      "extensions": {
        "code": "NOT_FOUND"
      }
    }
  ],
  "data": null
}
```

## Performance Considerations

1. **DataLoader**: Batch and cache database queries
2. **Depth Limiting**: Prevent deeply nested queries
3. **Rate Limiting**: Limit requests per user/IP
4. **Query Complexity**: Assign cost to each field, limit total cost
5. **Caching**: Redis for frequently accessed data
6. **Indexes**: Database indexes on commonly queried fields

## Authentication (Optional)

For public read-only API, no auth needed. For write operations or private data:

```http
Authorization: Bearer <jwt-token>
```

## CORS

Configure CORS to allow frontend domains:

```typescript
cors: {
  origin: ['https://app.stonefinance.io', 'http://localhost:3000']
}
```

## Next Steps

To implement this API, we need to:

1. Set up Apollo Server
2. Define GraphQL schema (types, queries, subscriptions)
3. Implement resolvers for each query
4. Add DataLoader for optimized queries
5. Set up WebSocket for subscriptions
6. Add error handling and validation
7. Deploy alongside the indexer

Would you like me to implement Phase 3 (the GraphQL API)?
