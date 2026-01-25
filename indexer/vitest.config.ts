import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    env: {
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://josiahkendall@localhost:5432/stone_test',
      RPC_ENDPOINT: 'http://localhost:26657',
      CHAIN_ID: 'testing',
      FACTORY_ADDRESS: 'cosmos1factoryqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
      MARKET_CODE_ID: '1',
      LOG_LEVEL: 'error',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/api/**',
        'src/utils/logger.ts',
        'src/config/index.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false, // Run test files sequentially for DB isolation
    sequence: {
      shuffle: false,
    },
  },
});
