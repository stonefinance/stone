# GraphQL API

This directory contains the GraphQL API implementation for querying indexed blockchain data.

## Structure

```
api/
├── schema.graphql          # GraphQL schema definition
├── server.ts               # Apollo Server setup with WebSocket support
├── context.ts              # GraphQL context (Prisma + DataLoaders)
├── scalars.ts              # Custom scalar types (DateTime, BigInt, Decimal, JSON)
└── resolvers/
    ├── index.ts            # Combined resolvers export
    ├── queries.ts          # Query resolvers
    ├── fields.ts           # Type field resolvers
    └── subscriptions.ts    # Subscription resolvers + PubSub
```

## Features

✅ **Queries**
- Markets (with filters)
- User positions
- Transactions
- Market snapshots
- Interest accrual events

✅ **Subscriptions** (WebSocket)
- `marketUpdated` - Real-time market state changes
- `newTransaction` - Live transaction feed
- `positionUpdated` - User position updates

✅ **Performance**
- DataLoader for batching and caching
- Efficient Prisma queries
- Pagination support

## Usage

### GraphQL Playground

Open http://localhost:4000/graphql in your browser to access the GraphQL Playground.

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

**Subscribe to market updates:**
```graphql
subscription {
  marketUpdated(marketId: "abc123") {
    totalSupply
    totalDebt
    utilization
  }
}
```

## Development

The GraphQL server starts automatically with the indexer. No separate process needed.

## Configuration

Set `API_PORT` in `.env` to change the port (default: 4000).

## Schema Changes

After modifying `schema.graphql`, restart the server. The schema is loaded at startup.
