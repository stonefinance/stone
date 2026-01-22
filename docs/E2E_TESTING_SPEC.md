# Stone Finance E2E Testing Stack Specification

## Overview

This document specifies the end-to-end testing infrastructure for Stone Finance, enabling full-stack testing locally and in GitHub Actions workflows.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           E2E Test Runner (Playwright)                       │
│   • Browser automation for frontend                                          │
│   • API testing for GraphQL                                                  │
│   • Chain interaction via CosmJS                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
┌──────────────────────┐  ┌───────────────────┐  ┌──────────────────────┐
│   Frontend (Next.js) │  │ Indexer + GraphQL │  │  Local CosmWasm Node │
│   http://localhost:  │  │ http://localhost: │  │  http://localhost:   │
│       3000           │  │      4000         │  │       26657          │
└──────────────────────┘  └───────────────────┘  └──────────────────────┘
                                   │                        │
                                   ▼                        │
                          ┌──────────────────┐              │
                          │    PostgreSQL    │              │
                          │  localhost:5432  │              │
                          └──────────────────┘              │
                                   ▲                        │
                                   └────────────────────────┘
                                      (indexes chain events)
```

## Components

### 1. Local CosmWasm Chain (`wasmd`)

**Purpose**: Run a local blockchain for contract deployment and interaction.

**Implementation Options**:

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **wasmd (LocalOsmosis/LocalCosmos)** | Official, production-like | Heavier setup | ✅ Recommended |
| **cw-orchestrator** | Rust-native, fast | Less production-like | For unit tests |
| **cosmwasm-check** | Lightweight | Limited functionality | Not suitable |

**Selected: `wasmd` via Docker**

```yaml
# docker-compose.e2e.yml - wasmd service
wasmd:
  image: cosmwasm/wasmd:v0.53.0
  ports:
    - "26657:26657"  # RPC
    - "26656:26656"  # P2P
    - "1317:1317"    # REST
    - "9090:9090"    # gRPC
  environment:
    - CHAIN_ID=stone-local-1
    - STAKE_TOKEN=ustake
  volumes:
    - ./e2e/chain-data:/root/.wasmd
  command: ["wasmd", "start"]
```

**Chain Configuration**:
- Chain ID: `stone-local-1`
- Staking denom: `ustake`
- Fee denom: `ustone`
- Block time: 1 second (fast for testing)
- Genesis accounts with test tokens

### 2. Contract Deployment

**Purpose**: Deploy factory and market contracts to local chain.

**Approach**: Dedicated deployment script that:
1. Compiles contracts to WASM (if not pre-built)
2. Stores WASM bytecode on chain
3. Instantiates factory contract
4. Creates test markets with mock oracles

**Script Location**: `e2e/scripts/deploy-contracts.ts`

```typescript
// Deployment flow
interface DeploymentResult {
  factoryAddress: string;
  marketCodeId: number;
  testMarkets: {
    marketId: string;
    marketAddress: string;
    collateralDenom: string;
    debtDenom: string;
  }[];
  oracleAddress: string;
}

async function deployContracts(): Promise<DeploymentResult> {
  // 1. Store factory WASM
  // 2. Store market WASM
  // 3. Store mock oracle WASM (for testing)
  // 4. Instantiate factory
  // 5. Create test markets
  // 6. Return deployment info
}
```

### 3. PostgreSQL Database

**Purpose**: Store indexed blockchain data.

**Docker Service**:
```yaml
postgres:
  image: postgres:16-alpine
  ports:
    - "5432:5432"
  environment:
    POSTGRES_USER: stone
    POSTGRES_PASSWORD: stone_test
    POSTGRES_DB: stone_e2e
  volumes:
    - postgres_data:/var/lib/postgresql/data
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U stone"]
    interval: 5s
    timeout: 5s
    retries: 5
```

### 4. Indexer Service

**Purpose**: Index chain events and serve GraphQL API.

**Docker Service**:
```yaml
indexer:
  build:
    context: ./indexer
    dockerfile: Dockerfile
  ports:
    - "4000:4000"
  environment:
    DATABASE_URL: postgresql://stone:stone_test@postgres:5432/stone_e2e
    RPC_ENDPOINT: http://wasmd:26657
    CHAIN_ID: stone-local-1
    FACTORY_ADDRESS: ${FACTORY_ADDRESS}
    MARKET_CODE_ID: ${MARKET_CODE_ID}
    START_BLOCK_HEIGHT: 1
    POLL_INTERVAL_MS: 500
    LOG_LEVEL: debug
  depends_on:
    postgres:
      condition: service_healthy
    wasmd:
      condition: service_started
