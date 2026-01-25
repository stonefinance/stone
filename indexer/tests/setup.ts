import { beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Set environment variables BEFORE any imports that use them
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://josiahkendall@localhost:5432/stone_test';
process.env.RPC_ENDPOINT = 'http://localhost:26657';
process.env.CHAIN_ID = 'testing';
process.env.FACTORY_ADDRESS = 'cosmos1factoryqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';
process.env.MARKET_CODE_ID = '1';
process.env.LOG_LEVEL = 'error';

// Mock the config module to avoid deployment result loading
vi.mock('../src/config', () => ({
  config: {
    database: {
      url: process.env.DATABASE_URL,
    },
    blockchain: {
      rpcEndpoint: 'http://localhost:26657',
      chainId: 'testing',
    },
    contracts: {
      factoryAddress: 'cosmos1factoryqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
      marketCodeId: '1',
    },
    indexer: {
      startBlockHeight: 1,
      batchSize: 100,
      pollIntervalMs: 1000,
    },
    api: {
      port: 4000,
      enableSubscriptions: false,
    },
    logging: {
      level: 'error',
    },
    oracle: {
      endpoints: [],
    },
  },
}));

// Mock external blockchain clients globally
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

// Mock logger to reduce noise in tests
vi.mock('../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import prisma AFTER mocking config
import { prisma } from '../src/db/client';

beforeAll(async () => {
  // Ensure database connection works
  try {
    await prisma.$executeRaw`SELECT 1`;
  } catch (error) {
    console.error('Database connection failed. Ensure PostgreSQL is running and DATABASE_URL is set.');
    console.error('For tests, set: export DATABASE_URL="postgresql://localhost:5432/stone_test"');
    throw error;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clear all tables before each test in correct order (respecting foreign keys)
  await prisma.interestAccrualEvent.deleteMany();
  await prisma.marketSnapshot.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.userPosition.deleteMany();
  await prisma.market.deleteMany();
  await prisma.indexerState.deleteMany();

  // Reset all mocks
  vi.clearAllMocks();
});
