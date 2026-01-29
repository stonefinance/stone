export * from './contracts';

// UI-specific types
export type PositionType = 'none' | 'supply' | 'borrow' | 'both';

export interface Market {
  id: string;
  address: string;
  collateralDenom: string;
  debtDenom: string;
  curator: string;
  supplyApy: number;
  borrowApy: number;
  totalSupplied: string;
  totalBorrowed: string;
  utilization: number;
  availableLiquidity: string;
}

export interface UserPosition {
  marketId: string;
  collateralAmount: string;
  collateralValue: number;
  supplyAmount: string;
  supplyValue: number;
  debtAmount: string;
  debtValue: number;
  healthFactor?: number;
  maxBorrowValue: number;
  liquidationPrice?: number;
}

export interface PortfolioSummary {
  totalSupplied: number;
  totalBorrowed: number;
  netApy: number;
  healthFactor?: number;
  totalPnL: number;
}
