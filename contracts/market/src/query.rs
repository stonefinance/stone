use cosmwasm_std::{Decimal, Deps, Env};

use crate::error::ContractResult;
use crate::health::{
    calculate_health_factor, calculate_liquidation_price, calculate_max_borrow, is_liquidatable,
    query_price,
};
use crate::interest::{get_user_collateral, get_user_debt, get_user_supply};
use crate::state::{CONFIG, PARAMS, STATE};
use stone_types::{
    IsLiquidatableResponse, MarketConfigResponse, MarketParamsResponse, MarketStateResponse,
    UserBalanceResponse, UserPositionResponse,
};

pub fn config(deps: Deps) -> ContractResult<MarketConfigResponse> {
    let config = CONFIG.load(deps.storage)?;
    Ok(MarketConfigResponse {
        factory: config.factory.to_string(),
        curator: config.curator.to_string(),
        oracle: config.oracle_config.address.to_string(),
        oracle_type: config.oracle_config.oracle_type,
        collateral_denom: config.collateral_denom,
        debt_denom: config.debt_denom,
        protocol_fee_collector: config.protocol_fee_collector.to_string(),
        salt: config.salt,
    })
}

pub fn params(deps: Deps) -> ContractResult<MarketParamsResponse> {
    let params = PARAMS.load(deps.storage)?;
    Ok(MarketParamsResponse {
        loan_to_value: params.loan_to_value,
        liquidation_threshold: params.liquidation_threshold,
        liquidation_bonus: params.liquidation_bonus,
        liquidation_protocol_fee: params.liquidation_protocol_fee,
        close_factor: params.close_factor,
        interest_rate_model: params.interest_rate_model,
        protocol_fee: params.protocol_fee,
        curator_fee: params.curator_fee,
        supply_cap: params.supply_cap,
        borrow_cap: params.borrow_cap,
        enabled: params.enabled,
        is_mutable: params.is_mutable,
        ltv_last_update: params.ltv_last_update,
    })
}

pub fn state(deps: Deps) -> ContractResult<MarketStateResponse> {
    let state = STATE.load(deps.storage)?;
    Ok(MarketStateResponse {
        borrow_index: state.borrow_index,
        liquidity_index: state.liquidity_index,
        borrow_rate: state.borrow_rate,
        liquidity_rate: state.liquidity_rate,
        total_supply: state.total_supply(),
        total_supply_scaled: state.total_supply_scaled,
        total_debt: state.total_debt(),
        total_debt_scaled: state.total_debt_scaled,
        total_collateral: state.total_collateral,
        utilization: state.utilization(),
        available_liquidity: state.available_liquidity(),
        last_update: state.last_update,
        created_at: state.created_at,
    })
}

pub fn user_position(
    deps: Deps,
    env: Env,
    user: String,
) -> ContractResult<UserPositionResponse> {
    let config = CONFIG.load(deps.storage)?;

    let user_addr = deps.api.addr_validate(&user)?;
    let user_str = user_addr.as_str();

    // Get user balances
    let collateral_amount = get_user_collateral(deps.storage, user_str)
        .map_err(|e| cosmwasm_std::StdError::generic_err(e.to_string()))?;
    let supply_amount = get_user_supply(deps.storage, user_str)
        .map_err(|e| cosmwasm_std::StdError::generic_err(e.to_string()))?;
    let debt_amount = get_user_debt(deps.storage, user_str)
        .map_err(|e| cosmwasm_std::StdError::generic_err(e.to_string()))?;

    // Get prices (propagate oracle errors for consistency with health_factor query)
    let collateral_price =
        query_price(deps, &env, &config.oracle_config, &config.collateral_denom)?;
    let debt_price = query_price(deps, &env, &config.oracle_config, &config.debt_denom)?;

    // Calculate values
    let collateral_value = Decimal::from_ratio(collateral_amount, 1u128) * collateral_price;
    let supply_value = Decimal::from_ratio(supply_amount, 1u128) * debt_price;
    let debt_value = Decimal::from_ratio(debt_amount, 1u128) * debt_price;

    // Calculate health factor
    let health_factor = calculate_health_factor(deps, &env, user_str)
        .map_err(|e| cosmwasm_std::StdError::generic_err(e.to_string()))?;

    // Calculate max borrow
    let max_borrow = calculate_max_borrow(deps, &env, user_str)
        .map_err(|e| cosmwasm_std::StdError::generic_err(e.to_string()))?;
    let max_borrow_value = Decimal::from_ratio(max_borrow, 1u128) * debt_price;

    // Calculate liquidation price
    let liquidation_price = calculate_liquidation_price(deps, &env, user_str)
        .map_err(|e| cosmwasm_std::StdError::generic_err(e.to_string()))?;

    Ok(UserPositionResponse {
        collateral_amount,
        collateral_value,
        supply_amount,
        supply_value,
        debt_amount,
        debt_value,
        health_factor,
        max_borrow_value,
        liquidation_price,
    })
}

