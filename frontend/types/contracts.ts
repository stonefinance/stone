// Contract Types for Stone Finance
// Based on packages/types/src/market.rs and factory.rs

export interface Coin {
  denom: string;
  amount: string;
}

export interface Decimal {
  value: string;
}

// Market Query Messages
export type MarketQueryMsg =
  | { config: Record<string, never> }
  | { params: Record<string, never> }
  | { state: Record<string, never> }
  | { user_position: { user: string } }
  | { user_supply: { user: string } }
  | { user_collateral: { user: string } }
  | { user_debt: { user: string } }
  | { is_liquidatable: { user: string } };

// Market Execute Messages
export type MarketExecuteMsg =
  | { supply: { recipient?: string } }
  | { withdraw: { amount?: string; recipient?: string } }
  | { supply_collateral: { recipient?: string } }
  | { withdraw_collateral: { amount?: string; recipient?: string } }
  | { borrow: { amount: string; recipient?: string } }
  | { repay: { on_behalf_of?: string } }
  | { liquidate: { borrower: string } }
  | { accrue_interest: Record<string, never> };

// Factory Query Messages
export type FactoryQueryMsg =
  | { config: Record<string, never> }
  | { market: { market_id: string } }
  | { market_by_address: { address: string } }
  | { markets: { start_after?: string; limit?: number } }
  | { markets_by_curator: { curator: string; start_after?: string; limit?: number } }
  | { market_count: Record<string, never> };

// Market Config Response
export interface MarketConfigResponse {
  factory: string;
  curator: string;
  oracle: string;
  collateral_denom: string;
  debt_denom: string;
  fee_collector: string;
}

// Interest Rate Model
export interface InterestRateModel {
  optimal_utilization: Decimal;
  base_rate: Decimal;
  slope_1: Decimal;
  slope_2: Decimal;
}

// Market Params Response
export interface MarketParamsResponse {
  enabled: boolean;
  max_ltv: Decimal;
  liquidation_threshold: Decimal;
  liquidation_bonus: Decimal;
  liquidation_fee: Decimal;
  close_factor: Decimal;
  interest_rate_model: InterestRateModel;
  supply_cap?: string;
  borrow_cap?: string;
  protocol_liquidation_fee: Decimal;
  protocol_interest_fee: Decimal;
}

// Market State Response
export interface MarketStateResponse {
  borrow_index: Decimal;
  liquidity_index: Decimal;
  borrow_rate: Decimal;
  liquidity_rate: Decimal;
  total_supply_scaled: string;
  total_debt_scaled: string;
  total_collateral: string;
  utilization: Decimal;
  available_liquidity: string;
  last_update: number;
}

// User Balance Response
export interface UserBalanceResponse {
  scaled_amount: string;
  actual_amount: string;
  usd_value: Decimal;
}

// User Position Response
export interface UserPositionResponse {
  collateral_amount: string;
  collateral_value: Decimal;
  supply_amount: string;
  supply_value: Decimal;
  debt_amount: string;
  debt_value: Decimal;
  health_factor?: Decimal;
  max_borrow_value: Decimal;
  liquidation_price?: Decimal;
}

// Is Liquidatable Response
export interface IsLiquidatableResponse {
  liquidatable: boolean;
  health_factor?: Decimal;
  shortfall?: Decimal;
}

// Factory Config Response
export interface FactoryConfigResponse {
  owner: string;
  market_code_id: number;
  protocol_fee_collector: string;
  market_creation_fee?: Coin;
}

// Market Info (from factory)
export interface MarketInfo {
  market_id: string;
  address: string;
  collateral_denom: string;
  debt_denom: string;
  curator: string;
  created_at: number;
}

// Markets Response
export interface MarketsResponse {
  markets: MarketInfo[];
}

// Market Count Response
export interface MarketCountResponse {
  count: number;
}
