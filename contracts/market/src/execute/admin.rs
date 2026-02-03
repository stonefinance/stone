use cosmwasm_std::{BankMsg, Coin, Decimal, DepsMut, Env, MessageInfo, Response, Uint128};

use crate::error::ContractError;
use crate::interest::apply_accumulated_interest;
use crate::state::{ACCRUED_CURATOR_FEES, ACCRUED_PROTOCOL_FEES, CONFIG, PARAMS, STATE};
use stone_types::MarketParamsUpdate;

/// 7 days in seconds (LTV update cooldown)
pub const LTV_COOLDOWN_SECONDS: u64 = 604_800; // TODO don't hardcode - should be parameterisable and set on init

/// Maximum LTV change per update (5%)
pub const MAX_LTV_CHANGE: Decimal = Decimal::raw(50_000_000_000_000_000); // 0.05 // todo don;t hardcode, should be parameterisbable and set on init

/// Update market parameters (curator only).
pub fn execute_update_params(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    updates: MarketParamsUpdate,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    let mut params = PARAMS.load(deps.storage)?;

    // Only curator can update params
    if info.sender != config.curator {
        return Err(ContractError::Unauthorized);
    }

    let mut response = Response::new().add_attribute("action", "update_params");

    // Update LTV (requires mutable market and cooldown)
    if let Some(new_ltv) = updates.loan_to_value {
        if !params.is_mutable {
            return Err(ContractError::MarketImmutable);
        }

        // Check cooldown
        let time_since_last = env
            .block
            .time
            .seconds()
            .saturating_sub(params.ltv_last_update);
        if time_since_last < LTV_COOLDOWN_SECONDS {
            return Err(ContractError::LtvCooldownNotElapsed {
                remaining_seconds: LTV_COOLDOWN_SECONDS - time_since_last,
            });
        }

        // Check change is within bounds
        let change = if new_ltv > params.loan_to_value {
            new_ltv.checked_sub(params.loan_to_value)?
        } else {
            params.loan_to_value.checked_sub(new_ltv)?
        };

        if change > MAX_LTV_CHANGE {
            return Err(ContractError::LtvChangeExceedsMax {
                current: params.loan_to_value.to_string(),
                requested: new_ltv.to_string(),
            });
        }

        // Validate LTV bounds
        if new_ltv < Decimal::percent(1) || new_ltv > Decimal::percent(95) {
            return Err(ContractError::InvalidLtv);
        }

        // Must be less than liquidation threshold
        if new_ltv >= params.liquidation_threshold {
            return Err(ContractError::InvalidLtv);
        }

        params.loan_to_value = new_ltv;
        params.ltv_last_update = env.block.time.seconds();
        response = response.add_attribute("new_ltv", new_ltv.to_string());
    }

    // Update interest rate model (always allowed)
    if let Some(new_model) = updates.interest_rate_model {
        if !new_model.validate() {
            return Err(ContractError::Types(
                stone_types::ContractError::InvalidInterestRateModel,
            ));
        }
        params.interest_rate_model = new_model;
        response = response.add_attribute("interest_rate_model", "updated");
    }

    // Update curator fee (always allowed, 0-25%)
    if let Some(new_fee) = updates.curator_fee {
        if new_fee > Decimal::percent(25) {
            return Err(ContractError::CuratorFeeExceedsMax);
        }
        params.curator_fee = new_fee;
        response = response.add_attribute("curator_fee", new_fee.to_string());
    }

    // Update supply cap (always allowed)
    if let Some(new_cap) = updates.supply_cap {
        params.supply_cap = new_cap;
        response = response.add_attribute(
            "supply_cap",
            new_cap.map(|c| c.to_string()).unwrap_or("none".to_string()),
        );
    }

    // Update borrow cap (always allowed)
    if let Some(new_cap) = updates.borrow_cap {
        params.borrow_cap = new_cap;
        response = response.add_attribute(
            "borrow_cap",
            new_cap.map(|c| c.to_string()).unwrap_or("none".to_string()),
        );
    }

    // Update enabled status (always allowed)
    if let Some(enabled) = updates.enabled {
        params.enabled = enabled;
        response = response.add_attribute("enabled", enabled.to_string());
    }

    PARAMS.save(deps.storage, &params)?;

    // Add full parameter snapshot for indexer
    response = response
        .add_attribute("final_ltv", params.loan_to_value.to_string())
        .add_attribute(
            "final_liquidation_threshold",
            params.liquidation_threshold.to_string(),
        )
        .add_attribute(
            "final_liquidation_bonus",
            params.liquidation_bonus.to_string(),
        )
        .add_attribute(
            "final_liquidation_protocol_fee",
            params.liquidation_protocol_fee.to_string(),
        )
        .add_attribute("final_close_factor", params.close_factor.to_string())
        .add_attribute("final_protocol_fee", params.protocol_fee.to_string())
        .add_attribute("final_curator_fee", params.curator_fee.to_string())
        .add_attribute(
            "final_supply_cap",
            params
                .supply_cap
                .map(|c| c.to_string())
                .unwrap_or("none".to_string()),
        )
        .add_attribute(
            "final_borrow_cap",
            params
                .borrow_cap
                .map(|c| c.to_string())
                .unwrap_or("none".to_string()),
        )
        .add_attribute("final_enabled", params.enabled.to_string())
        .add_attribute("final_is_mutable", params.is_mutable.to_string());

    Ok(response)
}

