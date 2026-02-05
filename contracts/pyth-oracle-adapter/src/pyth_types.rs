//! Minimal Pyth types for oracle adapter.
//! These types mirror the Pyth SDK structures for querying price feeds.

use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Decimal, StdError};
use schemars::JsonSchema;
use serde::{de::Visitor, Deserialize, Deserializer, Serialize, Serializer};
use std::fmt;

use crate::error::ContractError;

/// Convert a Pyth price and exponent to a cosmwasm_std::Decimal.
///
/// Pyth prices are represented as `price * 10^expo` where expo is typically negative.
/// Examples:
/// - (1_052_000_000, -8) → $10.52
/// - (100, 2) → $10000
/// - (42, 0) → $42
///
/// # Errors
/// - `ContractError::InvalidPrice` if price <= 0
/// - `ContractError::ExponentOutOfRange` if |expo| > 18
/// - `ContractError::Overflow` if the calculation overflows
pub fn pyth_price_to_decimal(price: i64, expo: i32) -> Result<Decimal, ContractError> {
    // 1. Reject negative or zero price
    if price <= 0 {
        return Err(ContractError::InvalidPrice {
            reason: format!("price must be positive, got {}", price),
        });
    }

    // 2. Reject out-of-range exponents (|expo| > 18)
    // Decimal has 18 decimal places max, exponents beyond this overflow or lose precision
    if expo.unsigned_abs() > 18 {
        return Err(ContractError::ExponentOutOfRange { expo });
    }

    // 3. Convert based on exponent sign
    let price_u128 = price as u128;
    if expo >= 0 {
        // price * 10^expo
        let multiplier = 10u128
            .checked_pow(expo as u32)
            .ok_or(ContractError::Overflow)?;
        let scaled = price_u128
            .checked_mul(multiplier)
            .ok_or(ContractError::Overflow)?;
        Decimal::from_atomics(scaled, 0).map_err(|_| ContractError::Overflow)
    } else {
        // price / 10^|expo| → use Decimal::from_atomics
        let decimal_places = (-expo) as u32;
        Decimal::from_atomics(price_u128, decimal_places).map_err(|_| ContractError::Overflow)
    }
}

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
    pub fn from_hex(hex_str: &str) -> Result<Self, StdError> {
        // Strip optional 0x prefix
        let hex_str = hex_str.strip_prefix("0x").unwrap_or(hex_str);
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
    /// Returns None if the price is negative/zero or if the exponent would cause overflow.
    pub fn get_price_as_decimal(&self) -> Option<cosmwasm_std::Decimal> {
        pyth_price_to_decimal(self.price, self.expo).ok()
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
    fn test_price_identifier_from_hex_with_prefix() {
        // Test with 0x prefix
        let hex_str = "b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f8";
        let hex_with_prefix = format!("0x{}", hex_str);
        
        let id_from_plain = PriceIdentifier::from_hex(hex_str).unwrap();
        let id_from_prefixed = PriceIdentifier::from_hex(&hex_with_prefix).unwrap();
        
        assert_eq!(id_from_plain, id_from_prefixed);
        assert_eq!(id_from_prefixed.to_hex(), hex_str);
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
    fn test_confidence_ratio_boundary_exactly_max() {
        // Test that a confidence ratio of exactly max_confidence_ratio passes through
        // (since the code uses strict > for the error condition)
        // price=10000, conf=100 -> ratio = 100/10000 = 0.01
        let price = Price {
            price: 10000,
            conf: 100,
            expo: 0,
            publish_time: 1000,
        };
        let ratio = price.get_confidence_ratio().unwrap();
        let max_confidence_ratio = Decimal::from_ratio(1u128, 100u128); // 0.01
        
        // Since the check is `conf_ratio > max_confidence_ratio`, 
        // a ratio exactly equal to max should NOT trigger the error
        assert!(!(ratio > max_confidence_ratio), 
            "ratio {} should NOT be > max_confidence_ratio {} (they are equal)", 
            ratio, max_confidence_ratio);
        assert_eq!(ratio, max_confidence_ratio);
    }

    // ==========================================================================
    // Issue #87: Additional confidence validation tests
    // ==========================================================================

    #[test]
    fn confidence_ratio_1_percent_passes() {
        // Issue #87: conf=10, price=1000, max_ratio=0.02 -> 1% < 2% → pass
        // ratio = 10/1000 = 0.01
        let price = Price {
            price: 1000,
            conf: 10,
            expo: 0,
            publish_time: 1000,
        };
        let ratio = price.get_confidence_ratio().unwrap();
        let max_ratio = Decimal::from_ratio(2u128, 100u128); // 0.02
        
        // Should pass: 1% < 2%
        assert!(ratio < max_ratio, "ratio {} should be < max_ratio {}", ratio, max_ratio);
        assert!(!(ratio > max_ratio), "ratio {} should NOT exceed max_ratio {}", ratio, max_ratio);
    }

    #[test]
    fn confidence_ratio_3_percent_fails() {
        // Issue #87: conf=30, price=1000, max_ratio=0.02 -> 3% > 2% → fail
        // ratio = 30/1000 = 0.03
        let price = Price {
            price: 1000,
            conf: 30,
            expo: 0,
            publish_time: 1000,
        };
        let ratio = price.get_confidence_ratio().unwrap();
        let max_ratio = Decimal::from_ratio(2u128, 100u128); // 0.02
        
        // Should fail: 3% > 2%
        assert!(ratio > max_ratio, "ratio {} should exceed max_ratio {}", ratio, max_ratio);
    }

    #[test]
    fn confidence_ratio_zero_conf_always_passes() {
        // Issue #87: conf=0 -> always passes regardless of max_ratio
        let price = Price {
            price: 1000,
            conf: 0,
            expo: 0,
            publish_time: 1000,
        };
        let ratio = price.get_confidence_ratio().unwrap();
        
        // Even with extremely strict max_ratio, conf=0 should pass
        let very_strict_max = Decimal::from_ratio(1u128, 10000u128); // 0.0001
        assert_eq!(ratio, Decimal::zero(), "ratio should be zero when conf=0");
        assert!(!(ratio > very_strict_max), "zero ratio should not exceed any positive max_ratio");
    }

    #[test]
    fn confidence_ratio_exactly_at_max_boundary() {
        // Issue #87: Boundary at exactly max ratio
        // For max_ratio=0.02, price=1000, we need conf=20 to get exactly 2%
        // ratio = 20/1000 = 0.02 exactly
        let price = Price {
            price: 1000,
            conf: 20,
            expo: 0,
            publish_time: 1000,
        };
        let ratio = price.get_confidence_ratio().unwrap();
        let max_ratio = Decimal::from_ratio(2u128, 100u128); // 0.02
        
        // Exactly at boundary - should NOT fail (check is > not >=)
        assert_eq!(ratio, max_ratio, "ratio should equal max_ratio at boundary");
        assert!(!(ratio > max_ratio), "ratio at boundary should NOT exceed max_ratio");
    }

    #[test]
    fn test_confidence_ratio_boundary_just_above_max() {
        // Test that a confidence ratio just above max_confidence_ratio would fail
        // price=10000, conf=101 -> ratio = 101/10000 = 0.0101
        let price = Price {
            price: 10000,
            conf: 101,
            expo: 0,
            publish_time: 1000,
        };
        let ratio = price.get_confidence_ratio().unwrap();
        let max_confidence_ratio = Decimal::from_ratio(1u128, 100u128); // 0.01
        
        // Since the check is `conf_ratio > max_confidence_ratio`, 
        // a ratio slightly above max SHOULD trigger the error
        assert!(ratio > max_confidence_ratio, 
            "ratio {} should be > max_confidence_ratio {}", 
            ratio, max_confidence_ratio);
    }

    #[test]
    fn test_negative_price_handling() {
        // Negative prices return None for get_price_as_decimal (delegates to pyth_price_to_decimal)
        let price = Price {
            price: -12345,
            conf: 100,
            expo: -2,
            publish_time: 1000,
        };
        let result = price.get_price_as_decimal();
        assert!(result.is_none(), "Expected None for negative price, got {:?}", result);

        // Zero price returns None for get_price_as_decimal (delegates to pyth_price_to_decimal)
        let price = Price {
            price: 0,
            conf: 100,
            expo: -2,
            publish_time: 1000,
        };
        let result = price.get_price_as_decimal();
        assert!(result.is_none(), "Expected None for zero price");
        assert!(price.get_confidence_ratio().is_none());
    }

    #[test]
    fn test_pyth_query_msg_schema() {
        let msg = PythQueryMsg::PriceFeed {
            id: PriceIdentifier::new([0u8; 32]),
        };
        let json = cosmwasm_std::to_json_string(&msg).unwrap();
        assert!(json.contains("price_feed"));
    }

    // ==========================================================================
    // Tests for pyth_price_to_decimal function
    // ==========================================================================

    #[test]
    fn standard_conversion() {
        // (1_052_000_000, -8) → 10.52
        let result = pyth_price_to_decimal(1_052_000_000, -8).unwrap();
        let expected = Decimal::from_atomics(1052u128, 2).unwrap(); // 10.52
        assert_eq!(result, expected);
    }

    #[test]
    fn positive_exponent() {
        // (100, 2) → 10000
        let result = pyth_price_to_decimal(100, 2).unwrap();
        let expected = Decimal::from_atomics(10000u128, 0).unwrap();
        assert_eq!(result, expected);
    }

    #[test]
    fn zero_exponent() {
        // (42, 0) → 42
        let result = pyth_price_to_decimal(42, 0).unwrap();
        let expected = Decimal::from_atomics(42u128, 0).unwrap();
        assert_eq!(result, expected);
    }

    #[test]
    fn large_negative_expo() {
        // (1, -18) → 0.000000000000000001
        let result = pyth_price_to_decimal(1, -18).unwrap();
        let expected = Decimal::from_atomics(1u128, 18).unwrap();
        assert_eq!(result, expected);
    }

    #[test]
    fn typical_btc_price() {
        // (6_500_000_000_000, -8) → 65000.0
        let result = pyth_price_to_decimal(6_500_000_000_000i64, -8).unwrap();
        let expected = Decimal::from_atomics(65000u128, 0).unwrap();
        assert_eq!(result, expected);
    }

    #[test]
    fn typical_stablecoin() {
        // (99_990_000, -8) → 0.9999
        let result = pyth_price_to_decimal(99_990_000, -8).unwrap();
        let expected = Decimal::from_atomics(9999u128, 4).unwrap(); // 0.9999
        assert_eq!(result, expected);
    }

    #[test]
    fn small_price() {
        // (1, -8) → 0.00000001
        let result = pyth_price_to_decimal(1, -8).unwrap();
        let expected = Decimal::from_atomics(1u128, 8).unwrap();
        assert_eq!(result, expected);
    }

    #[test]
    fn negative_price_rejected() {
        // (-100, -8) → InvalidPrice error
        let result = pyth_price_to_decimal(-100, -8);
        assert!(
            matches!(result, Err(ContractError::InvalidPrice { .. })),
            "Expected InvalidPrice error for negative price, got {:?}",
            result
        );
    }

    #[test]
    fn zero_price_rejected() {
        // (0, -8) → InvalidPrice error
        let result = pyth_price_to_decimal(0, -8);
        assert!(
            matches!(result, Err(ContractError::InvalidPrice { .. })),
            "Expected InvalidPrice error for zero price, got {:?}",
            result
        );
    }

    #[test]
    fn expo_too_large() {
        // (100, 19) → ExponentOutOfRange error
        let result = pyth_price_to_decimal(100, 19);
        assert!(matches!(
            result,
            Err(ContractError::ExponentOutOfRange { expo: 19 })
        ));
    }

    #[test]
    fn expo_too_negative() {
        // (100, -19) → ExponentOutOfRange error
        let result = pyth_price_to_decimal(100, -19);
        assert!(matches!(
            result,
            Err(ContractError::ExponentOutOfRange { expo: -19 })
        ));
    }

    #[test]
    fn max_safe_values() {
        // Test with large values that still fit within Decimal (18 decimal places max)
        // Decimal::MAX is approximately 3.4e38
        
        // Large value with negative exponent to keep it within bounds
        // 1e18 with 18 decimal places = 1.0
        let result = pyth_price_to_decimal(1_000_000_000_000_000_000i64, -18);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), Decimal::one());

        // Test with moderate positive exponent
        // 1e9 * 10^9 = 1e18 which easily fits in Decimal
        let result = pyth_price_to_decimal(1_000_000_000i64, 9);
        assert!(result.is_ok());
        
        // Test with reasonably large price values using known-working patterns
        // BTC price ~65000 with 8 decimals = 6_500_000_000_000
        let result = pyth_price_to_decimal(6_500_000_000_000i64, -8);
        assert!(result.is_ok());
        
        // Test large price with exponent 0
        let result = pyth_price_to_decimal(1_000_000_000_000_000i64, 0);
        assert!(result.is_ok());
    }

    #[test]
    fn positive_exponent_overflow() {
        // Test overflow protection in from_atomics.
        // Decimal::from_atomics(value, 0) interprets value as an integer, but Decimal
        // has 18 decimal places internally, so it computes value * 10^18.
        // u128::MAX is ~3.4e38, so value * 10^18 must be < 3.4e38, meaning value < 3.4e20.
        // With expo=18, scaled = price * 10^18, so price * 10^18 must be < 3.4e20,
        // meaning price < 340.

        // price=100 with expo=18: scaled=10^20, from_atomics stores 10^38 < 3.4e38 ✓
        let result = pyth_price_to_decimal(100, 18);
        assert!(
            result.is_ok(),
            "price=100, expo=18 should succeed, got: {:?}",
            result
        );

        // price=1000 with expo=18: scaled=10^21, from_atomics tries 10^39 > 3.4e38 → Overflow
        let result = pyth_price_to_decimal(1000, 18);
        assert!(
            matches!(result, Err(ContractError::Overflow)),
            "Expected Overflow for price=1000, expo=18 (exceeds Decimal capacity), got: {:?}",
            result
        );

        // Verify exponent out of range is caught separately from overflow
        let result = pyth_price_to_decimal(100, 19);
        assert!(
            matches!(result, Err(ContractError::ExponentOutOfRange { expo: 19 })),
            "Expected ExponentOutOfRange for expo=19, got {:?}",
            result
        );

        // Test at boundary: price=340, expo=18
        // scaled = 340 * 10^18 = 3.4e20
        // from_atomics stores 3.4e20 * 10^18 = 3.4e38 which is near u128::MAX
        let result = pyth_price_to_decimal(340, 18);
        assert!(
            result.is_ok(),
            "price=340, expo=18 should succeed at boundary, got: {:?}",
            result
        );
    }
}
