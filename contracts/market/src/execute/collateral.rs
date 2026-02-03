use cosmwasm_std::{BankMsg, Coin, DepsMut, Env, MessageInfo, Response, Uint128};

use crate::error::ContractError;
use crate::health::check_withdrawal_allowed;
use crate::interest::apply_accumulated_interest;
use crate::state::{COLLATERAL, CONFIG, PARAMS, STATE};

/// Supply collateral asset to enable borrowing.
pub fn execute_supply_collateral(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    recipient: Option<String>,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let params = PARAMS.load(deps.storage)?;

    if !params.enabled {
        return Err(ContractError::MarketDisabled);
    }

    // Check for wrong denom first
    if info.funds.len() > 1
        || (info.funds.len() == 1 && info.funds[0].denom != config.collateral_denom)
    {
        let sent_denom = info
            .funds
            .first()
            .map(|c| c.denom.as_str())
            .unwrap_or("none");
        return Err(ContractError::WrongDenom {
            expected: config.collateral_denom.clone(),
            got: sent_denom.to_string(),
        });
    }

    // Get the collateral amount sent
    let amount = info
        .funds
        .iter()
        .find(|c| c.denom == config.collateral_denom)
        .map(|c| c.amount)
        .unwrap_or_default();

    if amount.is_zero() {
        return Err(ContractError::ZeroAmount);
    }

    // Determine recipient
    let recipient_addr = match recipient {
        Some(addr) => deps.api.addr_validate(&addr)?,
        None => info.sender.clone(),
    };

    // Update user's collateral position (collateral is NOT scaled)
    let current = COLLATERAL
        .may_load(deps.storage, recipient_addr.as_str())?
        .unwrap_or_default();
    let new_collateral = current.checked_add(amount)?;
    COLLATERAL.save(deps.storage, recipient_addr.as_str(), &new_collateral)?;

    // Update market totals
    let mut state = STATE.load(deps.storage)?;
    state.total_collateral = state.total_collateral.checked_add(amount)?;
    STATE.save(deps.storage, &state)?;

    Ok(Response::new()
        .add_attribute("action", "supply_collateral")
        .add_attribute("supplier", info.sender)
        .add_attribute("recipient", recipient_addr)
        .add_attribute("amount", amount))
}

