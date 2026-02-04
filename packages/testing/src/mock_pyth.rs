//! Mock Pyth contract for cw-multi-test integration testing.
//! 
//! This mock mimics the real Pyth CosmWasm contract's query interface,
//! returning price feed data that matches the `PriceFeedResponse` struct
//! defined in `pyth-oracle-adapter/src/pyth_types.rs`.

use cosmwasm_schema::cw_serde;
use cosmwasm_std::{to_json_binary, Binary, Deps, DepsMut, Env, MessageInfo, Response, StdResult};
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

/// Price identifier - 32 bytes serialized as 64-character hex string.
/// Mirrors the PriceIdentifier type from pyth_types.rs.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct PriceIdentifier([u8; 32]);

impl PriceIdentifier {
    /// Parse from a 64-character hex string (with optional `0x` prefix).
    pub fn from_hex(hex_str: &str) -> StdResult<Self> {
        let hex_str = hex_str.strip_prefix("0x").unwrap_or(hex_str);
        if hex_str.len() != 64 {
            return Err(cosmwasm_std::StdError::generic_err(format!(
                "Invalid PriceIdentifier hex string length: expected 64, got {}",
                hex_str.len()
            )));
        }
        let bytes = hex::decode(hex_str).map_err(|e| {
            cosmwasm_std::StdError::generic_err(format!("Invalid PriceIdentifier hex string: {}", e))
        })?;
        let mut array = [0u8; 32];
        array.copy_from_slice(&bytes);
        Ok(Self(array))
    }
}

impl<'de> serde::Deserialize<'de> for PriceIdentifier {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        struct PriceIdentifierVisitor;

        impl<'de> serde::de::Visitor<'de> for PriceIdentifierVisitor {
            type Value = PriceIdentifier;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a 64-character hex string representing a 32-byte price identifier")
            }

            fn visit_str<E>(self, value: &str) -> Result<PriceIdentifier, E>
            where
                E: serde::de::Error,
            {
                PriceIdentifier::from_hex(value).map_err(|e| {
                    serde::de::Error::custom(format!(
                        "Invalid PriceIdentifier hex string '{}': {}",
                        value, e
                    ))
                })
            }
        }

        deserializer.deserialize_str(PriceIdentifierVisitor)
    }
}

impl serde::Serialize for PriceIdentifier {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&hex::encode(self.0))
    }
}

impl schemars::JsonSchema for PriceIdentifier {
    fn schema_name() -> String {
        "PriceIdentifier".to_string()
    }

    fn json_schema(gen: &mut schemars::gen::SchemaGenerator) -> schemars::schema::Schema {
        String::json_schema(gen)
    }
}

/// Query messages for the Pyth contract.
#[cw_serde]
#[derive(cosmwasm_schema::QueryResponses)]
pub enum PythQueryMsg {
    /// Query a single price feed by ID.
    #[returns(PriceFeedResponse)]
    PriceFeed { id: PriceIdentifier },
}

/// Price data structure matching Pyth's format.
#[cw_serde]
#[derive(Copy)]
pub struct Price {
    pub price: i64,
    pub conf: u64,
    pub expo: i32,
    pub publish_time: i64,
}

