# Indexer Testing Framework Specification

## Overview

This document specifies a comprehensive testing framework for the Stone Finance indexer. The framework is designed to achieve high test coverage across all 10 message/event types, prevent regressions, and ensure predictable behavior.

## Tech Stack

- **Test Runner**: Vitest (fast, TypeScript-native, Prisma-compatible)
- **Database**: PostgreSQL test database with Prisma migrations
- **Mocking**: Vitest mocks for external dependencies (Tendermint RPC, CosmWasm client)
- **Fixtures**: JSON-based test fixtures for blockchain events
- **Coverage**: Vitest coverage with c8/istanbul

## Directory Structure

```
indexer/
├── src/
│   └── ...
├── tests/
│   ├── setup.ts                    # Global test setup (DB, mocks)
│   ├── teardown.ts                 # Global teardown
│   ├── helpers/
│   │   ├── db.ts                   # Test database utilities
│   │   ├── fixtures.ts             # Fixture loading/creation helpers
│   │   ├── mocks.ts                # Mock factories for RPC/clients
│   │   └── assertions.ts           # Custom assertion helpers
│   ├── fixtures/
│   │   ├── events/
│   │   │   ├── supply.json
│   │   │   ├── withdraw.json
│   │   │   ├── supply_collateral.json
│   │   │   ├── withdraw_collateral.json
│   │   │   ├── borrow.json
│   │   │   ├── repay.json
│   │   │   ├── liquidate.json
│   │   │   ├── accrue_interest.json
│   │   │   ├── update_params.json
│   │   │   └── market_instantiated.json
│   │   ├── markets/
│   │   │   └── sample-market.json
│   │   └── positions/
│   │       └── sample-position.json
│   ├── unit/
│   │   ├── parser.test.ts          # Event parser unit tests
│   │   └── handlers/
│   │       ├── supply.test.ts
│   │       ├── withdraw.test.ts
│   │       ├── supply-collateral.test.ts
│   │       ├── withdraw-collateral.test.ts
│   │       ├── borrow.test.ts
│   │       ├── repay.test.ts
│   │       ├── liquidate.test.ts
│   │       ├── accrue-interest.test.ts
│   │       ├── update-params.test.ts
│   │       └── market-created.test.ts
│   ├── integration/
│   │   ├── block-processor.test.ts  # Block processing integration
│   │   ├── reorg-handling.test.ts   # Reorg detection/rollback
│   │   └── event-routing.test.ts    # Event routing to handlers
│   └── scenarios/
│       ├── lending-flow.test.ts     # Supply → Borrow → Repay → Withdraw
│       ├── liquidation-flow.test.ts # Collateral → Borrow → Liquidate
│       ├── multi-user.test.ts       # Multiple users same market
│       └── multi-market.test.ts     # Single user multiple markets
└── vitest.config.ts
```

---

## Test Categories

### 1. Unit Tests: Event Parsers

Test the parsing of raw blockchain event attributes into typed TypeScript objects.

#### `tests/unit/parser.test.ts`

| Test Case | Description | Coverage |
|-----------|-------------|----------|
| `parseEventAttributes` converts Tendermint event | Verify attribute key/value extraction | `parser.ts:9-15` |
| `parseMarketCreatedEvent` with valid attributes | All required fields present | `parser.ts:42-69` |
| `parseMarketCreatedEvent` with missing market_id | Returns null, logs warning | `parser.ts:55-58` |
| `parseMarketCreatedEvent` with wrong action | Returns null | `parser.ts:49-51` |
| `parseMarketEvent` - supply | All fields mapped correctly | `parser.ts:82-97` |
| `parseMarketEvent` - withdraw | scaledDecrease mapped | `parser.ts:99-114` |
| `parseMarketEvent` - supply_collateral | Minimal fields (no scaled) | `parser.ts:116-127` |
| `parseMarketEvent` - withdraw_collateral | Minimal fields | `parser.ts:129-140` |
| `parseMarketEvent` - borrow | scaledAmount mapped | `parser.ts:142-157` |
| `parseMarketEvent` - repay | scaledDecrease, borrower/repayer | `parser.ts:159-174` |
| `parseMarketEvent` - liquidate | All liquidation fields | `parser.ts:176-194` |
| `parseMarketEvent` - accrue_interest | Index and rate fields | `parser.ts:196-209` |
| `parseMarketEvent` - update_params | All param fields including optionals | `parser.ts:211-230` |
| `parseMarketEvent` - unknown action | Returns null | `parser.ts:232-233` |

