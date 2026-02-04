//! Mock Pyth contract for cw-multi-test integration testing.
//! 
//! This mock mimics the real Pyth CosmWasm contract's query interface,
//! returning price feed data that matches the `PriceFeedResponse` struct
//! defined in `pyth-oracle-adapter/src/pyth_types.rs`.

use cosmwasm_schema::cw_serde;
use cosmwasm_std::{
    entry_point, to_json_binary, Binary, Deps, DepsMut, Env, MessageInfo, Response, StdResult,
};
use cw_storage_plus::Map;

/// Instantiate message for the mock Pyth contract.
#[cw_serde]
pub struct MockPythInstantiateMsg {
    pub feeds: Vec<MockPriceFeedInit>,
}

/// Initial price feed configuration for instantiation.
#[cw_serde]
pub struct MockPriceFeedInit {
    /// 64-character hex feed ID
    pub id: String,
    /// Price value
    pub price: i64,
    /// Confidence interval
    pub conf: u64,
    /// Exponent (price = raw_price * 10^expo)
    pub expo: i32,
    /// Unix timestamp when this price was published
    pub publish_time: i64,
    /// EMA price (defaults to same as price if not provided)
    pub ema_price: Option<i64>,
    /// EMA confidence (defaults to same as conf if not provided)
    pub ema_conf: Option<u64>,
}

/// Execute messages for the mock Pyth contract.
#[cw_serde]
pub enum MockPythExecuteMsg {
    /// Update a price feed (for simulating price movements in tests)
    UpdateFeed {
        /// Feed ID (64-character hex)
        id: String,
        /// New price value
        price: i64,
        /// New confidence interval
        conf: u64,
        /// New publish timestamp
        publish_time: i64,
    },
}

/// Query message to get a price feed.
/// Matches the Pyth contract interface.
#[cw_serde]
pub struct PriceFeedQuery {
    pub price_feed: PriceFeedId,
}

#[cw_serde]
pub struct PriceFeedId {
    pub id: String,
}

/// Price data structure matching Pyth's format.
#[cw_serde]
pub struct Price {
    pub price: i64,
    pub conf: u64,
    pub expo: i32,
    pub publish_time: i64,
}

/// Complete price feed data.
#[cw_serde]
pub struct PriceFeed {
    pub id: String,
    pub price: Price,
    pub ema_price: Price,
}

/// Response from Pyth price feed query.
#[cw_serde]
pub struct PriceFeedResponse {
    pub price_feed: PriceFeed,
}

/// Stored feed data.
#[cw_serde]
pub struct StoredFeed {
    pub price: i64,
    pub conf: u64,
    pub expo: i32,
    pub publish_time: i64,
    pub ema_price: i64,
    pub ema_conf: u64,
}

/// Storage: feed_id (hex string) → stored feed data
pub const FEEDS: Map<&str, StoredFeed> = Map::new("feeds");

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: MockPythInstantiateMsg,
) -> StdResult<Response> {
    for feed in msg.feeds {
        FEEDS.save(
            deps.storage,
            &feed.id,
            &StoredFeed {
                price: feed.price,
                conf: feed.conf,
                expo: feed.expo,
                publish_time: feed.publish_time,
                ema_price: feed.ema_price.unwrap_or(feed.price),
                ema_conf: feed.ema_conf.unwrap_or(feed.conf),
            },
        )?;
    }
    Ok(Response::new().add_attribute("action", "instantiate_mock_pyth"))
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: MockPythExecuteMsg,
) -> StdResult<Response> {
    match msg {
        MockPythExecuteMsg::UpdateFeed {
            id,
            price,
            conf,
            publish_time,
        } => {
            FEEDS.update(deps.storage, &id, |existing| -> StdResult<_> {
                let mut feed =
                    existing.ok_or_else(|| cosmwasm_std::StdError::not_found("feed"))?;
                feed.price = price;
                feed.conf = conf;
                feed.publish_time = publish_time;
                Ok(feed)
            })?;
            Ok(Response::new()
                .add_attribute("action", "update_feed")
                .add_attribute("feed_id", id))
        }
    }
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: Binary) -> StdResult<Binary> {
    // Try to parse as PriceFeedQuery first
    let query: PriceFeedQuery = cosmwasm_std::from_json(&msg)?;
    let feed = FEEDS.load(deps.storage, &query.price_feed.id)?;

    let response = PriceFeedResponse {
        price_feed: PriceFeed {
            id: query.price_feed.id,
            price: Price {
                price: feed.price,
                conf: feed.conf,
                expo: feed.expo,
                publish_time: feed.publish_time,
            },
            ema_price: Price {
                price: feed.ema_price,
                conf: feed.ema_conf,
                expo: feed.expo,
                publish_time: feed.publish_time,
            },
        },
    };

    to_json_binary(&response)
}

