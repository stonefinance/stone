use cosmwasm_std::{entry_point, Binary, Deps, DepsMut, Env, MessageInfo, Reply, Response};

use stone_types::{FactoryExecuteMsg, FactoryInstantiateMsg, FactoryQueryMsg};

use crate::error::ContractError;
use crate::execute::{
    accept_ownership, create_market, handle_instantiate_reply, transfer_ownership, update_config,
    update_market_code_id, INSTANTIATE_REPLY_ID,
};
use crate::query;
use crate::state::{CONFIG, CONTRACT_NAME, CONTRACT_VERSION, MARKET_COUNT};
use stone_types::FactoryConfig;

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: FactoryInstantiateMsg,
) -> Result<Response, ContractError> {
    cw2::set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    let config = FactoryConfig {
        owner: deps.api.addr_validate(&msg.owner)?,
        protocol_fee_collector: deps.api.addr_validate(&msg.protocol_fee_collector)?,
        market_creation_fee: msg.market_creation_fee,
        market_code_id: msg.market_code_id,
    };

    CONFIG.save(deps.storage, &config)?;
    MARKET_COUNT.save(deps.storage, &0)?;

    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("owner", config.owner)
        .add_attribute("market_code_id", config.market_code_id.to_string()))
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: FactoryExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        FactoryExecuteMsg::CreateMarket {
            collateral_denom,
            debt_denom,
            oracle,
            params,
            salt,
        } => create_market(deps, env, info, collateral_denom, debt_denom, oracle, params, salt),
        FactoryExecuteMsg::UpdateConfig {
            protocol_fee_collector,
            market_creation_fee,
        } => update_config(deps, info, protocol_fee_collector, market_creation_fee),
        FactoryExecuteMsg::UpdateMarketCodeId { code_id } => {
            update_market_code_id(deps, info, code_id)
        }
        FactoryExecuteMsg::TransferOwnership { new_owner } => {
            transfer_ownership(deps, info, new_owner)
        }
        FactoryExecuteMsg::AcceptOwnership {} => accept_ownership(deps, info),
    }
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: FactoryQueryMsg) -> Result<Binary, ContractError> {
    use cosmwasm_std::to_json_binary;

    let result = match msg {
        FactoryQueryMsg::Config {} => to_json_binary(&query::config(deps)?)?,
        FactoryQueryMsg::Market { market_id } => to_json_binary(&query::market(deps, market_id)?)?,
        FactoryQueryMsg::MarketByAddress { address } => {
            to_json_binary(&query::market_by_address(deps, address)?)?
        }
        FactoryQueryMsg::Markets { start_after, limit } => {
            to_json_binary(&query::markets(deps, start_after, limit)?)?
        }
        FactoryQueryMsg::MarketsByCurator {
            curator,
            start_after,
            limit,
        } => to_json_binary(&query::markets_by_curator(deps, curator, start_after, limit)?)?,
        FactoryQueryMsg::MarketsByCollateral {
            collateral_denom,
            start_after,
            limit,
        } => to_json_binary(&query::markets_by_collateral(
            deps,
            collateral_denom,
            start_after,
            limit,
        )?)?,
        FactoryQueryMsg::MarketsByDebt {
            debt_denom,
            start_after,
            limit,
        } => to_json_binary(&query::markets_by_debt(deps, debt_denom, start_after, limit)?)?,
        FactoryQueryMsg::MarketCount {} => to_json_binary(&query::market_count(deps)?)?,
        FactoryQueryMsg::ComputeMarketId {
            collateral_denom,
            debt_denom,
            curator,
            salt,
        } => to_json_binary(&query::compute_market_id_query(
            collateral_denom,
            debt_denom,
            curator,
            salt,
        ))?,
    };

    Ok(result)
}

#[entry_point]
pub fn reply(deps: DepsMut, env: Env, msg: Reply) -> Result<Response, ContractError> {
    match msg.id {
        INSTANTIATE_REPLY_ID => handle_instantiate_reply(deps, env, msg),
        id => Err(ContractError::Std(cosmwasm_std::StdError::generic_err(
            format!("Unknown reply id: {}", id),
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{message_info, mock_dependencies, mock_env, MockApi};
    use cosmwasm_std::{from_json, Coin, Uint128};
    use stone_types::FactoryConfigResponse;

    #[test]
    fn test_instantiate() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let api = MockApi::default();
        let creator = api.addr_make("creator");
        let owner = api.addr_make("owner");
        let collector = api.addr_make("collector");
        let info = message_info(&creator, &[]);

        let msg = FactoryInstantiateMsg {
            owner: owner.to_string(),
            protocol_fee_collector: collector.to_string(),
            market_creation_fee: Coin {
                denom: "uosmo".to_string(),
                amount: Uint128::new(1000000),
            },
            market_code_id: 1,
        };

        let res = instantiate(deps.as_mut(), env, info, msg).unwrap();
        assert_eq!(res.attributes.len(), 3);

        // Verify config was saved
        let config = CONFIG.load(deps.as_ref().storage).unwrap();
        assert_eq!(config.owner, owner);
        assert_eq!(config.market_code_id, 1);
    }

    #[test]
    fn test_query_config() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let api = MockApi::default();
        let creator = api.addr_make("creator");
        let owner = api.addr_make("owner");
        let collector = api.addr_make("collector");
        let info = message_info(&creator, &[]);

        let msg = FactoryInstantiateMsg {
            owner: owner.to_string(),
            protocol_fee_collector: collector.to_string(),
            market_creation_fee: Coin {
                denom: "uosmo".to_string(),
                amount: Uint128::new(1000000),
            },
            market_code_id: 42,
        };
        instantiate(deps.as_mut(), env.clone(), info, msg).unwrap();

        let query_msg = FactoryQueryMsg::Config {};
        let res = query(deps.as_ref(), env, query_msg).unwrap();
        let config: FactoryConfigResponse = from_json(res).unwrap();

        assert_eq!(config.owner, owner.to_string());
        assert_eq!(config.market_code_id, 42);
    }
}
