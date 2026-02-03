use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Decimal, Uint128};

use crate::{InterestRateModel, OracleConfig, OracleConfigUnchecked, OracleType};

/// Market configuration set at instantiation (mostly immutable).
#[cw_serde]
pub struct MarketConfig {
    /// Factory contract that deployed this market
    pub factory: Addr,
    /// Curator who created and manages this market
    pub curator: Addr,
    /// Oracle configuration with address and validation rules
    pub oracle_config: OracleConfig,
    /// Collateral asset denom
    pub collateral_denom: String,
    /// Debt asset denom (the asset being lent/borrowed)
    pub debt_denom: String,
    /// Protocol fee collector address
    pub protocol_fee_collector: Addr,
}

/// Market parameters that control risk and fees.
#[cw_serde]
pub struct MarketParams {
    /// Maximum loan-to-value ratio for borrowing (e.g., 0.80 = 80%)
    pub loan_to_value: Decimal,
    /// Threshold at which positions become liquidatable (e.g., 0.85 = 85%)
    pub liquidation_threshold: Decimal,
    /// Bonus given to liquidators (e.g., 0.05 = 5%)
    pub liquidation_bonus: Decimal,
    /// Protocol fee on liquidations (e.g., 0.02 = 2%)
    pub liquidation_protocol_fee: Decimal,
    /// Maximum portion of debt that can be liquidated at once (e.g., 0.5 = 50%)
    pub close_factor: Decimal,
    /// Interest rate model parameters
    pub interest_rate_model: InterestRateModel,
    /// Protocol fee on interest (e.g., 0.10 = 10%)
    pub protocol_fee: Decimal,
    /// Curator fee on interest (e.g., 0.05 = 5%, max 25%)
    pub curator_fee: Decimal,
    /// Maximum supply allowed (None = unlimited)
    pub supply_cap: Option<Uint128>,
    /// Maximum borrow allowed (None = unlimited)
    pub borrow_cap: Option<Uint128>,
    /// Whether the market is enabled for new operations
    pub enabled: bool,
    /// Whether LTV can be modified by curator
    pub is_mutable: bool,
    /// Timestamp of last LTV update (for cooldown enforcement)
    pub ltv_last_update: u64,
}

/// Current market state with indices and totals.
#[cw_serde]
pub struct MarketState {
    /// Borrow index for tracking debt growth (starts at 1.0)
    pub borrow_index: Decimal,
    /// Liquidity index for tracking supply growth (starts at 1.0)
    pub liquidity_index: Decimal,
    /// Current borrow rate (annualized)
    pub borrow_rate: Decimal,
    /// Current liquidity/supply rate (annualized)
    pub liquidity_rate: Decimal,
    /// Total scaled supply (actual = scaled * liquidity_index)
    pub total_supply_scaled: Uint128,
    /// Total scaled debt (actual = scaled * borrow_index)
    pub total_debt_scaled: Uint128,
    /// Total collateral deposited (not scaled, no interest)
    pub total_collateral: Uint128,
    /// Last time interest was accrued
    pub last_update: u64,
    /// Market creation timestamp
    pub created_at: u64,
}

impl MarketState {
    /// Create initial market state.
    pub fn new(timestamp: u64) -> Self {
        Self {
            borrow_index: Decimal::one(),
            liquidity_index: Decimal::one(),
            borrow_rate: Decimal::zero(),
            liquidity_rate: Decimal::zero(),
            total_supply_scaled: Uint128::zero(),
            total_debt_scaled: Uint128::zero(),
            total_collateral: Uint128::zero(),
            last_update: timestamp,
            created_at: timestamp,
        }
    }

    /// Calculate current utilization rate.
    pub fn utilization(&self) -> Decimal {
        let total_supply = self.total_supply();
        let total_debt = self.total_debt();

        if total_supply.is_zero() {
            Decimal::zero()
        } else {
            Decimal::from_ratio(total_debt, total_supply)
        }
    }

    /// Get actual total supply (unscaled).
    /// scaled_amount * index = actual_amount
    pub fn total_supply(&self) -> Uint128 {
        self.total_supply_scaled.mul_floor(self.liquidity_index)
    }

    /// Get actual total debt (unscaled).
    /// scaled_amount * index = actual_amount
    pub fn total_debt(&self) -> Uint128 {
        self.total_debt_scaled.mul_floor(self.borrow_index)
    }

    /// Get available liquidity for borrowing/withdrawal.
    pub fn available_liquidity(&self) -> Uint128 {
        let supply = self.total_supply();
        let debt = self.total_debt();
        if supply > debt {
            supply - debt
        } else {
            Uint128::zero()
        }
    }
}

