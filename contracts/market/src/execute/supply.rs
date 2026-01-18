use cosmwasm_std::{DepsMut, Env, MessageInfo, Response};

use crate::error::ContractError;
use crate::interest::apply_accumulated_interest;
use crate::state::{CONFIG, PARAMS, STATE, SUPPLIES};

/// Supply debt asset to earn interest.
pub fn execute_supply(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    recipient: Option<String>,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let params = PARAMS.load(deps.storage)?;

    // Check market is enabled
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
    let amount = info
        .funds
        .iter()
        .find(|c| c.denom == config.debt_denom)
        .map(|c| c.amount)
        .unwrap_or_default();

    if amount.is_zero() {
        return Err(ContractError::ZeroAmount);
    }

    // Apply accumulated interest
    let fee_messages = apply_accumulated_interest(deps.storage, env.block.time.seconds())?;

    // Check supply cap
    let state = STATE.load(deps.storage)?;
    let current_supply = state.total_supply();
    if let Some(cap) = params.supply_cap {
        let would_be = current_supply.checked_add(amount)?;
        if would_be > cap {
            return Err(ContractError::SupplyCapExceeded {
                cap: cap.to_string(),
                would_be: would_be.to_string(),
            });
        }
    }

    // Calculate scaled amount: scaled = amount / index
    let scaled_amount = stone_types::amount_to_scaled(amount, state.liquidity_index);

    // Determine recipient
    let recipient_addr = match recipient {
        Some(addr) => deps.api.addr_validate(&addr)?,
        None => info.sender.clone(),
    };

    // Update user's supply position
    let current_scaled = SUPPLIES
        .may_load(deps.storage, recipient_addr.as_str())?
        .unwrap_or_default();
    let new_scaled = current_scaled.checked_add(scaled_amount)?;
    SUPPLIES.save(deps.storage, recipient_addr.as_str(), &new_scaled)?;

    // Update market totals
    let mut state = STATE.load(deps.storage)?;
    state.total_supply_scaled = state.total_supply_scaled.checked_add(scaled_amount)?;
    STATE.save(deps.storage, &state)?;

    // Calculate unscaled totals for event
    let total_supply = state.total_supply();
    let total_debt = state.total_debt();
    let utilization = state.utilization();

    Ok(Response::new()
        .add_messages(fee_messages)
        .add_attribute("action", "supply")
        .add_attribute("supplier", info.sender)
        .add_attribute("recipient", recipient_addr)
        .add_attribute("amount", amount)
        .add_attribute("scaled_amount", scaled_amount)
        .add_attribute("total_supply", total_supply)
        .add_attribute("total_debt", total_debt)
        .add_attribute("utilization", utilization.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{message_info, mock_dependencies, mock_env, MockApi};
    use cosmwasm_std::{coins, Decimal, Uint128};
    use stone_types::{InterestRateModel, MarketConfig, MarketParams, MarketState};

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
            oracle: api.addr_make("oracle"),
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
    fn test_supply_success() {
        let mut deps = mock_dependencies();
        setup_market(&mut deps);

        let api = MockApi::default();
        let user1 = api.addr_make("user1");
        let env = mock_env();
        let info = message_info(&user1, &coins(1000, "uusdc"));

        let res = execute_supply(deps.as_mut(), env, info, None).unwrap();

        assert_eq!(res.attributes.len(), 8);

        // Check user's supply was recorded
        let supply = SUPPLIES
            .load(deps.as_ref().storage, user1.as_str())
            .unwrap();
        assert_eq!(supply, Uint128::new(1000)); // scaled = 1000 / 1.0 = 1000

        // Check market totals
        let state = STATE.load(deps.as_ref().storage).unwrap();
        assert_eq!(state.total_supply_scaled, Uint128::new(1000));
    }

    #[test]
    fn test_supply_with_recipient() {
        let mut deps = mock_dependencies();
        setup_market(&mut deps);

        let api = MockApi::default();
        let user1 = api.addr_make("user1");
        let user2 = api.addr_make("user2");
        let env = mock_env();
        let info = message_info(&user1, &coins(1000, "uusdc"));

        let res = execute_supply(deps.as_mut(), env, info, Some(user2.to_string())).unwrap();

        assert!(res
            .attributes
            .iter()
            .any(|a| a.key == "recipient" && a.value == user2.as_str()));

        // Check user2's supply was recorded
        let supply = SUPPLIES
            .load(deps.as_ref().storage, user2.as_str())
            .unwrap();
        assert_eq!(supply, Uint128::new(1000));
    }

    #[test]
    fn test_supply_zero_amount() {
        let mut deps = mock_dependencies();
        setup_market(&mut deps);

        let api = MockApi::default();
        let user1 = api.addr_make("user1");
        let env = mock_env();
        let info = message_info(&user1, &[]);

        let err = execute_supply(deps.as_mut(), env, info, None).unwrap_err();
        assert!(matches!(err, ContractError::ZeroAmount));
    }

    #[test]
    fn test_supply_wrong_denom() {
        let mut deps = mock_dependencies();
        setup_market(&mut deps);

        let api = MockApi::default();
        let user1 = api.addr_make("user1");
        let env = mock_env();
        let info = message_info(&user1, &coins(1000, "uatom")); // Wrong denom

        let err = execute_supply(deps.as_mut(), env, info, None).unwrap_err();
        assert!(matches!(err, ContractError::WrongDenom { .. }));
    }

    #[test]
    fn test_supply_disabled_market() {
        let mut deps = mock_dependencies();
        setup_market(&mut deps);

        // Disable market
        let mut params = PARAMS.load(deps.as_ref().storage).unwrap();
        params.enabled = false;
        PARAMS.save(deps.as_mut().storage, &params).unwrap();

        let api = MockApi::default();
        let user1 = api.addr_make("user1");
        let env = mock_env();
        let info = message_info(&user1, &coins(1000, "uusdc"));

        let err = execute_supply(deps.as_mut(), env, info, None).unwrap_err();
        assert!(matches!(err, ContractError::MarketDisabled));
    }

    #[test]
    fn test_supply_cap_exceeded() {
        let mut deps = mock_dependencies();
        setup_market(&mut deps);

        // Set supply cap
        let mut params = PARAMS.load(deps.as_ref().storage).unwrap();
        params.supply_cap = Some(Uint128::new(500));
        PARAMS.save(deps.as_mut().storage, &params).unwrap();

        let api = MockApi::default();
        let user1 = api.addr_make("user1");
        let env = mock_env();
        let info = message_info(&user1, &coins(1000, "uusdc"));

        let err = execute_supply(deps.as_mut(), env, info, None).unwrap_err();
        assert!(matches!(err, ContractError::SupplyCapExceeded { .. }));
    }

    #[test]
    fn test_supply_with_existing_position() {
        let mut deps = mock_dependencies();
        setup_market(&mut deps);

        let api = MockApi::default();
        let user1 = api.addr_make("user1");
        let env = mock_env();

        // First supply
        let info = message_info(&user1, &coins(1000, "uusdc"));
        execute_supply(deps.as_mut(), env.clone(), info, None).unwrap();

        // Second supply
        let info = message_info(&user1, &coins(500, "uusdc"));
        execute_supply(deps.as_mut(), env, info, None).unwrap();

        // Check accumulated supply
        let supply = SUPPLIES
            .load(deps.as_ref().storage, user1.as_str())
            .unwrap();
        assert_eq!(supply, Uint128::new(1500));
    }
}