/// Complete price feed data.
#[cw_serde]
pub struct PriceFeed {
    pub id: PriceIdentifier,
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

/// Mock Pyth contract instantiate entry point for use in tests.
pub fn mock_pyth_instantiate(
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

/// Mock Pyth contract execute entry point for use in tests.
pub fn mock_pyth_execute(
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

/// Mock Pyth contract query entry point for use in tests.
pub fn mock_pyth_query(deps: Deps, _env: Env, msg: PythQueryMsg) -> StdResult<Binary> {
    match msg {
        PythQueryMsg::PriceFeed { id } => {
            let id_hex = hex::encode(id.0);
            let feed = FEEDS.load(deps.storage, &id_hex)?;

            let response = PriceFeedResponse {
                price_feed: PriceFeed {
                    id,
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
    }
}

/// Helper to create a mock Pyth contract for cw-multi-test.
#[allow(dead_code)]
pub fn mock_pyth_contract() -> cw_multi_test::ContractWrapper<
    MockPythExecuteMsg,
    MockPythInstantiateMsg,
    PythQueryMsg,
    cosmwasm_std::StdError,
    cosmwasm_std::StdError,
    cosmwasm_std::StdError,
> {
    use cw_multi_test::ContractWrapper;

    ContractWrapper::new(
        mock_pyth_execute,
        mock_pyth_instantiate,
        mock_pyth_query,
    )
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

    fn atom_feed_id_bytes() -> [u8; 32] {
        hex::decode(atom_feed_id()).unwrap().try_into().unwrap()
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

        let res = mock_pyth_instantiate(deps.as_mut(), env.clone(), info, msg).unwrap();
        assert!(res
            .attributes
            .iter()
            .any(|a| a.key == "action" && a.value == "instantiate_mock_pyth"));

        // Query the feed using PythQueryMsg
        let query_msg = PythQueryMsg::PriceFeed {
            id: PriceIdentifier(atom_feed_id_bytes()),
        };
        let res = mock_pyth_query(deps.as_ref(), env, query_msg).unwrap();

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
        mock_pyth_instantiate(deps.as_mut(), env.clone(), info.clone(), msg).unwrap();

        // Update the price
        let update_msg = MockPythExecuteMsg::UpdateFeed {
            id: feed_id.clone(),
            price: 1_100_000_000i64,
            conf: 1_200_000u64,
            publish_time: 1_700_000_100i64,
        };
        let res = mock_pyth_execute(deps.as_mut(), env.clone(), info, update_msg).unwrap();
        assert!(res
            .attributes
            .iter()
            .any(|a| a.key == "action" && a.value == "update_feed"));

        // Query again and verify new price
        let query_msg = PythQueryMsg::PriceFeed {
            id: PriceIdentifier(atom_feed_id_bytes()),
        };
        let res = mock_pyth_query(deps.as_ref(), env, query_msg).unwrap();

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
        mock_pyth_instantiate(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Query non-existent feed
        let query_msg = PythQueryMsg::PriceFeed {
            id: PriceIdentifier([0u8; 32]),
        };
        let res = mock_pyth_query(deps.as_ref(), env, query_msg);
        assert!(res.is_err());
    }

    #[test]
    fn test_mock_pyth_contract_helper() {
        // Just verify the helper compiles and returns a contract
        let _contract = mock_pyth_contract();
    }

    /// Integration test that deploys the mock through cw-multi-test and queries it.
    /// This exercises the full dispatch path and would catch query type mismatches.
    #[test]
    fn test_mock_pyth_through_multitest() {
        use cw_multi_test::{App, Executor, IntoAddr};

        let mut app = App::default();
        let code_id = app.store_code(Box::new(mock_pyth_contract()));

        let feed_id_hex = atom_feed_id();
        let feed_id_bytes = atom_feed_id_bytes();

        let pyth_addr = app
            .instantiate_contract(
                code_id,
                "admin".into_addr(),
                &MockPythInstantiateMsg {
                    feeds: vec![MockPriceFeedInit {
                        id: feed_id_hex,
                        price: 1_052_000_000i64,
                        conf: 1_000_000u64,
                        expo: -8,
                        publish_time: 1_700_000_000i64,
                        ema_price: None,
                        ema_conf: None,
                    }],
                },
                &[],
                "mock-pyth",
                None,
            )
            .unwrap();

        // Query through the app (this exercises the full dispatch path)
        let resp: PriceFeedResponse = app
            .wrap()
            .query_wasm_smart(
                pyth_addr,
                &PythQueryMsg::PriceFeed {
                    id: PriceIdentifier(feed_id_bytes),
                },
            )
            .unwrap();

        assert_eq!(resp.price_feed.price.price, 1_052_000_000i64);
        assert_eq!(resp.price_feed.price.conf, 1_000_000u64);
        assert_eq!(resp.price_feed.price.expo, -8);
        assert_eq!(resp.price_feed.price.publish_time, 1_700_000_000i64);
    }
}
