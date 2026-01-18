# API Overview - Quick Reference

## What API Does the Indexer Expose?

The indexer exposes a **GraphQL API** that serves indexed blockchain data to the frontend application.

## Endpoint

- **URL**: `http://localhost:4000/graphql` (configurable via `API_PORT`)
- **Protocol**: HTTP POST for queries, WebSocket for subscriptions
- **Format**: GraphQL (JSON over HTTP)

## Key Features

✅ **Flexible Queries** - Request exactly the data you need
✅ **Type Safety** - Strongly typed schema
✅ **Nested Data** - Fetch related data in one request
✅ **Real-time Updates** - WebSocket subscriptions
✅ **Pagination** - Handle large datasets
✅ **Filtering** - Search by market, user, action, time, etc.

## Main Query Categories

### 1. Markets
- Get single market by ID or address
- List all markets (with filters)
- Count total markets
- Filter by curator, collateral, debt denom

### 2. User Positions
- Get user's position in a market
- List all positions for a user
- Find liquidatable positions
- Computed fields: health factor, current balances

### 3. Transactions
- Get transaction details
- List transactions (with filters)
- Filter by market, user, action type
- Historical activity

### 4. Market History
- Market snapshots over time
- Interest rate history
- Time-series data for charts

### 5. Real-time Subscriptions
- Market updates
- New transactions
- Position changes

## Example Queries

### Get Market Data
```graphql
query {
  market(id: "abc123") {
    collateralDenom
    debtDenom
    totalSupply
    totalDebt
    borrowRate
  }
}
```

### Get User Positions
```graphql
query {
  userPositions(userAddress: "wasm1user...") {
    market { collateralDenom, debtDenom }
    supplyAmount
    debtAmount
    healthFactor
  }
}
```

### Watch Market Updates (WebSocket)
```graphql
subscription {
  marketUpdated(marketId: "abc123") {
    totalSupply
    totalDebt
    utilization
  }
}
```

## Frontend Integration

The frontend can use Apollo Client to query the API:

```typescript
import { ApolloClient, InMemoryCache, gql } from '@apollo/client';

const client = new ApolloClient({
  uri: 'http://localhost:4000/graphql',
  cache: new InMemoryCache(),
});

// Query markets
const { data } = await client.query({
  query: gql`
    query {
      markets(limit: 10) {
        id
        collateralDenom
        debtDenom
        totalSupply
      }
    }
  `,
});
```

## Status

**Current**: ⏳ Not implemented yet (Phase 3)
**Required**: ✅ Yes - Frontend needs this to display data
**Priority**: High - This is the interface between indexer and UI

## See Also

- [API_DESIGN.md](./API_DESIGN.md) - Full API specification
- [../INDEXER_PLAN.md](../../docs/INDEXER_PLAN.md) - Original plan
- [GraphQL Documentation](https://graphql.org/learn/) - Learn GraphQL

## Implementation Phases

**Phase 1** ✅ Database & Event Indexing - DONE
**Phase 2** ✅ Block Processing - DONE
**Phase 3** ⏳ GraphQL API - NEXT
**Phase 4** ⏳ Advanced Features (oracle integration, health factor, etc.)

Would you like me to implement the GraphQL API next?
