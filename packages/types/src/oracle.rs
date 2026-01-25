use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Api, Decimal, StdResult};

/// Oracle query interface.
/// This defines the interface that oracles must implement.
#[cw_serde]
#[derive(QueryResponses)]
pub enum OracleQueryMsg {
    /// Query price for a specific denom
    #[returns(PriceResponse)]
    Price { denom: String },
}

/// Price response from oracle.
#[cw_serde]
pub struct PriceResponse {
    /// The denom being priced
    pub denom: String,
    /// Price in USD (or reference currency)
    pub price: Decimal,
    /// Timestamp of the price
    pub updated_at: u64,
}

/// Named oracle types with their configuration and validation rules.
#[cw_serde]
pub enum OracleType {
    /// Generic oracle following Stone's OracleQueryMsg interface.
    /// Use this for custom oracles or testing.
    Generic {
        /// Optional expected code ID. If None, code ID is not validated.
        expected_code_id: Option<u64>,
        /// Maximum allowed staleness in seconds (default: 300s / 5 min)
        max_staleness_secs: u64,
    },
    /// Pyth oracle adapter.
    /// The adapter contract wraps Pyth and implements Stone's OracleQueryMsg interface.
    Pyth {
        /// Expected Pyth adapter contract code ID
        expected_code_id: u64,
        /// Maximum allowed staleness in seconds (default: 60s / 1 min)
        max_staleness_secs: u64,
        /// Maximum confidence interval as ratio of price (e.g., 0.01 = 1%)
        max_confidence_ratio: Decimal,
    },
    /// Chainlink oracle (future support)
    Chainlink {
        /// Expected Chainlink adapter contract code ID
        expected_code_id: u64,
        /// Maximum allowed staleness in seconds (default: 3600s / 1 hour)
        max_staleness_secs: u64,
    },
}

impl OracleType {
    /// Returns the max staleness in seconds for this oracle type
    pub fn max_staleness_secs(&self) -> u64 {
        match self {
            OracleType::Generic { max_staleness_secs, .. } => *max_staleness_secs,
            OracleType::Pyth { max_staleness_secs, .. } => *max_staleness_secs,
            OracleType::Chainlink { max_staleness_secs, .. } => *max_staleness_secs,
        }
    }

    /// Returns the expected code ID if validation is required
    pub fn expected_code_id(&self) -> Option<u64> {
        match self {
            OracleType::Generic { expected_code_id, .. } => *expected_code_id,
            OracleType::Pyth { expected_code_id, .. } => Some(*expected_code_id),
            OracleType::Chainlink { expected_code_id, .. } => Some(*expected_code_id),
        }
    }
}

impl Default for OracleType {
    fn default() -> Self {
        OracleType::Generic {
            expected_code_id: None,
            max_staleness_secs: 300, // 5 minutes
        }
    }
}

/// Oracle configuration stored in market (validated addresses).
#[cw_serde]
pub struct OracleConfig {
    /// Oracle contract address
    pub address: Addr,
    /// Oracle type with validation rules
    pub oracle_type: OracleType,
}

/// Oracle configuration passed during instantiation (unchecked addresses).
#[cw_serde]
pub struct OracleConfigUnchecked {
    /// Oracle contract address (to be validated)
    pub address: String,
    /// Oracle type with validation rules
    pub oracle_type: OracleType,
}

impl OracleConfigUnchecked {
    /// Validate the address and convert to OracleConfig
    pub fn validate(self, api: &dyn Api) -> StdResult<OracleConfig> {
        Ok(OracleConfig {
            address: api.addr_validate(&self.address)?,
            oracle_type: self.oracle_type,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_price_response_serialization() {
        let response = PriceResponse {
            denom: "uatom".to_string(),
            price: Decimal::from_ratio(10u128, 1u128),
            updated_at: 1000,
        };

        let json = cosmwasm_std::to_json_string(&response).unwrap();
        let parsed: PriceResponse = cosmwasm_std::from_json(json).unwrap();

        assert_eq!(parsed.denom, "uatom");
        assert_eq!(parsed.price, Decimal::from_ratio(10u128, 1u128));
        assert_eq!(parsed.updated_at, 1000);
    }
}
