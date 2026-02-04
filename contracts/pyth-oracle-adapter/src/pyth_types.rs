//! Minimal Pyth types for oracle adapter.
//! These types mirror the Pyth SDK structures for querying price feeds.

use cosmwasm_schema::cw_serde;
use cosmwasm_std::StdError;
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

    /// Parse from a 64-character hex string.
    pub fn from_hex(hex_str: &str) -> Result<Self, StdError> {
        if hex_str.len() != 64 {
            return Err(StdError::generic_err(format!(
                "Invalid PriceIdentifier hex string length: expected 64, got {}",
                hex_str.len()
            )));
        }
        let bytes = hex::decode(hex_str).map_err(|e| {
            StdError::generic_err(format!("Invalid PriceIdentifier hex string: {}", e))
        })?;
        let mut array = [0u8; 32];
        array.copy_from_slice(&bytes);
        Ok(Self(array))
    }
}

impl fmt::Display for PriceIdentifier {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_hex())
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

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
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
    /// Price value (can be negative for some feeds).
    pub price: i64,
    /// Confidence interval (uncertainty around the price).
    pub conf: u64,
    /// Exponent (price = raw_price * 10^expo).
    pub expo: i32,
    /// Unix timestamp when this price was published.
    pub publish_time: i64,
}

impl Price {
    /// Get the price as a decimal value.
    /// Returns None if the exponent would cause overflow/underflow.
    pub fn get_price_as_decimal(&self) -> Option<cosmwasm_std::Decimal> {
        if self.expo >= 0 {
            // Positive exponent: multiply
            let multiplier = 10u128.checked_pow(self.expo as u32)?;
            let price_abs = self.price.unsigned_abs() as u128;
            let scaled = price_abs.checked_mul(multiplier)?;
            if self.price < 0 {
                // Note: Decimal can't represent negative values in CosmWasm
                return None;
            }
            Some(cosmwasm_std::Decimal::from_ratio(scaled, 1u128))
        } else {
            // Negative exponent: divide
            let divisor = 10u128.checked_pow((-self.expo) as u32)?;
            let price_abs = self.price.unsigned_abs() as u128;
            if self.price < 0 {
                return None;
            }
            Some(cosmwasm_std::Decimal::from_ratio(price_abs, divisor))
        }
    }

    /// Get the confidence as a ratio of the price.
    pub fn get_confidence_ratio(&self) -> Option<cosmwasm_std::Decimal> {
        if self.price <= 0 {
            return None;
        }
        Some(cosmwasm_std::Decimal::from_ratio(self.conf, self.price as u64))
    }
}

/// Complete price feed data from Pyth.
#[cw_serde]
#[derive(Copy)]
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

/// Query messages for the Pyth contract.
#[cw_serde]
#[derive(cosmwasm_schema::QueryResponses)]
pub enum PythQueryMsg {
    /// Query a single price feed by ID.
    #[returns(PriceFeedResponse)]
    PriceFeed { id: PriceIdentifier },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_price_identifier_hex_roundtrip() {
        // Test with a known Pyth feed ID (e.g., ATOM/USD)
        let hex_str = "b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f8";
        let id = PriceIdentifier::from_hex(hex_str).unwrap();
        assert_eq!(id.to_hex(), hex_str);

        // Test serialization roundtrip
        let json = serde_json_wasm::to_string(&id).unwrap();
        assert_eq!(json, format!("\"{}\"", hex_str));

        let deserialized: PriceIdentifier = serde_json_wasm::from_str(&json).unwrap();
        assert_eq!(id, deserialized);
    }

    #[test]
    fn test_price_identifier_invalid_hex() {
        // Too short
        let result = PriceIdentifier::from_hex("abcd");
        assert!(result.is_err());

        // Too long
        let result = PriceIdentifier::from_hex("a".repeat(65).as_str());
        assert!(result.is_err());

        // Invalid characters
        let result = PriceIdentifier::from_hex("zzzz");
        assert!(result.is_err());
    }

    #[test]
    fn test_price_decimal_conversion() {
        // Price = 12345, expo = -2 -> 123.45
        let price = Price {
            price: 12345,
            conf: 100,
            expo: -2,
            publish_time: 1000,
        };
        let decimal = price.get_price_as_decimal().unwrap();
        assert_eq!(decimal, cosmwasm_std::Decimal::from_ratio(12345u128, 100u128));

        // Price = 100, expo = 2 -> 10000
        let price = Price {
            price: 100,
            conf: 10,
            expo: 2,
            publish_time: 1000,
        };
        let decimal = price.get_price_as_decimal().unwrap();
        assert_eq!(decimal, cosmwasm_std::Decimal::from_ratio(10000u128, 1u128));
    }

    #[test]
    fn test_price_confidence_ratio() {
        let price = Price {
            price: 10000,
            conf: 100,
            expo: -2,
            publish_time: 1000,
        };
        let ratio = price.get_confidence_ratio().unwrap();
        // conf / price = 100 / 10000 = 0.01 = 1%
        assert_eq!(ratio, cosmwasm_std::Decimal::from_ratio(100u128, 10000u128));
    }

    #[test]
    fn test_pyth_query_msg_schema() {
        let msg = PythQueryMsg::PriceFeed {
            id: PriceIdentifier::new([0u8; 32]),
        };
        let json = cosmwasm_std::to_json_string(&msg).unwrap();
        assert!(json.contains("price_feed"));
    }
}