```

**Indexer Dockerfile** (`indexer/Dockerfile`):
```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
RUN npx prisma generate

CMD ["npm", "start"]
```

### 5. Frontend Service

**Purpose**: Serve the Next.js frontend for browser testing.

**Docker Service**:
```yaml
frontend:
  build:
    context: ./frontend
    dockerfile: Dockerfile.e2e
  ports:
    - "3000:3000"
  environment:
    NEXT_PUBLIC_CHAIN_ID: stone-local-1
    NEXT_PUBLIC_RPC_ENDPOINT: http://localhost:26657
    NEXT_PUBLIC_REST_ENDPOINT: http://localhost:1317
    NEXT_PUBLIC_GRAPHQL_ENDPOINT: http://localhost:4000/graphql
    NEXT_PUBLIC_FACTORY_ADDRESS: ${FACTORY_ADDRESS}
  depends_on:
    - indexer
```

**Frontend E2E Dockerfile** (`frontend/Dockerfile.e2e`):
```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

CMD ["npm", "start"]
```

### 6. E2E Test Runner (Playwright)

**Purpose**: Execute browser-based E2E tests.

**Configuration** (`e2e/playwright.config.ts`):
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results.json' }],
  ],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'docker compose -f docker-compose.e2e.yml up',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
```

---

## Directory Structure

```
stone-finance/
├── e2e/
│   ├── docker-compose.e2e.yml      # Full stack orchestration
│   ├── playwright.config.ts         # Playwright configuration
│   ├── package.json                 # E2E test dependencies
│   ├── tsconfig.json               # TypeScript config
│   │
│   ├── chain/
│   │   ├── genesis.json            # Chain genesis configuration
│   │   ├── config.toml             # Tendermint configuration
│   │   └── app.toml                # Application configuration
│   │
│   ├── scripts/
│   │   ├── deploy-contracts.ts     # Contract deployment
│   │   ├── setup-test-data.ts      # Create test accounts/positions
│   │   ├── wait-for-services.ts    # Health check script
│   │   └── cleanup.ts              # Teardown script
│   │
│   ├── fixtures/
│   │   ├── test-accounts.ts        # Test wallet configurations
│   │   ├── test-markets.ts         # Market configurations
│   │   └── mock-oracle-prices.ts   # Price feed data
│   │
│   ├── tests/
│   │   ├── smoke/
│   │   │   └── health.spec.ts      # Basic connectivity tests
│   │   │
│   │   ├── markets/
│   │   │   ├── list-markets.spec.ts
│   │   │   ├── market-detail.spec.ts
│   │   │   └── create-market.spec.ts
│   │   │
│   │   ├── lending/
│   │   │   ├── supply.spec.ts
│   │   │   ├── withdraw.spec.ts
│   │   │   ├── borrow.spec.ts
│   │   │   ├── repay.spec.ts
│   │   │   └── liquidation.spec.ts
│   │   │
│   │   ├── wallet/
│   │   │   ├── connect.spec.ts
│   │   │   └── transactions.spec.ts
│   │   │
│   │   ├── indexer/
│   │   │   ├── graphql-queries.spec.ts
│   │   │   ├── subscriptions.spec.ts
│   │   │   └── event-processing.spec.ts
│   │   │
│   │   └── integration/
│   │       ├── full-lending-flow.spec.ts
│   │       └── liquidation-scenario.spec.ts
│   │
│   └── utils/
│       ├── chain-client.ts         # CosmJS wrapper for tests
│       ├── graphql-client.ts       # GraphQL test client
│       ├── wallet-mock.ts          # Mock Keplr for testing
│       └── assertions.ts           # Custom test assertions
│
├── frontend/
│   └── Dockerfile.e2e              # E2E-specific frontend build
│
├── indexer/
│   └── Dockerfile                  # Indexer container
│
└── .github/
    └── workflows/
        └── e2e.yml                 # E2E GitHub Actions workflow
```

---

## Docker Compose Configuration

**Full `docker-compose.e2e.yml`**:

```yaml
version: '3.8'

services:
  # Local CosmWasm blockchain
  wasmd:
    image: cosmwasm/wasmd:v0.53.0
    container_name: stone-wasmd
    ports:
      - "26657:26657"
      - "26656:26656"
      - "1317:1317"
      - "9090:9090"
    volumes:
      - ./e2e/chain:/root/.wasmd
      - ./e2e/scripts/init-chain.sh:/init-chain.sh:ro
    entrypoint: ["/bin/sh", "/init-chain.sh"]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:26657/status"]
      interval: 5s
      timeout: 10s
      retries: 30
      start_period: 10s

  # PostgreSQL database
  postgres:
    image: postgres:16-alpine
    container_name: stone-postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: stone
      POSTGRES_PASSWORD: stone_test
      POSTGRES_DB: stone_e2e
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U stone -d stone_e2e"]
      interval: 5s
      timeout: 5s
      retries: 10

  # Contract deployer (one-shot)
  deployer:
    build:
      context: .
      dockerfile: e2e/Dockerfile.deployer
    container_name: stone-deployer
    environment:
      RPC_ENDPOINT: http://wasmd:26657
      CHAIN_ID: stone-local-1
    volumes:
      - ./artifacts:/artifacts:ro
      - deployment_state:/deployment
    depends_on:
      wasmd:
        condition: service_healthy

  # Blockchain indexer
  indexer:
    build:
      context: ./indexer
      dockerfile: Dockerfile
    container_name: stone-indexer
    ports:
      - "4000:4000"
    environment:
      DATABASE_URL: postgresql://stone:stone_test@postgres:5432/stone_e2e
      RPC_ENDPOINT: http://wasmd:26657
      CHAIN_ID: stone-local-1
      START_BLOCK_HEIGHT: 1
      POLL_INTERVAL_MS: 500
      API_PORT: 4000
      ENABLE_SUBSCRIPTIONS: "true"
      LOG_LEVEL: info
    env_file:
      - ./e2e/.env.deployment
    depends_on:
      postgres:
        condition: service_healthy
      deployer:
        condition: service_completed_successfully
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/health"]
      interval: 5s
      timeout: 10s
      retries: 20

  # Frontend application
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.e2e
    container_name: stone-frontend
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_CHAIN_ID: stone-local-1
      NEXT_PUBLIC_RPC_ENDPOINT: http://localhost:26657
      NEXT_PUBLIC_REST_ENDPOINT: http://localhost:1317
      NEXT_PUBLIC_GRAPHQL_ENDPOINT: http://localhost:4000/graphql
      NEXT_PUBLIC_WS_ENDPOINT: ws://localhost:4000/graphql
    env_file:
      - ./e2e/.env.deployment
    depends_on:
      indexer:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000"]
      interval: 5s
      timeout: 10s
      retries: 20

volumes:
  postgres_data:
  deployment_state:
```

---

## Chain Initialization Script

**`e2e/scripts/init-chain.sh`**:

```bash
#!/bin/sh
set -e

CHAIN_ID="stone-local-1"
MONIKER="stone-validator"
KEYRING_BACKEND="test"

# Genesis accounts (mnemonics stored in test fixtures)
VALIDATOR_MNEMONIC="satisfy adjust timber high purchase tuition stool faith fine install that you unaware feed domain license impose boss human eager hat rent enjoy dawn"
TEST_USER_1_MNEMONIC="notice oak worry limit wrap speak medal online prefer cluster roof addict wrist behave treat actual wasp year salad speed social layer crew genius"
TEST_USER_2_MNEMONIC="quality vacuum hard canal turtle phrase inflict attract muscle sketch jelly eager over ten income page nation favorite captain economy dignity spend nephew exhale"

# Initialize chain if not already done
if [ ! -f /root/.wasmd/config/genesis.json ]; then
    wasmd init $MONIKER --chain-id $CHAIN_ID

    # Configure for fast blocks
    sed -i 's/timeout_commit = "5s"/timeout_commit = "1s"/g' /root/.wasmd/config/config.toml
    sed -i 's/timeout_propose = "3s"/timeout_propose = "1s"/g' /root/.wasmd/config/config.toml

    # Enable API
    sed -i 's/enable = false/enable = true/g' /root/.wasmd/config/app.toml
    sed -i 's/swagger = false/swagger = true/g' /root/.wasmd/config/app.toml
    sed -i 's/enabled-unsafe-cors = false/enabled-unsafe-cors = true/g' /root/.wasmd/config/app.toml
    sed -i 's/cors_allowed_origins = \[\]/cors_allowed_origins = ["*"]/g' /root/.wasmd/config/config.toml

    # Add validator account
    echo "$VALIDATOR_MNEMONIC" | wasmd keys add validator --recover --keyring-backend $KEYRING_BACKEND

    # Add test user accounts
    echo "$TEST_USER_1_MNEMONIC" | wasmd keys add test_user_1 --recover --keyring-backend $KEYRING_BACKEND
    echo "$TEST_USER_2_MNEMONIC" | wasmd keys add test_user_2 --recover --keyring-backend $KEYRING_BACKEND

    # Add genesis accounts with tokens
    wasmd genesis add-genesis-account validator 1000000000000ustake,1000000000000ustone --keyring-backend $KEYRING_BACKEND
    wasmd genesis add-genesis-account test_user_1 1000000000000ustake,1000000000000ustone,1000000000000uatom,1000000000000uosmo --keyring-backend $KEYRING_BACKEND
    wasmd genesis add-genesis-account test_user_2 1000000000000ustake,1000000000000ustone,1000000000000uatom,1000000000000uosmo --keyring-backend $KEYRING_BACKEND

    # Create genesis transaction
    wasmd genesis gentx validator 100000000ustake --chain-id $CHAIN_ID --keyring-backend $KEYRING_BACKEND

    # Collect genesis transactions
    wasmd genesis collect-gentxs
fi

# Start the chain
exec wasmd start --rpc.laddr tcp://0.0.0.0:26657 --api.address tcp://0.0.0.0:1317
```