---

### 2. Unit Tests: Event Handlers

Test each handler in isolation with mocked Prisma client.

#### Handler Test Template

Each handler test file follows this structure:

```typescript
describe('handle{EventType}', () => {
  describe('happy path', () => {
    it('creates/updates market state correctly')
    it('creates/updates user position correctly')
    it('creates transaction record with correct snapshot')
  })

  describe('edge cases', () => {
    it('handles market not found error')
    it('creates new position when none exists')
    it('handles zero amounts')
    it('handles large decimal values (Uint128 max)')
  })

  describe('atomicity', () => {
    it('rolls back all changes on partial failure')
  })
})
```

#### Handler-Specific Tests

##### `tests/unit/handlers/supply.test.ts`

| Test Case | Verifies |
|-----------|----------|
| Increments `totalSupplyScaled` on market | `handlers.ts:106-113` |
| Creates new position if not exists | `handlers.ts:131-144` |
| Increments existing position `supplyScaled` | `handlers.ts:122-130` |
| Updates `lastInteraction` timestamp | `handlers.ts:128` |
| Transaction record has correct action=SUPPLY | `handlers.ts:155` |
| Transaction has market state snapshot | `handlers.ts:159-161` |
| Position ID format is `{marketId}:{recipient}` | `handlers.ts:116` |

##### `tests/unit/handlers/withdraw.test.ts`

| Test Case | Verifies |
|-----------|----------|
| Decrements `totalSupplyScaled` on market | `handlers.ts:194-201` |
| Decrements position `supplyScaled` | `handlers.ts:210-218` |
| Does not create position if not exists | `handlers.ts:205-219` |
| Handles withdrawal when position is missing (no-op) | Edge case |
| Allows withdrawing full balance (zero remaining) | `handlers.ts:213` |

##### `tests/unit/handlers/supply-collateral.test.ts`

| Test Case | Verifies |
|-----------|----------|
| Increments market `totalCollateral` | `handlers.ts:260-268` |
| Creates new position with only collateral | `handlers.ts:284-296` |
| Increments existing position collateral | `handlers.ts:276-283` |
| Transaction has `totalCollateral` snapshot | `handlers.ts:311` |

##### `tests/unit/handlers/withdraw-collateral.test.ts`

| Test Case | Verifies |
|-----------|----------|
| Decrements market `totalCollateral` | `handlers.ts:338-346` |
| Decrements position collateral | `handlers.ts:354-361` |
| Does not create position if missing | `handlers.ts:350-362` |

##### `tests/unit/handlers/borrow.test.ts`

| Test Case | Verifies |
|-----------|----------|
| Increments `totalDebtScaled` on market | `handlers.ts:399-406` |
| Creates new position with debt | `handlers.ts:424-436` |
| Increments existing position `debtScaled` | `handlers.ts:414-423` |
| Transaction action=BORROW | `handlers.ts:448` |

##### `tests/unit/handlers/repay.test.ts`

| Test Case | Verifies |
|-----------|----------|
| Decrements `totalDebtScaled` on market | `handlers.ts:477-484` |
| Decrements position `debtScaled` | `handlers.ts:493-503` |
| Uses `Decimal.max(calculated, 0)` to prevent negatives | `handlers.ts:493-495` |
| Transaction records repayer (not borrower) as userAddress | `handlers.ts:514` |

##### `tests/unit/handlers/liquidate.test.ts`

| Test Case | Verifies |
|-----------|----------|
| Decrements `totalDebtScaled` by `scaledDebtDecrease` | `handlers.ts:550-551` |
| Sets `totalCollateral` from event (not incremental) | `handlers.ts:553` |
| Updates borrower position debt and collateral | `handlers.ts:563-575` |
| Transaction has liquidator, borrower, debtRepaid, collateralSeized, protocolFee | `handlers.ts:587-592` |
| Transaction userAddress is liquidator | `handlers.ts:586` |

##### `tests/unit/handlers/accrue-interest.test.ts`

| Test Case | Verifies |
|-----------|----------|
| Updates market indices (borrowIndex, liquidityIndex) | `handlers.ts:620-624` |
| Updates market rates (borrowRate, liquidityRate) | `handlers.ts:622-623` |
| Creates InterestAccrualEvent record | `handlers.ts:629-640` |
| Does NOT create Transaction record | Verify no tx.transaction.create call |

