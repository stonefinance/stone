# Stone Finance

An isolated lending markets protocol for CosmWasm blockchains. Each market is a separate contract instance providing true isolation—bad debt in one market cannot affect another.

## Overview

Stone Finance implements a factory pattern where:

- **Factory Contract** deploys and tracks all market instances
- **Market Contracts** operate independently with their own token balances
- **Curators** create markets with custom parameters and earn fees
- **True Isolation** prevents bad debt contagion between markets

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Factory Contract                      │
│  - Deploys new market instances                         │
│  - Tracks all markets                                   │
│  - Collects creation fees                               │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Market A   │  │   Market B   │  │   Market C   │
│  ATOM/USDC   │  │  OSMO/USDC   │  │ stATOM/ATOM  │
└──────────────┘  └──────────────┘  └──────────────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          ▼
                    ┌──────────┐
                    │ Indexer  │
                    │ GraphQL  │
                    └──────────┘
                          │
                          ▼
                    ┌──────────┐
                    │ Frontend │
                    │ Next.js  │
                    └──────────┘
```

## Project Structure

```
stone-finance/
├── contracts/           # CosmWasm smart contracts
│   ├── factory/         # Factory contract for deploying markets
│   ├── market/          # Individual lending market contract
│   └── mock-oracle/     # Oracle for testing
├── frontend/            # Next.js web application
├── indexer/             # Blockchain indexer with GraphQL API
├── docs/                # Technical documentation
├── e2e/                 # End-to-end tests
└── packages/            # Shared packages
```

## Prerequisites

- **Rust** 1.75+ with `wasm32-unknown-unknown` target
- **Node.js** 18+
- **Docker** (for PostgreSQL)

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/stone-finance.git
cd stone-finance
```

### 2. Build Smart Contracts

```bash
# Install Rust dependencies
rustup target add wasm32-unknown-unknown

# Build all contracts
cargo build --release --target wasm32-unknown-unknown

# Run contract tests
cargo test
```

### 3. Set Up the Indexer

```bash
cd indexer

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database and RPC settings

# Generate Prisma client
npm run db:generate

# Push database schema
npm run db:push

# Start the indexer
npm run dev
```

### 4. Set Up the Frontend

```bash
cd frontend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your configuration

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Configuration

### Frontend Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_CHAIN_ID` | Cosmos chain ID (e.g., `osmo-test-5`) |
| `NEXT_PUBLIC_RPC_ENDPOINT` | RPC endpoint URL |
| `NEXT_PUBLIC_REST_ENDPOINT` | REST endpoint URL |
| `NEXT_PUBLIC_FACTORY_ADDRESS` | Deployed factory contract address |
| `NEXT_PUBLIC_GRAPHQL_ENDPOINT` | Indexer GraphQL endpoint |

### Indexer Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `RPC_ENDPOINT` | Blockchain RPC endpoint |
| `FACTORY_ADDRESS` | Factory contract address to index |
| `START_BLOCK` | Block height to start indexing from |

## Smart Contract Deployment

### 1. Upload Contract Code

```bash
# Upload market contract
osmosisd tx wasm store artifacts/market.wasm \
  --from deployer --gas auto --gas-adjustment 1.3

# Upload factory contract
osmosisd tx wasm store artifacts/factory.wasm \
  --from deployer --gas auto --gas-adjustment 1.3
```

### 2. Instantiate Factory

```bash
osmosisd tx wasm instantiate $FACTORY_CODE_ID '{
  "owner": "osmo1...",
  "market_code_id": '$MARKET_CODE_ID',
  "market_creation_fee": {"denom": "uosmo", "amount": "1000000"},
  "protocol_fee_collector": "osmo1..."
}' --from deployer --label "Stone Finance Factory" --admin osmo1...
```

### 3. Create a Market

```bash
osmosisd tx wasm execute $FACTORY_ADDRESS '{
  "create_market": {
    "collateral_denom": "uatom",
    "debt_denom": "ibc/...USDC",
    "oracle": "osmo1...",
    "params": {
      "max_ltv": "0.75",
      "liquidation_threshold": "0.80",
      "liquidation_bonus": "0.05"
    }
  }
}' --from curator --amount 1000000uosmo
```

## Development

### Running Tests

```bash
# Smart contract tests
cargo test

# Indexer tests
cd indexer && npm test

# Frontend tests
cd frontend && npm test

# End-to-end tests
cd e2e && npm test
```

### Building for Production

```bash
# Build optimized contracts
make build

# Build frontend
cd frontend && npm run build

# Build indexer
cd indexer && npm run build
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Smart Contracts | Rust, CosmWasm |
| Frontend | Next.js 14, TypeScript, TailwindCSS |
| Indexer | Node.js, TypeScript, Prisma, GraphQL |
| Database | PostgreSQL |
| Wallet | Keplr |

## Documentation

- [Events Reference](docs/EVENTS_REFERENCE.md) - Blockchain events emitted by contracts
- [Indexer Plan](docs/INDEXER_PLAN.md) - Indexer architecture and implementation
- [Frontend Plan](docs/FRONTEND_PLAN.md) - Frontend architecture and features

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

Copyright (c) 2026 Stone Finance. All rights reserved.

This software is proprietary and confidential. Unauthorized copying, distribution, or use of this software is strictly prohibited.
