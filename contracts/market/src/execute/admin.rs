use cosmwasm_std::{Decimal, DepsMut, Env, MessageInfo, Response};

use crate::error::ContractError;
use crate::state::{CONFIG, PARAMS};
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
    let fee_messages =
        crate::interest::apply_accumulated_interest(deps.storage, env.block.time.seconds())?;

    // Load updated state to emit in events
    let state = crate::state::STATE.load(deps.storage)?;

    Ok(Response::new()
        .add_messages(fee_messages)
        .add_attribute("action", "accrue_interest")
        .add_attribute("borrow_index", state.borrow_index.to_string())
        .add_attribute("liquidity_index", state.liquidity_index.to_string())
        .add_attribute("borrow_rate", state.borrow_rate.to_string())
        .add_attribute("liquidity_rate", state.liquidity_rate.to_string())
        .add_attribute("last_update", state.last_update.to_string()))
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
}