##### `tests/unit/handlers/update-params.test.ts`

| Test Case | Verifies |
|-----------|----------|
| Updates all 9 market params | `handlers.ts:660-675` |
| Handles optional supplyCap/borrowCap (null when missing) | `handlers.ts:670-671` |
| Converts string 'true'/'false' to boolean | `handlers.ts:672-673` |
| Creates MarketSnapshot with new params | `handlers.ts:680-700` |
| Snapshot totalSupply/totalDebt calculated from scaled * index | `handlers.ts:690-693` |

##### `tests/unit/handlers/market-created.test.ts`

| Test Case | Verifies |
|-----------|----------|
| Calls `queryMarketInfo` with market address | `handlers.ts:35` |
| Creates Market with config fields (curator, denoms, oracle) | `handlers.ts:42-45` |
| Creates Market with params fields (LTV, thresholds, fees) | `handlers.ts:50-61` |
| Initializes state fields (indices=1, scaled=0, collateral=0) | `handlers.ts:64-73` |
| Handles `queryMarketInfo` failure (throws, logs error) | `handlers.ts:82-88` |

---

### 3. Integration Tests

Test the interaction between components with a real test database.

#### `tests/integration/block-processor.test.ts`

| Test Case | Description |
|-----------|-------------|
| Processes block with single supply transaction | Full flow: fetch → parse → handle → DB |
| Processes block with multiple transactions | Multiple tx in same block |
| Processes block with multiple events per transaction | Same tx has supply + accrue_interest |
| Skips failed transactions (code !== 0) | Verify no DB changes for failed tx |
| Updates IndexerState checkpoint after block | lastProcessedBlock, lastProcessedHash |
| Handles empty block (no transactions) | Only updates checkpoint |

#### `tests/integration/event-routing.test.ts`

| Test Case | Description |
|-----------|-------------|
| Routes factory events to `processFactoryEvent` | market_instantiated |
| Routes market events to `processMarketEventFromContract` | supply, borrow, etc. |
| Ignores events from unknown contracts | No error, no DB changes |
| Adds new market address to tracking set | After market_instantiated |

#### `tests/integration/reorg-handling.test.ts`

| Test Case | Description |
|-----------|-------------|
| `detectReorg` returns false when hash matches | No reorg |
| `detectReorg` returns true when hash differs | Reorg detected |
| `handleReorg` deletes transactions from affected blocks | Verify Transaction deleted |
| `handleReorg` deletes InterestAccrualEvents | Verify deleted |
| `handleReorg` deletes MarketSnapshots | Verify deleted |
| `handleReorg` preserves Markets and UserPositions | Not deleted |
| `handleReorg` resets checkpoint to safeHeight | 10 blocks back |

---

### 4. Scenario Tests (End-to-End Flows)

Test realistic sequences of events that simulate actual protocol usage.

#### `tests/scenarios/lending-flow.test.ts`

```
Sequence:
1. market_instantiated → Market created
2. supply(user A, 1000) → Position created, market totalSupply updated
3. accrue_interest → Indices updated
4. borrow(user B, 500) → Position created, market totalDebt updated
5. accrue_interest → Indices updated
6. repay(user B, 500) → Position debt zeroed
7. withdraw(user A, 1000 + interest) → Position supply zeroed
```

Verifications:
- Final market state: totalSupplyScaled=0, totalDebtScaled=0
- User A position: supplyScaled=0, earned interest
- User B position: debtScaled=0
- Transaction history correct for all actions

#### `tests/scenarios/liquidation-flow.test.ts`

```
Sequence:
1. market_instantiated
2. supply_collateral(user A, 1000 ETH)
3. borrow(user A, 500 USDC)
4. accrue_interest (simulate time passing)
5. liquidate(liquidator, user A, 250 USDC debt, 300 ETH collateral)
```

Verifications:
- User A position: debt reduced, collateral reduced
- Market: totalDebtScaled reduced, totalCollateral reduced
- Transaction: liquidator, borrower, debtRepaid, collateralSeized, protocolFee all recorded

#### `tests/scenarios/multi-user.test.ts`

```
Sequence:
1. market_instantiated
2. supply(user A, 1000)
3. supply(user B, 2000)
4. borrow(user C, 1500)
5. withdraw(user A, 500)
6. repay(user C, 750)
```

Verifications:
- Three separate UserPosition records
- Market totals are sum of all positions
- Each user's position independent