---

## Contract Deployment Script

**`e2e/scripts/deploy-contracts.ts`**:

```typescript
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { GasPrice } from '@cosmjs/stargate';
import * as fs from 'fs';

const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'http://localhost:26657';
const CHAIN_ID = process.env.CHAIN_ID || 'stone-local-1';
const DEPLOYER_MNEMONIC = process.env.DEPLOYER_MNEMONIC ||
  'satisfy adjust timber high purchase tuition stool faith fine install that you unaware feed domain license impose boss human eager hat rent enjoy dawn';

interface DeploymentResult {
  factoryAddress: string;
  factoryCodeId: number;
  marketCodeId: number;
  oracleAddress: string;
  oracleCodeId: number;
  testMarkets: TestMarket[];
}

interface TestMarket {
  marketId: string;
  marketAddress: string;
  collateralDenom: string;
  debtDenom: string;
}

async function main() {
  console.log('Starting contract deployment...');

  // Setup wallet
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(DEPLOYER_MNEMONIC, {
    prefix: 'wasm',
  });
  const [account] = await wallet.getAccounts();
  console.log(`Deployer address: ${account.address}`);

  // Connect to chain
  const client = await SigningCosmWasmClient.connectWithSigner(
    RPC_ENDPOINT,
    wallet,
    { gasPrice: GasPrice.fromString('0.025ustake') }
  );

  // Read WASM files
  const factoryWasm = fs.readFileSync('/artifacts/factory.wasm');
  const marketWasm = fs.readFileSync('/artifacts/market.wasm');
  const oracleWasm = fs.readFileSync('/artifacts/mock_oracle.wasm');

  // Upload contracts
  console.log('Uploading factory contract...');
  const factoryUpload = await client.upload(account.address, factoryWasm, 'auto');
  console.log(`Factory code ID: ${factoryUpload.codeId}`);

  console.log('Uploading market contract...');
  const marketUpload = await client.upload(account.address, marketWasm, 'auto');
  console.log(`Market code ID: ${marketUpload.codeId}`);

  console.log('Uploading mock oracle contract...');
  const oracleUpload = await client.upload(account.address, oracleWasm, 'auto');
  console.log(`Oracle code ID: ${oracleUpload.codeId}`);

  // Instantiate mock oracle
  console.log('Instantiating mock oracle...');
  const oracleResult = await client.instantiate(
    account.address,
    oracleUpload.codeId,
    {
      prices: [
        { denom: 'uatom', price: '10000000' },  // $10
        { denom: 'uosmo', price: '1000000' },   // $1
        { denom: 'ustone', price: '1000000' },  // $1
      ],
    },
    'Mock Oracle',
    'auto'
  );
  console.log(`Oracle address: ${oracleResult.contractAddress}`);

  // Instantiate factory
  console.log('Instantiating factory...');
  const factoryResult = await client.instantiate(
    account.address,
    factoryUpload.codeId,
    {
      market_code_id: marketUpload.codeId,
      market_creation_fee: { denom: 'ustake', amount: '1000000' },
      fee_collector: account.address,
    },
    'Stone Factory',
    'auto'
  );
  console.log(`Factory address: ${factoryResult.contractAddress}`);

  // Create test markets
  const testMarkets: TestMarket[] = [];

  // Market 1: ATOM/STONE (collateral/debt)
  console.log('Creating ATOM/STONE market...');
  const market1Result = await client.execute(
    account.address,
    factoryResult.contractAddress,
    {
      create_market: {
        collateral_denom: 'uatom',
        debt_denom: 'ustone',
        oracle: oracleResult.contractAddress,
        ltv: '750000',           // 75%
        liquidation_threshold: '800000',  // 80%
        liquidation_bonus: '50000',       // 5%
        interest_rate_model: {
          base_rate: '20000',    // 2%
          slope1: '40000',       // 4%
          slope2: '750000',      // 75%
          optimal_utilization: '800000',  // 80%
        },
      },
    },
    'auto',
    '',
    [{ denom: 'ustake', amount: '1000000' }]
  );

  // Parse market address from events
  const market1Address = market1Result.logs[0].events
    .find(e => e.type === 'wasm')
    ?.attributes.find(a => a.key === 'market_address')?.value || '';

  testMarkets.push({
    marketId: '1',
    marketAddress: market1Address,
    collateralDenom: 'uatom',
    debtDenom: 'ustone',
  });

  // Market 2: OSMO/STONE
  console.log('Creating OSMO/STONE market...');
  const market2Result = await client.execute(
    account.address,
    factoryResult.contractAddress,
    {
      create_market: {
        collateral_denom: 'uosmo',
        debt_denom: 'ustone',
        oracle: oracleResult.contractAddress,
        ltv: '650000',           // 65%
        liquidation_threshold: '750000',  // 75%
        liquidation_bonus: '80000',       // 8%
        interest_rate_model: {
          base_rate: '30000',    // 3%
          slope1: '50000',       // 5%
          slope2: '1000000',     // 100%
          optimal_utilization: '750000',  // 75%
        },
      },
    },
    'auto',
    '',
    [{ denom: 'ustake', amount: '1000000' }]
  );

  const market2Address = market2Result.logs[0].events
    .find(e => e.type === 'wasm')
    ?.attributes.find(a => a.key === 'market_address')?.value || '';

  testMarkets.push({
    marketId: '2',
    marketAddress: market2Address,
    collateralDenom: 'uosmo',
    debtDenom: 'ustone',
  });

  // Write deployment result
  const result: DeploymentResult = {
    factoryAddress: factoryResult.contractAddress,
    factoryCodeId: factoryUpload.codeId,
    marketCodeId: marketUpload.codeId,
    oracleAddress: oracleResult.contractAddress,
    oracleCodeId: oracleUpload.codeId,
    testMarkets,
  };

  // Write to shared volume for other services
  fs.writeFileSync('/deployment/result.json', JSON.stringify(result, null, 2));

  // Write .env file for docker-compose
  const envContent = `