/// Parameters for creating a new market.
#[cw_serde]
pub struct CreateMarketParams {
    pub loan_to_value: Decimal,
    pub liquidation_threshold: Decimal,
    pub liquidation_bonus: Decimal,
    pub liquidation_protocol_fee: Decimal,
    pub close_factor: Decimal,
    pub interest_rate_model: InterestRateModel,
    pub protocol_fee: Decimal,
    pub curator_fee: Decimal,
    pub supply_cap: Option<Uint128>,
    pub borrow_cap: Option<Uint128>,
    pub is_mutable: bool,
}

/// Allowed updates to market parameters by curator.
#[cw_serde]
pub struct MarketParamsUpdate {
    /// New LTV (only if market is mutable, subject to ±5% and 7-day cooldown)
    pub loan_to_value: Option<Decimal>,
    /// New interest rate model
    pub interest_rate_model: Option<InterestRateModel>,
    /// New curator fee (0-25%)
    pub curator_fee: Option<Decimal>,
    /// New supply cap
    pub supply_cap: Option<Option<Uint128>>,
    /// New borrow cap
    pub borrow_cap: Option<Option<Uint128>>,
    /// Enable/disable market
    pub enabled: Option<bool>,
}

// ============================================================================
// Market Contract Messages
// ============================================================================

/// Instantiate message for market contract (called by factory).
#[cw_serde]
pub struct MarketInstantiateMsg {
    pub curator: String,
    pub oracle_config: OracleConfigUnchecked,
    pub collateral_denom: String,
    pub debt_denom: String,
    pub protocol_fee_collector: String,
    pub params: CreateMarketParams,
}

/// Execute messages for market contract.
#[cw_serde]
pub enum MarketExecuteMsg {
    /// Supply debt asset to earn interest (send debt_denom with msg)
    Supply { recipient: Option<String> },

    /// Withdraw supplied debt asset
    Withdraw {
        amount: Option<Uint128>,
        recipient: Option<String>,
    },

    /// Supply collateral asset (send collateral_denom with msg)
    SupplyCollateral { recipient: Option<String> },

    /// Withdraw collateral (must maintain LTV if debt exists)
    WithdrawCollateral {
        amount: Option<Uint128>,
        recipient: Option<String>,
    },

    /// Borrow debt asset against collateral
    Borrow {
        amount: Uint128,
        recipient: Option<String>,
    },

    /// Repay borrowed debt (send debt_denom with msg)
    Repay { on_behalf_of: Option<String> },

    /// Liquidate an unhealthy position (send debt_denom with msg)
    Liquidate { borrower: String },

    /// Update market parameters (curator only)
    UpdateParams { updates: MarketParamsUpdate },

    /// Accrue interest (can be called by anyone)
    AccrueInterest {},

    /// Claim accrued protocol and/or curator fees.
    /// Only callable by protocol fee collector or curator.
    /// Claims are limited by available liquidity (fees must be backed by actual tokens).
    ClaimFees {},
}

/// Query messages for market contract.
#[cw_serde]
#[derive(QueryResponses)]
pub enum MarketQueryMsg {
    /// Get market configuration
    #[returns(MarketConfigResponse)]
    Config {},

    /// Get market parameters
    #[returns(MarketParamsResponse)]
    Params {},

    /// Get current market state
    #[returns(MarketStateResponse)]
    State {},

    /// Get user's full position in this market
    #[returns(UserPositionResponse)]
    UserPosition { user: String },

    /// Get user's supply balance
    #[returns(UserBalanceResponse)]
    UserSupply { user: String },

    /// Get user's collateral balance
    #[returns(UserBalanceResponse)]
    UserCollateral { user: String },

    /// Get user's debt balance
    #[returns(UserBalanceResponse)]
    UserDebt { user: String },

    /// Check if a position is liquidatable
    #[returns(IsLiquidatableResponse)]
    IsLiquidatable { user: String },

    /// Get accrued protocol and curator fees (not yet claimed)
    #[returns(AccruedFeesResponse)]
    AccruedFees {},
}

// ============================================================================
// Query Responses
// ============================================================================

#[cw_serde]
pub struct MarketConfigResponse {
    pub factory: String,
    pub curator: String,
    /// Oracle contract address
    pub oracle: String,
    /// Oracle type with validation configuration
    pub oracle_type: OracleType,
    pub collateral_denom: String,
    pub debt_denom: String,
    pub protocol_fee_collector: String,
}

#[cw_serde]
pub struct MarketParamsResponse {
    pub loan_to_value: Decimal,
    pub liquidation_threshold: Decimal,
    pub liquidation_bonus: Decimal,
    pub liquidation_protocol_fee: Decimal,
    pub close_factor: Decimal,
    pub interest_rate_model: InterestRateModel,
    pub protocol_fee: Decimal,
    pub curator_fee: Decimal,
    pub supply_cap: Option<Uint128>,
    pub borrow_cap: Option<Uint128>,
    pub enabled: bool,
    pub is_mutable: bool,
    pub ltv_last_update: u64,
}

