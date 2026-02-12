use cosmwasm_std::{Decimal, Decimal256, Deps, Env, Uint128};

use crate::error::ContractError;
use crate::interest::{get_user_collateral, get_user_debt};
use crate::math256::{
    decimal256_to_decimal, decimal_to_decimal256, u128_to_decimal256, uint256_to_uint128,
};
use crate::state::{CONFIG, PARAMS};
use stone_types::{MarketConfig, MarketParams, OracleConfig, OracleQueryMsg, PriceResponse};

/// Query price from oracle for a denom.
/// Validates that the price is not stale and not zero.
pub fn query_price(
    deps: Deps,
    env: &Env,
    oracle_config: &OracleConfig,
    denom: &str,
) -> Result<Decimal, ContractError> {
    let response: PriceResponse = deps
        .querier
        .query_wasm_smart(
            oracle_config.address.as_str(),
            &OracleQueryMsg::Price {
                denom: denom.to_string(),
            },
        )
        .map_err(|e| ContractError::OracleError {
            denom: denom.to_string(),
            reason: e.to_string(),
        })?;

    // Validate timestamp is not in the future (clock skew check)
    let current_time = env.block.time.seconds();
    if response.updated_at > current_time {
        return Err(ContractError::OraclePriceFuture {
            denom: denom.to_string(),
            updated_at: response.updated_at,
            current: current_time,
        });
    }

    // Validate staleness
    let max_staleness = oracle_config.oracle_type.max_staleness_secs();
    let age_seconds = current_time.saturating_sub(response.updated_at);

    if age_seconds > max_staleness {
        return Err(ContractError::OraclePriceStale {
            denom: denom.to_string(),
            age_seconds,
            max_staleness,
        });
    }

    // Validate non-zero price
    if response.price.is_zero() {
        return Err(ContractError::OracleZeroPrice {
            denom: denom.to_string(),
        });
    }

    Ok(response.price)
}

// ============================================================================
// Core Position Health Data Structure
// ============================================================================

/// Represents a user's position health data with all relevant values calculated.
/// This is the single source of truth for position health calculations.
/// All values use Decimal256 internally to prevent overflow with large token amounts.
#[derive(Debug, Clone)]
pub struct PositionHealth {
    /// Raw collateral amount in tokens
    pub collateral_amount: Uint128,
    /// Raw debt amount in tokens
    pub debt_amount: Uint128,
    /// Collateral value in USD (collateral_amount * collateral_price)
    pub collateral_value: Decimal256,
    /// Debt value in USD (debt_amount * debt_price)
    pub debt_value: Decimal256,
    /// Price of collateral token (needed for recalculating collateral value)
    pub collateral_price: Decimal,
    /// Price of debt token (needed for converting values back to tokens)
    pub debt_price: Decimal,
    /// Loan-to-Value ratio from market params
    pub loan_to_value: Decimal,
    /// Liquidation threshold from market params
    pub liquidation_threshold: Decimal,
}

impl PositionHealth {
    /// Calculate health factor for this position.
    /// Returns None if position has no debt (always healthy).
    /// Health factor = (collateral_value * liquidation_threshold) / debt_value
    pub fn health_factor(&self) -> Result<Option<Decimal>, ContractError> {
        if self.debt_amount.is_zero() {
            return Ok(None);
        }

        let health_factor = self
            .collateral_value
            .checked_mul(decimal_to_decimal256(self.liquidation_threshold))?
            .checked_div(self.debt_value)?;

        Ok(Some(decimal256_to_decimal(health_factor)?))
    }

    /// Check if this position is liquidatable.
    /// A position is liquidatable when health_factor < 1.0
    pub fn is_liquidatable(&self) -> Result<bool, ContractError> {
        match self.health_factor()? {
            Some(hf) => Ok(hf < Decimal::one()),
            None => Ok(false),
        }
    }

    /// Calculate the maximum borrow value based on collateral.
    /// max_borrow_value = collateral_value * LTV
    pub fn max_borrow_value(&self) -> Result<Decimal256, ContractError> {
        Ok(self
            .collateral_value
            .checked_mul(decimal_to_decimal256(self.loan_to_value))?)
    }

    /// Calculate the maximum amount that can be borrowed in debt tokens.
    /// max_borrow = (collateral_value * LTV - debt_value) / debt_price
    pub fn max_borrow_amount(&self) -> Result<Uint128, ContractError> {
        let max_borrow_value = self.max_borrow_value()?;

        if max_borrow_value <= self.debt_value {
            return Ok(Uint128::zero());
        }

        let remaining_borrow_value = max_borrow_value.checked_sub(self.debt_value)?;

        // Convert value back to debt tokens
        let max_borrow =
            remaining_borrow_value.checked_div(decimal_to_decimal256(self.debt_price))?;

        // Convert Decimal256 to Uint128 (truncate), capping at Uint128::MAX
        let max_borrow_u256 = max_borrow.to_uint_floor();
        match uint256_to_uint128(max_borrow_u256) {
            Ok(value) => Ok(value),
            Err(_) => Ok(Uint128::MAX), // Cap at Uint128::MAX if too large
        }
    }

