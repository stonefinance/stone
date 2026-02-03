use cosmwasm_std::{BankMsg, Coin, Decimal, DepsMut, Env, MessageInfo, Response, Uint128};

use crate::error::ContractError;
use crate::health::{calculate_health_factor, query_price};
use crate::interest::{apply_accumulated_interest, get_user_collateral, get_user_debt};
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

    if !params.enabled {
        return Err(ContractError::MarketDisabled);
    }

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
    let health_factor = calculate_health_factor(deps.as_ref(), borrower_str)?;
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
    let max_liquidatable = borrower_debt.checked_mul_floor(params.close_factor)?;
    let actual_debt_repaid = debt_to_repay.min(max_liquidatable).min(borrower_debt);

    // Get prices
    let collateral_price = query_price(
        deps.as_ref(),
        config.oracle_config.address.as_str(),
        &config.collateral_denom,
    )?;
    let debt_price = query_price(
        deps.as_ref(),
        config.oracle_config.address.as_str(),
        &config.debt_denom,
    )?;

    // Calculate collateral to seize
    // debt_value = actual_debt_repaid * debt_price
    // collateral_needed = debt_value / collateral_price
    // collateral_with_bonus = collateral_needed * (1 + liquidation_bonus)
    // protocol_fee = collateral_needed * liquidation_protocol_fee
    let debt_value = Decimal::from_ratio(actual_debt_repaid, 1u128).checked_mul(debt_price)?;
    let collateral_needed_value = debt_value.checked_div(collateral_price)?;
    let collateral_needed = Uint128::new(collateral_needed_value.to_uint_floor().u128());

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
            let scaled_debt_value =
                Decimal::from_ratio(scaled_collateral, 1u128).checked_mul(collateral_price)?;
            let scaled_debt = Uint128::new(
                scaled_debt_value
                    .checked_div(debt_price)?
                    .to_uint_floor()
                    .u128(),
            );
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
    let scaled_debt_decrease = stone_types::amount_to_scaled(final_debt_repaid, state.borrow_index);
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
        coins, from_json, to_json_binary, ContractResult, QuerierResult, WasmQuery,
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
                            updated_at: 1000,
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

    #[test]
    fn test_liquidate_success() {
        let mut deps = mock_dependencies();
        // Set price to $5, making HF = (1000 * 5 * 0.85) / 5000 = 0.85 (liquidatable)
        let (borrower, liquidator, _) =
            setup_liquidatable_position(&mut deps, Decimal::from_ratio(5u128, 1u128));

        let env = mock_env();
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

        let env = mock_env();
        let info = message_info(&liquidator, &coins(2500, "uusdc"));

        let err = execute_liquidate(deps.as_mut(), env, info, borrower.to_string()).unwrap_err();
        assert!(matches!(err, ContractError::NotLiquidatable { .. }));
    }

    #[test]
    fn test_liquidate_zero_amount() {
        let mut deps = mock_dependencies();
        let (borrower, liquidator, _) =
            setup_liquidatable_position(&mut deps, Decimal::from_ratio(5u128, 1u128));

        let env = mock_env();
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

        let env = mock_env();
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

        let env = mock_env();
        let info = message_info(&liquidator, &coins(2500, "uusdc"));

        execute_liquidate(deps.as_mut(), env, info, borrower.to_string()).unwrap();

        let final_collateral = COLLATERAL
            .load(deps.as_ref().storage, borrower.as_str())
            .unwrap();
        assert!(final_collateral < initial_collateral);
    }

    #[test]
    fn test_liquidate_market_disabled() {
        let mut deps = mock_dependencies();
        let (borrower, liquidator, _) =
            setup_liquidatable_position(&mut deps, Decimal::from_ratio(5u128, 1u128));

        let mut params = PARAMS.load(deps.as_ref().storage).unwrap();
        params.enabled = false;
        PARAMS.save(deps.as_mut().storage, &params).unwrap();

        let env = mock_env();
        let info = message_info(&liquidator, &coins(2500, "uusdc"));

        let err = execute_liquidate(deps.as_mut(), env, info, borrower.to_string()).unwrap_err();
        assert!(matches!(err, ContractError::MarketDisabled));
    }

    #[test]
    fn test_liquidate_no_debt() {
        let mut deps = mock_dependencies();
        let (borrower, liquidator, _) =
            setup_liquidatable_position(&mut deps, Decimal::from_ratio(5u128, 1u128));

        // Remove borrower's debt
        DEBTS.remove(deps.as_mut().storage, borrower.as_str());

        let env = mock_env();
        let info = message_info(&liquidator, &coins(2500, "uusdc"));

        let err = execute_liquidate(deps.as_mut(), env, info, borrower.to_string()).unwrap_err();
        assert!(matches!(err, ContractError::NotLiquidatable { .. }));
    }
}