/// Withdraw collateral (must maintain LTV if debt exists).
pub fn execute_withdraw_collateral(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    amount: Option<Uint128>,
    recipient: Option<String>,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // NOTE: Withdraw collateral is ALWAYS allowed regardless of market status
    // so users can always access their collateral (subject to LTV constraints).

    // Apply accumulated interest (needed for accurate debt calculation)
    let fee_messages = apply_accumulated_interest(deps.storage, env.block.time.seconds())?;

    let user = info.sender.as_str();

    // Get user's current collateral
    let current_collateral = COLLATERAL.may_load(deps.storage, user)?.unwrap_or_default();

    if current_collateral.is_zero() {
        return Err(ContractError::NoCollateral);
    }

    // Determine withdraw amount
    let withdraw_amount = match amount {
        Some(amt) => {
            if amt.is_zero() {
                return Err(ContractError::ZeroAmount);
            }
            amt.min(current_collateral)
        }
        None => current_collateral,
    };

    // Check if withdrawal is allowed (LTV check)
    check_withdrawal_allowed(deps.as_ref(), &env, user, withdraw_amount)?;

    // Update user's collateral position
    let new_collateral = current_collateral - withdraw_amount;
    if new_collateral.is_zero() {
        COLLATERAL.remove(deps.storage, user);
    } else {
        COLLATERAL.save(deps.storage, user, &new_collateral)?;
    }

    // Update market totals
    let mut state = STATE.load(deps.storage)?;
    state.total_collateral = state.total_collateral.saturating_sub(withdraw_amount);
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
            denom: config.collateral_denom,
            amount: withdraw_amount,
        }],
    };

    Ok(Response::new()
        .add_messages(fee_messages)
        .add_message(transfer_msg)
        .add_attribute("action", "withdraw_collateral")
        .add_attribute("user", info.sender)
        .add_attribute("recipient", recipient_addr)
        .add_attribute("amount", withdraw_amount))
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{message_info, mock_dependencies, mock_env, MockApi};
    use cosmwasm_std::{coins, Decimal};
    use stone_types::{
        InterestRateModel, MarketConfig, MarketParams, MarketState, OracleConfig, OracleType,
    };

    fn setup_market(
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

        let state = MarketState::new(1000);
        STATE.save(deps.as_mut().storage, &state).unwrap();
    }

    #[test]
    fn test_supply_collateral_success() {
        let mut deps = mock_dependencies();
        setup_market(&mut deps);

        let api = MockApi::default();
        let user1 = api.addr_make("user1");
        let env = mock_env();
        let info = message_info(&user1, &coins(1000, "uatom"));

        let res = execute_supply_collateral(deps.as_mut(), env, info, None).unwrap();

        assert_eq!(res.attributes.len(), 4);

        // Check user's collateral was recorded
        let collateral = COLLATERAL
            .load(deps.as_ref().storage, user1.as_str())
            .unwrap();
        assert_eq!(collateral, Uint128::new(1000));

        // Check market totals
        let state = STATE.load(deps.as_ref().storage).unwrap();
        assert_eq!(state.total_collateral, Uint128::new(1000));
    }

    #[test]
    fn test_supply_collateral_with_recipient() {
        let mut deps = mock_dependencies();
        setup_market(&mut deps);

        let api = MockApi::default();
        let user1 = api.addr_make("user1");
        let user2 = api.addr_make("user2");
        let env = mock_env();
        let info = message_info(&user1, &coins(1000, "uatom"));

        let res =
            execute_supply_collateral(deps.as_mut(), env, info, Some(user2.to_string())).unwrap();

        assert!(res
            .attributes
            .iter()
            .any(|a| a.key == "recipient" && a.value == user2.as_str()));

        let collateral = COLLATERAL
            .load(deps.as_ref().storage, user2.as_str())
            .unwrap();
        assert_eq!(collateral, Uint128::new(1000));
    }

    #[test]
    fn test_supply_collateral_wrong_denom() {
        let mut deps = mock_dependencies();
        setup_market(&mut deps);

        let api = MockApi::default();
        let user1 = api.addr_make("user1");
        let env = mock_env();
        let info = message_info(&user1, &coins(1000, "uusdc")); // Wrong denom

        let err = execute_supply_collateral(deps.as_mut(), env, info, None).unwrap_err();
        assert!(matches!(err, ContractError::WrongDenom { .. }));
    }

    #[test]
    fn test_withdraw_collateral_no_debt() {
        let mut deps = mock_dependencies();
        setup_market(&mut deps);

        let api = MockApi::default();
        let user1 = api.addr_make("user1");

        // Add collateral
        COLLATERAL
            .save(deps.as_mut().storage, user1.as_str(), &Uint128::new(1000))
            .unwrap();
        let mut state = STATE.load(deps.as_ref().storage).unwrap();
        state.total_collateral = Uint128::new(1000);
        STATE.save(deps.as_mut().storage, &state).unwrap();

        let env = mock_env();
        let info = message_info(&user1, &[]);

        // Should be able to withdraw all with no debt
        let res = execute_withdraw_collateral(deps.as_mut(), env, info, None, None).unwrap();

        assert!(!res.messages.is_empty());
        assert!(!COLLATERAL.has(deps.as_ref().storage, user1.as_str()));
    }

    #[test]
    fn test_withdraw_collateral_partial() {
        let mut deps = mock_dependencies();
        setup_market(&mut deps);

        let api = MockApi::default();
        let user1 = api.addr_make("user1");

        COLLATERAL
            .save(deps.as_mut().storage, user1.as_str(), &Uint128::new(1000))
            .unwrap();
        let mut state = STATE.load(deps.as_ref().storage).unwrap();
        state.total_collateral = Uint128::new(1000);
        STATE.save(deps.as_mut().storage, &state).unwrap();

        let env = mock_env();
        let info = message_info(&user1, &[]);

        let res =
            execute_withdraw_collateral(deps.as_mut(), env, info, Some(Uint128::new(500)), None)
                .unwrap();

        assert!(!res.messages.is_empty());

        let remaining = COLLATERAL
            .load(deps.as_ref().storage, user1.as_str())
            .unwrap();
        assert_eq!(remaining, Uint128::new(500));
    }

    #[test]
    fn test_withdraw_collateral_no_collateral() {
        let mut deps = mock_dependencies();
        setup_market(&mut deps);

        let api = MockApi::default();
        let user1 = api.addr_make("user1");
        let env = mock_env();
        let info = message_info(&user1, &[]);

        let err = execute_withdraw_collateral(deps.as_mut(), env, info, None, None).unwrap_err();
        assert!(matches!(err, ContractError::NoCollateral));
    }

    #[test]
    fn test_supply_collateral_accumulates() {
        let mut deps = mock_dependencies();
        setup_market(&mut deps);

        let api = MockApi::default();
        let user1 = api.addr_make("user1");
        let env = mock_env();

        // First supply
        let info = message_info(&user1, &coins(1000, "uatom"));
        execute_supply_collateral(deps.as_mut(), env.clone(), info, None).unwrap();

        // Second supply
        let info = message_info(&user1, &coins(500, "uatom"));
        execute_supply_collateral(deps.as_mut(), env, info, None).unwrap();

        let collateral = COLLATERAL
            .load(deps.as_ref().storage, user1.as_str())
            .unwrap();
        assert_eq!(collateral, Uint128::new(1500));
    }

    #[test]
    fn test_supply_collateral_blocked_when_disabled() {
        // C4 Fix: Supply collateral must be blocked when market is disabled
        let mut deps = mock_dependencies();
        setup_market(&mut deps);

        let mut params = PARAMS.load(deps.as_ref().storage).unwrap();
        params.enabled = false;
        PARAMS.save(deps.as_mut().storage, &params).unwrap();

        let api = MockApi::default();
        let user1 = api.addr_make("user1");
        let env = mock_env();
        let info = message_info(&user1, &coins(1000, "uatom"));

        // Supply collateral should fail when market is disabled
        let err = execute_supply_collateral(deps.as_mut(), env, info, None).unwrap_err();
        assert!(matches!(err, ContractError::MarketDisabled));
    }

    #[test]
    fn test_withdraw_collateral_works_when_disabled() {
        // C4 Fix: Withdraw collateral must ALWAYS work regardless of market status
        let mut deps = mock_dependencies();
        setup_market(&mut deps);

        let api = MockApi::default();
        let user1 = api.addr_make("user1");

        // Add collateral
        COLLATERAL
            .save(deps.as_mut().storage, user1.as_str(), &Uint128::new(1000))
            .unwrap();
        let mut state = STATE.load(deps.as_ref().storage).unwrap();
        state.total_collateral = Uint128::new(1000);
        STATE.save(deps.as_mut().storage, &state).unwrap();

        let mut params = PARAMS.load(deps.as_ref().storage).unwrap();
        params.enabled = false;
        PARAMS.save(deps.as_mut().storage, &params).unwrap();

        let env = mock_env();
        let info = message_info(&user1, &[]);

        // Withdraw collateral should succeed even when market is disabled
        let res =
            execute_withdraw_collateral(deps.as_mut(), env, info, Some(Uint128::new(500)), None)
                .unwrap();

        assert!(!res.messages.is_empty());
        assert!(res
            .attributes
            .iter()
            .any(|a| a.key == "action" && a.value == "withdraw_collateral"));

        let remaining = COLLATERAL
            .load(deps.as_ref().storage, user1.as_str())
            .unwrap();
        assert_eq!(remaining, Uint128::new(500));
    }
}
