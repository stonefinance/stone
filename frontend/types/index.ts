// Re-export contract types for CosmJS client
export * from './contracts';

// Types expected by frontend components
// These are the "presentation" types that components work with

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
  totalCollateral?: string;
  utilization: number;
  availableLiquidity: string;
  loanToValue: number;
}

export interface MarketDetail extends Market {
  info: {
    market_id: string;
    address: string;
    collateral_denom: string;
    debt_denom: string;
    curator: string;
  };
  state: {
    total_supply_scaled: string;
    total_debt_scaled: string;
    liquidity_rate: string;
    borrow_rate: string;
    utilization: string;
    available_liquidity: string;
    liquidity_index: string;
    borrow_index: string;
  };
  config: {
    collateral_denom: string;
    debt_denom: string;
    curator: string;
    oracle: string;
  };
  params: {
    loan_to_value: string;
    liquidation_threshold: string;
    liquidation_bonus: string;
    close_factor: string;
    interest_rate_model: Record<string, unknown>;
    supply_cap?: string;
    borrow_cap?: string;
  };
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

// Sorting types for tables
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  column: string;
  direction: SortDirection;
}

// Market filtering
export type MarketFilter = 'all' | 'supplied' | 'borrowed' | 'collateral';
