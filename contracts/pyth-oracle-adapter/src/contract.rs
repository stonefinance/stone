//! Contract entry points for the Pyth oracle adapter.

use std::collections::HashSet;

use cosmwasm_std::{
    entry_point, to_json_binary, Binary, Decimal, Deps, DepsMut, Env, MessageInfo, Response, StdResult, Empty,
};

use crate::error::ContractError;
use crate::msg::{ExecuteMsg, InstantiateMsg, QueryMsg};
use crate::pyth_types::{PriceFeedResponse, PriceIdentifier, PythQueryMsg};
use crate::state::{Config, CONFIG, CONTRACT_NAME, CONTRACT_VERSION, PENDING_OWNER, PRICE_FEEDS};

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    // Validate owner address
    let owner = deps.api.addr_validate(&msg.owner)?;

    // Validate pyth_contract_addr
    let pyth_contract_addr = deps.api.addr_validate(&msg.pyth_contract_addr)?;

    // Validate max_confidence_ratio is > 0 and ≤ 1
    if msg.max_confidence_ratio.is_zero() {
        return Err(ContractError::InvalidConfidenceRatio {
            value: msg.max_confidence_ratio,
            reason: "must be greater than 0".to_string(),
        });
    }
    if msg.max_confidence_ratio > Decimal::one() {
        return Err(ContractError::InvalidConfidenceRatio {
            value: msg.max_confidence_ratio,
            reason: "must be less than or equal to 1".to_string(),
        });
    }

    // Store Config in state
    let config = Config {
        owner,
        pyth_contract_addr,
        max_confidence_ratio: msg.max_confidence_ratio,
    };
    CONFIG.save(deps.storage, &config)?;

    // Check for duplicate denoms in price_feeds
    let mut seen_denoms: HashSet<String> = HashSet::new();
    for price_feed in &msg.price_feeds {
        if !seen_denoms.insert(price_feed.denom.clone()) {
            return Err(ContractError::DuplicateDenom {
                denom: price_feed.denom.clone(),
            });
        }
    }

    // Parse and store each PriceFeedConfig in the PRICE_FEEDS map
    for price_feed in msg.price_feeds {
        // Validate feed_id is valid 64-char hex
        let feed_id = PriceIdentifier::from_hex(&price_feed.feed_id)
            .map_err(|_| ContractError::InvalidFeedId {
                feed_id: price_feed.feed_id.clone(),
            })?;
        // Store mapping: denom → PriceIdentifier
        PRICE_FEEDS.save(deps.storage, &price_feed.denom, &feed_id)?;
    }

    // Set contract version for migration tracking
    cw2::set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("contract", CONTRACT_NAME)
        .add_attribute("owner", config.owner)
        .add_attribute("pyth_contract_addr", config.pyth_contract_addr)
        .add_attribute("max_confidence_ratio", config.max_confidence_ratio.to_string()))
}

/// Migrate entry point for contract upgrades.
/// No-op migration that just sets the contract version for tracking.
#[entry_point]
pub fn migrate(deps: DepsMut, _env: Env, _msg: Empty) -> StdResult<Response> {
    // Set contract version for migration tracking
    cw2::set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    Ok(Response::new()
        .add_attribute("action", "migrate")
        .add_attribute("contract", CONTRACT_NAME)
        .add_attribute("version", CONTRACT_VERSION))
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
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    denom: String,
    feed_id: String,
) -> Result<Response, ContractError> {
    // Require sender == owner
    let config = CONFIG.load(deps.storage)?;
    if info.sender != config.owner {
        return Err(ContractError::Unauthorized);
    }

    // Validate feed_id via PriceIdentifier::from_hex()
    let feed_id = PriceIdentifier::from_hex(&feed_id)
        .map_err(|_| ContractError::InvalidFeedId { feed_id: feed_id.clone() })?;

    // Save to PRICE_FEEDS map
    PRICE_FEEDS.save(deps.storage, &denom, &feed_id)?;

    Ok(Response::new()
        .add_attribute("action", "set_price_feed")
        .add_attribute("denom", denom)
        .add_attribute("feed_id", feed_id.to_hex()))
}

fn execute_remove_price_feed(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    denom: String,
) -> Result<Response, ContractError> {
    // Require sender == owner
    let config = CONFIG.load(deps.storage)?;
    if info.sender != config.owner {
        return Err(ContractError::Unauthorized);
    }

    // Remove from PRICE_FEEDS map (error if not found)
    if !PRICE_FEEDS.has(deps.storage, &denom) {
        return Err(ContractError::PriceFeedNotConfigured { denom: denom.clone() });
    }
    PRICE_FEEDS.remove(deps.storage, &denom);

    Ok(Response::new()
        .add_attribute("action", "remove_price_feed")
        .add_attribute("denom", denom))
}

fn execute_update_config(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    pyth_contract_addr: Option<String>,
    max_confidence_ratio: Option<Decimal>,
) -> Result<Response, ContractError> {
    // Require sender == owner
    let mut config = CONFIG.load(deps.storage)?;
    if info.sender != config.owner {
        return Err(ContractError::Unauthorized);
    }

    let mut attributes = vec![
        ("action", "update_config".to_string()),
    ];

    // Partial update — only update fields that are Some
    if let Some(addr) = pyth_contract_addr {
        let validated_addr = deps.api.addr_validate(&addr)?;
        config.pyth_contract_addr = validated_addr;
        attributes.push(("pyth_contract_addr", config.pyth_contract_addr.to_string()));
    }

    if let Some(ratio) = max_confidence_ratio {
        // Validate new max_confidence_ratio if provided (> 0 and ≤ 1)
        if ratio.is_zero() {
            return Err(ContractError::InvalidConfidenceRatio {
                value: ratio,
                reason: "must be greater than 0".to_string(),
            });
        }
        if ratio > Decimal::one() {
            return Err(ContractError::InvalidConfidenceRatio {
                value: ratio,
                reason: "must be less than or equal to 1".to_string(),
            });
        }
        config.max_confidence_ratio = ratio;
        attributes.push(("max_confidence_ratio", config.max_confidence_ratio.to_string()));
    }

    // Save updated Config
    CONFIG.save(deps.storage, &config)?;

    let mut resp = Response::new();
    for (key, value) in attributes {
        resp = resp.add_attribute(key, value);
    }

    Ok(resp)
}