pub fn user_supply(deps: Deps, env: Env, user: String) -> ContractResult<UserBalanceResponse> {
    let config = CONFIG.load(deps.storage)?;
    let state = STATE.load(deps.storage)?;

    let user_addr = deps.api.addr_validate(&user)?;

    let scaled = crate::state::SUPPLIES
        .may_load(deps.storage, user_addr.as_str())?
        .unwrap_or_default();
    let amount = stone_types::scaled_to_amount(scaled, state.liquidity_index);

    let debt_price = query_price(deps, &env, &config.oracle_config, &config.debt_denom)
        .unwrap_or(Decimal::zero());
    let value = Decimal::from_ratio(amount, 1u128) * debt_price;

    Ok(UserBalanceResponse {
        scaled,
        amount,
        value,
    })
}

pub fn user_collateral(deps: Deps, env: Env, user: String) -> ContractResult<UserBalanceResponse> {
    let config = CONFIG.load(deps.storage)?;

    let user_addr = deps.api.addr_validate(&user)?;

    let amount = crate::state::COLLATERAL
        .may_load(deps.storage, user_addr.as_str())?
        .unwrap_or_default();

    let collateral_price =
        query_price(deps, &env, &config.oracle_config, &config.collateral_denom)
            .unwrap_or(Decimal::zero());
    let value = Decimal::from_ratio(amount, 1u128) * collateral_price;

    Ok(UserBalanceResponse {
        scaled: amount, // Collateral is not scaled
        amount,
        value,
    })
}

pub fn user_debt(deps: Deps, env: Env, user: String) -> ContractResult<UserBalanceResponse> {
    let config = CONFIG.load(deps.storage)?;
    let state = STATE.load(deps.storage)?;

    let user_addr = deps.api.addr_validate(&user)?;

    let scaled = crate::state::DEBTS
        .may_load(deps.storage, user_addr.as_str())?
        .unwrap_or_default();
    let amount = stone_types::scaled_to_amount(scaled, state.borrow_index);

    let debt_price = query_price(deps, &env, &config.oracle_config, &config.debt_denom)
        .unwrap_or(Decimal::zero());
    let value = Decimal::from_ratio(amount, 1u128) * debt_price;

    Ok(UserBalanceResponse {
        scaled,
        amount,
        value,
    })
}

pub fn query_is_liquidatable(
    deps: Deps,
    env: Env,
    user: String,
) -> ContractResult<IsLiquidatableResponse> {
    let user_addr = deps.api.addr_validate(&user)?;

    let liquidatable = is_liquidatable(deps, &env, user_addr.as_str())
        .map_err(|e| cosmwasm_std::StdError::generic_err(e.to_string()))?;

    let health_factor = calculate_health_factor(deps, &env, user_addr.as_str())
        .map_err(|e| cosmwasm_std::StdError::generic_err(e.to_string()))?;

    let shortfall = match health_factor {
        Some(hf) if hf < Decimal::one() => Decimal::one() - hf,
        _ => Decimal::zero(),
    };

    Ok(IsLiquidatableResponse {
        is_liquidatable: liquidatable,
        health_factor,
        shortfall,
    })
}