#### `tests/scenarios/multi-market.test.ts`

```
Sequence:
1. market_instantiated (market 1: ETH/USDC)
2. market_instantiated (market 2: BTC/USDC)
3. supply(user A, market 1, 1000)
4. supply(user A, market 2, 2000)
5. borrow(user A, market 1, 500)
```

Verifications:
- User A has two separate positions (one per market)
- Position IDs are `market1:userA` and `market2:userA`
- Market states independent

---

## Test Fixtures

### Event Fixture Format

Each event fixture in `tests/fixtures/events/` follows this structure:

```json
{
  "name": "supply_basic",
  "description": "Basic supply event with typical values",
  "rawAttributes": {
    "_contract_address": "cosmos1market...",
    "action": "supply",
    "supplier": "cosmos1user...",
    "recipient": "cosmos1user...",
    "amount": "1000000000000000000",
    "scaled_amount": "1000000000000000000",
    "total_supply": "5000000000000000000",
    "total_debt": "2000000000000000000",
    "utilization": "400000000000000000"
  },
  "metadata": {
    "txHash": "ABC123...",
    "blockHeight": 12345,
    "timestamp": 1700000000,
    "logIndex": 0
  },
  "expectedParsed": {
    "action": "supply",
    "supplier": "cosmos1user...",
    "recipient": "cosmos1user...",
    "amount": "1000000000000000000",
    "scaledAmount": "1000000000000000000",
    "totalSupply": "5000000000000000000",
    "totalDebt": "2000000000000000000",
    "utilization": "400000000000000000",
    "marketAddress": "cosmos1market...",
    "txHash": "ABC123...",
    "blockHeight": 12345,
    "timestamp": 1700000000,
    "logIndex": 0
  }
}
```

### Market Fixture Format

```json
{
  "name": "eth_usdc_market",
  "data": {
    "id": "1",
    "marketAddress": "cosmos1market...",
    "curator": "cosmos1curator...",
    "collateralDenom": "ueth",
    "debtDenom": "uusdc",
    "oracle": "cosmos1oracle...",
    "loanToValue": "0.8",
    "liquidationThreshold": "0.85",
    "liquidationBonus": "0.05",
    "liquidationProtocolFee": "0.1",
    "closeFactor": "0.5",
    "protocolFee": "0.1",
    "curatorFee": "0.05",
    "supplyCap": null,
    "borrowCap": null,
    "enabled": true,
    "isMutable": true,
    "borrowIndex": "1.0",
    "liquidityIndex": "1.0",
    "borrowRate": "0.05",
    "liquidityRate": "0.03",
    "totalSupplyScaled": "0",
    "totalDebtScaled": "0",
    "totalCollateral": "0",
    "interestRateModel": {
      "optimal_utilization": "0.8",
      "base_rate": "0.02",
      "slope1": "0.04",
      "slope2": "0.75"
    }
  }
}
```

---

## Mocking Strategy

### Tendermint RPC Mock

```typescript
// tests/helpers/mocks.ts
export function createMockTendermintClient(blocks: MockBlock[]) {
  return {
    block: vi.fn((height: number) => {
      const block = blocks.find(b => b.height === height);
      if (!block) throw new Error(`Block ${height} not found`);
      return {
        blockId: { hash: Buffer.from(block.hash, 'hex') },
        block: {
          header: { time: new Date(block.timestamp * 1000) },
          txs: block.txs.map(tx => Buffer.from(tx.bytes, 'base64')),
        },
      };
    }),
    blockResults: vi.fn((height: number) => {
      const block = blocks.find(b => b.height === height);
      if (!block) throw new Error(`Block ${height} not found`);
      return {
        results: block.txs.map(tx => ({
          code: tx.code,
          events: tx.events,
        })),
      };
    }),
  };
}
```

### CosmWasm Client Mock

```typescript
export function createMockCosmWasmClient(marketConfigs: Record<string, MarketConfig>) {
  return {
    queryContractSmart: vi.fn((address: string, query: object) => {
      const config = marketConfigs[address];
      if (!config) throw new Error(`Unknown market: ${address}`);

      if ('config' in query) {
        return {
          curator: config.curator,
          collateral_denom: config.collateralDenom,
          debt_denom: config.debtDenom,
          oracle: config.oracle,
        };
      }
      if ('params' in query) {
        return config.params;
      }
      throw new Error('Unknown query');
    }),
  };
}
```

### Database Isolation

Each test uses an isolated transaction that is rolled back after the test:

