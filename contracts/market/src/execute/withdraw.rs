use cosmwasm_std::{BankMsg, Coin, DepsMut, Env, MessageInfo, Response, Uint128};

use crate::error::ContractError;
use crate::interest::{apply_accumulated_interest, get_user_supply};
use crate::state::{CONFIG, PARAMS, STATE, SUPPLIES};

/// Withdraw previously supplied debt asset.
pub fn execute_withdraw(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    amount: Option<Uint128>,
    recipient: Option<String>,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let params = PARAMS.load(deps.storage)?;

    // NOTE: Withdraw is ALWAYS allowed regardless of market status
    // so users can always access their supplied funds.

    // Apply accumulated interest
    let fee_messages = apply_accumulated_interest(deps.storage, env.block.time.seconds())?;

    let state = STATE.load(deps.storage)?;

    // Get user's current supply
    let user = info.sender.as_str();
    let current_supply = get_user_supply(deps.storage, user)?;

    if current_supply.is_zero() {
        return Err(ContractError::NoSupply);
    }

    // Determine withdraw amount
    let withdraw_amount = match amount {
        Some(amt) => {
            if amt.is_zero() {
                return Err(ContractError::ZeroAmount);
            }
            amt.min(current_supply)
        }
        None => current_supply, // Withdraw all
    };

    // Check available liquidity
    let available = state.available_liquidity();
    if withdraw_amount > available {
        return Err(ContractError::InsufficientLiquidity {
            available: available.to_string(),
            requested: withdraw_amount.to_string(),
        });
    }

    // Calculate scaled amount to remove: scaled = amount / index
    let scaled_decrease = stone_types::amount_to_scaled(withdraw_amount, state.liquidity_index);

    // Update user's supply position
    let current_scaled = SUPPLIES.may_load(deps.storage, user)?.unwrap_or_default();
    let new_scaled = current_scaled.saturating_sub(scaled_decrease);

    if new_scaled.is_zero() {
        SUPPLIES.remove(deps.storage, user);
    } else {
        SUPPLIES.save(deps.storage, user, &new_scaled)?;
    }

    // Update market totals
    let mut state = STATE.load(deps.storage)?;
    state.total_supply_scaled = state.total_supply_scaled.saturating_sub(scaled_decrease);
    STATE.save(deps.storage, &state)?;

    // Calculate unscaled totals for event
    let total_supply = state.total_supply();
    let total_debt = state.total_debt();
    let utilization = state.utilization();

    // Calculate current rates based on post-transaction state
    let (borrow_rate, liquidity_rate) = crate::interest::calculate_current_rates(deps.storage)?;

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
            amount: withdraw_amount,
        }],
    };

    Ok(Response::new()
        .add_messages(fee_messages)
        .add_message(transfer_msg)
        .add_attribute("action", "withdraw")
        .add_attribute("withdrawer", info.sender)
        .add_attribute("recipient", recipient_addr)
        .add_attribute("amount", withdraw_amount)
        .add_attribute("scaled_decrease", scaled_decrease)
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
    use cosmwasm_std::testing::{message_info, mock_dependencies, mock_env, MockApi};
    use cosmwasm_std::Decimal;
    use stone_types::{
        InterestRateModel, MarketConfig, MarketParams, MarketState, OracleConfig, OracleType,
    };

    fn setup_market_with_supply(
        deps: &mut cosmwasm_std::OwnedDeps<
            cosmwasm_std::MemoryStorage,
            cosmwasm_std::testing::MockApi,
            cosmwasm_std::testing::MockQuerier,
        >,
    ) {
        let api = MockApi::default();
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
        state.total_supply_scaled = Uint128::new(10000);
        STATE.save(deps.as_mut().storage, &state).unwrap();

        // User has 1000 scaled supply
        let user1 = api.addr_make("user1");
        SUPPLIES
            .save(deps.as_mut().storage, user1.as_str(), &Uint128::new(1000))
            .unwrap();
    }

    #[test]
    fn test_withdraw_partial() {
        let mut deps = mock_dependencies();
        setup_market_with_supply(&mut deps);

        let env = mock_env();
        let user1 = MockApi::default().addr_make("user1");
        let info = message_info(&user1, &[]);

        let res =
            execute_withdraw(deps.as_mut(), env, info, Some(Uint128::new(500)), None).unwrap();

        // Should have transfer message
        assert!(!res.messages.is_empty());

        // Check user's remaining supply
        let supply = SUPPLIES
            .load(deps.as_ref().storage, user1.as_str())
            .unwrap();
        assert_eq!(supply, Uint128::new(500));
    }

    #[test]
    fn test_withdraw_all() {
        let mut deps = mock_dependencies();
        setup_market_with_supply(&mut deps);

        let env = mock_env();
        let user1 = MockApi::default().addr_make("user1");
        let info = message_info(&user1, &[]);

        let res = execute_withdraw(deps.as_mut(), env, info, None, None).unwrap();

        assert!(!res.messages.is_empty());

        // User's supply should be removed
        assert!(!SUPPLIES.has(deps.as_ref().storage, user1.as_str()));
    }

    #[test]
    fn test_withdraw_with_recipient() {
        let mut deps = mock_dependencies();
        setup_market_with_supply(&mut deps);

        let env = mock_env();
        let api = MockApi::default();
        let user1 = api.addr_make("user1");
        let user2 = api.addr_make("user2");
        let info = message_info(&user1, &[]);

        let res = execute_withdraw(
            deps.as_mut(),
            env,
            info,
            Some(Uint128::new(500)),
            Some(user2.to_string()),
        )
        .unwrap();

        assert!(res
            .attributes
            .iter()
            .any(|a| a.key == "recipient" && a.value == user2.as_str()));
    }

    #[test]
    fn test_withdraw_no_supply() {
        let mut deps = mock_dependencies();
        setup_market_with_supply(&mut deps);

        let env = mock_env();
        let user2 = MockApi::default().addr_make("user2"); // User with no supply
        let info = message_info(&user2, &[]);

        let err = execute_withdraw(deps.as_mut(), env, info, None, None).unwrap_err();
        assert!(matches!(err, ContractError::NoSupply));
    }

    #[test]
    fn test_withdraw_zero_amount() {
        let mut deps = mock_dependencies();
        setup_market_with_supply(&mut deps);

        let env = mock_env();
        let user1 = MockApi::default().addr_make("user1");
        let info = message_info(&user1, &[]);

        let err =
            execute_withdraw(deps.as_mut(), env, info, Some(Uint128::zero()), None).unwrap_err();
        assert!(matches!(err, ContractError::ZeroAmount));
    }

    #[test]
    fn test_withdraw_insufficient_liquidity() {
        let mut deps = mock_dependencies();
        setup_market_with_supply(&mut deps);

        // Add some debt to reduce available liquidity
        let mut state = STATE.load(deps.as_ref().storage).unwrap();
        state.total_debt_scaled = Uint128::new(9500); // Only 500 available
        STATE.save(deps.as_mut().storage, &state).unwrap();

        let env = mock_env();
        let user1 = MockApi::default().addr_make("user1");
        let info = message_info(&user1, &[]);

        let err =
            execute_withdraw(deps.as_mut(), env, info, Some(Uint128::new(1000)), None).unwrap_err();
        assert!(matches!(err, ContractError::InsufficientLiquidity { .. }));
    }

    #[test]
    fn test_withdraw_capped_to_supply() {
        let mut deps = mock_dependencies();
        setup_market_with_supply(&mut deps);

        let env = mock_env();
        let user1 = MockApi::default().addr_make("user1");
        let info = message_info(&user1, &[]);

        // Try to withdraw more than supply
        let res = execute_withdraw(
            deps.as_mut(),
            env,
            info,
            Some(Uint128::new(5000)), // More than user has
            None,
        )
        .unwrap();

        // Should only withdraw user's actual supply (1000)
        assert!(res
            .attributes
            .iter()
            .any(|a| a.key == "amount" && a.value == "1000"));
    }

    #[test]
    fn test_withdraw_works_when_disabled() {
        // C4 Fix: Withdraw must ALWAYS work regardless of market status
        let mut deps = mock_dependencies();
        setup_market_with_supply(&mut deps);

        let mut params = PARAMS.load(deps.as_ref().storage).unwrap();
        params.enabled = false;
        PARAMS.save(deps.as_mut().storage, &params).unwrap();

        let env = mock_env();
        let user1 = MockApi::default().addr_make("user1");
        let info = message_info(&user1, &[]);

        // Withdraw should succeed even when market is disabled
        let res = execute_withdraw(deps.as_mut(), env, info, Some(Uint128::new(500)), None).unwrap();

        assert!(!res.messages.is_empty());
        assert!(res
            .attributes
            .iter()
            .any(|a| a.key == "action" && a.value == "withdraw"));

        // Check user's remaining supply
        let supply = SUPPLIES
            .load(deps.as_ref().storage, user1.as_str())
            .unwrap();
        assert_eq!(supply, Uint128::new(500));
    }
}
