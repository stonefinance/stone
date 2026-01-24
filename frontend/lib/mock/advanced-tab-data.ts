import { IRMParams } from '@/lib/utils/irm';
import { Position } from '@/lib/utils/collateral-risk';

/**
 * Mock data for Advanced tab components
 *
 * TODO: Replace with real data from:
 * - Oracle price: Requires on-chain query to oracle contract (see advanced-tab-data-analysis.md)
 * - Reference price: Requires external price API integration (CoinGecko, DefiLlama)
 * - Positions for collateral-at-risk: Requires GET_LIQUIDATABLE_POSITIONS query with all positions
 */

// Mock IRM parameters matching the design screenshot
export const MOCK_IRM_PARAMS: IRMParams = {
  base_rate: '0.02', // 2%
  slope_1: '0.04', // 4%
  slope_2: '0.75', // 75%
  optimal_utilization: '0.9', // 90%
};

// Mock market data for Advanced tab
export const MOCK_ADVANCED_MARKET_DATA = {
  // Instantaneous rates
  borrowRate: 0.0485, // 4.85%
  liquidityRate: 0.038, // 3.8% (supply rate)

  // Current utilization
  utilization: 0.7995, // 79.95%

  // Liquidation parameters
  liquidationThreshold: 0.86, // 86% LLTV
  liquidationBonus: 0.0438, // 4.38% penalty

  // Total supply for calculations
  totalSupply: 1400000000, // $1.4B in debt token units

  // Oracle data (TODO: fetch from oracle contract)
  oracleAddress: '0x663B...39B9',
  oraclePrice: 89539.3, // cbBTC/USDC
  referencePrice: 89962.43, // From external price feed (TODO: implement)

  // IRM contract (TODO: may need separate field)
  irmAddress: '0x4941...2887',
};

// Mock historical rate data for the chart
// Simulates hourly data over the past week
export function generateMockRateHistory(
  currentRate: number,
  days: number = 7,
  pointsPerDay: number = 24
): { timestamp: number; borrowRate: number; liquidityRate: number }[] {
  const now = Date.now();
  const msPerPoint = (24 * 60 * 60 * 1000) / pointsPerDay;
  const totalPoints = days * pointsPerDay;
  const data = [];

  // Seeded random for consistent data
  let seed = 12345;
  const seededRandom = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  for (let i = 0; i < totalPoints; i++) {
    const timestamp = now - (totalPoints - i) * msPerPoint;

    // Add some variation to the rate (within +/- 2%)
    const variation = (seededRandom() - 0.5) * 0.04;
    const borrowRate = Math.max(0.01, currentRate + variation);

    // Supply rate is typically lower than borrow rate
    const liquidityRate = borrowRate * 0.78;

    data.push({
      timestamp,
      borrowRate,
      liquidityRate,
    });
  }

  return data;
}

// Mock positions for collateral-at-risk calculation
// TODO: Replace with data from GET_LIQUIDATABLE_POSITIONS query
export const MOCK_POSITIONS: Position[] = [
  // High-risk positions (will liquidate with small price drop)
  { collateral: 0.5, debt: 38000 }, // ~84.8% LTV
  { collateral: 1.2, debt: 90000 }, // ~83.7% LTV
  { collateral: 0.3, debt: 22000 }, // ~81.8% LTV

  // Medium-risk positions
  { collateral: 2, debt: 120000 }, // ~67% LTV
  { collateral: 5, debt: 300000 }, // ~67% LTV
  { collateral: 0.8, debt: 45000 }, // ~62.8% LTV
  { collateral: 3.5, debt: 180000 }, // ~57.4% LTV

  // Lower-risk positions
  { collateral: 10, debt: 400000 }, // ~44.7% LTV
  { collateral: 15, debt: 500000 }, // ~37.2% LTV
  { collateral: 8, debt: 200000 }, // ~27.9% LTV

  // Very safe positions
  { collateral: 20, debt: 300000 }, // ~16.7% LTV
  { collateral: 50, debt: 500000 }, // ~11.2% LTV
];

// Mock liquidation history
export interface MockLiquidation {
  timestamp: number;
  borrower: string;
  collateralSeized: number;
  debtRepaid: number;
  realizedBadDebt: number; // TODO: Bad debt tracking not yet implemented
}

export const MOCK_LIQUIDATION_HISTORY: MockLiquidation[] = [
  {
    timestamp: Date.now() - 1 * 60 * 60 * 1000, // 1 hour ago
    borrower: '0x4f91...796B',
    collateralSeized: 0.000701,
    debtRepaid: 818.41,
    realizedBadDebt: 0,
  },
  {
    timestamp: Date.now() - 1 * 60 * 60 * 1000,
    borrower: '0xEe88...64fE',
    collateralSeized: 0.003596,
    debtRepaid: 300.63,
    realizedBadDebt: 0,
  },
  {
    timestamp: Date.now() - 2 * 60 * 60 * 1000,
    borrower: '0x1874...E856',
    collateralSeized: 0.036678,
    debtRepaid: 3065.81,
    realizedBadDebt: 0,
  },
  {
    timestamp: Date.now() - 2 * 60 * 60 * 1000,
    borrower: '0xcA9f...E3Cf',
    collateralSeized: 0.055434,
    debtRepaid: 4633.57,
    realizedBadDebt: 0,
  },
  {
    timestamp: Date.now() - 2 * 60 * 60 * 1000,
    borrower: '0x8add...Cc01',
    collateralSeized: 0.021137,
    debtRepaid: 1766.84,
    realizedBadDebt: 0,
  },
];

// Helper to format mock addresses consistently
export function formatMockAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