NEXT_PUBLIC_FACTORY_ADDRESS=${result.factoryAddress}
FACTORY_ADDRESS=${result.factoryAddress}
MARKET_CODE_ID=${result.marketCodeId}
ORACLE_ADDRESS=${result.oracleAddress}
TEST_MARKET_1_ADDRESS=${testMarkets[0].marketAddress}
TEST_MARKET_2_ADDRESS=${testMarkets[1].marketAddress}
`.trim();

  fs.writeFileSync('/deployment/.env.deployment', envContent);

  console.log('Deployment complete!');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
```

---

## GitHub Actions Workflow

**`.github/workflows/e2e.yml`**:

```yaml
name: E2E Tests

on:
  push:
    branches: [master, main]
  pull_request:
    branches: [master, main]
  workflow_dispatch:  # Allow manual trigger

env:
  CARGO_TERM_COLOR: always

jobs:
  build-contracts:
    name: Build WASM Contracts
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-action@stable
        with:
          targets: wasm32-unknown-unknown

      - name: Cache Cargo
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            target
          key: ${{ runner.os }}-cargo-wasm-${{ hashFiles('**/Cargo.lock') }}

      - name: Build WASM contracts
        run: |
          cargo build --release --target wasm32-unknown-unknown -p factory
          cargo build --release --target wasm32-unknown-unknown -p market

          # Create artifacts directory
          mkdir -p artifacts
          cp target/wasm32-unknown-unknown/release/factory.wasm artifacts/
          cp target/wasm32-unknown-unknown/release/market.wasm artifacts/

          # Build mock oracle for testing (if exists)
          if [ -d "packages/testing" ]; then
            cargo build --release --target wasm32-unknown-unknown -p testing || true
          fi

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: wasm-contracts
          path: artifacts/
          retention-days: 1

  e2e-tests:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs: build-contracts

    steps:
      - uses: actions/checkout@v4

      - name: Download WASM contracts
        uses: actions/download-artifact@v4
        with:
          name: wasm-contracts
          path: artifacts/

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: |
            e2e/package-lock.json
            indexer/package-lock.json
            frontend/package-lock.json

      - name: Install E2E dependencies
        run: |
          cd e2e
          npm ci

      - name: Install Playwright browsers
        run: |
          cd e2e
          npx playwright install --with-deps chromium

      - name: Start E2E stack
        run: |
          docker compose -f e2e/docker-compose.e2e.yml up -d

          # Wait for services to be healthy
          timeout 180 bash -c 'until curl -s http://localhost:3000 > /dev/null; do sleep 5; done'
          timeout 60 bash -c 'until curl -s http://localhost:4000/health > /dev/null; do sleep 5; done'
          timeout 60 bash -c 'until curl -s http://localhost:26657/status > /dev/null; do sleep 5; done'

      - name: Run E2E tests
        run: |
          cd e2e
          npm test
        env:
          CI: true

      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: e2e/playwright-report/
          retention-days: 7

      - name: Upload test screenshots
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: test-screenshots
          path: e2e/test-results/
          retention-days: 7

      - name: Stop E2E stack
        if: always()
        run: |
          docker compose -f e2e/docker-compose.e2e.yml down -v
          docker compose -f e2e/docker-compose.e2e.yml rm -f
```

