//! Mock Pyth contract for local development and e2e testing.
//!
//! This contract mimics the real Pyth CosmWasm contract's interface,
//! allowing the pyth-oracle-adapter to be tested locally without
//! connecting to a real Pyth deployment.
//!
//! The contract stores price feeds keyed by their 64-character hex feed ID
//! and responds to `PriceFeed { id }` queries with `PriceFeedResponse`.

use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{entry_point, to_json_binary, Binary, Deps, DepsMut, Env, MessageInfo, Response, StdResult};
use cw_storage_plus::Map;
use schemars::JsonSchema;
use serde::{de::Visitor, Deserialize, Deserializer, Serialize, Serializer};
use std::fmt;

/// Price identifier - 32 bytes serialized as 64-character hex string.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct PriceIdentifier([u8; 32]);

impl PriceIdentifier {
    /// Create a new PriceIdentifier from a 32-byte array.
    pub const fn new(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }

    /// Get the underlying bytes.
    pub const fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }

    /// Convert to a 64-character hex string.
    pub fn to_hex(&self) -> String {
        hex::encode(self.0)
    }

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

impl Serialize for PriceIdentifier {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_hex())
    }
}

impl<'de> Deserialize<'de> for PriceIdentifier {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct PriceIdentifierVisitor;

        impl<'de> Visitor<'de> for PriceIdentifierVisitor {
            type Value = PriceIdentifier;

            fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
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

impl JsonSchema for PriceIdentifier {
    fn schema_name() -> String {
        "PriceIdentifier".to_string()
    }

    fn json_schema(gen: &mut schemars::gen::SchemaGenerator) -> schemars::schema::Schema {
        String::json_schema(gen)
    }
}

/// Price data from Pyth.
#[cw_serde]
#[derive(Copy)]
pub struct Price {
    /// Price value.
    pub price: i64,
    /// Confidence interval.
    pub conf: u64,
    /// Exponent (price = raw_price * 10^expo).
    pub expo: i32,
    /// Unix timestamp when this price was published.
    pub publish_time: i64,
}

/// Complete price feed data.
#[cw_serde]
pub struct PriceFeed {
    /// The price feed identifier.
    pub id: PriceIdentifier,
    /// Current price.
    pub price: Price,
    /// EMA (exponential moving average) price.
    pub ema_price: Price,
}

/// Response from Pyth price feed query.
#[cw_serde]
pub struct PriceFeedResponse {
    /// The price feed data.
    pub price_feed: PriceFeed,
}

/// Instantiate message for the mock Pyth contract.
#[cw_serde]
pub struct InstantiateMsg {
    /// Price feeds to initialize at deployment.
    pub feeds: Vec<PriceFeedInit>,
}

/// Initial price feed configuration for instantiation.
#[cw_serde]
pub struct PriceFeedInit {
    /// 64-character hex feed ID.
    pub id: String,
    /// Price value.
    pub price: i64,
    /// Confidence interval.
    pub conf: u64,
    /// Exponent (price = raw_price * 10^expo).
    pub expo: i32,
    /// Unix timestamp when this price was published.
    pub publish_time: i64,
    /// EMA price (defaults to same as price if not provided).
    pub ema_price: Option<i64>,
    /// EMA confidence (defaults to same as conf if not provided).
    pub ema_conf: Option<u64>,
}

/// Execute messages for the mock Pyth contract.
#[cw_serde]
pub enum ExecuteMsg {
    /// Update a price feed (for simulating price movements).
    UpdateFeed {
        /// Feed ID (64-character hex).
        id: String,
        /// New price value.
        price: i64,
        /// New confidence interval.
        conf: u64,
        /// New publish timestamp.
        publish_time: i64,
    },
}

/// Query messages for the Pyth contract.
#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    /// Query a single price feed by ID.
    #[returns(PriceFeedResponse)]
    PriceFeed { id: PriceIdentifier },
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

/// Storage: feed_id (hex string) → stored feed data.
pub const FEEDS: Map<&str, StoredFeed> = Map::new("feeds");

/// Instantiate entry point.
#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: InstantiateMsg,
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

/// Execute entry point.
#[entry_point]
pub fn execute(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: ExecuteMsg,
) -> StdResult<Response> {
    match msg {
        ExecuteMsg::UpdateFeed {
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

/// Query entry point.
#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::PriceFeed { id } => {
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

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{message_info, mock_dependencies, mock_env, MockApi};

    fn test_addr() -> cosmwasm_std::Addr {
        let api = MockApi::default();
        api.addr_make("creator")
    }

    fn atom_feed_id() -> String {
        "b00b60f88b03a6a625a8d1c048c3f66653edf217439983d037e7222c4e612819".to_string()
    }

    fn atom_feed_id_bytes() -> [u8; 32] {
        hex::decode(atom_feed_id()).unwrap().try_into().unwrap()
    }

    #[test]
    fn test_instantiate_and_query() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let creator = test_addr();
        let info = message_info(&creator, &[]);

        let feed_id = atom_feed_id();
        let msg = InstantiateMsg {
            feeds: vec![PriceFeedInit {
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

        // Query the feed
        let query_msg = QueryMsg::PriceFeed {
            id: PriceIdentifier(atom_feed_id_bytes()),
        };
        let res = query(deps.as_ref(), env, query_msg).unwrap();

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
    fn test_update_feed() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let creator = test_addr();
        let info = message_info(&creator, &[]);

        let feed_id = atom_feed_id();
        let msg = InstantiateMsg {
            feeds: vec![PriceFeedInit {
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
        let update_msg = ExecuteMsg::UpdateFeed {
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
        let query_msg = QueryMsg::PriceFeed {
            id: PriceIdentifier(atom_feed_id_bytes()),
        };
        let res = query(deps.as_ref(), env, query_msg).unwrap();

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
    fn test_unknown_feed() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let creator = test_addr();
        let info = message_info(&creator, &[]);

        // Instantiate with no feeds
        let msg = InstantiateMsg { feeds: vec![] };
        instantiate(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Query non-existent feed
        let query_msg = QueryMsg::PriceFeed {
            id: PriceIdentifier([0u8; 32]),
        };
        let res = query(deps.as_ref(), env, query_msg);
        assert!(res.is_err());
    }
}
