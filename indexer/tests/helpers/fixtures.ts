import { Decimal } from 'decimal.js';
import { prisma } from '../../src/db/client';

// Test addresses
export const ADDRESSES = {
  factory: 'cosmos1factoryqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
  market1: 'cosmos1market1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
  market2: 'cosmos1market2qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
  userA: 'cosmos1useraqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
  userB: 'cosmos1userbqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
  userC: 'cosmos1usercqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
  curator: 'cosmos1curatorqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
  oracle: 'cosmos1oracleqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
  liquidator: 'cosmos1liquidatorqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
};

// Decimal test values
export const DECIMALS = {
  maxUint128: '340282366920938463463374607431768211455',
  oneToken: '1000000000000000000', // 1e18
  thousand: '1000000000000000000000', // 1000e18
  million: '1000000000000000000000000', // 1M e18
  dust: '1',
  zero: '0',
  // Utilization ratios (stored as decimal values 0-1, not raw 18-decimal integers)
  // These are used for utilization field which is Decimal(20,18) in the DB
  zeroUtilization: '0',
  tenPercentUtilization: '0.1',
  fiftyPercentUtilization: '0.5',
  eightyPercentUtilization: '0.8',
  hundredPercentUtilization: '1',
  // Aliases for utilization (used directly in tests)
  tenPercent: '0.1',
  fiftyPercent: '0.5',
  eightyPercent: '0.8',
};

// Default market parameters
export const DEFAULT_MARKET_PARAMS = {
  loanToValue: new Decimal('0.8'),
  liquidationThreshold: new Decimal('0.85'),
  liquidationBonus: new Decimal('0.05'),
  liquidationProtocolFee: new Decimal('0.1'),
  closeFactor: new Decimal('0.5'),
  protocolFee: new Decimal('0.1'),
  curatorFee: new Decimal('0.05'),
  interestRateModel: {
    optimal_utilization: '0.8',
    base_rate: '0.02',
    slope1: '0.04',
    slope2: '0.75',
  },
};

// Create a market in the database
export async function createTestMarket(overrides: Partial<{
  id: string;
  marketAddress: string;
  curator: string;
  collateralDenom: string;
  debtDenom: string;
  oracle: string;
  totalSupplyScaled: Decimal;
  totalDebtScaled: Decimal;
  totalCollateral: Decimal;
  borrowIndex: Decimal;
  liquidityIndex: Decimal;
}> = {}) {
  const id = overrides.id ?? '1';
  const marketAddress = overrides.marketAddress ?? ADDRESSES.market1;

  return prisma.market.create({
    data: {
      id,
      marketAddress,
      curator: overrides.curator ?? ADDRESSES.curator,
      collateralDenom: overrides.collateralDenom ?? 'ueth',
      debtDenom: overrides.debtDenom ?? 'uusdc',
      oracle: overrides.oracle ?? ADDRESSES.oracle,
      createdAt: new Date(),
      createdAtBlock: BigInt(1),
      ...DEFAULT_MARKET_PARAMS,
      supplyCap: null,
      borrowCap: null,
      enabled: true,
      isMutable: true,
      borrowIndex: overrides.borrowIndex ?? new Decimal('1'),
      liquidityIndex: overrides.liquidityIndex ?? new Decimal('1'),
      borrowRate: new Decimal('0.05'),
      liquidityRate: new Decimal('0.03'),
      totalSupplyScaled: overrides.totalSupplyScaled ?? new Decimal('0'),
      totalDebtScaled: overrides.totalDebtScaled ?? new Decimal('0'),
      totalCollateral: overrides.totalCollateral ?? new Decimal('0'),
      lastUpdate: BigInt(Math.floor(Date.now() / 1000)),
      utilization: new Decimal('0'),
      availableLiquidity: new Decimal('0'),
    },
  });
}

// Create a user position in the database
export async function createTestPosition(
  marketId: string,
  userAddress: string,
  overrides: Partial<{
    supplyScaled: Decimal;
    debtScaled: Decimal;
    collateral: Decimal;
  }> = {}
) {
  return prisma.userPosition.create({
    data: {
      id: `${marketId}:${userAddress}`,
      marketId,
      userAddress,
      supplyScaled: overrides.supplyScaled ?? new Decimal('0'),
      debtScaled: overrides.debtScaled ?? new Decimal('0'),
      collateral: overrides.collateral ?? new Decimal('0'),
      firstInteraction: new Date(),
      lastInteraction: new Date(),
    },
  });
}

// Create indexer state
export async function createIndexerState(
  lastProcessedBlock: number,
  lastProcessedHash?: string
) {
  return prisma.indexerState.create({
    data: {
      id: 'singleton',
      lastProcessedBlock: BigInt(lastProcessedBlock),
      lastProcessedHash: lastProcessedHash ?? 'abc123',
    },
  });
}

// Generate a unique tx hash
let txCounter = 0;
export function generateTxHash(): string {
  txCounter++;
  return `TX${txCounter.toString().padStart(62, '0')}`.toUpperCase();
}

// Reset tx counter between tests
export function resetTxCounter() {
  txCounter = 0;
}
