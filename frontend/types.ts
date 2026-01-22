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

export interface MarketInfo {
  market_id: string;
  address: string;
  curator: string;
  collateral_denom: string;
  debt_denom: string;
  created_at: number;
}

export interface MarketState {
  borrow_index: string;
  liquidity_index: string;
  borrow_rate: string;
  liquidity_rate: string;
  total_supply: string;
  total_supply_scaled: string;
  total_debt: string;
  total_debt_scaled: string;
  total_collateral: string;
  utilization: string;
  available_liquidity: string;
  last_update: number;
  created_at: number;
}

export interface MarketConfig {
  factory: string;
  curator: string;
  oracle: string;
  collateral_denom: string;
  debt_denom: string;
  protocol_fee_collector: string;
}

export interface MarketParams {
  loan_to_value: string;
  liquidation_threshold: string;
  liquidation_bonus: string;
  liquidation_protocol_fee: string;
  close_factor: string;
  interest_rate_model: InterestRateModel;
  protocol_fee: string;
  curator_fee: string;
  supply_cap: string | null;
  borrow_cap: string | null;
  enabled: boolean;
  is_mutable: boolean;
  ltv_last_update: number;
}

export interface InterestRateModel {
  base_rate: string;
  slope1: string;
  slope2: string;
  optimal_utilization: string;
}

export interface UserPositionResponse {
  collateral_amount: string;
  collateral_value: string;
  supply_amount: string;
  supply_value: string;
  debt_amount: string;
  debt_value: string;
  health_factor: string | null;
  max_borrow_value: string;
  liquidation_price: string | null;
}

export interface MarketsResponse {
  markets: MarketInfo[];
}