/// Query accrued protocol and curator fees.
///
/// # Note
/// This query returns values that do NOT include un-accrued interest. In CosmWasm,
/// queries cannot write state, so interest is not applied when querying. The returned
/// values reflect only fees that have already been accrued to state. To get the most
/// current values, call `AccrueInterest` execute msg first, then query.
pub fn accrued_fees(deps: Deps) -> ContractResult<stone_types::AccruedFeesResponse> {
    let accrued_protocol = crate::state::ACCRUED_PROTOCOL_FEES
        .may_load(deps.storage)?
        .unwrap_or_default();
    let accrued_curator = crate::state::ACCRUED_CURATOR_FEES
        .may_load(deps.storage)?
        .unwrap_or_default();

    Ok(stone_types::AccruedFeesResponse {
        accrued_protocol_fees: accrued_protocol,
        accrued_curator_fees: accrued_curator,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{mock_dependencies, mock_env, MockApi, MockQuerier};
    use cosmwasm_std::{from_json, to_json_binary, ContractResult, QuerierResult, WasmQuery};
    use cosmwasm_std::{Timestamp, Uint128};
    use stone_types::{
        InterestRateModel, MarketConfig, MarketParams, MarketState, OracleConfig, OracleType,
        OracleQueryMsg, PriceResponse,
    };

    // Base timestamp for tests (~Nov 2023)
    const BASE_TIMESTAMP: u64 = 1_700_000_000;

    fn mock_env_at_time(time: u64) -> Env {
        let mut env = mock_env();
        env.block.time = Timestamp::from_seconds(time);
        env
    }

    fn setup_market(
        deps: &mut cosmwasm_std::OwnedDeps<
            cosmwasm_std::MemoryStorage,
            cosmwasm_std::testing::MockApi,
            MockQuerier,
        >,
    ) -> cosmwasm_std::Addr {
        let api = MockApi::default();
        let curator = api.addr_make("curator");
        let oracle_addr = api.addr_make("oracle");
        let config = MarketConfig {
            factory: api.addr_make("factory"),
            curator: curator.clone(),
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
        state.total_supply_scaled = Uint128::new(10000);
        state.total_debt_scaled = Uint128::new(5000);
        state.total_collateral = Uint128::new(2000);
        STATE.save(deps.as_mut().storage, &state).unwrap();

        // Setup oracle mock with realistic timestamp
        let oracle_str = oracle_addr.to_string();
        deps.querier.update_wasm(move |query| match query {
            WasmQuery::Smart { contract_addr, msg } if *contract_addr == oracle_str => {
                let query_msg: OracleQueryMsg = from_json(msg).unwrap();
                match query_msg {
                    OracleQueryMsg::Price { denom } => {
                        let price = if denom == "uatom" {
                            Decimal::from_ratio(10u128, 1u128) // $10 per collateral
                        } else {
                            Decimal::one() // $1 per debt
                        };
                        let response = PriceResponse {
                            denom,
                            price,
                            updated_at: BASE_TIMESTAMP,
                        };
                        QuerierResult::Ok(ContractResult::Ok(to_json_binary(&response).unwrap()))
                    }
                }
            }
            _ => QuerierResult::Err(cosmwasm_std::SystemError::UnsupportedRequest {
                kind: "unknown".to_string(),
            }),
        });

        curator
    }

    #[test]
    fn test_query_config() {
        let mut deps = mock_dependencies();
        let curator = setup_market(&mut deps);

        let result = config(deps.as_ref()).unwrap();
        assert_eq!(result.curator, curator.to_string());
        assert_eq!(result.collateral_denom, "uatom");
        assert_eq!(result.debt_denom, "uusdc");
    }

    #[test]
    fn test_query_params() {
        let mut deps = mock_dependencies();
        let _curator = setup_market(&mut deps);

        let result = params(deps.as_ref()).unwrap();
        assert_eq!(result.loan_to_value, Decimal::percent(80));
        assert_eq!(result.liquidation_threshold, Decimal::percent(85));
        assert!(result.enabled);
    }

    #[test]
    fn test_query_state() {
        let mut deps = mock_dependencies();
        let _curator = setup_market(&mut deps);

        let result = state(deps.as_ref()).unwrap();
        assert_eq!(result.borrow_index, Decimal::one());
        assert_eq!(result.total_supply_scaled, Uint128::new(10000));
        assert_eq!(result.total_debt_scaled, Uint128::new(5000));
        assert_eq!(result.total_collateral, Uint128::new(2000));
    }

    #[test]
    fn test_query_user_supply() {
        let mut deps = mock_dependencies();
        let _curator = setup_market(&mut deps);

        let api = MockApi::default();
        let user1 = api.addr_make("user1");

        crate::state::SUPPLIES
            .save(deps.as_mut().storage, user1.as_str(), &Uint128::new(1000))
            .unwrap();

        let env = mock_env_at_time(BASE_TIMESTAMP);
        let result = user_supply(deps.as_ref(), env, user1.to_string()).unwrap();
        assert_eq!(result.scaled, Uint128::new(1000));
        assert_eq!(result.amount, Uint128::new(1000)); // index = 1
    }

    #[test]
    fn test_query_user_collateral() {
        let mut deps = mock_dependencies();
        let _curator = setup_market(&mut deps);

        let api = MockApi::default();
        let user1 = api.addr_make("user1");

        crate::state::COLLATERAL
            .save(deps.as_mut().storage, user1.as_str(), &Uint128::new(500))
            .unwrap();

        let env = mock_env_at_time(BASE_TIMESTAMP);
        let result = user_collateral(deps.as_ref(), env, user1.to_string()).unwrap();
        assert_eq!(result.amount, Uint128::new(500));
    }

    #[test]
    fn test_query_user_debt() {
        let mut deps = mock_dependencies();
        let _curator = setup_market(&mut deps);

        let api = MockApi::default();
        let user1 = api.addr_make("user1");

        crate::state::DEBTS
            .save(deps.as_mut().storage, user1.as_str(), &Uint128::new(200))
            .unwrap();

        let env = mock_env_at_time(BASE_TIMESTAMP);
        let result = user_debt(deps.as_ref(), env, user1.to_string()).unwrap();
        assert_eq!(result.scaled, Uint128::new(200));
        assert_eq!(result.amount, Uint128::new(200)); // index = 1
    }
}