---

## E2E Test Package Configuration

**`e2e/package.json`**:

```json
{
  "name": "@stone-finance/e2e",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "playwright test",
    "test:headed": "playwright test --headed",
    "test:debug": "playwright test --debug",
    "test:ui": "playwright test --ui",
    "test:smoke": "playwright test --grep @smoke",
    "test:integration": "playwright test --grep @integration",
    "report": "playwright show-report",
    "stack:up": "docker compose -f docker-compose.e2e.yml up -d",
    "stack:down": "docker compose -f docker-compose.e2e.yml down -v",
    "stack:logs": "docker compose -f docker-compose.e2e.yml logs -f",
    "deploy": "tsx scripts/deploy-contracts.ts",
    "setup": "tsx scripts/setup-test-data.ts"
  },
  "devDependencies": {
    "@cosmjs/cosmwasm-stargate": "^0.32.4",
    "@cosmjs/proto-signing": "^0.32.4",
    "@cosmjs/stargate": "^0.32.4",
    "@playwright/test": "^1.48.0",
    "@types/node": "^20.10.0",
    "dotenv": "^16.3.1",
    "graphql": "^16.8.1",
    "graphql-request": "^6.1.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3"
  }
}
```

**`e2e/tsconfig.json`**:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./",
    "resolveJsonModule": true
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Sample E2E Tests

### Smoke Test

**`e2e/tests/smoke/health.spec.ts`**:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Smoke Tests @smoke', () => {
  test('frontend loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Stone Finance/);
  });

  test('markets page displays', async ({ page }) => {
    await page.goto('/markets');
    await expect(page.getByRole('heading', { name: /Markets/i })).toBeVisible();
  });

  test('GraphQL API is healthy', async ({ request }) => {
    const response = await request.get('http://localhost:4000/health');
    expect(response.ok()).toBeTruthy();
  });

  test('blockchain is running', async ({ request }) => {
    const response = await request.get('http://localhost:26657/status');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.result.node_info.network).toBe('stone-local-1');
  });

  test('test markets are indexed', async ({ request }) => {
    const response = await request.post('http://localhost:4000/graphql', {
      data: {
        query: `
          query {
            markets {
              id
              collateralDenom
              debtDenom
            }
          }
        `,
      },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.data.markets.length).toBeGreaterThan(0);
  });
});
```

### Lending Flow Test

**`e2e/tests/integration/full-lending-flow.spec.ts`**:

```typescript
import { test, expect } from '@playwright/test';
import { ChainClient } from '../../utils/chain-client';
import { TEST_USER_1_MNEMONIC } from '../../fixtures/test-accounts';

test.describe('Full Lending Flow @integration', () => {
  let chainClient: ChainClient;

  test.beforeAll(async () => {
    chainClient = await ChainClient.connect(TEST_USER_1_MNEMONIC);
  });

  test('complete supply → borrow → repay → withdraw flow', async ({ page }) => {
    // 1. Navigate to markets
    await page.goto('/markets');

    // 2. Select ATOM/STONE market
    await page.getByTestId('market-card-atom-stone').click();
    await expect(page).toHaveURL(/\/markets\/\d+/);

    // 3. Supply collateral (ATOM)
    await page.getByRole('button', { name: /Supply Collateral/i }).click();
    await page.getByTestId('amount-input').fill('100');
    await page.getByRole('button', { name: /Confirm/i }).click();

    // Wait for transaction
    await expect(page.getByText(/Transaction successful/i)).toBeVisible({ timeout: 30000 });

    // 4. Borrow (STONE)
    await page.getByRole('button', { name: /Borrow/i }).click();
    await page.getByTestId('amount-input').fill('50');
    await page.getByRole('button', { name: /Confirm/i }).click();

    await expect(page.getByText(/Transaction successful/i)).toBeVisible({ timeout: 30000 });

    // 5. Verify position
    await page.goto('/dashboard');
    await expect(page.getByTestId('collateral-balance')).toContainText('100');
    await expect(page.getByTestId('debt-balance')).toContainText('50');

    // 6. Repay debt
    await page.getByRole('button', { name: /Repay/i }).click();
    await page.getByTestId('amount-input').fill('50');
    await page.getByRole('button', { name: /Confirm/i }).click();

    await expect(page.getByText(/Transaction successful/i)).toBeVisible({ timeout: 30000 });

    // 7. Withdraw collateral
    await page.getByRole('button', { name: /Withdraw Collateral/i }).click();
    await page.getByTestId('amount-input').fill('100');
    await page.getByRole('button', { name: /Confirm/i }).click();

    await expect(page.getByText(/Transaction successful/i)).toBeVisible({ timeout: 30000 });

    // 8. Verify clean position
    await page.reload();
    await expect(page.getByTestId('collateral-balance')).toContainText('0');
    await expect(page.getByTestId('debt-balance')).toContainText('0');
  });
});
```

### GraphQL Test

**`e2e/tests/indexer/graphql-queries.spec.ts`**:

```typescript
import { test, expect } from '@playwright/test';
import { GraphQLClient, gql } from 'graphql-request';