#[cw_serde]
pub struct MarketStateResponse {
    pub borrow_index: Decimal,
    pub liquidity_index: Decimal,
    pub borrow_rate: Decimal,
    pub liquidity_rate: Decimal,
    pub total_supply: Uint128,
    pub total_supply_scaled: Uint128,
    pub total_debt: Uint128,
    pub total_debt_scaled: Uint128,
    pub total_collateral: Uint128,
    pub utilization: Decimal,
    pub available_liquidity: Uint128,
    pub last_update: u64,
    pub created_at: u64,
}

#[cw_serde]
pub struct UserPositionResponse {
    pub collateral_amount: Uint128,
    pub collateral_value: Decimal,
    pub supply_amount: Uint128,
    pub supply_value: Decimal,
    pub debt_amount: Uint128,
    pub debt_value: Decimal,
    pub health_factor: Option<Decimal>,
    pub max_borrow_value: Decimal,
    pub liquidation_price: Option<Decimal>,
}

#[cw_serde]
pub struct UserBalanceResponse {
    pub scaled: Uint128,
    pub amount: Uint128,
    pub value: Decimal,
}

#[cw_serde]
pub struct IsLiquidatableResponse {
    pub is_liquidatable: bool,
    pub health_factor: Option<Decimal>,
    pub shortfall: Decimal,
}

#[cw_serde]
pub struct AccruedFeesResponse {
    /// Protocol fees accrued but not yet claimed (in debt token)
    pub accrued_protocol_fees: Uint128,
    /// Curator fees accrued but not yet claimed (in debt token)
    pub accrued_curator_fees: Uint128,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_market_state_new() {
        let state = MarketState::new(1000);

        assert_eq!(state.borrow_index, Decimal::one());
        assert_eq!(state.liquidity_index, Decimal::one());
        assert_eq!(state.borrow_rate, Decimal::zero());
        assert_eq!(state.liquidity_rate, Decimal::zero());
        assert_eq!(state.total_supply_scaled, Uint128::zero());
        assert_eq!(state.total_debt_scaled, Uint128::zero());
        assert_eq!(state.total_collateral, Uint128::zero());
        assert_eq!(state.last_update, 1000);
        assert_eq!(state.created_at, 1000);
    }

    #[test]
    fn test_utilization_zero_supply() {
        let state = MarketState::new(1000);
        assert_eq!(state.utilization(), Decimal::zero());
    }

    #[test]
    fn test_utilization_with_supply_and_debt() {
        let mut state = MarketState::new(1000);
        state.total_supply_scaled = Uint128::new(1000);
        state.total_debt_scaled = Uint128::new(500);
        // With index = 1, utilization = 500/1000 = 0.5
        assert_eq!(state.utilization(), Decimal::percent(50));
    }

    #[test]
    fn test_utilization_with_indices() {
        let mut state = MarketState::new(1000);
        state.total_supply_scaled = Uint128::new(1000);
        state.total_debt_scaled = Uint128::new(500);
        state.liquidity_index = Decimal::from_ratio(11u128, 10u128); // 1.1
        state.borrow_index = Decimal::from_ratio(12u128, 10u128); // 1.2

        // Actual supply = 1000 * 1.1 = 1100
        // Actual debt = 500 * 1.2 = 600
        // Utilization = 600 / 1100 ≈ 0.545
        let util = state.utilization();
        assert!(util > Decimal::percent(54));
        assert!(util < Decimal::percent(55));
    }

    #[test]
    fn test_total_supply() {
        let mut state = MarketState::new(1000);
        state.total_supply_scaled = Uint128::new(1000);
        state.liquidity_index = Decimal::from_ratio(11u128, 10u128); // 1.1

        assert_eq!(state.total_supply(), Uint128::new(1100));
    }

    #[test]
    fn test_total_debt() {
        let mut state = MarketState::new(1000);
        state.total_debt_scaled = Uint128::new(500);
        state.borrow_index = Decimal::from_ratio(12u128, 10u128); // 1.2

        assert_eq!(state.total_debt(), Uint128::new(600));
    }

    #[test]
    fn test_available_liquidity() {
        let mut state = MarketState::new(1000);
        state.total_supply_scaled = Uint128::new(1000);
        state.total_debt_scaled = Uint128::new(400);
        // Available = 1000 - 400 = 600
        assert_eq!(state.available_liquidity(), Uint128::new(600));
    }

    #[test]
    fn test_available_liquidity_fully_utilized() {
        let mut state = MarketState::new(1000);
        state.total_supply_scaled = Uint128::new(1000);
        state.total_debt_scaled = Uint128::new(1000);
        assert_eq!(state.available_liquidity(), Uint128::zero());
    }

    #[test]
    fn test_available_liquidity_over_utilized() {
        // Edge case: debt > supply (shouldn't happen, but handle gracefully)
        let mut state = MarketState::new(1000);
        state.total_supply_scaled = Uint128::new(1000);
        state.total_debt_scaled = Uint128::new(1100);
        assert_eq!(state.available_liquidity(), Uint128::zero());
    }
}
