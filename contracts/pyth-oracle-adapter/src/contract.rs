//! Contract entry points for the Pyth oracle adapter.

use cosmwasm_std::{
    entry_point, to_json_binary, Binary, Decimal, Deps, DepsMut, Env, MessageInfo, Response,
};

use crate::error::ContractError;
use crate::msg::{ExecuteMsg, InstantiateMsg, QueryMsg};
use crate::state::{CONTRACT_NAME, CONTRACT_VERSION};

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    _msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    // Set contract version for migration tracking
    cw2::set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    // TODO: Implement full instantiation logic
    // - Validate owner address
    // - Validate pyth_contract_addr
    // - Set config
    // - Initialize price feeds

    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("contract", CONTRACT_NAME))
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::SetPriceFeed { denom, feed_id } => {
            execute_set_price_feed(deps, env, info, denom, feed_id)
        }
        ExecuteMsg::RemovePriceFeed { denom } => {
            execute_remove_price_feed(deps, env, info, denom)
        }
        ExecuteMsg::UpdateConfig {
            pyth_contract_addr,
            max_confidence_ratio,
        } => execute_update_config(deps, env, info, pyth_contract_addr, max_confidence_ratio),
        ExecuteMsg::TransferOwnership { new_owner } => {
            execute_transfer_ownership(deps, env, info, new_owner)
        }
        ExecuteMsg::AcceptOwnership {} => execute_accept_ownership(deps, env, info),
    }
}

fn execute_set_price_feed(
    _deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    _denom: String,
    _feed_id: String,
) -> Result<Response, ContractError> {
    // TODO: Implement
    // - Check authorization (only owner)
    // - Validate feed_id format (64-char hex)
    // - Save to PRICE_FEEDS
    unimplemented!("SetPriceFeed not yet implemented")
}

fn execute_remove_price_feed(
    _deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    _denom: String,
) -> Result<Response, ContractError> {
    // TODO: Implement
    // - Check authorization (only owner)
    // - Remove from PRICE_FEEDS
    unimplemented!("RemovePriceFeed not yet implemented")
}

fn execute_update_config(
    _deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    _pyth_contract_addr: Option<String>,
    _max_confidence_ratio: Option<Decimal>,
) -> Result<Response, ContractError> {
    // TODO: Implement
    // - Check authorization (only owner)
    // - Validate and update config fields
    unimplemented!("UpdateConfig not yet implemented")
}

fn execute_transfer_ownership(
    _deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    _new_owner: String,
) -> Result<Response, ContractError> {
    // TODO: Implement
    // - Check authorization (only owner)
    // - Validate new_owner address
    // - Set PENDING_OWNER
    unimplemented!("TransferOwnership not yet implemented")
}

fn execute_accept_ownership(
    _deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
) -> Result<Response, ContractError> {
    // TODO: Implement
    // - Check caller is PENDING_OWNER
    // - Update owner in CONFIG
    // - Clear PENDING_OWNER
    unimplemented!("AcceptOwnership not yet implemented")
}

#[entry_point]
pub fn query(deps: Deps, env: Env, msg: QueryMsg) -> Result<Binary, ContractError> {
    let result = match msg {
        QueryMsg::Price { denom } => to_json_binary(&query_price(deps, env, denom)?)?,
        QueryMsg::Config {} => to_json_binary(&query_config(deps)?)?,
        QueryMsg::PriceFeed { denom } => to_json_binary(&query_price_feed(deps, denom)?)?,
        QueryMsg::AllPriceFeeds { start_after, limit } => {
            to_json_binary(&query_all_price_feeds(deps, start_after, limit)?)?
        }
    };

    Ok(result)
}

fn query_price(
    _deps: Deps,
    _env: Env,
    _denom: String,
) -> Result<stone_types::PriceResponse, ContractError> {
    // TODO: Implement
    // - Look up feed_id for denom
    // - Query Pyth contract for price
    // - Validate confidence ratio
    // - Validate timestamp freshness
    // - Convert to PriceResponse
    unimplemented!("Price query not yet implemented")
}

fn query_config(_deps: Deps) -> Result<crate::msg::ConfigResponse, ContractError> {
    // TODO: Implement
    // - Load CONFIG
    // - Return as ConfigResponse
    unimplemented!("Config query not yet implemented")
}

fn query_price_feed(
    _deps: Deps,
    _denom: String,
) -> Result<crate::msg::PriceFeedInfo, ContractError> {
    // TODO: Implement
    // - Load price feed for denom
    // - Return as PriceFeedInfo
    unimplemented!("PriceFeed query not yet implemented")
}

fn query_all_price_feeds(
    _deps: Deps,
    _start_after: Option<String>,
    _limit: Option<u32>,
) -> Result<Vec<crate::msg::PriceFeedInfo>, ContractError> {
    // TODO: Implement
    // - Iterate over PRICE_FEEDS with pagination
    // - Return as Vec<PriceFeedInfo>
    unimplemented!("AllPriceFeeds query not yet implemented")
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{message_info, mock_dependencies, mock_env, MockApi};

    fn test_addrs() -> (cosmwasm_std::Addr, cosmwasm_std::Addr) {
        let api = MockApi::default();
        (api.addr_make("owner"), api.addr_make("pyth"))
    }

    #[test]
    fn test_instantiate_stub() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, pyth) = test_addrs();
        let info = message_info(&owner, &[]);

        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: cosmwasm_std::Decimal::percent(1),
            price_feeds: vec![],
        };

        let res = instantiate(deps.as_mut(), env, info, msg).unwrap();
        assert_eq!(res.attributes.len(), 2);
        assert!(res.attributes.iter().any(|a| a.key == "action" && a.value == "instantiate"));
    }

}