const GRAPHQL_ENDPOINT = 'http://localhost:4000/graphql';

test.describe('GraphQL API @integration', () => {
  let client: GraphQLClient;

  test.beforeAll(() => {
    client = new GraphQLClient(GRAPHQL_ENDPOINT);
  });

  test('fetches all markets', async () => {
    const query = gql`
      query {
        markets {
          id
          collateralDenom
          debtDenom
          ltv
          liquidationThreshold
          totalSupply
          totalDebt
        }
      }
    `;

    const data = await client.request(query);
    expect(data.markets).toBeInstanceOf(Array);
    expect(data.markets.length).toBeGreaterThanOrEqual(2);
  });

  test('fetches single market with transactions', async () => {
    const query = gql`
      query GetMarket($id: ID!) {
        market(id: $id) {
          id
          collateralDenom
          debtDenom
          transactions(limit: 10) {
            id
            txHash
            action
            amount
          }
        }
      }
    `;

    const data = await client.request(query, { id: '1' });
    expect(data.market).toBeDefined();
    expect(data.market.collateralDenom).toBe('uatom');
  });

  test('fetches user positions', async () => {
    const query = gql`
      query GetUserPositions($userAddress: String!) {
        userPositions(userAddress: $userAddress) {
          marketId
          supplyBalance
          debtBalance
          collateralBalance
        }
      }
    `;

    const testAddress = 'wasm1...'; // Test user address
    const data = await client.request(query, { userAddress: testAddress });
    expect(data.userPositions).toBeInstanceOf(Array);
  });
});
```

---

## Utility Classes

### Chain Client

**`e2e/utils/chain-client.ts`**:

```typescript
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { GasPrice, Coin } from '@cosmjs/stargate';

const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'http://localhost:26657';

export class ChainClient {
  private constructor(
    public readonly client: SigningCosmWasmClient,
    public readonly address: string
  ) {}

  static async connect(mnemonic: string): Promise<ChainClient> {
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
      prefix: 'wasm',
    });
    const [account] = await wallet.getAccounts();

    const client = await SigningCosmWasmClient.connectWithSigner(
      RPC_ENDPOINT,
      wallet,
      { gasPrice: GasPrice.fromString('0.025ustake') }
    );

    return new ChainClient(client, account.address);
  }

  async supplyCollateral(
    marketAddress: string,
    amount: string,
    denom: string
  ): Promise<string> {
    const result = await this.client.execute(
      this.address,
      marketAddress,
      { supply_collateral: {} },
      'auto',
      '',
      [{ denom, amount }]
    );
    return result.transactionHash;
  }

  async borrow(marketAddress: string, amount: string): Promise<string> {
    const result = await this.client.execute(
      this.address,
      marketAddress,
      { borrow: { amount } },
      'auto'
    );
    return result.transactionHash;
  }

  async repay(
    marketAddress: string,
    amount: string,
    denom: string
  ): Promise<string> {
    const result = await this.client.execute(
      this.address,
      marketAddress,
      { repay: {} },
      'auto',
      '',
      [{ denom, amount }]
    );
    return result.transactionHash;
  }

  async withdrawCollateral(
    marketAddress: string,
    amount: string
  ): Promise<string> {
    const result = await this.client.execute(
      this.address,
      marketAddress,
      { withdraw_collateral: { amount } },
      'auto'
    );
    return result.transactionHash;
  }

  async getBalance(denom: string): Promise<Coin> {
    return this.client.getBalance(this.address, denom);
  }
}
```

### Wallet Mock (for Playwright)

**`e2e/utils/wallet-mock.ts`**:

```typescript
import { Page } from '@playwright/test';

