use cosmwasm_std::{BankMsg, Coin, Decimal, DepsMut, Env, MessageInfo, Response};

use crate::error::ContractError;
use crate::health::{calculate_health_factor, query_price};
use crate::interest::{apply_accumulated_interest, get_user_collateral, get_user_debt};
use crate::math256::{decimal_to_decimal256, u128_to_decimal256, uint256_to_uint128};
use crate::state::{COLLATERAL, CONFIG, DEBTS, PARAMS, STATE};

/// Liquidate an unhealthy position.
pub fn execute_liquidate(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    borrower: String,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let params = PARAMS.load(deps.storage)?;

    // NOTE: Liquidation is ALWAYS allowed regardless of market status
    // to prevent bad debt accumulation when markets are disabled.

    let borrower_addr = deps.api.addr_validate(&borrower)?;
    let borrower_str = borrower_addr.as_str();

    // Get the debt asset amount sent by liquidator
    let debt_to_repay = info
        .funds
        .iter()
        .find(|c| c.denom == config.debt_denom)
        .map(|c| c.amount)
        .unwrap_or_default();

    if debt_to_repay.is_zero() {
        return Err(ContractError::ZeroAmount);
    }

    // Apply accumulated interest (fees are accrued to state, not sent immediately)
    apply_accumulated_interest(deps.storage, env.block.time.seconds())?;

    // Check position is liquidatable
    let health_factor = calculate_health_factor(deps.as_ref(), &env, borrower_str)?;
    match health_factor {
        None => {
            return Err(ContractError::NotLiquidatable {
                health_factor: "infinite (no debt)".to_string(),
            });
        }
        Some(hf) if hf >= Decimal::one() => {
            return Err(ContractError::NotLiquidatable {
                health_factor: hf.to_string(),
            });
        }
        _ => {}
    }

    // Get current positions
    let borrower_debt = get_user_debt(deps.storage, borrower_str)?;
    let borrower_collateral = get_user_collateral(deps.storage, borrower_str)?;

    // Calculate max liquidatable debt (close_factor)
    // For dust positions (debt <= dust_debt_threshold), allow full liquidation
    // regardless of close factor to prevent unliquidatable dust positions.
    let max_liquidatable = if borrower_debt <= params.dust_debt_threshold {
        borrower_debt // Full liquidation allowed for dust positions
    } else {
        borrower_debt.checked_mul_floor(params.close_factor)?
    };
    let actual_debt_repaid = debt_to_repay.min(max_liquidatable).min(borrower_debt);

    // Get prices
    let collateral_price = query_price(
        deps.as_ref(),
        &env,
        &config.oracle_config,
        &config.collateral_denom,
    )?;
    let debt_price = query_price(
        deps.as_ref(),
        &env,
        &config.oracle_config,
        &config.debt_denom,
    )?;

    // Calculate collateral to seize using Decimal256 to prevent overflow
    // debt_value = actual_debt_repaid * debt_price
    // collateral_needed = debt_value / collateral_price
    // collateral_with_bonus = collateral_needed * (1 + liquidation_bonus)
    // protocol_fee = collateral_needed * liquidation_protocol_fee
    let debt_value_256 = u128_to_decimal256(actual_debt_repaid)
        .checked_mul(decimal_to_decimal256(debt_price))?;
    let collateral_needed_value_256 = debt_value_256
        .checked_div(decimal_to_decimal256(collateral_price))?;
    let collateral_needed = uint256_to_uint128(collateral_needed_value_256.to_uint_floor())?;

    let bonus_amount = collateral_needed.checked_mul_floor(params.liquidation_bonus)?;
    let protocol_fee_amount =
        collateral_needed.checked_mul_floor(params.liquidation_protocol_fee)?;
    let total_collateral_seized = collateral_needed
        .checked_add(bonus_amount)?
        .checked_add(protocol_fee_amount)?;

    // Cap at available collateral
    let total_collateral_seized = total_collateral_seized.min(borrower_collateral);

    // Recalculate amounts if capped
    let uncapped_total = collateral_needed
        .checked_add(bonus_amount)?
        .checked_add(protocol_fee_amount)?;
    let (final_collateral_seized, final_protocol_fee, final_debt_repaid) =
        if total_collateral_seized < uncapped_total {
            // We're capped by collateral, need to scale down
            let scale = Decimal::from_ratio(total_collateral_seized, uncapped_total);
            let scaled_collateral = collateral_needed.checked_mul_floor(scale)?;
            let scaled_protocol = protocol_fee_amount.checked_mul_floor(scale)?;
            // Use Decimal256 for the back-conversion to prevent overflow
            let scaled_debt_value_256 = u128_to_decimal256(scaled_collateral)
                .checked_mul(decimal_to_decimal256(collateral_price))?;
            let scaled_debt = uint256_to_uint128(
                scaled_debt_value_256
                    .checked_div(decimal_to_decimal256(debt_price))?
                    .to_uint_floor(),
            )?;
            (total_collateral_seized, scaled_protocol, scaled_debt)
        } else {
            (
                total_collateral_seized,
                protocol_fee_amount,
                actual_debt_repaid,
            )
        };

    let liquidator_collateral = final_collateral_seized.saturating_sub(final_protocol_fee);

    let state = STATE.load(deps.storage)?;

    // Update borrower's debt (scaled)
    let scaled_debt_decrease = stone_types::amount_to_scaled(final_debt_repaid, state.borrow_index)?;
    let current_debt_scaled = DEBTS
        .may_load(deps.storage, borrower_str)?
        .unwrap_or_default();
    let new_debt_scaled = current_debt_scaled.saturating_sub(scaled_debt_decrease);
    if new_debt_scaled.is_zero() {
        DEBTS.remove(deps.storage, borrower_str);
    } else {
        DEBTS.save(deps.storage, borrower_str, &new_debt_scaled)?;
    }

    // Update borrower's collateral
    let new_collateral = borrower_collateral.saturating_sub(final_collateral_seized);
    if new_collateral.is_zero() {
        COLLATERAL.remove(deps.storage, borrower_str);
    } else {
        COLLATERAL.save(deps.storage, borrower_str, &new_collateral)?;
    }

    // Update market totals
    let mut state = STATE.load(deps.storage)?;
    state.total_debt_scaled = state.total_debt_scaled.saturating_sub(scaled_debt_decrease);
    state.total_collateral = state
        .total_collateral
        .saturating_sub(final_collateral_seized);
    STATE.save(deps.storage, &state)?;

    // Calculate unscaled totals for event
    let total_supply = state.total_supply();
    let total_debt = state.total_debt();
    let utilization = state.utilization();

    // Calculate current rates based on post-transaction state
    let (borrow_rate, liquidity_rate) = crate::interest::calculate_current_rates(deps.storage)?;

    // Build messages (no fee messages, fees are accrued to state)
    let mut messages = vec![];

    // Transfer collateral to liquidator
    if !liquidator_collateral.is_zero() {
        messages.push(BankMsg::Send {
            to_address: info.sender.to_string(),
            amount: vec![Coin {
                denom: config.collateral_denom.clone(),
                amount: liquidator_collateral,
            }],
        });
    }

    // Transfer protocol fee
    if !final_protocol_fee.is_zero() {
        messages.push(BankMsg::Send {
            to_address: config.protocol_fee_collector.to_string(),
            amount: vec![Coin {
                denom: config.collateral_denom.clone(),
                amount: final_protocol_fee,
            }],
        });
    }

    // Refund excess debt payment if any
    let refund = debt_to_repay.saturating_sub(final_debt_repaid);
    if !refund.is_zero() {
        messages.push(BankMsg::Send {
            to_address: info.sender.to_string(),
            amount: vec![Coin {
                denom: config.debt_denom,
                amount: refund,
            }],
        });
    }

    Ok(Response::new()
        .add_messages(messages)
        .add_attribute("action", "liquidate")
        .add_attribute("liquidator", info.sender)
        .add_attribute("borrower", borrower)
        .add_attribute("debt_repaid", final_debt_repaid)
        .add_attribute("collateral_seized", final_collateral_seized)
        .add_attribute("liquidator_collateral", liquidator_collateral)
        .add_attribute("protocol_fee", final_protocol_fee)
        .add_attribute("scaled_debt_decrease", scaled_debt_decrease)
        .add_attribute("borrow_index", state.borrow_index.to_string())
        .add_attribute("liquidity_index", state.liquidity_index.to_string())
        .add_attribute("borrow_rate", borrow_rate.to_string())
        .add_attribute("liquidity_rate", liquidity_rate.to_string())
        .add_attribute("total_supply", total_supply)
        .add_attribute("total_debt", total_debt)
        .add_attribute("total_collateral", state.total_collateral)
        .add_attribute("utilization", utilization.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{message_info, mock_dependencies, mock_env, MockApi, MockQuerier};
    use cosmwasm_std::{
        coins, from_json, to_json_binary, ContractResult, QuerierResult, Uint128, WasmQuery,
    };
    use stone_types::{
        InterestRateModel, MarketConfig, MarketParams, MarketState, OracleConfig, OracleQueryMsg,
        OracleType, PriceResponse,
    };

    fn setup_liquidatable_position(
        deps: &mut cosmwasm_std::OwnedDeps<
            cosmwasm_std::MemoryStorage,
            cosmwasm_std::testing::MockApi,
            MockQuerier,
        >,
        collateral_price: Decimal,
    ) -> (cosmwasm_std::Addr, cosmwasm_std::Addr, cosmwasm_std::Addr) {
        let api = MockApi::default();
        let borrower = api.addr_make("borrower");
        let liquidator = api.addr_make("liquidator");
        let oracle = api.addr_make("oracle");
        let config = MarketConfig {
            factory: api.addr_make("factory"),
            curator: api.addr_make("curator"),
            oracle_config: OracleConfig {
                address: oracle.clone(),
                oracle_type: OracleType::Generic {
                    expected_code_id: None,
                    max_staleness_secs: 300,
                },
            },
            collateral_denom: "uatom".to_string(),
            debt_denom: "uusdc".to_string(),
            protocol_fee_collector: api.addr_make("collector"),
            salt: None,
        };
        CONFIG.save(deps.as_mut().storage, &config).unwrap();

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

        let mut state = MarketState::new(1000);
        state.total_collateral = Uint128::new(1000);
        state.total_debt_scaled = Uint128::new(5000);
        STATE.save(deps.as_mut().storage, &state).unwrap();

        // User has 1000 collateral and 5000 debt
        COLLATERAL
            .save(
                deps.as_mut().storage,
                borrower.as_str(),
                &Uint128::new(1000),
            )
            .unwrap();
        DEBTS
            .save(
                deps.as_mut().storage,
                borrower.as_str(),
                &Uint128::new(5000),
            )
            .unwrap();

        // Setup oracle mock with variable collateral price
        // Use updated_at = 0 so it's fresh when env.block.time = 0
        let oracle_addr = oracle.to_string();
        deps.querier.update_wasm(move |query| match query {
            WasmQuery::Smart { contract_addr, msg } if contract_addr == &oracle_addr => {
                let query_msg: OracleQueryMsg = from_json(msg).unwrap();
                match query_msg {
                    OracleQueryMsg::Price { denom } => {
                        let price = if denom == "uatom" {
                            collateral_price
                        } else {
                            Decimal::one()
                        };
                        let response = PriceResponse {
                            denom,
                            price,
                            updated_at: 0,
                        };
                        QuerierResult::Ok(ContractResult::Ok(to_json_binary(&response).unwrap()))
                    }
                }
            }
            _ => QuerierResult::Err(cosmwasm_std::SystemError::UnsupportedRequest {
                kind: "unknown".to_string(),
            }),
        });

        (borrower, liquidator, oracle)
    }

    fn mock_env_at_time(time: u64) -> Env {
        let mut env = mock_env();
        env.block.time = cosmwasm_std::Timestamp::from_seconds(time);
        env
    }

    #[test]
    fn test_liquidate_success() {
        let mut deps = mock_dependencies();
        // Set price to $5, making HF = (1000 * 5 * 0.85) / 5000 = 0.85 (liquidatable)
        let (borrower, liquidator, _) =
            setup_liquidatable_position(&mut deps, Decimal::from_ratio(5u128, 1u128));

        let env = mock_env_at_time(0);
        let info = message_info(&liquidator, &coins(2500, "uusdc")); // 50% of debt

        let res = execute_liquidate(deps.as_mut(), env, info, borrower.to_string()).unwrap();

        // Should have transfer messages
        assert!(!res.messages.is_empty());

        // Check attributes
        assert!(res
            .attributes
            .iter()
            .any(|a| a.key == "action" && a.value == "liquidate"));
        assert!(res
            .attributes
            .iter()
            .any(|a| a.key == "borrower" && a.value == borrower.as_str()));
    }

    #[test]
    fn test_liquidate_not_liquidatable() {
        let mut deps = mock_dependencies();
        // Set price to $10, making HF = (1000 * 10 * 0.85) / 5000 = 1.7 (healthy)
        let (borrower, liquidator, _) =
            setup_liquidatable_position(&mut deps, Decimal::from_ratio(10u128, 1u128));

        let env = mock_env_at_time(0);
        let info = message_info(&liquidator, &coins(2500, "uusdc"));

        let err = execute_liquidate(deps.as_mut(), env, info, borrower.to_string()).unwrap_err();
        assert!(matches!(err, ContractError::NotLiquidatable { .. }));
    }

    #[test]
    fn test_liquidate_zero_amount() {
        let mut deps = mock_dependencies();
        let (borrower, liquidator, _) =
            setup_liquidatable_position(&mut deps, Decimal::from_ratio(5u128, 1u128));

        let env = mock_env_at_time(0);
        let info = message_info(&liquidator, &[]);

        let err = execute_liquidate(deps.as_mut(), env, info, borrower.to_string()).unwrap_err();
        assert!(matches!(err, ContractError::ZeroAmount));
    }

    #[test]
    fn test_liquidate_reduces_debt() {
        let mut deps = mock_dependencies();
        let (borrower, liquidator, _) =
            setup_liquidatable_position(&mut deps, Decimal::from_ratio(5u128, 1u128));

        let initial_debt = DEBTS
            .load(deps.as_ref().storage, borrower.as_str())
            .unwrap();

        let env = mock_env_at_time(0);
        let info = message_info(&liquidator, &coins(2500, "uusdc"));

        execute_liquidate(deps.as_mut(), env, info, borrower.to_string()).unwrap();

        let final_debt = DEBTS
            .load(deps.as_ref().storage, borrower.as_str())
            .unwrap();
        assert!(final_debt < initial_debt);
    }

    #[test]
    fn test_liquidate_reduces_collateral() {
        let mut deps = mock_dependencies();
        let (borrower, liquidator, _) =
            setup_liquidatable_position(&mut deps, Decimal::from_ratio(5u128, 1u128));

        let initial_collateral = COLLATERAL
            .load(deps.as_ref().storage, borrower.as_str())
            .unwrap();

        let env = mock_env_at_time(0);
        let info = message_info(&liquidator, &coins(2500, "uusdc"));

        execute_liquidate(deps.as_mut(), env, info, borrower.to_string()).unwrap();

        let final_collateral = COLLATERAL
            .load(deps.as_ref().storage, borrower.as_str())
            .unwrap();
        assert!(final_collateral < initial_collateral);
    }

    #[test]
    fn test_liquidate_works_when_disabled() {
        // C4 Fix: Liquidation must ALWAYS work regardless of market status
        let mut deps = mock_dependencies();
        let (borrower, liquidator, _) =
            setup_liquidatable_position(&mut deps, Decimal::from_ratio(5u128, 1u128));

        let mut params = PARAMS.load(deps.as_ref().storage).unwrap();
        params.enabled = false;
        PARAMS.save(deps.as_mut().storage, &params).unwrap();

        let env = mock_env_at_time(0);
        let info = message_info(&liquidator, &coins(2500, "uusdc"));

        // Liquidation should succeed even when market is disabled
        let res = execute_liquidate(deps.as_mut(), env, info, borrower.to_string()).unwrap();
        assert!(!res.messages.is_empty());
        assert!(res
            .attributes
            .iter()
            .any(|a| a.key == "action" && a.value == "liquidate"));
    }

    #[test]
    fn test_liquidate_no_debt() {
        let mut deps = mock_dependencies();
        let (borrower, liquidator, _) =
            setup_liquidatable_position(&mut deps, Decimal::from_ratio(5u128, 1u128));

        // Remove borrower's debt
        DEBTS.remove(deps.as_mut().storage, borrower.as_str());

        let env = mock_env_at_time(0);
        let info = message_info(&liquidator, &coins(2500, "uusdc"));

        let err = execute_liquidate(deps.as_mut(), env, info, borrower.to_string()).unwrap_err();
        assert!(matches!(err, ContractError::NotLiquidatable { .. }));
    }

    // ============================================================================
    // Dust Liquidation Tests (Issue #57)
    // ============================================================================

    fn setup_dust_position(
        deps: &mut cosmwasm_std::OwnedDeps<
            cosmwasm_std::MemoryStorage,
            cosmwasm_std::testing::MockApi,
            MockQuerier,
        >,
        dust_debt_threshold: Uint128,
    ) -> (cosmwasm_std::Addr, cosmwasm_std::Addr) {
        let api = MockApi::default();
        let borrower = api.addr_make("borrower");
        let liquidator = api.addr_make("liquidator");
        let oracle = api.addr_make("oracle");

        let config = CONFIG.load(deps.as_ref().storage).unwrap_or_else(|_| {
            let config = MarketConfig {
                factory: api.addr_make("factory"),
                curator: api.addr_make("curator"),
                oracle_config: OracleConfig {
                    address: oracle.clone(),
                    oracle_type: OracleType::Generic {
                        expected_code_id: None,
                        max_staleness_secs: 300,
                    },
                },
                collateral_denom: "uatom".to_string(),
                debt_denom: "uusdc".to_string(),
                protocol_fee_collector: api.addr_make("collector"),
                salt: None,
            };
            CONFIG.save(deps.as_mut().storage, &config).unwrap();
            config
        });

        // Set dust threshold
        let params = MarketParams {
            loan_to_value: Decimal::percent(80),
            liquidation_threshold: Decimal::percent(85),
            liquidation_bonus: Decimal::percent(5),
            liquidation_protocol_fee: Decimal::percent(2),
            close_factor: Decimal::percent(50), // 50% close factor
            dust_debt_threshold,
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

        let mut state = MarketState::new(1000);
        state.total_collateral = Uint128::new(1000);
        state.total_debt_scaled = Uint128::new(5000);
        STATE.save(deps.as_mut().storage, &state).unwrap();

        // Setup oracle mock - price $1
        let oracle_addr = config.oracle_config.address.to_string();
        deps.querier.update_wasm(move |query| match query {
            WasmQuery::Smart { contract_addr, msg } if contract_addr == &oracle_addr => {
                let query_msg: OracleQueryMsg = from_json(msg).unwrap();
                match query_msg {
                    OracleQueryMsg::Price { denom } => {
                        let price = if denom == "uatom" {
                            Decimal::from_ratio(1u128, 1u128) // $1 per collateral
                        } else {
                            Decimal::one()
                        };
                        let response = PriceResponse {
                            denom,
                            price,
                            updated_at: 0,
                        };
                        QuerierResult::Ok(ContractResult::Ok(to_json_binary(&response).unwrap()))
                    }
                }
            }
            _ => QuerierResult::Err(cosmwasm_std::SystemError::UnsupportedRequest {
                kind: "unknown".to_string(),
            }),
        });

        (borrower, liquidator)
    }

    #[test]
    fn test_dust_position_full_liquidation() {
        // Issue #57: Dust positions should be fully liquidatable regardless of close factor
        let mut deps = mock_dependencies();

        // Dust threshold = 100
        let dust_threshold = Uint128::new(100);
        let (borrower, liquidator) = setup_dust_position(&mut deps, dust_threshold);

        // Set up liquidatable dust position:
        // collateral = 60, debt = 50 (below dust threshold of 100)
        // HF = (60 * 1 * 0.85) / 50 = 1.02 > 1, not liquidatable!
        // Need HF < 1: debt > collateral * 0.85
        // For debt = 50, need collateral < 50/0.85 = 58.8
        // Let's use: collateral = 50, debt = 60
        // HF = (50 * 0.85) / 60 = 0.71 < 1, liquidatable
        COLLATERAL
            .save(deps.as_mut().storage, borrower.as_str(), &Uint128::new(50))
            .unwrap();
        DEBTS
            .save(deps.as_mut().storage, borrower.as_str(), &Uint128::new(60))
            .unwrap();

        let env = mock_env_at_time(0);
        // Try to liquidate full debt (60), which is more than 50% close factor would allow
        let info = message_info(&liquidator, &coins(60, "uusdc"));

        let res = execute_liquidate(deps.as_mut(), env, info, borrower.to_string()).unwrap();

        // Should fully liquidate the dust position
        assert!(res
            .attributes
            .iter()
            .any(|a| a.key == "action" && a.value == "liquidate"));

        // Check the debt_repaid attribute
        let debt_attr = res
            .attributes
            .iter()
            .find(|a| a.key == "debt_repaid")
            .map(|a| a.value.parse::<u128>().unwrap())
            .expect("debt_repaid attribute should exist");
        
        // Collateral capping kicks in because:
        // collateral_needed = 60, bonus = floor(60*5%) = 3, fee = floor(60*2%) = 1, total = 64
        // With only 50 collateral, it's capped: scale = 50/64
        // scaled_collateral = floor(60 * 50/64) = floor(46.875) = 46
        // scaled_debt = 46 (same numeraire, $1 = $1)
        assert_eq!(debt_attr, 46u128, "Dust position should liquidate as much as collateral allows");
    }

    #[test]
    fn test_dust_position_partial_payment() {
        // Issue #57: Even with partial payment, dust positions should respect min(debt, payment)
        let mut deps = mock_dependencies();

        let dust_threshold = Uint128::new(100);
        let (borrower, liquidator) = setup_dust_position(&mut deps, dust_threshold);

        // Set up liquidatable dust position: collateral = 50, debt = 60
        // HF = (50 * 0.85) / 60 = 0.71 < 1, liquidatable
        COLLATERAL
            .save(deps.as_mut().storage, borrower.as_str(), &Uint128::new(50))
            .unwrap();
        DEBTS
            .save(deps.as_mut().storage, borrower.as_str(), &Uint128::new(60))
            .unwrap();

        let env = mock_env_at_time(0);
        // Send only 30 to repay (partial payment)
        let info = message_info(&liquidator, &coins(30, "uusdc"));

        let res = execute_liquidate(deps.as_mut(), env, info, borrower.to_string()).unwrap();

        // Should process 30 of the debt (limited by payment, not close factor)
        let debt_attr = res
            .attributes
            .iter()
            .find(|a| a.key == "debt_repaid")
            .map(|a| a.value.parse::<u128>().unwrap())
            .expect("debt_repaid attribute should exist");
        assert_eq!(debt_attr, 30u128, "Should repay the exact amount sent");
    }

    #[test]
    fn test_non_dust_position_respects_close_factor() {
        // Issue #57: Normal positions should still respect close factor
        let mut deps = mock_dependencies();

        // Dust threshold = 100, debt = 500 (above threshold)
        let dust_threshold = Uint128::new(100);
        let (borrower, liquidator) = setup_dust_position(&mut deps, dust_threshold);

        // Set up liquidatable position: collateral = 500, debt = 600
        // HF = (500 * 0.85) / 600 = 0.71 < 1, liquidatable
        // Debt > dust_threshold so close factor applies
        COLLATERAL
            .save(deps.as_mut().storage, borrower.as_str(), &Uint128::new(500))
            .unwrap();
        DEBTS
            .save(deps.as_mut().storage, borrower.as_str(), &Uint128::new(600))
            .unwrap();

        let env = mock_env_at_time(0);
        // Try to liquidate full debt (600)
        let info = message_info(&liquidator, &coins(600, "uusdc"));

        let res = execute_liquidate(deps.as_mut(), env, info, borrower.to_string()).unwrap();

        // Should only liquidate 50% (close factor) = 300
        let debt_attr = res
            .attributes
            .iter()
            .find(|a| a.key == "debt_repaid")
            .map(|a| a.value.parse::<u128>().unwrap())
            .expect("debt_repaid attribute should exist");

        // With 50% close factor, max liquidatable is 300
        assert_eq!(debt_attr, 300u128, "Should respect close factor for non-dust positions");

        // Debt should not be fully cleared
        let remaining_debt = DEBTS
            .load(deps.as_ref().storage, borrower.as_str())
            .unwrap();
        assert!(
            remaining_debt > Uint128::zero(),
            "Non-dust position should still have remaining debt"
        );
    }

    #[test]
    fn test_dust_threshold_exact_boundary() {
        // Issue #57: Position with debt exactly at threshold should be treated as dust
        let mut deps = mock_dependencies();

        // Dust threshold = 100, debt = 100 (exactly at threshold)
        let dust_threshold = Uint128::new(100);
        let (borrower, liquidator) = setup_dust_position(&mut deps, dust_threshold);

        // Set up position with exactly 100 debt and sufficient collateral
        // collateral = 120, debt = 100 (at threshold, liquidatable)
        // HF = (120 * 0.85) / 100 = 1.02 > 1, not liquidatable!
        // Need collateral < 100/0.85 = 117.6
        // Use: collateral = 100, debt = 100
        // HF = (100 * 0.85) / 100 = 0.85 < 1, liquidatable
        COLLATERAL
            .save(deps.as_mut().storage, borrower.as_str(), &Uint128::new(100))
            .unwrap();
        DEBTS
            .save(deps.as_mut().storage, borrower.as_str(), &Uint128::new(100))
            .unwrap();

        let env = mock_env_at_time(0);
        let info = message_info(&liquidator, &coins(100, "uusdc"));

        let res = execute_liquidate(deps.as_mut(), env, info, borrower.to_string()).unwrap();

        // Position at exact threshold should be fully liquidatable
        let debt_attr = res
            .attributes
            .iter()
            .find(|a| a.key == "debt_repaid")
            .map(|a| a.value.parse::<u128>().unwrap())
            .expect("debt_repaid attribute should exist");

        // collateral_needed = 100, bonus = 5, fee = 2, total = 107
        // Capped at 100 collateral: scale = 100/107
        // scaled_collateral = floor(100 * 100/107) = floor(93.457) = 93
        // scaled_debt = 93
        assert_eq!(debt_attr, 93u128, "Position at dust threshold should liquidate up to collateral cap");
    }

    #[test]
    fn test_zero_dust_threshold_disables_feature() {
        // Issue #57: Zero dust threshold means no special dust handling
        let mut deps = mock_dependencies();

        // Dust threshold = 0, disables the dust feature
        let dust_threshold = Uint128::zero();
        let (borrower, liquidator) = setup_dust_position(&mut deps, dust_threshold);

        // Set up liquidatable dust position: collateral = 50, debt = 60
        // HF = (50 * 0.85) / 60 = 0.71 < 1, liquidatable
        COLLATERAL
            .save(deps.as_mut().storage, borrower.as_str(), &Uint128::new(50))
            .unwrap();
        DEBTS
            .save(deps.as_mut().storage, borrower.as_str(), &Uint128::new(60))
            .unwrap();

        let env = mock_env_at_time(0);
        let info = message_info(&liquidator, &coins(60, "uusdc"));

        let res = execute_liquidate(deps.as_mut(), env, info, borrower.to_string()).unwrap();

        // With zero threshold, 60 > 0, so close factor applies
        let debt_attr = res
            .attributes
            .iter()
            .find(|a| a.key == "debt_repaid")
            .map(|a| a.value.parse::<u128>().unwrap())
            .expect("debt_repaid attribute should exist");

        // close_factor applies: max_liquidatable = floor(60 * 50%) = 30
        // collateral_needed = 30, bonus = floor(30*5%)=1, fee = floor(30*2%)=0, total = 31
        // 31 < 50 collateral, so not capped
        assert_eq!(debt_attr, 30u128, "Zero dust threshold should apply close factor");
    }
}
