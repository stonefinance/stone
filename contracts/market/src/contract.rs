use cosmwasm_std::{
    entry_point, to_json_binary, Binary, Deps, DepsMut, Env, MessageInfo, Response,
};

use stone_types::{
    MarketConfig, MarketExecuteMsg, MarketInstantiateMsg, MarketParams, MarketQueryMsg, MarketState,
};

use crate::error::ContractError;
use crate::execute;
use crate::query;
use crate::state::{CONFIG, CONTRACT_NAME, CONTRACT_VERSION, PARAMS, STATE};

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: MarketInstantiateMsg,
) -> Result<Response, ContractError> {
    cw2::set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    let config = MarketConfig {
        factory: info.sender.clone(), // Factory is the one instantiating
        curator: deps.api.addr_validate(&msg.curator)?,
        oracle_config: msg.oracle_config.validate(deps.api)?,
        collateral_denom: msg.collateral_denom,
        debt_denom: msg.debt_denom,
        protocol_fee_collector: deps.api.addr_validate(&msg.protocol_fee_collector)?,
    };

    let params = MarketParams {
        loan_to_value: msg.params.loan_to_value,
        liquidation_threshold: msg.params.liquidation_threshold,
        liquidation_bonus: msg.params.liquidation_bonus,
        liquidation_protocol_fee: msg.params.liquidation_protocol_fee,
        close_factor: msg.params.close_factor,
        interest_rate_model: msg.params.interest_rate_model,
        protocol_fee: msg.params.protocol_fee,
        curator_fee: msg.params.curator_fee,
        supply_cap: msg.params.supply_cap,
        borrow_cap: msg.params.borrow_cap,
        enabled: true,
        is_mutable: msg.params.is_mutable,
        ltv_last_update: env.block.time.seconds(),
    };

    let state = MarketState::new(env.block.time.seconds());

    CONFIG.save(deps.storage, &config)?;
    PARAMS.save(deps.storage, &params)?;
    STATE.save(deps.storage, &state)?;

    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("factory", info.sender)
        .add_attribute("curator", config.curator)
        .add_attribute("collateral_denom", config.collateral_denom)
        .add_attribute("debt_denom", config.debt_denom))
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: MarketExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        MarketExecuteMsg::Supply { recipient } => {
            execute::execute_supply(deps, env, info, recipient)
        }
        MarketExecuteMsg::Withdraw { amount, recipient } => {
            execute::execute_withdraw(deps, env, info, amount, recipient)
        }
        MarketExecuteMsg::SupplyCollateral { recipient } => {
            execute::execute_supply_collateral(deps, env, info, recipient)
        }
        MarketExecuteMsg::WithdrawCollateral { amount, recipient } => {
            execute::execute_withdraw_collateral(deps, env, info, amount, recipient)
        }
        MarketExecuteMsg::Borrow { amount, recipient } => {
            execute::execute_borrow(deps, env, info, amount, recipient)
        }
        MarketExecuteMsg::Repay { on_behalf_of } => {
            execute::execute_repay(deps, env, info, on_behalf_of)
        }
        MarketExecuteMsg::Liquidate { borrower } => {
            execute::execute_liquidate(deps, env, info, borrower)
        }
        MarketExecuteMsg::UpdateParams { updates } => {
            execute::execute_update_params(deps, env, info, updates)
        }
        MarketExecuteMsg::AccrueInterest {} => execute::execute_accrue_interest(deps, env),
    }
}

#[entry_point]
pub fn query(deps: Deps, env: Env, msg: MarketQueryMsg) -> Result<Binary, ContractError> {
    let result = match msg {
        MarketQueryMsg::Config {} => to_json_binary(&query::config(deps)?)?,
        MarketQueryMsg::Params {} => to_json_binary(&query::params(deps)?)?,
        MarketQueryMsg::State {} => to_json_binary(&query::state(deps)?)?,
        MarketQueryMsg::UserPosition { user } => {
            to_json_binary(&query::user_position(deps, env, user)?)?
        }
        MarketQueryMsg::UserSupply { user } => {
            to_json_binary(&query::user_supply(deps, env, user)?)?
        }
        MarketQueryMsg::UserCollateral { user } => {
            to_json_binary(&query::user_collateral(deps, env, user)?)?
        }
        MarketQueryMsg::UserDebt { user } => to_json_binary(&query::user_debt(deps, env, user)?)?,
        MarketQueryMsg::IsLiquidatable { user } => {
            to_json_binary(&query::query_is_liquidatable(deps, env, user)?)?
        }
    };

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{message_info, mock_dependencies, mock_env, MockApi};
    use cosmwasm_std::{from_json, Decimal};
    use stone_types::{
        CreateMarketParams, InterestRateModel, MarketConfigResponse, OracleConfigUnchecked,
        OracleType,
    };

    fn test_addrs() -> (
        cosmwasm_std::Addr,
        cosmwasm_std::Addr,
        cosmwasm_std::Addr,
        cosmwasm_std::Addr,
    ) {
        let api = MockApi::default();
        (
            api.addr_make("factory"),
            api.addr_make("curator"),
            api.addr_make("oracle"),
            api.addr_make("collector"),
        )
    }

    fn default_instantiate_msg() -> MarketInstantiateMsg {
        let (_, curator, oracle, collector) = test_addrs();
        MarketInstantiateMsg {
            curator: curator.to_string(),
            oracle_config: OracleConfigUnchecked {
                address: oracle.to_string(),
                oracle_type: OracleType::Generic {
                    expected_code_id: None,
                    max_staleness_secs: 300,
                },
            },
            collateral_denom: "uatom".to_string(),
            debt_denom: "uusdc".to_string(),
            protocol_fee_collector: collector.to_string(),
            params: CreateMarketParams {
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
                is_mutable: false,
            },
        }
    }

    #[test]
    fn test_instantiate() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (factory, curator, ..) = test_addrs();
        let info = message_info(&factory, &[]);

        let msg = default_instantiate_msg();
        let res = instantiate(deps.as_mut(), env, info, msg).unwrap();

        assert_eq!(res.attributes.len(), 5);

        // Verify config
        let config = CONFIG.load(deps.as_ref().storage).unwrap();
        assert_eq!(config.factory, factory);
        assert_eq!(config.curator, curator);

        // Verify params
        let params = PARAMS.load(deps.as_ref().storage).unwrap();
        assert_eq!(params.loan_to_value, Decimal::percent(80));
        assert!(params.enabled);

        // Verify state
        let state = STATE.load(deps.as_ref().storage).unwrap();
        assert_eq!(state.borrow_index, Decimal::one());
    }

    #[test]
    fn test_query_config() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (factory, curator, oracle, _) = test_addrs();
        let info = message_info(&factory, &[]);

        let msg = default_instantiate_msg();
        instantiate(deps.as_mut(), env.clone(), info, msg).unwrap();

        let query_msg = MarketQueryMsg::Config {};
        let res = query(deps.as_ref(), env, query_msg).unwrap();
        let config: MarketConfigResponse = from_json(res).unwrap();

        assert_eq!(config.factory, factory.to_string());
        assert_eq!(config.curator, curator.to_string());
        assert_eq!(config.oracle, oracle.to_string());
    }
}