    /// Calculate the liquidation price for collateral.
    /// This is the collateral price at which the position becomes liquidatable.
    /// liquidation_price = debt_value / (collateral_amount * liquidation_threshold)
    pub fn liquidation_price(&self) -> Result<Option<Decimal>, ContractError> {
        if self.debt_amount.is_zero() || self.collateral_amount.is_zero() {
            return Ok(None);
        }

        let denominator = u128_to_decimal256(self.collateral_amount)
            .checked_mul(decimal_to_decimal256(self.liquidation_threshold))?;
        let liquidation_price = self.debt_value.checked_div(denominator)?;

        Ok(Some(decimal256_to_decimal(liquidation_price)?))
    }

    /// Create a modified position with additional debt.
    /// Used to check if a borrow would be allowed.
    pub fn with_additional_debt(&self, additional_debt: Uint128) -> Result<Self, ContractError> {
        let new_debt_amount = self.debt_amount.checked_add(additional_debt)?;
        let new_debt_value = u128_to_decimal256(new_debt_amount)
            .checked_mul(decimal_to_decimal256(self.debt_price))?;

        Ok(Self {
            collateral_amount: self.collateral_amount,
            debt_amount: new_debt_amount,
            collateral_value: self.collateral_value,
            debt_value: new_debt_value,
            collateral_price: self.collateral_price,
            debt_price: self.debt_price,
            loan_to_value: self.loan_to_value,
            liquidation_threshold: self.liquidation_threshold,
        })
    }

    /// Create a modified position with reduced collateral.
    /// Used to check if a withdrawal would be allowed.
    pub fn with_reduced_collateral(&self, withdraw_amount: Uint128) -> Result<Self, ContractError> {
        if withdraw_amount > self.collateral_amount {
            return Err(ContractError::NoCollateral);
        }

        let new_collateral_amount = self.collateral_amount.checked_sub(withdraw_amount)?;
        let new_collateral_value = u128_to_decimal256(new_collateral_amount)
            .checked_mul(decimal_to_decimal256(self.collateral_price))?;

        Ok(Self {
            collateral_amount: new_collateral_amount,
            debt_amount: self.debt_amount,
            collateral_value: new_collateral_value,
            debt_value: self.debt_value,
            collateral_price: self.collateral_price,
            debt_price: self.debt_price,
            loan_to_value: self.loan_to_value,
            liquidation_threshold: self.liquidation_threshold,
        })
    }

    /// Check if adding more debt would exceed LTV.
    /// Returns Ok(()) if the borrow is allowed, Err if it exceeds LTV.
    pub fn check_borrow_allowed(&self, borrow_amount: Uint128) -> Result<(), ContractError> {
        let position_after = self.with_additional_debt(borrow_amount)?;
        let max_borrow_value = position_after.max_borrow_value()?;

        if position_after.debt_value > max_borrow_value {
            return Err(ContractError::ExceedsLtv {
                max_borrow: decimal256_to_decimal(max_borrow_value)?.to_string(),
                requested: decimal256_to_decimal(position_after.debt_value)?.to_string(),
            });
        }

        Ok(())
    }

    /// Check if withdrawing collateral would make the position unhealthy.
    /// Uses LTV for withdrawal check (more conservative than liquidation threshold).
    /// Returns Ok(()) if the withdrawal is allowed, Err otherwise.
    ///
    /// Note: This method assumes the caller has verified there is debt. If no debt exists,
    /// use the public `check_withdrawal_allowed` function which skips oracle queries entirely.
    pub fn check_withdrawal_allowed(&self, withdraw_amount: Uint128) -> Result<(), ContractError> {
        let position_after = self.with_reduced_collateral(withdraw_amount)?;
        let max_debt_value = position_after.max_borrow_value()?;

        if position_after.debt_value > max_debt_value {
            let health_factor = position_after.health_factor()?.unwrap_or(Decimal::zero());
            return Err(ContractError::InsufficientCollateral {
                health_factor: health_factor.to_string(),
            });
        }

        Ok(())
    }
}

// ============================================================================
// Core Position Health Calculator
// ============================================================================

/// Load all position health data for a user.
/// This is the core function that consolidates all health-related data loading.
pub fn calculate_position_health(
    deps: Deps,
    env: &Env,
    user: &str,
) -> Result<PositionHealth, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let params = PARAMS.load(deps.storage)?;

    calculate_position_health_with_config(deps, env, user, &config, &params)
}