```typescript
// tests/helpers/db.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function withTestTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const result = await fn(tx);
    // Force rollback by throwing after capturing result
    throw new RollbackError(result);
  }).catch((e) => {
    if (e instanceof RollbackError) return e.result;
    throw e;
  });
}
```

---

## Configuration

### `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/api/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
```

### `tests/setup.ts`

```typescript
import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '../src/db/client';

// Mock external clients globally
vi.mock('../src/utils/blockchain', () => ({
  getTendermintClient: vi.fn(),
  getCosmWasmClient: vi.fn(),
  queryMarketInfo: vi.fn(),
}));

// Mock subscriptions (no-op in tests)
vi.mock('../src/api/resolvers/subscriptions', () => ({
  publishMarketUpdate: vi.fn(),
  publishTransaction: vi.fn(),
  publishPositionUpdate: vi.fn(),
}));

beforeAll(async () => {
  // Ensure test database is migrated
  await prisma.$executeRaw`SELECT 1`;
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clear all tables before each test
  await prisma.interestAccrualEvent.deleteMany();
  await prisma.marketSnapshot.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.userPosition.deleteMany();
  await prisma.market.deleteMany();
  await prisma.indexerState.deleteMany();
});
```

### `package.json` Scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:scenarios": "vitest run tests/scenarios",
    "test:ci": "vitest run --coverage --reporter=junit --outputFile=test-results.xml"
  }
}
```

---

## Coverage Targets

| Component | Target Coverage |
|-----------|-----------------|
| Event Parsers (`parser.ts`) | 100% |
| Event Handlers (`handlers.ts`) | 95% |
| Block Processor (`block-processor.ts`) | 90% |
| Overall | 80% |

### Coverage Exclusions

- `src/index.ts` (main entry point, startup logic)
- `src/api/**` (GraphQL API layer, tested separately)
- `src/utils/logger.ts` (logging utilities)
- `src/config/index.ts` (configuration loading)

---

## Test Data Generation

### Decimal Precision Test Cases

```typescript
// tests/helpers/fixtures.ts
export const DECIMAL_TEST_CASES = {
  // Uint128 max value
  maxUint128: '340282366920938463463374607431768211455',
  // Typical token amounts (18 decimals)
  oneToken: '1000000000000000000',
  // Small amount (dust)
  dust: '1',
  // Zero
  zero: '0',
  // Large realistic amount (1 billion tokens)
  billion: '1000000000000000000000000000',
};
```

### Address Fixtures

```typescript
export const ADDRESSES = {
  factory: 'cosmos1factoryaddress...',
  market1: 'cosmos1market1address...',
  market2: 'cosmos1market2address...',
  userA: 'cosmos1usera...',
  userB: 'cosmos1userb...',
  userC: 'cosmos1userc...',
  curator: 'cosmos1curator...',
  oracle: 'cosmos1oracle...',
  liquidator: 'cosmos1liquidator...',
};
```

---

## CI Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/indexer-tests.yml
name: Indexer Tests

on:
  push:
    paths:
      - 'indexer/**'
  pull_request:
    paths:
      - 'indexer/**'

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: indexer_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: indexer/package-lock.json

      - name: Install dependencies
        working-directory: indexer
        run: npm ci

      - name: Generate Prisma client
        working-directory: indexer
        run: npx prisma generate

      - name: Run migrations
        working-directory: indexer
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/indexer_test
        run: npx prisma migrate deploy

      - name: Run tests
        working-directory: indexer
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/indexer_test
        run: npm run test:ci

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: indexer/coverage/coverage-final.json
          flags: indexer
```

---

## Summary

This testing framework provides:

1. **Complete Event Coverage**: All 10 event types have dedicated parser and handler tests
2. **Isolation**: Each test runs in isolation with database cleanup
3. **Realistic Scenarios**: End-to-end flows test actual protocol usage patterns
4. **Edge Cases**: Explicit tests for zero amounts, max values, missing data
5. **Regression Prevention**: High coverage targets with CI enforcement
6. **Fast Feedback**: Vitest provides fast test execution
7. **Maintainability**: Fixtures and helpers reduce test boilerplate

### Estimated Test Count

| Category | Test Count |
|----------|------------|
| Parser Unit Tests | ~15 |
| Handler Unit Tests | ~50 |
| Integration Tests | ~15 |
| Scenario Tests | ~20 |
| **Total** | **~100 tests** |