/// Helper to create a mock Pyth contract for cw-multi-test.
pub fn mock_pyth_contract() -> Box<dyn cw_multi_test::Contract<cosmwasm_std::Empty>> {
    Box::new(cw_multi_test::ContractWrapper::new(
        execute,
        instantiate,
        query,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{message_info, mock_dependencies, mock_env, MockApi};

    fn test_addrs() -> cosmwasm_std::Addr {
        let api = MockApi::default();
        api.addr_make("creator")
    }

    fn atom_feed_id() -> String {
        "b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f8".to_string()
    }

    #[test]
    fn test_mock_pyth_instantiate_and_query() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let creator = test_addrs();
        let info = message_info(&creator, &[]);

        let feed_id = atom_feed_id();
        let msg = MockPythInstantiateMsg {
            feeds: vec![MockPriceFeedInit {
                id: feed_id.clone(),
                price: 1_052_000_000i64,
                conf: 1_000_000u64,
                expo: -8,
                publish_time: 1_700_000_000i64,
                ema_price: None,
                ema_conf: None,
            }],
        };

        let res = instantiate(deps.as_mut(), env.clone(), info, msg).unwrap();
        assert!(res
            .attributes
            .iter()
            .any(|a| a.key == "action" && a.value == "instantiate_mock_pyth"));

        // Query the feed using PriceFeedQuery
        let query_msg = PriceFeedQuery {
            price_feed: PriceFeedId { id: feed_id },
        };
        let query_bytes = cosmwasm_std::to_json_binary(&query_msg).unwrap();
        let res = query(deps.as_ref(), env, query_bytes).unwrap();

        // Verify the response structure
        let response: PriceFeedResponse = cosmwasm_std::from_json(&res).unwrap();
        assert_eq!(response.price_feed.price.price, 1_052_000_000i64);
        assert_eq!(response.price_feed.price.conf, 1_000_000u64);
        assert_eq!(response.price_feed.price.expo, -8);
        assert_eq!(response.price_feed.price.publish_time, 1_700_000_000i64);
        assert_eq!(response.price_feed.ema_price.price, 1_052_000_000i64);
        assert_eq!(response.price_feed.ema_price.conf, 1_000_000u64);
    }

    #[test]
    fn test_mock_pyth_update_feed() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let creator = test_addrs();
        let info = message_info(&creator, &[]);

        let feed_id = atom_feed_id();
        let msg = MockPythInstantiateMsg {
            feeds: vec![MockPriceFeedInit {
                id: feed_id.clone(),
                price: 1_052_000_000i64,
                conf: 1_000_000u64,
                expo: -8,
                publish_time: 1_700_000_000i64,
                ema_price: Some(1_050_000_000i64),
                ema_conf: Some(900_000u64),
            }],
        };
        instantiate(deps.as_mut(), env.clone(), info.clone(), msg).unwrap();

        // Update the price
        let update_msg = MockPythExecuteMsg::UpdateFeed {
            id: feed_id.clone(),
            price: 1_100_000_000i64,
            conf: 1_200_000u64,
            publish_time: 1_700_000_100i64,
        };
        let res = execute(deps.as_mut(), env.clone(), info, update_msg).unwrap();
        assert!(res
            .attributes
            .iter()
            .any(|a| a.key == "action" && a.value == "update_feed"));

        // Query again and verify new price
        let query_msg = PriceFeedQuery {
            price_feed: PriceFeedId { id: feed_id },
        };
        let query_bytes = cosmwasm_std::to_json_binary(&query_msg).unwrap();
        let res = query(deps.as_ref(), env, query_bytes).unwrap();

        let response: PriceFeedResponse = cosmwasm_std::from_json(&res).unwrap();
        assert_eq!(response.price_feed.price.price, 1_100_000_000i64);
        assert_eq!(response.price_feed.price.conf, 1_200_000u64);
        assert_eq!(response.price_feed.price.publish_time, 1_700_000_100i64);
        // Expo should remain unchanged
        assert_eq!(response.price_feed.price.expo, -8);
        // EMA values should remain unchanged from initial values
        assert_eq!(response.price_feed.ema_price.price, 1_050_000_000i64);
        assert_eq!(response.price_feed.ema_price.conf, 900_000u64);
    }

    #[test]
    fn test_mock_pyth_unknown_feed() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let creator = test_addrs();
        let info = message_info(&creator, &[]);

        // Instantiate with no feeds
        let msg = MockPythInstantiateMsg { feeds: vec![] };
        instantiate(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Query non-existent feed
        let query_msg = PriceFeedQuery {
            price_feed: PriceFeedId {
                id: "0000000000000000000000000000000000000000000000000000000000000000".to_string(),
            },
        };
        let query_bytes = cosmwasm_std::to_json_binary(&query_msg).unwrap();
        let res = query(deps.as_ref(), env, query_bytes);
        assert!(res.is_err());
    }

    #[test]
    fn test_mock_pyth_contract_helper() {
        // Just verify the helper compiles and returns a contract
        let _contract = mock_pyth_contract();
    }
}