/// Load position health data with provided config and params.
/// Useful when caller already has config/params loaded.
pub fn calculate_position_health_with_config(
    deps: Deps,
    env: &Env,
    user: &str,
    config: &MarketConfig,
    params: &MarketParams,
) -> Result<PositionHealth, ContractError> {
    let collateral_amount = get_user_collateral(deps.storage, user)?;
    let debt_amount = get_user_debt(deps.storage, user)?;

    let collateral_price = query_price(deps, env, &config.oracle_config, &config.collateral_denom)?;
    let debt_price = query_price(deps, env, &config.oracle_config, &config.debt_denom)?;

    let collateral_value = u128_to_decimal256(collateral_amount)
        .checked_mul(decimal_to_decimal256(collateral_price))?;
    let debt_value =
        u128_to_decimal256(debt_amount).checked_mul(decimal_to_decimal256(debt_price))?;

    Ok(PositionHealth {
        collateral_amount,
        debt_amount,
        collateral_value,
        debt_value,
        collateral_price,
        debt_price,
        loan_to_value: params.loan_to_value,
        liquidation_threshold: params.liquidation_threshold,
    })
}

// ============================================================================
// Public API Functions (maintain existing signatures for backward compatibility)
// ============================================================================

/// Calculate health factor for a user.
/// Returns None if user has no debt (always healthy).
/// Health factor = (collateral_value * liquidation_threshold) / debt_value
/// Uses Decimal256 internally to prevent overflow with large token amounts.
pub fn calculate_health_factor(
    deps: Deps,
    env: &Env,
    user: &str,
) -> Result<Option<Decimal>, ContractError> {
    let position = calculate_position_health(deps, env, user)?;
    position.health_factor()
}

/// Check if a position is liquidatable.
pub fn is_liquidatable(deps: Deps, env: &Env, user: &str) -> Result<bool, ContractError> {
    let position = calculate_position_health(deps, env, user)?;
    position.is_liquidatable()
}

/// Calculate the maximum amount a user can borrow based on their collateral.
/// max_borrow_value = collateral_value * LTV - current_debt_value
/// Uses Decimal256 internally to prevent overflow with large token amounts.
pub fn calculate_max_borrow(deps: Deps, env: &Env, user: &str) -> Result<Uint128, ContractError> {
    let position = calculate_position_health(deps, env, user)?;
    position.max_borrow_amount()
}

/// Check if a borrow would exceed LTV.
/// Uses Decimal256 internally to prevent overflow with large token amounts.
pub fn check_borrow_allowed(
    deps: Deps,
    env: &Env,
    user: &str,
    borrow_amount: Uint128,
) -> Result<(), ContractError> {
    let position = calculate_position_health(deps, env, user)?;
    position.check_borrow_allowed(borrow_amount)
}

/// Check if a collateral withdrawal would make the position unhealthy.
/// Uses Decimal256 internally to prevent overflow with large token amounts.
pub fn check_withdrawal_allowed(
    deps: Deps,
    env: &Env,
    user: &str,
    withdraw_amount: Uint128,
) -> Result<(), ContractError> {
    let debt_amount = get_user_debt(deps.storage, user)?;

    // If no debt, any withdrawal is allowed (no oracle query needed, no validation)
    if debt_amount.is_zero() {
        return Ok(());
    }

    // Only query prices and load full position when there's debt
    let position = calculate_position_health(deps, env, user)?;
    position.check_withdrawal_allowed(withdraw_amount)
}