/// Accrue interest without performing any other action.
pub fn execute_accrue_interest(deps: DepsMut, env: Env) -> Result<Response, ContractError> {
    crate::interest::apply_accumulated_interest(deps.storage, env.block.time.seconds())?;

    // Load updated state to emit in events
    let state = crate::state::STATE.load(deps.storage)?;

    // Load accrued fees
    let accrued_protocol = ACCRUED_PROTOCOL_FEES
        .may_load(deps.storage)?
        .unwrap_or_default();
    let accrued_curator = ACCRUED_CURATOR_FEES
        .may_load(deps.storage)?
        .unwrap_or_default();

    Ok(Response::new()
        .add_attribute("action", "accrue_interest")
        .add_attribute("borrow_index", state.borrow_index.to_string())
        .add_attribute("liquidity_index", state.liquidity_index.to_string())
        .add_attribute("borrow_rate", state.borrow_rate.to_string())
        .add_attribute("liquidity_rate", state.liquidity_rate.to_string())
        .add_attribute("last_update", state.last_update.to_string())
        .add_attribute("accrued_protocol_fees", accrued_protocol)
        .add_attribute("accrued_curator_fees", accrued_curator))
}

/// Claim accrued protocol and/or curator fees.
/// Only callable by protocol fee collector or curator.
/// Claims are limited by available liquidity (fees must be backed by actual tokens).
pub fn execute_claim_fees(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
) -> Result<Response, ContractError> {
    // Apply accumulated interest first - this ensures accrued fees and available_liquidity are up-to-date.
    // All other execute handlers call this as their first action to ensure state is current.
    apply_accumulated_interest(deps.storage, env.block.time.seconds())?;

    let config = CONFIG.load(deps.storage)?;
    let state = STATE.load(deps.storage)?;

    // Determine which fees the caller can claim
    let is_protocol_collector = info.sender == config.protocol_fee_collector;
    let is_curator = info.sender == config.curator;

    if !is_protocol_collector && !is_curator {
        return Err(ContractError::Unauthorized);
    }

    // Get current accrued fees
    let accrued_protocol = ACCRUED_PROTOCOL_FEES
        .may_load(deps.storage)?
        .unwrap_or_default();
    let accrued_curator = ACCRUED_CURATOR_FEES
        .may_load(deps.storage)?
        .unwrap_or_default();

    // Calculate available liquidity (tokens not borrowed)
    // This is the amount that can actually be withdrawn
    //
    // Safety note: Using available_liquidity() as a claim cap is safe for sequential claims
    // by different parties because:
    // 1. Each claim atomically reduces accrued fees state before transferring tokens
    // 2. The next claimant sees reduced accrued_fees (the fee debt is already decreased)
    // 3. Total claims can never exceed initial available_liquidity because the sum of
    //    fee reductions equals the total claimed, preserving the invariant
    let available_liquidity = state.available_liquidity();

    // Calculate how much can actually be claimed
    // We need to ensure there's enough liquidity for all supplier withdrawals
    // So we can't claim more than available_liquidity
    let claimable_protocol = if is_protocol_collector {
        accrued_protocol.min(available_liquidity)
    } else {
        Uint128::zero()
    };

    let claimable_curator = if is_curator {
        // Curator gets what's left after protocol claims (if both are the same caller, they get both)
        let remaining_liquidity = available_liquidity.saturating_sub(claimable_protocol);
        accrued_curator.min(remaining_liquidity)
    } else {
        Uint128::zero()
    };

    if claimable_protocol.is_zero() && claimable_curator.is_zero() {
        return Err(ContractError::Std(cosmwasm_std::StdError::generic_err(
            "No fees available to claim (insufficient liquidity)",
        )));
    }

    // Update accrued fees state
    if !claimable_protocol.is_zero() {
        let new_accrued = accrued_protocol.saturating_sub(claimable_protocol);
        if new_accrued.is_zero() {
            ACCRUED_PROTOCOL_FEES.remove(deps.storage);
        } else {
            ACCRUED_PROTOCOL_FEES.save(deps.storage, &new_accrued)?;
        }
    }

    if !claimable_curator.is_zero() {
        let new_accrued = accrued_curator.saturating_sub(claimable_curator);
        if new_accrued.is_zero() {
            ACCRUED_CURATOR_FEES.remove(deps.storage);
        } else {
            ACCRUED_CURATOR_FEES.save(deps.storage, &new_accrued)?;
        }
    }

    // Build transfer messages
    let mut messages = vec![];

    if !claimable_protocol.is_zero() {
        messages.push(BankMsg::Send {
            to_address: config.protocol_fee_collector.to_string(),
            amount: vec![Coin {
                denom: config.debt_denom.clone(),
                amount: claimable_protocol,
            }],
        });
    }

    if !claimable_curator.is_zero() {
        messages.push(BankMsg::Send {
            to_address: config.curator.to_string(),
            amount: vec![Coin {
                denom: config.debt_denom,
                amount: claimable_curator,
            }],
        });
    }

    let total_claimed = claimable_protocol.checked_add(claimable_curator)?;

    Ok(Response::new()
        .add_messages(messages)
        .add_attribute("action", "claim_fees")
        .add_attribute("caller", info.sender)
        .add_attribute("protocol_claimed", claimable_protocol)
        .add_attribute("curator_claimed", claimable_curator)
        .add_attribute("total_claimed", total_claimed)
        .add_attribute("accrued_protocol_remaining", accrued_protocol.saturating_sub(claimable_protocol))
        .add_attribute("accrued_curator_remaining", accrued_curator.saturating_sub(claimable_curator)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::STATE;
    use cosmwasm_std::testing::{message_info, mock_dependencies, mock_env, MockApi};
    use cosmwasm_std::Uint128;
    use stone_types::{
        InterestRateModel, MarketConfig, MarketParams, MarketState, OracleConfig, OracleType,
    };

    fn setup_mutable_market(
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
            is_mutable: true, // Mutable market
            ltv_last_update: 0,
        };
        PARAMS.save(deps.as_mut().storage, &params).unwrap();

        let state = MarketState::new(1000);
        STATE.save(deps.as_mut().storage, &state).unwrap();
    }

    #[test]
    fn test_update_params_unauthorized() {
        let mut deps = mock_dependencies();
        setup_mutable_market(&mut deps);

        let env = mock_env();
        let not_curator = MockApi::default().addr_make("not_curator");
        let info = message_info(&not_curator, &[]);

        let updates = MarketParamsUpdate {
            loan_to_value: None,
            interest_rate_model: None,
            curator_fee: Some(Decimal::percent(10)),
            supply_cap: None,
            borrow_cap: None,
            enabled: None,
        };

        let err = execute_update_params(deps.as_mut(), env, info, updates).unwrap_err();
        assert!(matches!(err, ContractError::Unauthorized));
    }

    #[test]
    fn test_update_curator_fee() {
        let mut deps = mock_dependencies();
        setup_mutable_market(&mut deps);

        let env = mock_env();
        let curator = MockApi::default().addr_make("curator");
        let info = message_info(&curator, &[]);

        let updates = MarketParamsUpdate {
            loan_to_value: None,
            interest_rate_model: None,
            curator_fee: Some(Decimal::percent(20)),
            supply_cap: None,
            borrow_cap: None,
            enabled: None,
        };

        let res = execute_update_params(deps.as_mut(), env, info, updates).unwrap();
        assert!(res.attributes.iter().any(|a| a.key == "curator_fee"));

        let params = PARAMS.load(deps.as_ref().storage).unwrap();
        assert_eq!(params.curator_fee, Decimal::percent(20));
    }

    #[test]
    fn test_update_curator_fee_exceeds_max() {
        let mut deps = mock_dependencies();
        setup_mutable_market(&mut deps);

        let env = mock_env();
        let curator = MockApi::default().addr_make("curator");
        let info = message_info(&curator, &[]);

        let updates = MarketParamsUpdate {
            loan_to_value: None,
            interest_rate_model: None,
            curator_fee: Some(Decimal::percent(30)), // > 25%
            supply_cap: None,
            borrow_cap: None,
            enabled: None,
        };

        let err = execute_update_params(deps.as_mut(), env, info, updates).unwrap_err();
        assert!(matches!(err, ContractError::CuratorFeeExceedsMax));
    }

    #[test]
    fn test_update_ltv_mutable_market() {
        let mut deps = mock_dependencies();
        setup_mutable_market(&mut deps);

        // Set ltv_last_update to far in the past
        let mut params = PARAMS.load(deps.as_ref().storage).unwrap();
        params.ltv_last_update = 0;
        PARAMS.save(deps.as_mut().storage, &params).unwrap();

        let mut env = mock_env();
        env.block.time = cosmwasm_std::Timestamp::from_seconds(LTV_COOLDOWN_SECONDS + 1000);
        let curator = MockApi::default().addr_make("curator");
        let info = message_info(&curator, &[]);

        let updates = MarketParamsUpdate {
            loan_to_value: Some(Decimal::percent(75)), // 80% -> 75% = 5% change
            interest_rate_model: None,
            curator_fee: None,
            supply_cap: None,
            borrow_cap: None,
            enabled: None,
        };

        let res = execute_update_params(deps.as_mut(), env.clone(), info, updates).unwrap();
        assert!(res.attributes.iter().any(|a| a.key == "new_ltv"));

        let params = PARAMS.load(deps.as_ref().storage).unwrap();
        assert_eq!(params.loan_to_value, Decimal::percent(75));
        assert_eq!(params.ltv_last_update, env.block.time.seconds());
    }

    #[test]
    fn test_update_ltv_immutable_market() {
        let mut deps = mock_dependencies();
        setup_mutable_market(&mut deps);

        // Make market immutable
        let mut params = PARAMS.load(deps.as_ref().storage).unwrap();
        params.is_mutable = false;
        PARAMS.save(deps.as_mut().storage, &params).unwrap();

        let env = mock_env();
        let curator = MockApi::default().addr_make("curator");
        let info = message_info(&curator, &[]);

        let updates = MarketParamsUpdate {
            loan_to_value: Some(Decimal::percent(75)),
            interest_rate_model: None,
            curator_fee: None,
            supply_cap: None,
            borrow_cap: None,
            enabled: None,
        };

        let err = execute_update_params(deps.as_mut(), env, info, updates).unwrap_err();
        assert!(matches!(err, ContractError::MarketImmutable));
    }

    #[test]
    fn test_update_ltv_cooldown_not_elapsed() {
        let mut deps = mock_dependencies();
        setup_mutable_market(&mut deps);

        let mut env = mock_env();
        env.block.time = cosmwasm_std::Timestamp::from_seconds(1000);

        // Set recent update
        let mut params = PARAMS.load(deps.as_ref().storage).unwrap();
        params.ltv_last_update = 500; // Only 500 seconds ago
        PARAMS.save(deps.as_mut().storage, &params).unwrap();

        let curator = MockApi::default().addr_make("curator");
        let info = message_info(&curator, &[]);

        let updates = MarketParamsUpdate {
            loan_to_value: Some(Decimal::percent(75)),
            interest_rate_model: None,
            curator_fee: None,
            supply_cap: None,
            borrow_cap: None,
            enabled: None,
        };

        let err = execute_update_params(deps.as_mut(), env, info, updates).unwrap_err();
        assert!(matches!(err, ContractError::LtvCooldownNotElapsed { .. }));
    }

    #[test]
    fn test_update_ltv_exceeds_max_change() {
        let mut deps = mock_dependencies();
        setup_mutable_market(&mut deps);

        let mut env = mock_env();
        env.block.time = cosmwasm_std::Timestamp::from_seconds(LTV_COOLDOWN_SECONDS + 1000);

        let mut params = PARAMS.load(deps.as_ref().storage).unwrap();
        params.ltv_last_update = 0;
        PARAMS.save(deps.as_mut().storage, &params).unwrap();

        let curator = MockApi::default().addr_make("curator");
        let info = message_info(&curator, &[]);

        let updates = MarketParamsUpdate {
            loan_to_value: Some(Decimal::percent(70)), // 80% -> 70% = 10% change > 5%
            interest_rate_model: None,
            curator_fee: None,
            supply_cap: None,
            borrow_cap: None,
            enabled: None,
        };

        let err = execute_update_params(deps.as_mut(), env, info, updates).unwrap_err();
        assert!(matches!(err, ContractError::LtvChangeExceedsMax { .. }));
    }

    #[test]
    fn test_update_enabled() {
        let mut deps = mock_dependencies();
        setup_mutable_market(&mut deps);

        let env = mock_env();
        let curator = MockApi::default().addr_make("curator");
        let info = message_info(&curator, &[]);

        let updates = MarketParamsUpdate {
            loan_to_value: None,
            interest_rate_model: None,
            curator_fee: None,
            supply_cap: None,
            borrow_cap: None,
            enabled: Some(false),
        };

        execute_update_params(deps.as_mut(), env, info, updates).unwrap();

        let params = PARAMS.load(deps.as_ref().storage).unwrap();
        assert!(!params.enabled);
    }

    #[test]
    fn test_update_caps() {
        let mut deps = mock_dependencies();
        setup_mutable_market(&mut deps);

        let env = mock_env();
        let curator = MockApi::default().addr_make("curator");
        let info = message_info(&curator, &[]);

        let updates = MarketParamsUpdate {
            loan_to_value: None,
            interest_rate_model: None,
            curator_fee: None,
            supply_cap: Some(Some(Uint128::new(1000000))),
            borrow_cap: Some(Some(Uint128::new(500000))),
            enabled: None,
        };

        execute_update_params(deps.as_mut(), env, info, updates).unwrap();

        let params = PARAMS.load(deps.as_ref().storage).unwrap();
        assert_eq!(params.supply_cap, Some(Uint128::new(1000000)));
        assert_eq!(params.borrow_cap, Some(Uint128::new(500000)));
    }

    // ============================================================================
    // Claim Fees Tests
    // ============================================================================

    fn setup_market_with_fees(
        deps: &mut cosmwasm_std::OwnedDeps<
            cosmwasm_std::MemoryStorage,
            cosmwasm_std::testing::MockApi,
            cosmwasm_std::testing::MockQuerier,
        >,
        protocol_fees: Uint128,
        curator_fees: Uint128,
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

        // Set up state with some supply (liquidity) available
        // 10000 supply, 5000 debt = 5000 available liquidity
        let mut state = MarketState::new(1000);
        state.total_supply_scaled = Uint128::new(10000);
        state.total_debt_scaled = Uint128::new(5000);
        STATE.save(deps.as_mut().storage, &state).unwrap();

        // Set accrued fees
        if !protocol_fees.is_zero() {
            ACCRUED_PROTOCOL_FEES
                .save(deps.as_mut().storage, &protocol_fees)
                .unwrap();
        }
        if !curator_fees.is_zero() {
            ACCRUED_CURATOR_FEES
                .save(deps.as_mut().storage, &curator_fees)
                .unwrap();
        }
    }

    #[test]
    fn test_claim_fees_by_protocol_collector() {
        let mut deps = mock_dependencies();
        setup_market_with_fees(&mut deps, Uint128::new(1000), Uint128::new(500));

        let mut env = mock_env();
        // Set time to match state creation time (1000) to prevent interest accrual
        env.block.time = cosmwasm_std::Timestamp::from_seconds(1000);
        let collector = MockApi::default().addr_make("collector");
        let info = message_info(&collector, &[]);

        let res = execute_claim_fees(deps.as_mut(), env, info).unwrap();

        // Should have a BankMsg::Send for protocol fees
        assert!(!res.messages.is_empty());
        assert!(res
            .attributes
            .iter()
            .any(|a| a.key == "protocol_claimed" && a.value == "1000"));

        // Protocol fees should be cleared
        let remaining = ACCRUED_PROTOCOL_FEES
            .may_load(deps.as_ref().storage)
            .unwrap()
            .unwrap_or_default();
        assert!(remaining.is_zero());

        // Curator fees should remain
        let curator_remaining = ACCRUED_CURATOR_FEES
            .may_load(deps.as_ref().storage)
            .unwrap()
            .unwrap_or_default();
        assert_eq!(curator_remaining, Uint128::new(500));
    }

    #[test]
    fn test_claim_fees_by_curator() {
        let mut deps = mock_dependencies();
        setup_market_with_fees(&mut deps, Uint128::new(1000), Uint128::new(500));

        let mut env = mock_env();
        // Set time to match state creation time (1000) to prevent interest accrual
        env.block.time = cosmwasm_std::Timestamp::from_seconds(1000);
        let curator = MockApi::default().addr_make("curator");
        let info = message_info(&curator, &[]);

        let res = execute_claim_fees(deps.as_mut(), env, info).unwrap();

        // Should have a BankMsg::Send for curator fees
        assert!(!res.messages.is_empty());
        assert!(res
            .attributes
            .iter()
            .any(|a| a.key == "curator_claimed" && a.value == "500"));

        // Curator fees should be cleared
        let remaining = ACCRUED_CURATOR_FEES
            .may_load(deps.as_ref().storage)
            .unwrap()
            .unwrap_or_default();
        assert!(remaining.is_zero());

        // Protocol fees should remain
        let protocol_remaining = ACCRUED_PROTOCOL_FEES
            .may_load(deps.as_ref().storage)
            .unwrap()
            .unwrap_or_default();
        assert_eq!(protocol_remaining, Uint128::new(1000));
    }

    #[test]
    fn test_claim_fees_unauthorized() {
        let mut deps = mock_dependencies();
        setup_market_with_fees(&mut deps, Uint128::new(1000), Uint128::new(500));

        let env = mock_env();
        let unauthorized = MockApi::default().addr_make("unauthorized");
        let info = message_info(&unauthorized, &[]);

        let err = execute_claim_fees(deps.as_mut(), env, info).unwrap_err();
        assert!(matches!(err, ContractError::Unauthorized));
    }

    #[test]
    fn test_claim_fees_insufficient_liquidity() {
        let mut deps = mock_dependencies();
        // Set up with 5000 available liquidity (10000 supply - 5000 debt)
        setup_market_with_fees(&mut deps, Uint128::new(1000), Uint128::new(500));

        // Now let's set up a scenario where available liquidity is less than fees
        // This requires more debt than supply, which is unusual but let's test with partial claim
        let mut state = STATE.load(deps.as_ref().storage).unwrap();
        state.total_debt_scaled = Uint128::new(9500); // Only 500 available
        STATE.save(deps.as_mut().storage, &state).unwrap();

        let mut env = mock_env();
        // Set time to match state creation time (1000) to prevent interest accrual
        env.block.time = cosmwasm_std::Timestamp::from_seconds(1000);
        let collector = MockApi::default().addr_make("collector");
        let info = message_info(&collector, &[]);

        // Protocol collector can only claim up to available liquidity
        let res = execute_claim_fees(deps.as_mut(), env, info).unwrap();

        // Should claim min(protocol_fees, available) = min(1000, 500) = 500
        assert!(res
            .attributes
            .iter()
            .any(|a| a.key == "protocol_claimed" && a.value == "500"));

        // Remaining protocol fees
        let remaining = ACCRUED_PROTOCOL_FEES
            .may_load(deps.as_ref().storage)
            .unwrap()
            .unwrap_or_default();
        assert_eq!(remaining, Uint128::new(500)); // 1000 - 500 = 500 remaining
    }

    #[test]
    fn test_claim_fees_zero_liquidity() {
        let mut deps = mock_dependencies();
        // Set up with 0 available liquidity (100% utilization)
        setup_market_with_fees(&mut deps, Uint128::new(1000), Uint128::new(500));

        let mut state = STATE.load(deps.as_ref().storage).unwrap();
        state.total_debt_scaled = Uint128::new(10000); // 100% utilization
        STATE.save(deps.as_mut().storage, &state).unwrap();

        let mut env = mock_env();
        // Set time to match state creation time (1000) to prevent interest accrual
        env.block.time = cosmwasm_std::Timestamp::from_seconds(1000);
        let collector = MockApi::default().addr_make("collector");
        let info = message_info(&collector, &[]);

        // Should fail because no liquidity available
        let err = execute_claim_fees(deps.as_mut(), env, info).unwrap_err();
        assert!(matches!(err, ContractError::Std(_)));
    }

    #[test]
    fn test_claim_fees_partial_remaining() {
        let mut deps = mock_dependencies();
        // Set up with fees but limited liquidity
        setup_market_with_fees(&mut deps, Uint128::new(1000), Uint128::new(500));

        let mut env = mock_env();
        // Set time to match state creation time (1000) to prevent interest accrual
        env.block.time = cosmwasm_std::Timestamp::from_seconds(1000);
        let collector = MockApi::default().addr_make("collector");
        let info = message_info(&collector, &[]);

        let res = execute_claim_fees(deps.as_mut(), env, info).unwrap();

        // Check that remaining fees are reported correctly
        assert!(res
            .attributes
            .iter()
            .any(|a| a.key == "accrued_protocol_remaining" && a.value == "0"));
        assert!(res
            .attributes
            .iter()
            .any(|a| a.key == "accrued_curator_remaining" && a.value == "500"));
    }

    #[test]
    fn test_accrue_interest_emits_accrued_fees() {
        let mut deps = mock_dependencies();
        setup_market_with_fees(&mut deps, Uint128::new(1000), Uint128::new(500));

        // Set time to the same as state creation to prevent interest accrual
        let mut env = mock_env();
        env.block.time = cosmwasm_std::Timestamp::from_seconds(1000); // Same as state.created_at

        let res = execute_accrue_interest(deps.as_mut(), env).unwrap();

        // Should emit accrued fees in attributes (fees unchanged since no time elapsed)
        assert!(res
            .attributes
            .iter()
            .any(|a| a.key == "accrued_protocol_fees" && a.value == "1000"));
        assert!(res
            .attributes
            .iter()
            .any(|a| a.key == "accrued_curator_fees" && a.value == "500"));
    }
}