fn execute_transfer_ownership(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    new_owner: String,
) -> Result<Response, ContractError> {
    // Require sender == owner
    let config = CONFIG.load(deps.storage)?;
    if info.sender != config.owner {
        return Err(ContractError::Unauthorized);
    }

    // Validate new_owner address
    let new_owner_addr = deps.api.addr_validate(&new_owner)?;

    // Store in PENDING_OWNER
    PENDING_OWNER.save(deps.storage, &new_owner_addr)?;

    Ok(Response::new()
        .add_attribute("action", "transfer_ownership")
        .add_attribute("pending_owner", new_owner_addr.to_string()))
}

fn execute_accept_ownership(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
) -> Result<Response, ContractError> {
    // Require sender == pending_owner
    let pending = PENDING_OWNER
        .may_load(deps.storage)?
        .ok_or(ContractError::PendingOwnerNotSet)?;

    if info.sender != pending {
        return Err(ContractError::NotPendingOwner);
    }

    // Update Config.owner to sender
    let mut config = CONFIG.load(deps.storage)?;
    config.owner = info.sender.clone();
    CONFIG.save(deps.storage, &config)?;

    // Remove PENDING_OWNER
    PENDING_OWNER.remove(deps.storage);

    Ok(Response::new()
        .add_attribute("action", "accept_ownership")
        .add_attribute("new_owner", config.owner.to_string()))
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

// Note: _env intentionally unused. Staleness checking is handled by the market
// layer (stone-types::OraclePriceStale), not by the adapter.
fn query_price(deps: Deps, _env: Env, denom: String) -> Result<stone_types::PriceResponse, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // 1. Look up feed ID
    let feed_id = PRICE_FEEDS.load(deps.storage, &denom)
        .map_err(|_| ContractError::PriceFeedNotConfigured { denom: denom.clone() })?;

    // 2. Query Pyth contract
    let pyth_response: PriceFeedResponse = deps.querier.query_wasm_smart(
        config.pyth_contract_addr.as_str(),
        &PythQueryMsg::PriceFeed { id: feed_id },
    )?;

    let pyth_price = &pyth_response.price_feed.price;

    // 3. Reject negative/zero
    if pyth_price.price <= 0 {
        return Err(ContractError::NegativeOrZeroPrice { denom });
    }

    // 4. Confidence check
    if pyth_price.conf > 0 {
        let conf_ratio = Decimal::from_ratio(pyth_price.conf as u128, pyth_price.price as u128);
        if conf_ratio > config.max_confidence_ratio {
            return Err(ContractError::ConfidenceTooHigh {
                denom,
                confidence_ratio: conf_ratio,
                max_allowed: config.max_confidence_ratio,
            });
        }
    }

    // 5. Convert Pyth price to Decimal using pyth_price_to_decimal
    let decimal_price = crate::pyth_types::pyth_price_to_decimal(pyth_price.price, pyth_price.expo)?;

    // 6. Convert timestamp
    let updated_at: u64 = pyth_price.publish_time
        .try_into()
        .map_err(|_| ContractError::InvalidTimestamp)?;

    Ok(stone_types::PriceResponse { denom, price: decimal_price, updated_at })
}

fn query_config(deps: Deps) -> Result<crate::msg::ConfigResponse, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    Ok(crate::msg::ConfigResponse {
        owner: config.owner.to_string(),
        pyth_contract_addr: config.pyth_contract_addr.to_string(),
        max_confidence_ratio: config.max_confidence_ratio,
    })
}

fn query_price_feed(
    deps: Deps,
    denom: String,
) -> Result<crate::msg::PriceFeedInfo, ContractError> {
    let feed_id = PRICE_FEEDS
        .load(deps.storage, &denom)
        .map_err(|_| ContractError::PriceFeedNotConfigured { denom: denom.clone() })?;
    Ok(crate::msg::PriceFeedInfo {
        denom,
        feed_id: feed_id.to_hex(),
    })
}

const DEFAULT_LIMIT: u32 = 10;
const MAX_LIMIT: u32 = 30;

