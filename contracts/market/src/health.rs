use cosmwasm_std::{Decimal, Deps, Env, Uint128};

use crate::error::ContractError;
use crate::interest::{get_user_collateral, get_user_debt};
use crate::state::{CONFIG, PARAMS};
use stone_types::{OracleConfig, OracleQueryMsg, PriceResponse};

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

/// Calculate health factor for a user.
/// Returns None if user has no debt (always healthy).
/// Health factor = (collateral_value * liquidation_threshold) / debt_value
pub fn calculate_health_factor(
    deps: Deps,
    env: &Env,
    user: &str,
) -> Result<Option<Decimal>, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let params = PARAMS.load(deps.storage)?;

    let collateral_amount = get_user_collateral(deps.storage, user)?;
    let debt_amount = get_user_debt(deps.storage, user)?;

    if debt_amount.is_zero() {
        return Ok(None);
    }

    let collateral_price = query_price(deps, env, &config.oracle_config, &config.collateral_denom)?;
    let debt_price = query_price(deps, env, &config.oracle_config, &config.debt_denom)?;

    let collateral_value =
        Decimal::from_ratio(collateral_amount, 1u128).checked_mul(collateral_price)?;
    let debt_value = Decimal::from_ratio(debt_amount, 1u128).checked_mul(debt_price)?;

    let health_factor = collateral_value
        .checked_mul(params.liquidation_threshold)?
        .checked_div(debt_value)?;

    Ok(Some(health_factor))
}

/// Check if a position is liquidatable.
pub fn is_liquidatable(deps: Deps, env: &Env, user: &str) -> Result<bool, ContractError> {
    match calculate_health_factor(deps, env, user)? {
        Some(hf) => Ok(hf < Decimal::one()),
        None => Ok(false),
    }
}

/// Calculate the maximum amount a user can borrow based on their collateral.
/// max_borrow_value = collateral_value * LTV - current_debt_value
pub fn calculate_max_borrow(
    deps: Deps,
    env: &Env,
    user: &str,
) -> Result<Uint128, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let params = PARAMS.load(deps.storage)?;

    let collateral_amount = get_user_collateral(deps.storage, user)?;
    let debt_amount = get_user_debt(deps.storage, user)?;

    let collateral_price = query_price(deps, env, &config.oracle_config, &config.collateral_denom)?;
    let debt_price = query_price(deps, env, &config.oracle_config, &config.debt_denom)?;

    let collateral_value =
        Decimal::from_ratio(collateral_amount, 1u128).checked_mul(collateral_price)?;
    let debt_value = Decimal::from_ratio(debt_amount, 1u128).checked_mul(debt_price)?;

    let max_borrow_value = collateral_value.checked_mul(params.loan_to_value)?;

    if max_borrow_value <= debt_value {
        return Ok(Uint128::zero());
    }

    let remaining_borrow_value = max_borrow_value.checked_sub(debt_value)?;

    // Convert value back to debt tokens
    // remaining_borrow = remaining_value / debt_price
    let max_borrow = remaining_borrow_value.checked_div(debt_price)?;

    // Convert Decimal to Uint128 (truncate)
    Ok(Uint128::new(max_borrow.to_uint_floor().u128()))
}

/// Check if a borrow would exceed LTV.
pub fn check_borrow_allowed(
    deps: Deps,
    env: &Env,
    user: &str,
    borrow_amount: Uint128,
) -> Result<(), ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let params = PARAMS.load(deps.storage)?;

    let collateral_amount = get_user_collateral(deps.storage, user)?;
    let current_debt = get_user_debt(deps.storage, user)?;

    let collateral_price = query_price(deps, env, &config.oracle_config, &config.collateral_denom)?;
    let debt_price = query_price(deps, env, &config.oracle_config, &config.debt_denom)?;

    let collateral_value =
        Decimal::from_ratio(collateral_amount, 1u128).checked_mul(collateral_price)?;
    let new_debt_total = current_debt.checked_add(borrow_amount)?;
    let new_debt_value = Decimal::from_ratio(new_debt_total, 1u128).checked_mul(debt_price)?;

    let max_borrow_value = collateral_value.checked_mul(params.loan_to_value)?;

    if new_debt_value > max_borrow_value {
        return Err(ContractError::ExceedsLtv {
            max_borrow: max_borrow_value.to_string(),
            requested: new_debt_value.to_string(),
        });
    }

    Ok(())
}

/// Check if a collateral withdrawal would make the position unhealthy.
pub fn check_withdrawal_allowed(
    deps: Deps,
    env: &Env,
    user: &str,
    withdraw_amount: Uint128,
) -> Result<(), ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let params = PARAMS.load(deps.storage)?;

    let collateral_amount = get_user_collateral(deps.storage, user)?;
    let debt_amount = get_user_debt(deps.storage, user)?;

    // If no debt, any withdrawal is allowed
    if debt_amount.is_zero() {
        return Ok(());
    }

    // Check we're not withdrawing more than we have
    if withdraw_amount > collateral_amount {
        return Err(ContractError::NoCollateral);
    }

    let new_collateral = collateral_amount.checked_sub(withdraw_amount)?;

    let collateral_price = query_price(deps, env, &config.oracle_config, &config.collateral_denom)?;
    let debt_price = query_price(deps, env, &config.oracle_config, &config.debt_denom)?;

    let new_collateral_value =
        Decimal::from_ratio(new_collateral, 1u128).checked_mul(collateral_price)?;
    let debt_value = Decimal::from_ratio(debt_amount, 1u128).checked_mul(debt_price)?;

    // Use LTV for withdrawal check (more conservative than liquidation threshold)
    let max_debt_value = new_collateral_value.checked_mul(params.loan_to_value)?;

    if debt_value > max_debt_value {
        let health_factor = new_collateral_value
            .checked_mul(params.liquidation_threshold)?
            .checked_div(debt_value)?;
        return Err(ContractError::InsufficientCollateral {
            health_factor: health_factor.to_string(),
        });
    }

    Ok(())
}

/// Calculate liquidation price for collateral.
/// This is the price at which the position becomes liquidatable.
/// liquidation_price = (debt_value / (collateral_amount * liquidation_threshold))
pub fn calculate_liquidation_price(
    deps: Deps,
    env: &Env,
    user: &str,
) -> Result<Option<Decimal>, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let params = PARAMS.load(deps.storage)?;

    let collateral_amount = get_user_collateral(deps.storage, user)?;
    let debt_amount = get_user_debt(deps.storage, user)?;

    if debt_amount.is_zero() || collateral_amount.is_zero() {
        return Ok(None);
    }

    let debt_price = query_price(deps, env, &config.oracle_config, &config.debt_denom)?;
    let debt_value = Decimal::from_ratio(debt_amount, 1u128).checked_mul(debt_price)?;

    // liquidation_price = debt_value / (collateral_amount * liquidation_threshold)
    let denominator =
        Decimal::from_ratio(collateral_amount, 1u128).checked_mul(params.liquidation_threshold)?;
    let liquidation_price = debt_value.checked_div(denominator)?;

    Ok(Some(liquidation_price))
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
        assert!(hf > Decimal::one());
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
        assert!(hf < Decimal::one());
        assert!(is_liquidatable(deps.as_ref(), &env, "user1").unwrap());
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
        // price = 5000 / 850 ≈ 5.88
        assert!(liq_price > Decimal::from_ratio(5u128, 1u128));
        assert!(liq_price < Decimal::from_ratio(6u128, 1u128));
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
        setup_with_oracle(&mut deps, Decimal::from_ratio(10u128, 1u128), Decimal::zero());

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
}
