export interface TestMarketConfig {
  id: string;
  name: string;
  collateralDenom: string;
  debtDenom: string;
  ltv: number;           // As percentage (e.g., 75 for 75%)
  liquidationThreshold: number;
  liquidationBonus: number;
  collateralPrice: number; // In USD
  debtPrice: number;       // In USD
}

export const TEST_MARKETS: TestMarketConfig[] = [
  {
    id: '1',
    name: 'STONE/USDC',
    collateralDenom: 'ustone',
    debtDenom: 'uusdc',
    ltv: 75,
    liquidationThreshold: 80,
    liquidationBonus: 5,
    collateralPrice: 0.5,  // $0.50 per STONE
    debtPrice: 1,          // $1 per USDC
  },
  {
    id: '2',
    name: 'ATOM/USDC',
    collateralDenom: 'uatom',
    debtDenom: 'uusdc',
    ltv: 75,
    liquidationThreshold: 80,
    liquidationBonus: 5,
    collateralPrice: 10,   // $10 per ATOM
    debtPrice: 1,          // $1 per USDC
  },
];

// Helper to get market by ID
export function getTestMarket(id: string): TestMarketConfig | undefined {
  return TEST_MARKETS.find(m => m.id === id);
}

// Helper to format denom for display
export function formatDenom(denom: string): string {
  const denomMap: Record<string, string> = {
    uatom: 'ATOM',
    uosmo: 'OSMO',
    ustone: 'STONE',
    ustake: 'STAKE',
    uusdc: 'USDC',
  };
  return denomMap[denom] || denom.toUpperCase().replace(/^U/, '');
}

// Convert micro units to display units (divide by 1,000,000)
export function fromMicro(amount: string | number): number {
  return Number(amount) / 1_000_000;
}

// Convert display units to micro units (multiply by 1,000,000)
export function toMicro(amount: number): string {
  return Math.floor(amount * 1_000_000).toString();
}