fn query_all_price_feeds(
    deps: Deps,
    start_after: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<crate::msg::PriceFeedInfo>, ContractError> {
    let limit = limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT) as usize;
    let start = start_after.map(|s| cw_storage_plus::Bound::ExclusiveRaw(s.into_bytes()));

    let feeds: Result<Vec<_>, _> = PRICE_FEEDS
        .range(deps.storage, start, None, cosmwasm_std::Order::Ascending)
        .take(limit)
        .map(|item| {
            let (denom, feed_id) = item?;
            Ok(crate::msg::PriceFeedInfo {
                denom,
                feed_id: feed_id.to_hex(),
            })
        })
        .collect();

    feeds
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{message_info, mock_dependencies, mock_env, MockApi};

    // ========== Query Price Handler Tests ==========
    mod query_price_tests {
        use super::*;
        use cosmwasm_std::testing::{mock_env, MockStorage};
        use cosmwasm_std::{OwnedDeps, SystemResult, ContractResult, to_json_binary, WasmQuery, SystemError};
        use crate::pyth_types::*;
        use std::collections::HashMap;

        // Create a querier that responds to Pyth queries
        fn create_pyth_deps(
            pyth_addr_str: &str,
            feeds: HashMap<String, PriceFeedResponse>,
        ) -> (OwnedDeps<MockStorage, MockApi, cosmwasm_std::testing::MockQuerier>, String) {
            let mut deps = cosmwasm_std::testing::mock_dependencies();
            // Get the actual bech32 address that MockApi generates
            let pyth_bech32 = MockApi::default().addr_make(pyth_addr_str).to_string();
            let pyth_bech32_clone = pyth_bech32.clone();
            deps.querier.update_wasm(move |query| {
                match query {
                    WasmQuery::Smart { contract_addr, msg } if contract_addr == &pyth_bech32_clone => {
                        let pyth_msg: PythQueryMsg = cosmwasm_std::from_json(msg).unwrap();
                        match pyth_msg {
                            PythQueryMsg::PriceFeed { id } => {
                                let hex_id = id.to_hex();
                                match feeds.get(&hex_id) {
                                    Some(resp) => SystemResult::Ok(ContractResult::Ok(
                                        to_json_binary(resp).unwrap()
                                    )),
                                    None => SystemResult::Err(SystemError::InvalidRequest {
                                        error: format!("feed {} not found", hex_id),
                                        request: Default::default(),
                                    }),
                                }
                            }
                        }
                    }
                    _ => SystemResult::Err(SystemError::NoSuchContract { addr: "unknown".into() }),
                }
            });
            (deps, pyth_bech32)
        }

        fn make_feed_response(feed_id: &str, price: i64, conf: u64, expo: i32, publish_time: i64) -> PriceFeedResponse {
            PriceFeedResponse {
                price_feed: PriceFeed {
                    id: PriceIdentifier::from_hex(feed_id).unwrap(),
                    price: Price { price, conf, expo, publish_time },
                    ema_price: Price { price, conf, expo, publish_time },
                },
            }
        }

        // Helper to setup deps with config + feeds stored
        fn setup_with_pyth(
            pyth_addr_str: &str,
            feed_id: &str,
            denom: &str,
            pyth_price: i64, conf: u64, expo: i32, publish_time: i64,
            max_confidence_ratio: Decimal,
        ) -> OwnedDeps<MockStorage, MockApi, cosmwasm_std::testing::MockQuerier> {
            let mut feeds = HashMap::new();
            feeds.insert(feed_id.to_string(), make_feed_response(feed_id, pyth_price, conf, expo, publish_time));
            let (mut deps, pyth_bech32) = create_pyth_deps(pyth_addr_str, feeds);

            // Store config using the bech32 address that matches what the mock querier expects
            CONFIG.save(deps.as_mut().storage, &Config {
                owner: MockApi::default().addr_make("owner"),
                pyth_contract_addr: cosmwasm_std::Addr::unchecked(pyth_bech32),
                max_confidence_ratio,
            }).unwrap();

            // Store feed mapping
            let price_id = PriceIdentifier::from_hex(feed_id).unwrap();
            PRICE_FEEDS.save(deps.as_mut().storage, denom, &price_id).unwrap();

            deps
        }

        #[test]
        fn test_query_price_happy_path() {
            // ATOM at $10.52 (price=1052000000, expo=-8, conf=1000, publish_time=1700000000)
            let pyth_addr = "pyth";
            let feed_id = "b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f8";
            let deps = setup_with_pyth(
                pyth_addr,
                feed_id,
                "uatom",
                1052000000i64, // price
                1000u64,       // conf
                -8i32,         // expo
                1700000000i64, // publish_time
                Decimal::percent(1), // max_confidence_ratio = 0.01
            );

            let result = query_price(deps.as_ref(), mock_env(), "uatom".to_string()).unwrap();

            assert_eq!(result.denom, "uatom");
            // 1052000000 * 10^-8 = 10.52
            let expected_price = Decimal::from_atomics(1052u128, 2).unwrap();
            assert_eq!(result.price, expected_price);
            assert_eq!(result.updated_at, 1700000000u64);
        }

        #[test]
        fn test_query_price_feed_not_configured() {
            let pyth_addr = "pyth";
            let feed_id = "b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f8";
            let deps = setup_with_pyth(
                pyth_addr,
                feed_id,
                "uatom",
                1052000000i64,
                1000u64,
                -8i32,
                1700000000i64,
                Decimal::percent(1),
            );

            // Query unknown denom
            let result = query_price(deps.as_ref(), mock_env(), "unknown".to_string());
            assert!(matches!(result.unwrap_err(), ContractError::PriceFeedNotConfigured { denom } if denom == "unknown"));
        }

        #[test]
        fn test_query_price_negative_from_pyth() {
            // Pyth returns price=-100 → NegativeOrZeroPrice
            let pyth_addr = "pyth";
            let feed_id = "b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f8";
            let deps = setup_with_pyth(
                pyth_addr,
                feed_id,
                "uatom",
                -100i64,       // negative price
                1000u64,
                -8i32,
                1700000000i64,
                Decimal::percent(1),
            );

            let result = query_price(deps.as_ref(), mock_env(), "uatom".to_string());
            assert!(matches!(result.unwrap_err(), ContractError::NegativeOrZeroPrice { denom } if denom == "uatom"));
        }

        #[test]
        fn test_query_price_zero_from_pyth() {
            // Pyth returns price=0 → NegativeOrZeroPrice
            let pyth_addr = "pyth";
            let feed_id = "b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f8";
            let deps = setup_with_pyth(
                pyth_addr,
                feed_id,
                "uatom",
                0i64,          // zero price
                1000u64,
                -8i32,
                1700000000i64,
                Decimal::percent(1),
            );

            let result = query_price(deps.as_ref(), mock_env(), "uatom".to_string());
            assert!(matches!(result.unwrap_err(), ContractError::NegativeOrZeroPrice { denom } if denom == "uatom"));
        }

        #[test]
        fn test_query_price_confidence_too_high() {
            // conf/price=0.05, max=0.01 → ConfidenceTooHigh
            // price=10000, conf=500 → ratio=0.05
            let pyth_addr = "pyth";
            let feed_id = "b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f8";
            let deps = setup_with_pyth(
                pyth_addr,
                feed_id,
                "uatom",
                10000i64,      // price
                500u64,        // conf → 500/10000 = 0.05
                -8i32,
                1700000000i64,
                Decimal::from_ratio(1u128, 100u128), // max_confidence_ratio = 0.01
            );

            let result = query_price(deps.as_ref(), mock_env(), "uatom".to_string());
            assert!(matches!(result.unwrap_err(), ContractError::ConfidenceTooHigh { denom, .. } if denom == "uatom"));
        }

        #[test]
        fn test_query_price_confidence_ok() {
            // conf/price=0.005, max=0.01 → success
            // price=10000, conf=50 → ratio=0.005
            let pyth_addr = "pyth";
            let feed_id = "b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f8";
            let deps = setup_with_pyth(
                pyth_addr,
                feed_id,
                "uatom",
                10000i64,      // price
                50u64,         // conf → 50/10000 = 0.005
                -8i32,
                1700000000i64,
                Decimal::from_ratio(1u128, 100u128), // max_confidence_ratio = 0.01
            );

            let result = query_price(deps.as_ref(), mock_env(), "uatom".to_string()).unwrap();
            assert_eq!(result.denom, "uatom");
            assert_eq!(result.updated_at, 1700000000u64);
        }

        #[test]
        fn test_query_price_zero_confidence() {
            // conf=0 → always passes
            let pyth_addr = "pyth";
            let feed_id = "b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f8";
            let deps = setup_with_pyth(
                pyth_addr,
                feed_id,
                "uatom",
                1052000000i64,
                0u64,          // zero confidence
                -8i32,
                1700000000i64,
                Decimal::from_ratio(1u128, 1000u128), // max_confidence_ratio = 0.001 (very strict)
            );

            let result = query_price(deps.as_ref(), mock_env(), "uatom".to_string()).unwrap();
            assert_eq!(result.denom, "uatom");
        }

        #[test]
        fn test_query_price_negative_timestamp() {
            // publish_time=-1 → InvalidTimestamp
            let pyth_addr = "pyth";
            let feed_id = "b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f8";
            let deps = setup_with_pyth(
                pyth_addr,
                feed_id,
                "uatom",
                1052000000i64,
                1000u64,
                -8i32,
                -1i64,         // negative timestamp
                Decimal::percent(1),
            );

            let result = query_price(deps.as_ref(), mock_env(), "uatom".to_string());
            assert!(matches!(result.unwrap_err(), ContractError::InvalidTimestamp));
        }

        #[test]
        fn test_query_price_btc_accuracy() {
            // BTC at $65,000 (price=6500000000000, expo=-8) → verify exact Decimal
            let pyth_addr = "pyth";
            let feed_id = "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
            let deps = setup_with_pyth(
                pyth_addr,
                feed_id,
                "ubtc",
                6_500_000_000_000i64, // price
                100_000_000u64,       // conf
                -8i32,                // expo
                1700000000i64,
                Decimal::percent(1),
            );

            let result = query_price(deps.as_ref(), mock_env(), "ubtc".to_string()).unwrap();

            assert_eq!(result.denom, "ubtc");
            // 6_500_000_000_000 * 10^-8 = 65000.0
            let expected_price = Decimal::from_atomics(65000u128, 0).unwrap();
            assert_eq!(result.price, expected_price);
            assert_eq!(result.updated_at, 1700000000u64);
        }

        // Issue #87: Additional query flow tests

        #[test]
        fn test_query_price_pyth_unreachable_error_propagation() {
            // Issue #87: Pyth unreachable → propagated error
            let mut deps = cosmwasm_std::testing::mock_dependencies();
            let pyth_addr_str = "pyth";
            let feed_id = "b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f8";

            // Get the bech32 address
            let pyth_bech32 = MockApi::default().addr_make(pyth_addr_str).to_string();
            let pyth_bech32_for_closure = pyth_bech32.clone();

            // Create a querier that fails for Pyth queries
            deps.querier.update_wasm(move |query| {
                match query {
                    WasmQuery::Smart { contract_addr, .. } if contract_addr == &pyth_bech32_for_closure => {
                        SystemResult::Err(SystemError::NoSuchContract { 
                            addr: pyth_bech32_for_closure.clone() 
                        })
                    }
                    _ => SystemResult::Err(SystemError::NoSuchContract { addr: "unknown".into() }),
                }
            });

            // Store config
            CONFIG.save(deps.as_mut().storage, &Config {
                owner: MockApi::default().addr_make("owner"),
                pyth_contract_addr: cosmwasm_std::Addr::unchecked(pyth_bech32),
                max_confidence_ratio: Decimal::percent(1),
            }).unwrap();

            // Store feed mapping
            let price_id = PriceIdentifier::from_hex(feed_id).unwrap();
            PRICE_FEEDS.save(deps.as_mut().storage, "uatom", &price_id).unwrap();

            // Query should propagate the error from Pyth
            let result = query_price(deps.as_ref(), mock_env(), "uatom".to_string());
            assert!(result.is_err(), "Expected error when Pyth is unreachable");
            // Verify it's a StdError (querier error propagates as StdError)
            assert!(
                matches!(result.unwrap_err(), ContractError::Std(_)),
                "Expected StdError for Pyth unreachable"
            );
        }

        #[test]
        fn test_query_price_large_timestamp() {
            // Issue #87: Timestamp conversion edge case - very large timestamp
            let pyth_addr = "pyth";
            let feed_id = "b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f8";
            
            // Max u64 timestamp that fits in i64: 9223372036854775807 (i64::MAX)
            let large_timestamp: i64 = i64::MAX;
            let deps = setup_with_pyth(
                pyth_addr,
                feed_id,
                "uatom",
                1052000000i64,
                1000u64,
                -8i32,
                large_timestamp,
                Decimal::percent(1),
            );

            let result = query_price(deps.as_ref(), mock_env(), "uatom".to_string()).unwrap();
            assert_eq!(result.updated_at, large_timestamp as u64);
        }

        #[test]
        fn test_query_price_timestamp_zero() {
            // Issue #87: Timestamp conversion edge case - zero timestamp
            let pyth_addr = "pyth";
            let feed_id = "b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f8";
            let deps = setup_with_pyth(
                pyth_addr,
                feed_id,
                "uatom",
                1052000000i64,
                1000u64,
                -8i32,
                0i64, // Zero timestamp
                Decimal::percent(1),
            );

            let result = query_price(deps.as_ref(), mock_env(), "uatom".to_string()).unwrap();
            assert_eq!(result.updated_at, 0u64);
        }

        #[test]
        fn test_query_price_confidence_at_exact_boundary() {
            // Issue #87: Confidence exactly at max ratio boundary
            // max_confidence_ratio = 0.02
            // price = 1000, conf = 20 → ratio = 0.02 (exactly at boundary)
            // Should NOT fail since check is `conf_ratio > max_confidence_ratio` not >=
            let pyth_addr = "pyth";
            let feed_id = "b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f8";
            let deps = setup_with_pyth(
                pyth_addr,
                feed_id,
                "uatom",
                1000i64,      // price
                20u64,        // conf → 20/1000 = 0.02 = 2%
                -8i32,
                1700000000i64,
                Decimal::from_ratio(2u128, 100u128), // max_confidence_ratio = 0.02
            );

            // Should succeed since ratio equals max_ratio (not exceeds)
            let result = query_price(deps.as_ref(), mock_env(), "uatom".to_string()).unwrap();
            assert_eq!(result.denom, "uatom");
        }

        #[test]
        fn test_query_price_confidence_just_above_boundary() {
            // Issue #87: Confidence just above max ratio boundary
            // max_confidence_ratio = 0.02
            // price = 1000, conf = 21 → ratio = 0.021 = 2.1% > 2%
            let pyth_addr = "pyth";
            let feed_id = "b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f8";
            let deps = setup_with_pyth(
                pyth_addr,
                feed_id,
                "uatom",
                1000i64,      // price
                21u64,        // conf → 21/1000 = 0.021 = 2.1%
                -8i32,
                1700000000i64,
                Decimal::from_ratio(2u128, 100u128), // max_confidence_ratio = 0.02
            );

            let result = query_price(deps.as_ref(), mock_env(), "uatom".to_string());
            assert!(
                matches!(result.unwrap_err(), ContractError::ConfidenceTooHigh { denom, .. } if denom == "uatom"),
                "Expected ConfidenceTooHigh when ratio exceeds max by a small amount"
            );
        }
    }

    fn test_addrs() -> (cosmwasm_std::Addr, cosmwasm_std::Addr, cosmwasm_std::Addr) {
        let api = MockApi::default();
        (api.addr_make("owner"), api.addr_make("pyth"), api.addr_make("new_owner"))
    }

    fn valid_feed_id() -> String {
        "b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f8".to_string()
    }

    #[test]
    fn test_instantiate_valid() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, pyth, _) = test_addrs();
        let info = message_info(&owner, &[]);

        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: Decimal::percent(1),
            price_feeds: vec![],
        };

        let res = instantiate(deps.as_mut(), env, info, msg).unwrap();
        assert!(res.attributes.iter().any(|a| a.key == "action" && a.value == "instantiate"));
        assert!(res.attributes.iter().any(|a| a.key == "owner" && a.value == owner.to_string()));

        // Verify config was saved
        let config = CONFIG.load(deps.as_ref().storage).unwrap();
        assert_eq!(config.owner, owner);
        assert_eq!(config.pyth_contract_addr, pyth);
        assert_eq!(config.max_confidence_ratio, Decimal::percent(1));
    }

    #[test]
    fn test_instantiate_invalid_owner() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (_, pyth, _) = test_addrs();
        let info = message_info(&pyth, &[]);

        let msg = InstantiateMsg {
            owner: "invalid_address".to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: Decimal::percent(1),
            price_feeds: vec![],
        };

        let res = instantiate(deps.as_mut(), env, info, msg);
        assert!(res.is_err());
    }

    #[test]
    fn test_instantiate_invalid_pyth_addr() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, _, _) = test_addrs();
        let info = message_info(&owner, &[]);

        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: "invalid_address".to_string(),
            max_confidence_ratio: Decimal::percent(1),
            price_feeds: vec![],
        };

        let res = instantiate(deps.as_mut(), env, info, msg);
        assert!(res.is_err());
    }

    #[test]
    fn test_instantiate_invalid_confidence_ratio_zero() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, pyth, _) = test_addrs();
        let info = message_info(&owner, &[]);

        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: Decimal::zero(),
            price_feeds: vec![],
        };

        let res = instantiate(deps.as_mut(), env, info, msg);
        assert!(res.is_err());
    }

    #[test]
    fn test_instantiate_invalid_confidence_ratio_over_one() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, pyth, _) = test_addrs();
        let info = message_info(&owner, &[]);

        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: Decimal::percent(101), // > 1.0
            price_feeds: vec![],
        };

        let res = instantiate(deps.as_mut(), env, info, msg);
        assert!(res.is_err());
    }

    #[test]
    fn test_instantiate_with_price_feeds() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, pyth, _) = test_addrs();
        let info = message_info(&owner, &[]);

        let feed_id = valid_feed_id();
        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: Decimal::percent(1),
            price_feeds: vec![crate::msg::PriceFeedConfig {
                denom: "uatom".to_string(),
                feed_id: feed_id.clone(),
            }],
        };

        let res = instantiate(deps.as_mut(), env, info, msg).unwrap();
        assert!(res.attributes.iter().any(|a| a.key == "action" && a.value == "instantiate"));

        // Verify price feed was saved
        let stored_feed = PRICE_FEEDS.load(deps.as_ref().storage, "uatom").unwrap();
        assert_eq!(stored_feed.to_hex(), feed_id);
    }

    #[test]
    fn test_instantiate_invalid_feed_id() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, pyth, _) = test_addrs();
        let info = message_info(&owner, &[]);

        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: Decimal::percent(1),
            price_feeds: vec![crate::msg::PriceFeedConfig {
                denom: "uatom".to_string(),
                feed_id: "invalid_feed_id".to_string(),
            }],
        };

        let res = instantiate(deps.as_mut(), env, info, msg);
        assert!(res.is_err());
    }

    #[test]
    fn test_set_price_feed_by_owner() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, pyth, _) = test_addrs();
        
        // Instantiate first
        let info = message_info(&owner, &[]);
        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: Decimal::percent(1),
            price_feeds: vec![],
        };
        instantiate(deps.as_mut(), env.clone(), info.clone(), msg).unwrap();

        // Set price feed as owner
        let feed_id = valid_feed_id();
        let res = execute_set_price_feed(
            deps.as_mut(),
            env.clone(),
            info,
            "uatom".to_string(),
            feed_id.clone(),
        )
        .unwrap();

        assert!(res.attributes.iter().any(|a| a.key == "action" && a.value == "set_price_feed"));
        assert!(res.attributes.iter().any(|a| a.key == "denom" && a.value == "uatom"));

        // Verify price feed was saved
        let stored_feed = PRICE_FEEDS.load(deps.as_ref().storage, "uatom").unwrap();
        assert_eq!(stored_feed.to_hex(), feed_id);
    }

    #[test]
    fn test_set_price_feed_unauthorized() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, pyth, _) = test_addrs();
        let api = MockApi::default();
        let not_owner = api.addr_make("not_owner");
        
        // Instantiate first
        let info = message_info(&owner, &[]);
        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: Decimal::percent(1),
            price_feeds: vec![],
        };
        instantiate(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Try to set price feed as non-owner
        let info = message_info(&not_owner, &[]);
        let feed_id = valid_feed_id();
        let res = execute_set_price_feed(
            deps.as_mut(),
            env,
            info,
            "uatom".to_string(),
            feed_id,
        );

        assert!(matches!(res.unwrap_err(), ContractError::Unauthorized));
    }

    #[test]
    fn test_remove_price_feed() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, pyth, _) = test_addrs();
        
        // Instantiate with price feed
        let info = message_info(&owner, &[]);
        let feed_id = valid_feed_id();
        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: Decimal::percent(1),
            price_feeds: vec![crate::msg::PriceFeedConfig {
                denom: "uatom".to_string(),
                feed_id: feed_id.clone(),
            }],
        };
        instantiate(deps.as_mut(), env.clone(), info.clone(), msg).unwrap();

        // Verify price feed exists
        assert!(PRICE_FEEDS.has(deps.as_ref().storage, "uatom"));

        // Remove price feed as owner
        let res = execute_remove_price_feed(deps.as_mut(), env, info, "uatom".to_string()).unwrap();
        assert!(res.attributes.iter().any(|a| a.key == "action" && a.value == "remove_price_feed"));

        // Verify price feed was removed
        assert!(!PRICE_FEEDS.has(deps.as_ref().storage, "uatom"));
    }

    #[test]
    fn test_remove_price_feed_not_found() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, pyth, _) = test_addrs();
        
        // Instantiate without price feeds
        let info = message_info(&owner, &[]);
        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: Decimal::percent(1),
            price_feeds: vec![],
        };
        instantiate(deps.as_mut(), env.clone(), info.clone(), msg).unwrap();

        // Try to remove non-existent price feed
        let res = execute_remove_price_feed(deps.as_mut(), env, info, "uatom".to_string());
        assert!(matches!(res.unwrap_err(), ContractError::PriceFeedNotConfigured { .. }));
    }

    #[test]
    fn test_update_config_partial() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, pyth, _) = test_addrs();
        let api = MockApi::default();
        let new_pyth = api.addr_make("new_pyth");
        
        // Instantiate
        let info = message_info(&owner, &[]);
        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: Decimal::percent(1),
            price_feeds: vec![],
        };
        instantiate(deps.as_mut(), env.clone(), info.clone(), msg).unwrap();

        // Update only pyth_contract_addr
        let res = execute_update_config(
            deps.as_mut(),
            env.clone(),
            info.clone(),
            Some(new_pyth.to_string()),
            None,
        )
        .unwrap();

        assert!(res.attributes.iter().any(|a| a.key == "action" && a.value == "update_config"));
        assert!(res.attributes.iter().any(|a| a.key == "pyth_contract_addr" && a.value == new_pyth.to_string()));

        // Verify config was updated
        let config = CONFIG.load(deps.as_ref().storage).unwrap();
        assert_eq!(config.pyth_contract_addr, new_pyth);
        assert_eq!(config.max_confidence_ratio, Decimal::percent(1)); // unchanged

        // Update only max_confidence_ratio
        let res = execute_update_config(
            deps.as_mut(),
            env.clone(),
            info,
            None,
            Some(Decimal::percent(2)),
        )
        .unwrap();

        assert!(res.attributes.iter().any(|a| a.key == "max_confidence_ratio" && a.value == Decimal::percent(2).to_string()));

        let config = CONFIG.load(deps.as_ref().storage).unwrap();
        assert_eq!(config.max_confidence_ratio, Decimal::percent(2));
    }

    #[test]
    fn test_update_config_unauthorized() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, pyth, _) = test_addrs();
        let api = MockApi::default();
        let not_owner = api.addr_make("not_owner");
        
        // Instantiate
        let info = message_info(&owner, &[]);
        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: Decimal::percent(1),
            price_feeds: vec![],
        };
        instantiate(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Try to update config as non-owner
        let info = message_info(&not_owner, &[]);
        let res = execute_update_config(
            deps.as_mut(),
            env,
            info,
            None,
            Some(Decimal::percent(2)),
        );

        assert!(matches!(res.unwrap_err(), ContractError::Unauthorized));
    }

    #[test]
    fn test_transfer_ownership_flow() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, pyth, new_owner) = test_addrs();
        
        // Instantiate
        let info = message_info(&owner, &[]);
        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: Decimal::percent(1),
            price_feeds: vec![],
        };
        instantiate(deps.as_mut(), env.clone(), info.clone(), msg).unwrap();

        // Transfer ownership
        let res = execute_transfer_ownership(
            deps.as_mut(),
            env.clone(),
            info,
            new_owner.to_string(),
        )
        .unwrap();

        assert!(res.attributes.iter().any(|a| a.key == "action" && a.value == "transfer_ownership"));
        assert!(res.attributes.iter().any(|a| a.key == "pending_owner" && a.value == new_owner.to_string()));

        // Verify pending owner was set
        let pending = PENDING_OWNER.load(deps.as_ref().storage).unwrap();
        assert_eq!(pending, new_owner);

        // Old owner tries to accept (should fail)
        let info = message_info(&owner, &[]);
        let res = execute_accept_ownership(deps.as_mut(), env.clone(), info);
        assert!(matches!(res.unwrap_err(), ContractError::NotPendingOwner));

        // New owner accepts
        let info = message_info(&new_owner, &[]);
        let res = execute_accept_ownership(deps.as_mut(), env, info).unwrap();

        assert!(res.attributes.iter().any(|a| a.key == "action" && a.value == "accept_ownership"));
        assert!(res.attributes.iter().any(|a| a.key == "new_owner" && a.value == new_owner.to_string()));

        // Verify ownership was transferred
        let config = CONFIG.load(deps.as_ref().storage).unwrap();
        assert_eq!(config.owner, new_owner);

        // Verify pending owner was cleared
        assert!(!PENDING_OWNER.exists(deps.as_ref().storage));
    }

    #[test]
    fn test_accept_ownership_wrong_sender() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, pyth, new_owner) = test_addrs();
        let api = MockApi::default();
        let wrong_sender = api.addr_make("wrong_sender");
        
        // Instantiate
        let info = message_info(&owner, &[]);
        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: Decimal::percent(1),
            price_feeds: vec![],
        };
        instantiate(deps.as_mut(), env.clone(), info.clone(), msg).unwrap();

        // Transfer ownership
        execute_transfer_ownership(
            deps.as_mut(),
            env.clone(),
            info,
            new_owner.to_string(),
        )
        .unwrap();

        // Wrong sender tries to accept
        let info = message_info(&wrong_sender, &[]);
        let res = execute_accept_ownership(deps.as_mut(), env, info);
        assert!(matches!(res.unwrap_err(), ContractError::NotPendingOwner));
    }

    // Issue #87: Execute handler authorization tests

    #[test]
    fn test_remove_price_feed_unauthorized() {
        // Issue #87: Non-owner cannot remove price feed
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, pyth, _) = test_addrs();
        let api = MockApi::default();
        let not_owner = api.addr_make("not_owner");
        
        // Instantiate with a price feed
        let info = message_info(&owner, &[]);
        let feed_id = valid_feed_id();
        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: Decimal::percent(1),
            price_feeds: vec![crate::msg::PriceFeedConfig {
                denom: "uatom".to_string(),
                feed_id: feed_id.clone(),
            }],
        };
        instantiate(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Try to remove as non-owner
        let info = message_info(&not_owner, &[]);
        let res = execute_remove_price_feed(deps.as_mut(), env, info, "uatom".to_string());
        assert!(matches!(res.unwrap_err(), ContractError::Unauthorized));
    }

    #[test]
    fn test_update_config_pyth_addr_unauthorized() {
        // Issue #87: Non-owner cannot update config (pyth_contract_addr)
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, pyth, _) = test_addrs();
        let api = MockApi::default();
        let not_owner = api.addr_make("not_owner");
        let new_pyth = api.addr_make("new_pyth");
        
        // Instantiate
        let info = message_info(&owner, &[]);
        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: Decimal::percent(1),
            price_feeds: vec![],
        };
        instantiate(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Try to update pyth_contract_addr as non-owner
        let info = message_info(&not_owner, &[]);
        let res = execute_update_config(
            deps.as_mut(),
            env,
            info,
            Some(new_pyth.to_string()),
            None,
        );
        assert!(matches!(res.unwrap_err(), ContractError::Unauthorized));
    }

    #[test]
    fn test_update_config_max_ratio_unauthorized() {
        // Issue #87: Non-owner cannot update config (max_confidence_ratio)
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, pyth, _) = test_addrs();
        let api = MockApi::default();
        let not_owner = api.addr_make("not_owner");
        
        // Instantiate
        let info = message_info(&owner, &[]);
        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: Decimal::percent(1),
            price_feeds: vec![],
        };
        instantiate(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Try to update max_confidence_ratio as non-owner
        let info = message_info(&not_owner, &[]);
        let res = execute_update_config(
            deps.as_mut(),
            env,
            info,
            None,
            Some(Decimal::percent(2)),
        );
        assert!(matches!(res.unwrap_err(), ContractError::Unauthorized));
    }

    #[test]
    fn test_transfer_ownership_unauthorized() {
        // Issue #87: Non-owner cannot initiate ownership transfer
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, pyth, new_owner) = test_addrs();
        let api = MockApi::default();
        let not_owner = api.addr_make("not_owner");
        
        // Instantiate
        let info = message_info(&owner, &[]);
        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: Decimal::percent(1),
            price_feeds: vec![],
        };
        instantiate(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Try to transfer ownership as non-owner
        let info = message_info(&not_owner, &[]);
        let res = execute_transfer_ownership(
            deps.as_mut(),
            env,
            info,
            new_owner.to_string(),
        );
        assert!(matches!(res.unwrap_err(), ContractError::Unauthorized));
    }

    #[test]
    fn test_accept_ownership_without_pending() {
        // Issue #87: Cannot accept ownership if no transfer is pending
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, pyth, _) = test_addrs();
        let api = MockApi::default();
        let random_sender = api.addr_make("random");
        
        // Instantiate
        let info = message_info(&owner, &[]);
        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: Decimal::percent(1),
            price_feeds: vec![],
        };
        instantiate(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Try to accept ownership when no transfer is pending
        let info = message_info(&random_sender, &[]);
        let res = execute_accept_ownership(deps.as_mut(), env, info);
        assert!(matches!(res.unwrap_err(), ContractError::PendingOwnerNotSet));
    }

    #[test]
    fn test_owner_auth_for_all_execute_messages() {
        // Issue #87: Comprehensive test that owner auth is required for all execute messages
        // This test validates the auth check pattern is consistent across all execute handlers
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, pyth, new_owner) = test_addrs();
        let api = MockApi::default();
        let not_owner = api.addr_make("not_owner");
        
        // Instantiate with a price feed so we can try to remove it
        let info = message_info(&owner, &[]);
        let feed_id = valid_feed_id();
        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: Decimal::percent(1),
            price_feeds: vec![crate::msg::PriceFeedConfig {
                denom: "uatom".to_string(),
                feed_id: feed_id.clone(),
            }],
        };
        instantiate(deps.as_mut(), env.clone(), info, msg).unwrap();

        let info_not_owner = message_info(&not_owner, &[]);

        // Test SetPriceFeed
        let res = execute(
            deps.as_mut(),
            env.clone(),
            info_not_owner.clone(),
            ExecuteMsg::SetPriceFeed {
                denom: "uosmo".to_string(),
                feed_id: "c00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f9".to_string(),
            },
        );
        assert!(matches!(res.unwrap_err(), ContractError::Unauthorized), "SetPriceFeed should require owner");

        // Test RemovePriceFeed
        let res = execute(
            deps.as_mut(),
            env.clone(),
            info_not_owner.clone(),
            ExecuteMsg::RemovePriceFeed { denom: "uatom".to_string() },
        );
        assert!(matches!(res.unwrap_err(), ContractError::Unauthorized), "RemovePriceFeed should require owner");

        // Test UpdateConfig
        let res = execute(
            deps.as_mut(),
            env.clone(),
            info_not_owner.clone(),
            ExecuteMsg::UpdateConfig {
                pyth_contract_addr: None,
                max_confidence_ratio: Some(Decimal::percent(2)),
            },
        );
        assert!(matches!(res.unwrap_err(), ContractError::Unauthorized), "UpdateConfig should require owner");

        // Test TransferOwnership
        let res = execute(
            deps.as_mut(),
            env.clone(),
            info_not_owner.clone(),
            ExecuteMsg::TransferOwnership {
                new_owner: new_owner.to_string(),
            },
        );
        assert!(matches!(res.unwrap_err(), ContractError::Unauthorized), "TransferOwnership should require owner");

        // AcceptOwnership doesn't require owner - it requires pending_owner
        // This is tested separately in test_accept_ownership_wrong_sender
    }

    // ========== Query Handler Tests ==========

    #[test]
    fn test_query_config() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, pyth, _) = test_addrs();
        let info = message_info(&owner, &[]);

        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: Decimal::percent(1),
            price_feeds: vec![],
        };
        instantiate(deps.as_mut(), env, info, msg).unwrap();

        // Query config and verify fields match
        let config = query_config(deps.as_ref()).unwrap();
        assert_eq!(config.owner, owner.to_string());
        assert_eq!(config.pyth_contract_addr, pyth.to_string());
        assert_eq!(config.max_confidence_ratio, Decimal::percent(1));
    }

    #[test]
    fn test_query_price_feed() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, pyth, _) = test_addrs();
        let info = message_info(&owner, &[]);

        let feed_id = valid_feed_id();
        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: Decimal::percent(1),
            price_feeds: vec![crate::msg::PriceFeedConfig {
                denom: "uatom".to_string(),
                feed_id: feed_id.clone(),
            }],
        };
        instantiate(deps.as_mut(), env, info, msg).unwrap();

        // Query price feed and verify denom + feed_id
        let price_feed = query_price_feed(deps.as_ref(), "uatom".to_string()).unwrap();
        assert_eq!(price_feed.denom, "uatom");
        assert_eq!(price_feed.feed_id, feed_id);
    }

    #[test]
    fn test_query_price_feed_not_found() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, pyth, _) = test_addrs();
        let info = message_info(&owner, &[]);

        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: Decimal::percent(1),
            price_feeds: vec![],
        };
        instantiate(deps.as_mut(), env, info, msg).unwrap();

        // Query non-existent denom should return error
        let res = query_price_feed(deps.as_ref(), "unonexistent".to_string());
        assert!(matches!(res.unwrap_err(), ContractError::PriceFeedNotConfigured { denom } if denom == "unonexistent"));
    }

    #[test]
    fn test_query_all_price_feeds_basic() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, pyth, _) = test_addrs();
        let info = message_info(&owner, &[]);

        let feed_id1 = valid_feed_id();
        let feed_id2 = "c00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f9".to_string();
        let feed_id3 = "d00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493fa".to_string();

        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: Decimal::percent(1),
            price_feeds: vec![
                crate::msg::PriceFeedConfig {
                    denom: "uatom".to_string(),
                    feed_id: feed_id1.clone(),
                },
                crate::msg::PriceFeedConfig {
                    denom: "uosmo".to_string(),
                    feed_id: feed_id2.clone(),
                },
                crate::msg::PriceFeedConfig {
                    denom: "uusdc".to_string(),
                    feed_id: feed_id3.clone(),
                },
            ],
        };
        instantiate(deps.as_mut(), env, info, msg).unwrap();

        // Query all price feeds
        let feeds = query_all_price_feeds(deps.as_ref(), None, None).unwrap();
        assert_eq!(feeds.len(), 3);

        // Verify all feeds are returned (order is ascending by denom)
        let denoms: Vec<String> = feeds.iter().map(|f| f.denom.clone()).collect();
        assert_eq!(denoms, vec!["uatom", "uosmo", "uusdc"]);
    }

    #[test]
    fn test_query_all_price_feeds_pagination() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, pyth, _) = test_addrs();
        let info = message_info(&owner, &[]);

        // Set up 5 price feeds
        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: Decimal::percent(1),
            price_feeds: vec![
                crate::msg::PriceFeedConfig {
                    denom: "uatom".to_string(),
                    feed_id: valid_feed_id(),
                },
                crate::msg::PriceFeedConfig {
                    denom: "ubtc".to_string(),
                    feed_id: "a00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f9".to_string(),
                },
                crate::msg::PriceFeedConfig {
                    denom: "ueth".to_string(),
                    feed_id: "b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493fa".to_string(),
                },
                crate::msg::PriceFeedConfig {
                    denom: "uosmo".to_string(),
                    feed_id: "c00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493fb".to_string(),
                },
                crate::msg::PriceFeedConfig {
                    denom: "uusdc".to_string(),
                    feed_id: "d00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493fc".to_string(),
                },
            ],
        };
        instantiate(deps.as_mut(), env, info, msg).unwrap();

        // Query with limit=2
        let feeds = query_all_price_feeds(deps.as_ref(), None, Some(2)).unwrap();
        assert_eq!(feeds.len(), 2);
        assert_eq!(feeds[0].denom, "uatom");
        assert_eq!(feeds[1].denom, "ubtc");

        // Get next page using start_after
        let last_denom = feeds.last().unwrap().denom.clone();
        let feeds = query_all_price_feeds(deps.as_ref(), Some(last_denom), Some(2)).unwrap();
        assert_eq!(feeds.len(), 2);
        assert_eq!(feeds[0].denom, "ueth");
        assert_eq!(feeds[1].denom, "uosmo");

        // Get final page
        let last_denom = feeds.last().unwrap().denom.clone();
        let feeds = query_all_price_feeds(deps.as_ref(), Some(last_denom), Some(2)).unwrap();
        assert_eq!(feeds.len(), 1);
        assert_eq!(feeds[0].denom, "uusdc");
    }

    #[test]
    fn test_query_all_price_feeds_limit_cap() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, pyth, _) = test_addrs();
        let info = message_info(&owner, &[]);

        // Set up price feeds
        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: Decimal::percent(1),
            price_feeds: vec![
                crate::msg::PriceFeedConfig {
                    denom: "uatom".to_string(),
                    feed_id: valid_feed_id(),
                },
                crate::msg::PriceFeedConfig {
                    denom: "ubtc".to_string(),
                    feed_id: "a00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f9".to_string(),
                },
                crate::msg::PriceFeedConfig {
                    denom: "ueth".to_string(),
                    feed_id: "b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493fa".to_string(),
                },
                crate::msg::PriceFeedConfig {
                    denom: "uosmo".to_string(),
                    feed_id: "c00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493fb".to_string(),
                },
                crate::msg::PriceFeedConfig {
                    denom: "uusdc".to_string(),
                    feed_id: "d00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493fc".to_string(),
                },
            ],
        };
        instantiate(deps.as_mut(), env, info, msg).unwrap();

        // Request limit=100, should be capped to MAX_LIMIT (30) but we only have 5
        let feeds = query_all_price_feeds(deps.as_ref(), None, Some(100)).unwrap();
        assert_eq!(feeds.len(), 5); // All 5 returned since MAX_LIMIT=30

        // Verify that the limit was capped (we can't directly test the cap without more data,
        // but we verify the function works with high limit values)
    }

    // ========== Non-blocking Suggestion Tests ==========

    #[test]
    fn test_instantiate_duplicate_denom() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let (owner, pyth, _) = test_addrs();
        let info = message_info(&owner, &[]);

        let feed_id = valid_feed_id();
        let msg = InstantiateMsg {
            owner: owner.to_string(),
            pyth_contract_addr: pyth.to_string(),
            max_confidence_ratio: Decimal::percent(1),
            price_feeds: vec![
                crate::msg::PriceFeedConfig {
                    denom: "uatom".to_string(),
                    feed_id: feed_id.clone(),
                },
                crate::msg::PriceFeedConfig {
                    denom: "uatom".to_string(),
                    feed_id: "c00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f9".to_string(),
                },
            ],
        };

        let result = instantiate(deps.as_mut(), env, info, msg);
        assert!(matches!(result.unwrap_err(), ContractError::DuplicateDenom { denom } if denom == "uatom"));
    }
}
