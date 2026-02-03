use cosmwasm_std::{BankMsg, Coin, DepsMut, Env, MessageInfo, Response};

use crate::error::ContractError;
use crate::interest::{apply_accumulated_interest, get_user_debt};
use crate::state::{CONFIG, DEBTS, PARAMS, STATE};

/// Repay borrowed debt.
pub fn execute_repay(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    on_behalf_of: Option<String>,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let params = PARAMS.load(deps.storage)?;

    if !params.enabled {
        return Err(ContractError::MarketDisabled);
    }

    // Check for wrong denom first
    if info.funds.len() > 1 || (info.funds.len() == 1 && info.funds[0].denom != config.debt_denom) {
        let sent_denom = info
            .funds
            .first()
            .map(|c| c.denom.as_str())
            .unwrap_or("none");
        return Err(ContractError::WrongDenom {
            expected: config.debt_denom.clone(),
            got: sent_denom.to_string(),
        });
    }

    // Get the debt asset amount sent
    let amount_sent = info
        .funds
        .iter()
        .find(|c| c.denom == config.debt_denom)
        .map(|c| c.amount)
        .unwrap_or_default();

    if amount_sent.is_zero() {
        return Err(ContractError::ZeroAmount);
    }

    // Apply accumulated interest (fees are accrued to state, not sent immediately)
    apply_accumulated_interest(deps.storage, env.block.time.seconds())?;

    // Determine whose debt to repay
    let borrower = match &on_behalf_of {
        Some(addr) => deps.api.addr_validate(addr)?.to_string(),
        None => info.sender.to_string(),
    };

    // Get borrower's current debt
    let current_debt = get_user_debt(deps.storage, &borrower)?;

    if current_debt.is_zero() {
        return Err(ContractError::NoDebt);
    }

    // Calculate repay amount (cap at current debt)
    let repay_amount = amount_sent.min(current_debt);
    let refund_amount = amount_sent.saturating_sub(repay_amount);

    let state = STATE.load(deps.storage)?;

    // Calculate scaled debt decrease
    let scaled_decrease = stone_types::amount_to_scaled(repay_amount, state.borrow_index);

    // Update borrower's debt position
    let current_scaled = DEBTS.may_load(deps.storage, &borrower)?.unwrap_or_default();
    let new_scaled = current_scaled.saturating_sub(scaled_decrease);

    if new_scaled.is_zero() {
        DEBTS.remove(deps.storage, &borrower);
    } else {
        DEBTS.save(deps.storage, &borrower, &new_scaled)?;
    }

    // Update market totals
    let mut state = STATE.load(deps.storage)?;
    state.total_debt_scaled = state.total_debt_scaled.saturating_sub(scaled_decrease);
    STATE.save(deps.storage, &state)?;

    // Calculate unscaled totals for event
    let total_supply = state.total_supply();
    let total_debt = state.total_debt();
    let utilization = state.utilization();

    // Calculate current rates based on post-transaction state
    let (borrow_rate, liquidity_rate) = crate::interest::calculate_current_rates(deps.storage)?;

    // Build response
    let mut response = Response::new()
        .add_attribute("action", "repay")
        .add_attribute("repayer", &info.sender)
        .add_attribute("borrower", &borrower)
        .add_attribute("amount", repay_amount)
        .add_attribute("scaled_decrease", scaled_decrease)
        .add_attribute("borrow_index", state.borrow_index.to_string())
        .add_attribute("liquidity_index", state.liquidity_index.to_string())
        .add_attribute("borrow_rate", borrow_rate.to_string())
        .add_attribute("liquidity_rate", liquidity_rate.to_string())
        .add_attribute("total_supply", total_supply)
        .add_attribute("total_debt", total_debt)
        .add_attribute("utilization", utilization.to_string());

    // Refund excess if any
    if !refund_amount.is_zero() {
        let refund_msg = BankMsg::Send {
            to_address: info.sender.to_string(),
            amount: vec![Coin {
                denom: config.debt_denom,
                amount: refund_amount,
            }],
        };
        response = response
            .add_message(refund_msg)
            .add_attribute("refund", refund_amount);
    }

    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{message_info, mock_dependencies, mock_env, MockApi};
    use cosmwasm_std::{coins, Decimal, Uint128};
    use stone_types::{
        InterestRateModel, MarketConfig, MarketParams, MarketState, OracleConfig, OracleType,
    };

    fn setup_market_with_debt(
        deps: &mut cosmwasm_std::OwnedDeps<
            cosmwasm_std::MemoryStorage,
            cosmwasm_std::testing::MockApi,
            cosmwasm_std::testing::MockQuerier,
        >,
    ) -> cosmwasm_std::Addr {
        let api = MockApi::default();
        let user1 = api.addr_make("user1");
        let config = MarketConfig {
            factory: api.addr_make("factory"),
            curator: api.addr_make("curator"),
            oracle_config: OracleConfig {
                address: api.addr_make("oracle"),
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
        state.total_debt_scaled = Uint128::new(5000);
        STATE.save(deps.as_mut().storage, &state).unwrap();

        // User has 5000 scaled debt
        DEBTS
            .save(deps.as_mut().storage, user1.as_str(), &Uint128::new(5000))
            .unwrap();

        user1
    }

    #[test]
    fn test_repay_partial() {
        let mut deps = mock_dependencies();
        let user1 = setup_market_with_debt(&mut deps);

        let env = mock_env();
        let info = message_info(&user1, &coins(2000, "uusdc"));

        let res = execute_repay(deps.as_mut(), env, info, None).unwrap();

        assert!(res
            .attributes
            .iter()
            .any(|a| a.key == "amount" && a.value == "2000"));

        // Check remaining debt
        let debt = DEBTS.load(deps.as_ref().storage, user1.as_str()).unwrap();
        assert_eq!(debt, Uint128::new(3000));
    }

    #[test]
    fn test_repay_full() {
        let mut deps = mock_dependencies();
        let user1 = setup_market_with_debt(&mut deps);

        let env = mock_env();
        let info = message_info(&user1, &coins(5000, "uusdc"));

        let res = execute_repay(deps.as_mut(), env, info, None).unwrap();

        assert!(res
            .attributes
            .iter()
            .any(|a| a.key == "amount" && a.value == "5000"));

        // Debt should be removed
        assert!(!DEBTS.has(deps.as_ref().storage, user1.as_str()));
    }

    #[test]
    fn test_repay_with_refund() {
        let mut deps = mock_dependencies();
        let user1 = setup_market_with_debt(&mut deps);

        let env = mock_env();
        let info = message_info(&user1, &coins(7000, "uusdc")); // More than debt

        let res = execute_repay(deps.as_mut(), env, info, None).unwrap();

        // Should have refund message
        assert!(res.messages.iter().any(|m| {
            if let cosmwasm_std::CosmosMsg::Bank(BankMsg::Send { amount, .. }) = &m.msg {
                amount.iter().any(|c| c.amount == Uint128::new(2000))
            } else {
                false
            }
        }));

        assert!(res
            .attributes
            .iter()
            .any(|a| a.key == "refund" && a.value == "2000"));
    }

    #[test]
    fn test_repay_on_behalf_of() {
        let mut deps = mock_dependencies();
        let user1 = setup_market_with_debt(&mut deps);

        let api = MockApi::default();
        let user2 = api.addr_make("user2");
        let env = mock_env();
        let info = message_info(&user2, &coins(2000, "uusdc")); // Different user paying

        let res = execute_repay(deps.as_mut(), env, info, Some(user1.to_string())).unwrap();

        assert!(res
            .attributes
            .iter()
            .any(|a| a.key == "repayer" && a.value == user2.as_str()));
        assert!(res
            .attributes
            .iter()
            .any(|a| a.key == "borrower" && a.value == user1.as_str()));

        // Check user1's debt was reduced
        let debt = DEBTS.load(deps.as_ref().storage, user1.as_str()).unwrap();
        assert_eq!(debt, Uint128::new(3000));
    }

    #[test]
    fn test_repay_no_debt() {
        let mut deps = mock_dependencies();
        let _user1 = setup_market_with_debt(&mut deps);

        let api = MockApi::default();
        let user2 = api.addr_make("user2");
        let env = mock_env();
        let info = message_info(&user2, &coins(1000, "uusdc")); // User with no debt

        let err = execute_repay(deps.as_mut(), env, info, None).unwrap_err();
        assert!(matches!(err, ContractError::NoDebt));
    }

    #[test]
    fn test_repay_zero_amount() {
        let mut deps = mock_dependencies();
        let user1 = setup_market_with_debt(&mut deps);

        let env = mock_env();
        let info = message_info(&user1, &[]);

        let err = execute_repay(deps.as_mut(), env, info, None).unwrap_err();
        assert!(matches!(err, ContractError::ZeroAmount));
    }

    #[test]
    fn test_repay_wrong_denom() {
        let mut deps = mock_dependencies();
        let user1 = setup_market_with_debt(&mut deps);

        let env = mock_env();
        let info = message_info(&user1, &coins(1000, "uatom")); // Wrong denom

        let err = execute_repay(deps.as_mut(), env, info, None).unwrap_err();
        assert!(matches!(err, ContractError::WrongDenom { .. }));
    }

    #[test]
    fn test_repay_updates_market_totals() {
        let mut deps = mock_dependencies();
        let user1 = setup_market_with_debt(&mut deps);

        let env = mock_env();
        let info = message_info(&user1, &coins(2000, "uusdc"));

        execute_repay(deps.as_mut(), env, info, None).unwrap();

        let state = STATE.load(deps.as_ref().storage).unwrap();
        assert_eq!(state.total_debt_scaled, Uint128::new(3000));
    }
}