/// Calculate liquidation price for collateral.
/// This is the price at which the position becomes liquidatable.
/// liquidation_price = (debt_value / (collateral_amount * liquidation_threshold))
/// Uses Decimal256 internally to prevent overflow with large token amounts.
pub fn calculate_liquidation_price(
    deps: Deps,
    env: &Env,
    user: &str,
) -> Result<Option<Decimal>, ContractError> {
    let position = calculate_position_health(deps, env, user)?;
    position.liquidation_price()
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{mock_dependencies, mock_env, MockQuerier};
    use cosmwasm_std::{from_json, to_json_binary, Addr, ContractResult, QuerierResult, WasmQuery};
    use stone_types::{
        InterestRateModel, MarketConfig, MarketParams, MarketState, OracleConfig, OracleType,
    };

    // Base timestamp for tests (~Nov 2023)
    const BASE_TIMESTAMP: u64 = 1_700_000_000;

    fn setup_with_oracle(
        deps: &mut cosmwasm_std::OwnedDeps<
            cosmwasm_std::MemoryStorage,
            cosmwasm_std::testing::MockApi,
            MockQuerier,
        >,
        collateral_price: Decimal,
        debt_price: Decimal,
    ) {
        setup_with_oracle_at_time(deps, collateral_price, debt_price, BASE_TIMESTAMP);
    }

    fn setup_with_oracle_at_time(
        deps: &mut cosmwasm_std::OwnedDeps<
            cosmwasm_std::MemoryStorage,
            cosmwasm_std::testing::MockApi,
            MockQuerier,
        >,
        collateral_price: Decimal,
        debt_price: Decimal,
        oracle_updated_at: u64,
    ) {
        // Setup config
        let config = MarketConfig {
            factory: Addr::unchecked("factory"),
            curator: Addr::unchecked("curator"),
            oracle_config: OracleConfig {
                address: Addr::unchecked("oracle"),
                oracle_type: OracleType::Generic {
                    expected_code_id: None,
                    max_staleness_secs: 300,
                },
            },
            collateral_denom: "uatom".to_string(),
            debt_denom: "uusdc".to_string(),
            protocol_fee_collector: Addr::unchecked("collector"),
            salt: None,
        };
        CONFIG.save(deps.as_mut().storage, &config).unwrap();

        // Setup params
        let params = MarketParams {
            loan_to_value: Decimal::percent(80),
            liquidation_threshold: Decimal::percent(85),
            liquidation_bonus: Decimal::percent(5),
            liquidation_protocol_fee: Decimal::percent(2),
            close_factor: Decimal::percent(50),
            dust_debt_threshold: Uint128::new(100),
            interest_rate_model: InterestRateModel::default(),
            protocol_fee: Decimal::percent(10),
            curator_fee: Decimal::percent(5),
            supply_cap: None,
            borrow_cap: None,
            enabled: true,
            is_mutable: false,
            ltv_last_update: 0,
        };
        PARAMS.save(deps.as_mut().storage, &params).unwrap();

        // Setup state
        let state = MarketState::new(1000);
        crate::state::STATE
            .save(deps.as_mut().storage, &state)
            .unwrap();

        // Setup oracle mock with configurable updated_at timestamp
        let collateral_price_copy = collateral_price;
        let debt_price_copy = debt_price;
        let oracle_timestamp = oracle_updated_at;

        deps.querier.update_wasm(move |query| match query {
            WasmQuery::Smart { contract_addr, msg } if contract_addr == "oracle" => {
                let query_msg: OracleQueryMsg = from_json(msg).unwrap();
                match query_msg {
                    OracleQueryMsg::Price { denom } => {
                        let price = if denom == "uatom" {
                            collateral_price_copy
                        } else {
                            debt_price_copy
                        };
                        let response = PriceResponse {
                            denom,
                            price,
                            updated_at: oracle_timestamp,
                        };
                        QuerierResult::Ok(ContractResult::Ok(to_json_binary(&response).unwrap()))
                    }
                }
            }
            _ => QuerierResult::Err(cosmwasm_std::SystemError::UnsupportedRequest {
                kind: "unknown".to_string(),
            }),
        });
    }

    fn mock_env_at_time(time: u64) -> Env {
        let mut env = mock_env();
        env.block.time = cosmwasm_std::Timestamp::from_seconds(time);
        env
    }

    #[test]
    fn test_health_factor_no_debt() {
        let mut deps = mock_dependencies();
        setup_with_oracle(
            &mut deps,
            Decimal::from_ratio(10u128, 1u128),
            Decimal::one(),
        );

        // User has collateral but no debt
        crate::state::COLLATERAL
            .save(deps.as_mut().storage, "user1", &Uint128::new(1000))
            .unwrap();

        let env = mock_env_at_time(BASE_TIMESTAMP);
        let hf = calculate_health_factor(deps.as_ref(), &env, "user1").unwrap();
        assert!(hf.is_none());
    }

    #[test]
    fn test_health_factor_healthy() {
        let mut deps = mock_dependencies();
        setup_with_oracle(
            &mut deps,
            Decimal::from_ratio(10u128, 1u128), // $10 per collateral
            Decimal::one(),                     // $1 per debt
        );

        // User has 1000 collateral ($10,000) and 5000 debt ($5,000)
        crate::state::COLLATERAL
            .save(deps.as_mut().storage, "user1", &Uint128::new(1000))
            .unwrap();
        crate::state::DEBTS
            .save(deps.as_mut().storage, "user1", &Uint128::new(5000))
            .unwrap();

        let env = mock_env_at_time(BASE_TIMESTAMP);
        let hf = calculate_health_factor(deps.as_ref(), &env, "user1")
            .unwrap()
            .unwrap();
        // HF = (10000 * 0.85) / 5000 = 1.7
        assert_eq!(hf, Decimal::from_ratio(17u128, 10u128));
        assert!(!is_liquidatable(deps.as_ref(), &env, "user1").unwrap());
    }

    #[test]
    fn test_health_factor_liquidatable() {
        let mut deps = mock_dependencies();
        setup_with_oracle(
            &mut deps,
            Decimal::from_ratio(5u128, 1u128), // $5 per collateral
            Decimal::one(),                    // $1 per debt
        );

        // User has 1000 collateral ($5,000) and 5000 debt ($5,000)
        crate::state::COLLATERAL
            .save(deps.as_mut().storage, "user1", &Uint128::new(1000))
            .unwrap();
        crate::state::DEBTS
            .save(deps.as_mut().storage, "user1", &Uint128::new(5000))
            .unwrap();

        let env = mock_env_at_time(BASE_TIMESTAMP);
        let hf = calculate_health_factor(deps.as_ref(), &env, "user1")
            .unwrap()
            .unwrap();
        // HF = (5000 * 0.85) / 5000 = 0.85
        assert_eq!(hf, Decimal::percent(85));
        assert!(is_liquidatable(deps.as_ref(), &env, "user1").unwrap());
    }

    #[test]
    fn test_health_factor_with_large_amounts() {
        let mut deps = mock_dependencies();
        setup_with_oracle(
            &mut deps,
            Decimal::from_ratio(10u128, 1u128), // $10 per collateral
            Decimal::one(),                     // $1 per debt
        );

        // User has very large amounts that could cause overflow with Decimal
        // Uint128::MAX is approximately 3.4e38
        let large_amount = Uint128::new(u128::MAX / 2);
        crate::state::COLLATERAL
            .save(deps.as_mut().storage, "user1", &large_amount)
            .unwrap();
        crate::state::DEBTS
            .save(
                deps.as_mut().storage,
                "user1",
                &(large_amount / Uint128::new(2)),
            )
            .unwrap();

        let env = mock_env_at_time(BASE_TIMESTAMP);
        // This should not overflow with Decimal256
        let hf = calculate_health_factor(deps.as_ref(), &env, "user1")
            .unwrap()
            .unwrap();
        // HF = (large * 10 * 0.85) / (large/2 * 1) = (large * 8.5) / (large/2) = 17
        assert_eq!(hf, Decimal::from_ratio(17u128, 1u128));
        assert!(!is_liquidatable(deps.as_ref(), &env, "user1").unwrap());
    }

    #[test]
    fn test_max_borrow() {
        let mut deps = mock_dependencies();
        setup_with_oracle(
            &mut deps,
            Decimal::from_ratio(10u128, 1u128), // $10 per collateral
            Decimal::one(),                     // $1 per debt
        );

        // User has 1000 collateral ($10,000)
        crate::state::COLLATERAL
            .save(deps.as_mut().storage, "user1", &Uint128::new(1000))
            .unwrap();

        let env = mock_env_at_time(BASE_TIMESTAMP);
        let max = calculate_max_borrow(deps.as_ref(), &env, "user1").unwrap();
        // Max borrow = 10000 * 0.80 = 8000
        assert_eq!(max, Uint128::new(8000));
    }

    #[test]
    fn test_max_borrow_with_existing_debt() {
        let mut deps = mock_dependencies();
        setup_with_oracle(
            &mut deps,
            Decimal::from_ratio(10u128, 1u128),
            Decimal::one(),
        );

        // User has 1000 collateral and 3000 existing debt
        crate::state::COLLATERAL
            .save(deps.as_mut().storage, "user1", &Uint128::new(1000))
            .unwrap();
        crate::state::DEBTS
            .save(deps.as_mut().storage, "user1", &Uint128::new(3000))
            .unwrap();

        let env = mock_env_at_time(BASE_TIMESTAMP);
        let max = calculate_max_borrow(deps.as_ref(), &env, "user1").unwrap();
        // Max borrow = 8000 - 3000 = 5000
        assert_eq!(max, Uint128::new(5000));
    }

    #[test]
    fn test_max_borrow_with_large_amounts() {
        let mut deps = mock_dependencies();
        setup_with_oracle(
            &mut deps,
            Decimal::from_ratio(10u128, 1u128),
            Decimal::one(),
        );

        // User has very large collateral that could cause overflow with Decimal
        let large_collateral = Uint128::new(u128::MAX / 10);
        crate::state::COLLATERAL
            .save(deps.as_mut().storage, "user1", &large_collateral)
            .unwrap();

        let env = mock_env_at_time(BASE_TIMESTAMP);
        // This should not overflow with Decimal256
        let max = calculate_max_borrow(deps.as_ref(), &env, "user1").unwrap();
        // Max borrow = large_collateral * 10 * 0.80 = large_collateral * 8
        // (u128::MAX / 10) * 8 fits comfortably in Uint128
        let expected = large_collateral.checked_mul(Uint128::new(8)).unwrap();
        assert_eq!(max, expected);
    }

    #[test]
    fn test_check_borrow_allowed() {
        let mut deps = mock_dependencies();
        setup_with_oracle(
            &mut deps,
            Decimal::from_ratio(10u128, 1u128),
            Decimal::one(),
        );

        crate::state::COLLATERAL
            .save(deps.as_mut().storage, "user1", &Uint128::new(1000))
            .unwrap();

        let env = mock_env_at_time(BASE_TIMESTAMP);
        // Borrow 8000 should be allowed (exactly at LTV)
        assert!(check_borrow_allowed(deps.as_ref(), &env, "user1", Uint128::new(8000)).is_ok());

        // Borrow 8001 should fail
        assert!(check_borrow_allowed(deps.as_ref(), &env, "user1", Uint128::new(8001)).is_err());
    }

    #[test]
    fn test_check_borrow_allowed_with_large_amounts() {
        let mut deps = mock_dependencies();
        setup_with_oracle(
            &mut deps,
            Decimal::from_ratio(10u128, 1u128),
            Decimal::one(),
        );

        let large_collateral = Uint128::new(u128::MAX / 10);
        crate::state::COLLATERAL
            .save(deps.as_mut().storage, "user1", &large_collateral)
            .unwrap();

        let env = mock_env_at_time(BASE_TIMESTAMP);
        // Should not overflow when checking borrow with large collateral
        let result = check_borrow_allowed(deps.as_ref(), &env, "user1", Uint128::new(1000));
        assert!(result.is_ok());
    }

    #[test]
    fn test_check_withdrawal_allowed_no_debt() {
        let mut deps = mock_dependencies();
        setup_with_oracle(
            &mut deps,
            Decimal::from_ratio(10u128, 1u128),
            Decimal::one(),
        );

        crate::state::COLLATERAL
            .save(deps.as_mut().storage, "user1", &Uint128::new(1000))
            .unwrap();

        let env = mock_env_at_time(BASE_TIMESTAMP);
        // Any withdrawal should be allowed with no debt
        assert!(check_withdrawal_allowed(deps.as_ref(), &env, "user1", Uint128::new(1000)).is_ok());
    }

    #[test]
    fn test_check_withdrawal_with_debt() {
        let mut deps = mock_dependencies();
        setup_with_oracle(
            &mut deps,
            Decimal::from_ratio(10u128, 1u128),
            Decimal::one(),
        );

        // 1000 collateral ($10,000), 4000 debt ($4,000)
        crate::state::COLLATERAL
            .save(deps.as_mut().storage, "user1", &Uint128::new(1000))
            .unwrap();
        crate::state::DEBTS
            .save(deps.as_mut().storage, "user1", &Uint128::new(4000))
            .unwrap();

        let env = mock_env_at_time(BASE_TIMESTAMP);
        // Need at least 500 collateral to cover 4000 debt at 80% LTV
        // 500 * 10 * 0.8 = 4000
        // Withdrawing 500 should be allowed
        assert!(check_withdrawal_allowed(deps.as_ref(), &env, "user1", Uint128::new(500)).is_ok());

        // Withdrawing 501 should fail
        assert!(check_withdrawal_allowed(deps.as_ref(), &env, "user1", Uint128::new(501)).is_err());
    }

    #[test]
    fn test_check_withdrawal_with_large_amounts() {
        let mut deps = mock_dependencies();
        setup_with_oracle(
            &mut deps,
            Decimal::from_ratio(10u128, 1u128),
            Decimal::one(),
        );

        let large_collateral = Uint128::new(u128::MAX / 10);
        let large_debt = large_collateral / Uint128::new(20); // 5% of collateral

        crate::state::COLLATERAL
            .save(deps.as_mut().storage, "user1", &large_collateral)
            .unwrap();
        crate::state::DEBTS
            .save(deps.as_mut().storage, "user1", &large_debt)
            .unwrap();

        let env = mock_env_at_time(BASE_TIMESTAMP);
        // Should not overflow when checking withdrawal with large amounts
        let result = check_withdrawal_allowed(deps.as_ref(), &env, "user1", Uint128::new(1000));
        assert!(result.is_ok());
    }

    #[test]
    fn test_liquidation_price() {
        let mut deps = mock_dependencies();
        setup_with_oracle(
            &mut deps,
            Decimal::from_ratio(10u128, 1u128),
            Decimal::one(),
        );

        // 1000 collateral, 5000 debt
        crate::state::COLLATERAL
            .save(deps.as_mut().storage, "user1", &Uint128::new(1000))
            .unwrap();
        crate::state::DEBTS
            .save(deps.as_mut().storage, "user1", &Uint128::new(5000))
            .unwrap();

        let env = mock_env_at_time(BASE_TIMESTAMP);
        let liq_price = calculate_liquidation_price(deps.as_ref(), &env, "user1")
            .unwrap()
            .unwrap();

        // Liquidation when: collateral_value * 0.85 = debt_value
        // price * 1000 * 0.85 = 5000
        // price = 5000 / 850 = 100/17 ≈ 5.882352941...
        assert_eq!(liq_price, Decimal::from_ratio(5000u128, 850u128));
    }

    #[test]
    fn test_liquidation_price_with_large_amounts() {
        let mut deps = mock_dependencies();
        setup_with_oracle(
            &mut deps,
            Decimal::from_ratio(10u128, 1u128),
            Decimal::one(),
        );

        // Very large amounts that could overflow with Decimal
        let large_collateral = Uint128::new(u128::MAX / 10);
        let large_debt = large_collateral / Uint128::new(10);

        crate::state::COLLATERAL
            .save(deps.as_mut().storage, "user1", &large_collateral)
            .unwrap();
        crate::state::DEBTS
            .save(deps.as_mut().storage, "user1", &large_debt)
            .unwrap();

        let env = mock_env_at_time(BASE_TIMESTAMP);
        // This should not overflow with Decimal256
        let liq_price = calculate_liquidation_price(deps.as_ref(), &env, "user1")
            .unwrap()
            .unwrap();

        // LP = (large_debt * $1) / (large_collateral * 0.85)
        //    = (large_collateral/10 * 1) / (large_collateral * 0.85)
        //    = 1 / 8.5 = 2/17 ≈ 0.117647...
        assert_eq!(liq_price, Decimal::from_ratio(2u128, 17u128));
    }

    #[test]
    fn test_stale_price_rejection() {
        let mut deps = mock_dependencies();
        setup_with_oracle(
            &mut deps,
            Decimal::from_ratio(10u128, 1u128),
            Decimal::one(),
        );

        // User has collateral and debt
        crate::state::COLLATERAL
            .save(deps.as_mut().storage, "user1", &Uint128::new(1000))
            .unwrap();
        crate::state::DEBTS
            .save(deps.as_mut().storage, "user1", &Uint128::new(5000))
            .unwrap();

        // Price is stale when current time > updated_at + max_staleness (300s)
        // updated_at is BASE_TIMESTAMP, so at BASE_TIMESTAMP + 301 the price should be rejected
        let env = mock_env_at_time(BASE_TIMESTAMP + 301);
        let result = calculate_health_factor(deps.as_ref(), &env, "user1");

        assert!(
            matches!(
                &result,
                Err(ContractError::OraclePriceStale {
                    denom,
                    age_seconds: 301,
                    max_staleness: 300
                }) if denom == "uatom"
            ),
            "Expected OraclePriceStale error, got {:?}",
            result
        );
    }

    #[test]
    fn test_fresh_price_acceptance() {
        let mut deps = mock_dependencies();
        setup_with_oracle(
            &mut deps,
            Decimal::from_ratio(10u128, 1u128),
            Decimal::one(),
        );

        // User has collateral and debt
        crate::state::COLLATERAL
            .save(deps.as_mut().storage, "user1", &Uint128::new(1000))
            .unwrap();
        crate::state::DEBTS
            .save(deps.as_mut().storage, "user1", &Uint128::new(5000))
            .unwrap();

        // Price is fresh when current time <= updated_at + max_staleness (300s)
        // updated_at is BASE_TIMESTAMP, so at BASE_TIMESTAMP + 300 the price should be accepted
        let env = mock_env_at_time(BASE_TIMESTAMP + 300);
        let result = calculate_health_factor(deps.as_ref(), &env, "user1");

        assert!(
            result.is_ok(),
            "Expected fresh price to be accepted, got error: {:?}",
            result
        );

        // Verify the health factor is calculated correctly
        let hf = result.unwrap().unwrap();
        assert!(hf > Decimal::one());
    }

    #[test]
    fn test_zero_price_rejection() {
        let mut deps = mock_dependencies();
        // Set zero collateral price
        setup_with_oracle(&mut deps, Decimal::zero(), Decimal::one());

        // User has collateral and debt
        crate::state::COLLATERAL
            .save(deps.as_mut().storage, "user1", &Uint128::new(1000))
            .unwrap();
        crate::state::DEBTS
            .save(deps.as_mut().storage, "user1", &Uint128::new(5000))
            .unwrap();

        let env = mock_env_at_time(BASE_TIMESTAMP);
        let result = calculate_health_factor(deps.as_ref(), &env, "user1");

        assert!(
            matches!(
                &result,
                Err(ContractError::OracleZeroPrice { denom }) if denom == "uatom"
            ),
            "Expected OracleZeroPrice error, got {:?}",
            result
        );
    }

    #[test]
    fn test_zero_debt_price_rejection() {
        let mut deps = mock_dependencies();
        // Set zero debt price
        setup_with_oracle(
            &mut deps,
            Decimal::from_ratio(10u128, 1u128),
            Decimal::zero(),
        );

        // User has collateral and debt
        crate::state::COLLATERAL
            .save(deps.as_mut().storage, "user1", &Uint128::new(1000))
            .unwrap();
        crate::state::DEBTS
            .save(deps.as_mut().storage, "user1", &Uint128::new(5000))
            .unwrap();

        let env = mock_env_at_time(BASE_TIMESTAMP);
        let result = calculate_health_factor(deps.as_ref(), &env, "user1");

        assert!(
            matches!(
                &result,
                Err(ContractError::OracleZeroPrice { denom }) if denom == "uusdc"
            ),
            "Expected OracleZeroPrice error for debt, got {:?}",
            result
        );
    }

    #[test]
    fn test_future_price_rejection() {
        // Setup oracle with a future timestamp (clock skew)
        let mut deps = mock_dependencies();
        setup_with_oracle_at_time(
            &mut deps,
            Decimal::from_ratio(10u128, 1u128),
            Decimal::one(),
            BASE_TIMESTAMP + 100, // Oracle timestamp is in the future
        );

        // User has collateral and debt
        crate::state::COLLATERAL
            .save(deps.as_mut().storage, "user1", &Uint128::new(1000))
            .unwrap();
        crate::state::DEBTS
            .save(deps.as_mut().storage, "user1", &Uint128::new(5000))
            .unwrap();

        // Current time is BASE_TIMESTAMP, but oracle says price was updated at BASE_TIMESTAMP + 100
        let env = mock_env_at_time(BASE_TIMESTAMP);
        let result = calculate_health_factor(deps.as_ref(), &env, "user1");

        assert!(
            matches!(
                &result,
                Err(ContractError::OraclePriceFuture {
                    denom,
                    updated_at,
                    current
                }) if denom == "uatom" && *updated_at == BASE_TIMESTAMP + 100 && *current == BASE_TIMESTAMP
            ),
            "Expected OraclePriceFuture error, got {:?}",
            result
        );
    }

    // ============================================================================
    // Additional tests for PositionHealth struct methods
    // ============================================================================

    #[test]
    fn test_position_health_with_additional_debt() {
        let mut deps = mock_dependencies();
        setup_with_oracle(
            &mut deps,
            Decimal::from_ratio(10u128, 1u128),
            Decimal::one(),
        );

        crate::state::COLLATERAL
            .save(deps.as_mut().storage, "user1", &Uint128::new(1000))
            .unwrap();
        crate::state::DEBTS
            .save(deps.as_mut().storage, "user1", &Uint128::new(4000))
            .unwrap();

        let env = mock_env_at_time(BASE_TIMESTAMP);
        let position = calculate_position_health(deps.as_ref(), &env, "user1").unwrap();

        // Original position has 4000 debt
        assert_eq!(position.debt_amount, Uint128::new(4000));

        // After adding 1000 debt
        let new_position = position.with_additional_debt(Uint128::new(1000)).unwrap();
        assert_eq!(new_position.debt_amount, Uint128::new(5000));
        assert_eq!(new_position.collateral_amount, position.collateral_amount);
    }

    #[test]
    fn test_position_health_with_reduced_collateral() {
        let mut deps = mock_dependencies();
        setup_with_oracle(
            &mut deps,
            Decimal::from_ratio(10u128, 1u128),
            Decimal::one(),
        );

        crate::state::COLLATERAL
            .save(deps.as_mut().storage, "user1", &Uint128::new(1000))
            .unwrap();
        crate::state::DEBTS
            .save(deps.as_mut().storage, "user1", &Uint128::new(4000))
            .unwrap();

        let env = mock_env_at_time(BASE_TIMESTAMP);
        let position = calculate_position_health(deps.as_ref(), &env, "user1").unwrap();

        // After reducing collateral by 200
        let new_position = position.with_reduced_collateral(Uint128::new(200)).unwrap();
        assert_eq!(new_position.collateral_amount, Uint128::new(800));
        assert_eq!(new_position.debt_amount, position.debt_amount);
    }

    #[test]
    fn test_position_health_with_reduced_collateral_exceeds_available() {
        let mut deps = mock_dependencies();
        setup_with_oracle(
            &mut deps,
            Decimal::from_ratio(10u128, 1u128),
            Decimal::one(),
        );

        crate::state::COLLATERAL
            .save(deps.as_mut().storage, "user1", &Uint128::new(1000))
            .unwrap();

        let env = mock_env_at_time(BASE_TIMESTAMP);
        let position = calculate_position_health(deps.as_ref(), &env, "user1").unwrap();

        // Try to reduce collateral by more than available
        let result = position.with_reduced_collateral(Uint128::new(1001));
        assert!(matches!(result, Err(ContractError::NoCollateral)));
    }
}
