# Stone Finance E2E Testing

End-to-end testing infrastructure for Stone Finance.

## Quick Start

```bash
# From project root

# 1. Build contracts and start the blockchain
make e2e-build
cd e2e && docker compose -f docker-compose.e2e.yml up -d wasmd postgres

# 2. Verify chain is running
curl http://localhost:26657/status | jq '.result.node_info.network'
# Should output: "stone-local-1"
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    E2E Test Runner (Playwright)                  │
└─────────────────────────────────────────────────────────────────┘
                    │                 │                 │
         ┌──────────┴──────┐         │          ┌──────┴──────┐
         ▼                 ▼         ▼          ▼             │
┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│   Frontend   │  │   Indexer    │  │    wasmd     │         │
│  :3000       │  │ GraphQL :4000│  │  RPC :26657  │         │
└──────────────┘  └──────────────┘  └──────────────┘         │
                         │                   │               │
                         ▼                   │               │
                  ┌──────────────┐           │               │
                  │  PostgreSQL  │◀──────────┘               │
                  │    :5432     │     (indexes events)      │
                  └──────────────┘                           │
```

## Services

| Service | Port | URL | Status |
|---------|------|-----|--------|
| wasmd (blockchain) | 26657 | http://localhost:26657 | ✅ Working |
| wasmd REST API | 1317 | http://localhost:1317 | ✅ Working |
| PostgreSQL | 5432 | localhost:5432 | ✅ Working |
| Indexer GraphQL | 4000 | http://localhost:4000/graphql | ⚠️ Has build issues |
| Frontend | 3000 | http://localhost:3000 | ⚠️ Has build issues |

## Commands

### Using Make (from project root)

```bash
# Build WASM contracts
make build

# Build and prepare artifacts for E2E
make e2e-build

# Start full stack (may fail if frontend/indexer have issues)
make e2e-up

# Stop everything
make e2e-down

# View logs
make e2e-logs

# Clean all E2E data
make e2e-clean

# Show help
make help
```

### Using Docker Compose directly (from e2e/ directory)

```bash
# Start just blockchain + database (recommended for now)
docker compose -f docker-compose.e2e.yml up -d wasmd postgres

# Start all services
docker compose -f docker-compose.e2e.yml up -d

# View specific service logs
docker compose -f docker-compose.e2e.yml logs -f wasmd
docker compose -f docker-compose.e2e.yml logs -f postgres

# Stop and remove volumes
docker compose -f docker-compose.e2e.yml down -v

# Complete reset (removes chain data)
docker compose -f docker-compose.e2e.yml down -v && rm -rf chain
```

## Test Accounts

### Test User 1 (pre-funded)

**Mnemonic:**
```
notice oak worry limit wrap speak medal online prefer cluster roof addict wrist behave treat actual wasp year salad speed social layer crew genius
```

**Address:** `wasm1cyyzpxplxdzkeea7kwsydadg87357qna465cff`

**Balances:**
- 1,000,000 ATOM (1000000000000 uatom)
- 1,000,000 USDC (1000000000000 uusdc)
- 1,000,000 STONE (1000000000000 ustone)
- 1,000,000 STAKE (1000000000000 stake)

### Validator

**Mnemonic:**
```
satisfy adjust timber high purchase tuition stool faith fine install that you unaware feed domain license impose boss human eager hat rent enjoy dawn
```

**Address:** `wasm1phaxpevm5wecex2jyaqty2a4v02qj7qmauqnty`

## Chain Configuration

- **Chain ID:** `stone-local-1`
- **Block time:** ~1 second
- **Staking denom:** `stake`
- **Test tokens:** `uatom`, `uusdc`, `ustone`

## Verifying the Chain

```bash
# Check chain status
curl -s http://localhost:26657/status | jq '.result.node_info'

# Check account balance
curl -s "http://localhost:1317/cosmos/bank/v1beta1/balances/wasm1cyyzpxplxdzkeea7kwsydadg87357qna465cff" | jq

# Get latest block
curl -s http://localhost:26657/block | jq '.result.block.header.height'
```

## Interacting with the Chain

You can use CosmJS or any Cosmos SDK compatible wallet/tool:

```typescript
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { GasPrice } from '@cosmjs/stargate';

const mnemonic = "notice oak worry limit wrap speak medal online prefer cluster roof addict wrist behave treat actual wasp year salad speed social layer crew genius";

const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: 'wasm' });
const [account] = await wallet.getAccounts();

const client = await SigningCosmWasmClient.connectWithSigner(
  'http://localhost:26657',
  wallet,
  { gasPrice: GasPrice.fromString('0.025stake') }
);

// Now you can deploy contracts, execute transactions, etc.
```

## Troubleshooting

### Chain won't start
```bash
# Reset chain data completely
docker compose -f docker-compose.e2e.yml down -v
rm -rf chain
docker compose -f docker-compose.e2e.yml up -d wasmd
```

### Port already in use
```bash
# Check what's using the port
lsof -i :26657

# Kill the process or change the port in docker-compose.e2e.yml
```

### Container keeps restarting
```bash
# Check logs for errors
docker compose -f docker-compose.e2e.yml logs wasmd

# Common issues:
# - Invalid mnemonic: Check init-chain.sh for proper mnemonic format
# - Wrong denom: Use 'stake' not 'ustake' for staking
```

## Directory Structure

```
e2e/
├── docker-compose.e2e.yml    # Docker orchestration
├── playwright.config.ts       # Playwright test config
├── package.json              # Dependencies
├── chain/                    # Chain data (gitignored)
├── scripts/
│   ├── init-chain.sh         # Chain initialization
│   ├── deploy-contracts.ts   # Contract deployment
│   └── cleanup.ts            # Teardown
├── fixtures/
│   ├── test-accounts.ts      # Test wallets
│   └── mock-oracle-prices.ts # Price data
├── tests/
│   ├── smoke/               # Health checks
│   ├── markets/             # Market tests
│   ├── indexer/             # GraphQL tests
│   └── integration/         # Full flow tests
└── utils/
    ├── chain-client.ts      # CosmJS wrapper
    └── graphql-client.ts    # GraphQL client
```

## Known Issues

1. **Frontend build fails** - Missing `lib/utils/format.ts` module
2. **Indexer build fails** - TypeScript errors in existing code
3. **macOS ARM64** - wasmd image runs under emulation (slower but works)

These are pre-existing issues in the frontend/indexer code, not E2E infrastructure problems. The blockchain itself runs correctly.