export async function mockKeplrWallet(page: Page, mnemonic: string) {
  // Inject mock Keplr into page
  await page.addInitScript((mnemonic) => {
    const mockKeplr = {
      enable: async () => {},
      getKey: async (chainId: string) => ({
        name: 'Test User',
        algo: 'secp256k1',
        pubKey: new Uint8Array(33),
        address: new Uint8Array(20),
        bech32Address: 'wasm1test...',
      }),
      getOfflineSigner: (chainId: string) => ({
        getAccounts: async () => [{
          address: 'wasm1test...',
          algo: 'secp256k1',
          pubKey: new Uint8Array(33),
        }],
        signDirect: async () => ({ /* mock signature */ }),
      }),
      experimentalSuggestChain: async () => {},
    };

    (window as any).keplr = mockKeplr;
  }, mnemonic);
}
```

---

## Test Fixtures

**`e2e/fixtures/test-accounts.ts`**:

```typescript
export const VALIDATOR_MNEMONIC =
  'satisfy adjust timber high purchase tuition stool faith fine install that you unaware feed domain license impose boss human eager hat rent enjoy dawn';

export const TEST_USER_1_MNEMONIC =
  'notice oak worry limit wrap speak medal online prefer cluster roof addict wrist behave treat actual wasp year salad speed social layer crew genius';

export const TEST_USER_2_MNEMONIC =
  'quality vacuum hard canal turtle phrase inflict attract muscle sketch jelly eager over ten income page nation favorite captain economy dignity spend nephew exhale';

export const TEST_ACCOUNTS = {
  validator: {
    mnemonic: VALIDATOR_MNEMONIC,
    // Address derived from mnemonic
    address: 'wasm1cyyzpxplxdzkeea7kwsydadg87357qnahakaks',
  },
  user1: {
    mnemonic: TEST_USER_1_MNEMONIC,
    address: 'wasm18vd8fpwxzck93qlwghaj6arh4p7c5n89uzcee5',
  },
  user2: {
    mnemonic: TEST_USER_2_MNEMONIC,
    address: 'wasm1qnk2n4nlkpw9xfqntladh74w6ujtulwnmxnh3k',
  },
};
```

---

## Local Development Workflow

### Quick Start Commands

```bash
# 1. Build contracts (if not already built)
cargo build --release --target wasm32-unknown-unknown --workspace
mkdir -p artifacts
cp target/wasm32-unknown-unknown/release/*.wasm artifacts/

# 2. Start E2E stack
cd e2e
npm install
npm run stack:up

# 3. Watch logs
npm run stack:logs

# 4. Run tests
npm test

# 5. Run specific test file
npx playwright test tests/smoke/health.spec.ts

# 6. Run tests with UI
npm run test:ui

# 7. Cleanup
npm run stack:down
```

### Makefile (optional)

**`Makefile`** (project root):

```makefile
.PHONY: e2e-build e2e-up e2e-test e2e-down e2e-logs

e2e-build:
	cargo build --release --target wasm32-unknown-unknown --workspace
	mkdir -p artifacts
	cp target/wasm32-unknown-unknown/release/factory.wasm artifacts/
	cp target/wasm32-unknown-unknown/release/market.wasm artifacts/

e2e-up: e2e-build
	cd e2e && docker compose -f docker-compose.e2e.yml up -d

e2e-test:
	cd e2e && npm test

e2e-down:
	cd e2e && docker compose -f docker-compose.e2e.yml down -v

e2e-logs:
	cd e2e && docker compose -f docker-compose.e2e.yml logs -f

e2e: e2e-up e2e-test
```

---

## Summary

This E2E testing specification provides:

1. **Local Stack**: Docker Compose orchestration of all services
2. **Chain**: Local wasmd instance with fast block times
3. **Contracts**: Automated deployment with test markets
4. **Indexer**: Full indexer running against local chain
5. **Frontend**: Next.js app connected to local services
6. **Tests**: Playwright-based browser automation + API testing
7. **CI/CD**: GitHub Actions workflow for automated E2E testing

### Key Benefits

- **Reproducible**: Same stack runs locally and in CI
- **Fast**: 1-second block times, parallel test execution
- **Comprehensive**: Tests full user flows end-to-end
- **Debuggable**: Playwright traces, screenshots on failure
- **Isolated**: Fresh environment for each test run

### Next Steps

1. Implement the mock oracle contract for testing
2. Create the Dockerfiles for indexer and frontend
3. Set up the e2e directory structure
4. Write initial smoke tests
5. Add integration tests for key user flows
