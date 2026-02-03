use cosmwasm_std::{BankMsg, Coin, DepsMut, Env, MessageInfo, Response, Uint128};

use crate::error::ContractError;
use crate::health::check_borrow_allowed;
use crate::interest::apply_accumulated_interest;
use crate::state::{CONFIG, DEBTS, PARAMS, STATE};

/// Borrow debt asset against collateral.
pub fn execute_borrow(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    amount: Uint128,
    recipient: Option<String>,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let params = PARAMS.load(deps.storage)?;

    if !params.enabled {
        return Err(ContractError::MarketDisabled);
    }

    if amount.is_zero() {
        return Err(ContractError::ZeroAmount);
    }

    // Apply accumulated interest (fees are accrued to state, not sent immediately)
    apply_accumulated_interest(deps.storage, env.block.time.seconds())?;

    let state = STATE.load(deps.storage)?;
    let user = info.sender.as_str();

    // Check available liquidity
    let available = state.available_liquidity();
    if amount > available {
        return Err(ContractError::InsufficientLiquidity {
            available: available.to_string(),
            requested: amount.to_string(),
        });
    }

    // Check borrow cap
    let current_debt = state.total_debt();
    if let Some(cap) = params.borrow_cap {
        let would_be = current_debt.checked_add(amount)?;
        if would_be > cap {
            return Err(ContractError::BorrowCapExceeded {
                cap: cap.to_string(),
                would_be: would_be.to_string(),
            });
        }
    }

    // Check LTV constraint
    check_borrow_allowed(deps.as_ref(), &env, user, amount)?;

    // Calculate scaled debt amount: scaled = amount / borrow_index
    let scaled_amount = stone_types::amount_to_scaled(amount, state.borrow_index)?;

    // Update user's debt position
    let current_scaled = DEBTS.may_load(deps.storage, user)?.unwrap_or_default();
    let new_scaled = current_scaled.checked_add(scaled_amount)?;
    DEBTS.save(deps.storage, user, &new_scaled)?;

    // Update market totals
    let mut state = STATE.load(deps.storage)?;
    state.total_debt_scaled = state.total_debt_scaled.checked_add(scaled_amount)?;
    STATE.save(deps.storage, &state)?;

    // Determine recipient
    let recipient_addr = match recipient {
        Some(addr) => addr,
        None => info.sender.to_string(),
    };

    // Create transfer message
    let transfer_msg = BankMsg::Send {
        to_address: recipient_addr.clone(),
        amount: vec![Coin {
            denom: config.debt_denom,
            amount,
        }],
    };

    // Calculate unscaled totals for event
    let total_supply = state.total_supply();
    let total_debt = state.total_debt();
    let utilization = state.utilization();

    // Calculate current rates based on post-transaction state
    let (borrow_rate, liquidity_rate) = crate::interest::calculate_current_rates(deps.storage)?;

    Ok(Response::new()
        .add_message(transfer_msg)
        .add_attribute("action", "borrow")
        .add_attribute("borrower", info.sender)
        .add_attribute("recipient", recipient_addr)
        .add_attribute("amount", amount)
        .add_attribute("scaled_amount", scaled_amount)
        .add_attribute("borrow_index", state.borrow_index.to_string())
        .add_attribute("liquidity_index", state.liquidity_index.to_string())
        .add_attribute("borrow_rate", borrow_rate.to_string())
        .add_attribute("liquidity_rate", liquidity_rate.to_string())
        .add_attribute("total_supply", total_supply)
        .add_attribute("total_debt", total_debt)
        .add_attribute("utilization", utilization.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::COLLATERAL;
    use cosmwasm_std::testing::{message_info, mock_dependencies, mock_env, MockApi, MockQuerier};
    use cosmwasm_std::{
        from_json, to_json_binary, ContractResult, Decimal, QuerierResult, WasmQuery,
    };
    use stone_types::{
        InterestRateModel, MarketConfig, MarketParams, MarketState, OracleConfig, OracleQueryMsg,
        OracleType, PriceResponse,
    };

    fn setup_market_with_oracle(
        deps: &mut cosmwasm_std::OwnedDeps<
            cosmwasm_std::MemoryStorage,
            cosmwasm_std::testing::MockApi,
            MockQuerier,
        >,
    ) {
        let api = MockApi::default();
        let oracle_addr = api.addr_make("oracle");
        let config = MarketConfig {
            factory: api.addr_make("factory"),
            curator: api.addr_make("curator"),
            oracle_config: OracleConfig {
                address: oracle_addr.clone(),
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
        state.total_supply_scaled = Uint128::new(10000); // 10000 available liquidity
        STATE.save(deps.as_mut().storage, &state).unwrap();

        // Setup oracle mock: $10 per ATOM, $1 per USDC
        // Use updated_at = 0 so it's fresh when env.block.time = 0
        let oracle_str = oracle_addr.to_string();
        deps.querier.update_wasm(move |query| match query {
            WasmQuery::Smart { contract_addr, msg } if contract_addr == &oracle_str => {
                let query_msg: OracleQueryMsg = from_json(msg).unwrap();
                match query_msg {
                    OracleQueryMsg::Price { denom } => {
                        let price = if denom == "uatom" {
                            Decimal::from_ratio(10u128, 1u128)
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
    }

    fn mock_env_at_time(time: u64) -> Env {
        let mut env = mock_env();
        env.block.time = cosmwasm_std::Timestamp::from_seconds(time);
        env
    }

    #[test]
    fn test_borrow_success() {
        let mut deps = mock_dependencies();
        setup_market_with_oracle(&mut deps);

        let user1 = MockApi::default().addr_make("user1");
        // User has 1000 ATOM ($10,000) collateral
        COLLATERAL
            .save(deps.as_mut().storage, user1.as_str(), &Uint128::new(1000))
            .unwrap();

        let env = mock_env_at_time(0);
        let info = message_info(&user1, &[]);

        // Borrow 5000 USDC (within 80% LTV = $8000 max)
        let res = execute_borrow(deps.as_mut(), env, info, Uint128::new(5000), None).unwrap();

        assert!(!res.messages.is_empty());

        // Check user's debt
        let debt = DEBTS.load(deps.as_ref().storage, user1.as_str()).unwrap();
        assert_eq!(debt, Uint128::new(5000));

        // Check market totals
        let state = STATE.load(deps.as_ref().storage).unwrap();
        assert_eq!(state.total_debt_scaled, Uint128::new(5000));
    }

    #[test]
    fn test_borrow_exceeds_ltv() {
        let mut deps = mock_dependencies();
        setup_market_with_oracle(&mut deps);

        let user1 = MockApi::default().addr_make("user1");
        // User has 1000 ATOM ($10,000) collateral
        COLLATERAL
            .save(deps.as_mut().storage, user1.as_str(), &Uint128::new(1000))
            .unwrap();

        let env = mock_env_at_time(0);
        let info = message_info(&user1, &[]);

        // Try to borrow 9000 USDC (exceeds 80% LTV = $8000 max)
        let err = execute_borrow(deps.as_mut(), env, info, Uint128::new(9000), None).unwrap_err();
        assert!(matches!(err, ContractError::ExceedsLtv { .. }));
    }

    #[test]
    fn test_borrow_no_collateral() {
        let mut deps = mock_dependencies();
        setup_market_with_oracle(&mut deps);

        let env = mock_env_at_time(0);
        let user1 = MockApi::default().addr_make("user1");
        let info = message_info(&user1, &[]);

        // Try to borrow without collateral
        let err = execute_borrow(deps.as_mut(), env, info, Uint128::new(1000), None).unwrap_err();
        assert!(matches!(err, ContractError::ExceedsLtv { .. }));
    }

    #[test]
    fn test_borrow_insufficient_liquidity() {
        let mut deps = mock_dependencies();
        setup_market_with_oracle(&mut deps);

        let user1 = MockApi::default().addr_make("user1");
        // User has lots of collateral
        COLLATERAL
            .save(deps.as_mut().storage, user1.as_str(), &Uint128::new(100000))
            .unwrap();

        let env = mock_env_at_time(0);
        let info = message_info(&user1, &[]);

        // Try to borrow more than available liquidity (10000)
        let err = execute_borrow(deps.as_mut(), env, info, Uint128::new(15000), None).unwrap_err();
        assert!(matches!(err, ContractError::InsufficientLiquidity { .. }));
    }

    #[test]
    fn test_borrow_cap_exceeded() {
        let mut deps = mock_dependencies();
        setup_market_with_oracle(&mut deps);

        // Set borrow cap
        let mut params = PARAMS.load(deps.as_ref().storage).unwrap();
        params.borrow_cap = Some(Uint128::new(3000));
        PARAMS.save(deps.as_mut().storage, &params).unwrap();

        let user1 = MockApi::default().addr_make("user1");
        COLLATERAL
            .save(deps.as_mut().storage, user1.as_str(), &Uint128::new(1000))
            .unwrap();

        let env = mock_env_at_time(0);
        let info = message_info(&user1, &[]);

        let err = execute_borrow(deps.as_mut(), env, info, Uint128::new(5000), None).unwrap_err();
        assert!(matches!(err, ContractError::BorrowCapExceeded { .. }));
    }

    #[test]
    fn test_borrow_zero_amount() {
        let mut deps = mock_dependencies();
        setup_market_with_oracle(&mut deps);

        let env = mock_env_at_time(0);
        let user1 = MockApi::default().addr_make("user1");
        let info = message_info(&user1, &[]);

        let err = execute_borrow(deps.as_mut(), env, info, Uint128::zero(), None).unwrap_err();
        assert!(matches!(err, ContractError::ZeroAmount));
    }

    #[test]
    fn test_borrow_with_recipient() {
        let mut deps = mock_dependencies();
        setup_market_with_oracle(&mut deps);

        let api = MockApi::default();
        let user1 = api.addr_make("user1");
        let user2 = api.addr_make("user2");
        COLLATERAL
            .save(deps.as_mut().storage, user1.as_str(), &Uint128::new(1000))
            .unwrap();

        let env = mock_env_at_time(0);
        let info = message_info(&user1, &[]);

        let res = execute_borrow(
            deps.as_mut(),
            env,
            info,
            Uint128::new(5000),
            Some(user2.to_string()),
        )
        .unwrap();

        assert!(res
            .attributes
            .iter()
            .any(|a| a.key == "recipient" && a.value == user2.as_str()));
    }

    #[test]
    fn test_borrow_accumulates_debt() {
        let mut deps = mock_dependencies();
        setup_market_with_oracle(&mut deps);

        let user1 = MockApi::default().addr_make("user1");
        COLLATERAL
            .save(deps.as_mut().storage, user1.as_str(), &Uint128::new(1000))
            .unwrap();

        let env = mock_env_at_time(0);

        // First borrow
        let info = message_info(&user1, &[]);
        execute_borrow(deps.as_mut(), env.clone(), info, Uint128::new(3000), None).unwrap();

        // Second borrow
        let info = message_info(&user1, &[]);
        execute_borrow(deps.as_mut(), env, info, Uint128::new(2000), None).unwrap();

        let debt = DEBTS.load(deps.as_ref().storage, user1.as_str()).unwrap();
        assert_eq!(debt, Uint128::new(5000));
    }
}
