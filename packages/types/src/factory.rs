use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Coin};

use crate::CreateMarketParams;

/// Factory contract configuration.
#[cw_serde]
pub struct FactoryConfig {
    /// Contract owner (can update config)
    pub owner: Addr,
    /// Address to receive protocol fees
    pub protocol_fee_collector: Addr,
    /// Fee required to create a new market
    pub market_creation_fee: Coin,
    /// Code ID for instantiating market contracts
    pub market_code_id: u64,
}

/// Record of a created market.
#[cw_serde]
pub struct MarketRecord {
    /// Unique market ID (hash-based)
    pub market_id: String,
    /// Market contract address
    pub address: Addr,
    /// Curator who created the market
    pub curator: Addr,
    /// Collateral asset denom
    pub collateral_denom: String,
    /// Debt asset denom
    pub debt_denom: String,
    /// Creation timestamp
    pub created_at: u64,
}

// ============================================================================
// Factory Contract Messages
// ============================================================================

/// Instantiate message for factory contract.
#[cw_serde]
pub struct FactoryInstantiateMsg {
    /// Contract owner
    pub owner: String,
    /// Address to receive protocol fees
    pub protocol_fee_collector: String,
    /// Fee required to create a market
    pub market_creation_fee: Coin,
    /// Code ID for market contracts
    pub market_code_id: u64,
}

/// Execute messages for factory contract.
#[cw_serde]
pub enum FactoryExecuteMsg {
    /// Create a new isolated market (send creation fee with msg)
    CreateMarket {
        /// Collateral asset denom
        collateral_denom: String,
        /// Debt asset denom
        debt_denom: String,
        /// Oracle contract address
        oracle: String,
        /// Market parameters (boxed to reduce enum size)
        params: Box<CreateMarketParams>,
        /// Optional salt for creating multiple markets with same pair
        salt: Option<u64>,
    },

    /// Update factory configuration (owner only)
    UpdateConfig {
        protocol_fee_collector: Option<String>,
        market_creation_fee: Option<Coin>,
    },

    /// Update market code ID for future deployments (owner only)
    UpdateMarketCodeId { code_id: u64 },

    /// Transfer ownership
    TransferOwnership { new_owner: String },

    /// Accept ownership transfer
    AcceptOwnership {},
}

/// Query messages for factory contract.
#[cw_serde]
#[derive(QueryResponses)]
pub enum FactoryQueryMsg {
    /// Get factory configuration
    #[returns(FactoryConfigResponse)]
    Config {},

    /// Get market by ID
    #[returns(MarketResponse)]
    Market { market_id: String },

    /// Get market by contract address
    #[returns(MarketResponse)]
    MarketByAddress { address: String },

    /// List all markets (paginated)
    #[returns(MarketsResponse)]
    Markets {
        start_after: Option<String>,
        limit: Option<u32>,
    },

    /// List markets by curator
    #[returns(MarketsResponse)]
    MarketsByCurator {
        curator: String,
        start_after: Option<String>,
        limit: Option<u32>,
    },

    /// List markets by collateral denom
    #[returns(MarketsResponse)]
    MarketsByCollateral {
        collateral_denom: String,
        start_after: Option<String>,
        limit: Option<u32>,
    },

    /// List markets by debt denom
    #[returns(MarketsResponse)]
    MarketsByDebt {
        debt_denom: String,
        start_after: Option<String>,
        limit: Option<u32>,
    },

    /// Get total number of markets
    #[returns(MarketCountResponse)]
    MarketCount {},

    /// Compute market ID for given parameters (useful for prediction)
    #[returns(ComputeMarketIdResponse)]
    ComputeMarketId {
        collateral_denom: String,
        debt_denom: String,
        curator: String,
        salt: Option<u64>,
    },
}

// ============================================================================
// Query Responses
// ============================================================================

#[cw_serde]
pub struct FactoryConfigResponse {
    pub owner: String,
    pub protocol_fee_collector: String,
    pub market_creation_fee: Coin,
    pub market_code_id: u64,
}

#[cw_serde]
pub struct MarketResponse {
    pub market_id: String,
    pub address: String,
    pub curator: String,
    pub collateral_denom: String,
    pub debt_denom: String,
    pub created_at: u64,
}

#[cw_serde]
pub struct MarketsResponse {
    pub markets: Vec<MarketResponse>,
}

#[cw_serde]
pub struct MarketCountResponse {
    pub count: u64,
}

#[cw_serde]
pub struct ComputeMarketIdResponse {
    pub market_id: String,
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Generate a deterministic market ID from parameters.
/// Uses a simple deterministic ID based on the inputs.
/// Format: first 16 chars of hex-encoded combined string hash
pub fn compute_market_id(
    collateral_denom: &str,
    debt_denom: &str,
    curator: &str,
    salt: Option<u64>,
) -> String {
    use cosmwasm_std::HexBinary;

    let salt_val = salt.unwrap_or(0);
    let mut data = Vec::new();
    data.extend_from_slice(collateral_denom.as_bytes());
    data.extend_from_slice(b"|");
    data.extend_from_slice(debt_denom.as_bytes());
    data.extend_from_slice(b"|");
    data.extend_from_slice(curator.as_bytes());
    data.extend_from_slice(b"|");
    data.extend_from_slice(&salt_val.to_le_bytes());

    // Simple deterministic hash using a basic mixing function
    // This creates a unique, deterministic ID without external crypto deps
    let mut hash = [0u8; 32];
    let mut h: u64 = 0xcbf29ce484222325; // FNV offset basis
    for (i, &byte) in data.iter().enumerate() {
        h ^= byte as u64;
        h = h.wrapping_mul(0x100000001b3); // FNV prime
        hash[i % 32] ^= (h >> ((i % 8) * 8)) as u8;
    }
    // Mix further
    for byte in &mut hash {
        h ^= *byte as u64;
        h = h.wrapping_mul(0x100000001b3);
        *byte = (h >> 24) as u8;
    }

    HexBinary::from(&hash[..]).to_hex()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_market_id_deterministic() {
        let id1 = compute_market_id("uatom", "uusdc", "curator1", None);
        let id2 = compute_market_id("uatom", "uusdc", "curator1", None);
        assert_eq!(id1, id2);
    }

    #[test]
    fn test_compute_market_id_different_denoms() {
        let id1 = compute_market_id("uatom", "uusdc", "curator1", None);
        let id2 = compute_market_id("uosmo", "uusdc", "curator1", None);
        assert_ne!(id1, id2);
    }

    #[test]
    fn test_compute_market_id_different_curators() {
        let id1 = compute_market_id("uatom", "uusdc", "curator1", None);
        let id2 = compute_market_id("uatom", "uusdc", "curator2", None);
        assert_ne!(id1, id2);
    }

    #[test]
    fn test_compute_market_id_with_salt() {
        let id1 = compute_market_id("uatom", "uusdc", "curator1", Some(0));
        let id2 = compute_market_id("uatom", "uusdc", "curator1", Some(1));
        assert_ne!(id1, id2);
    }

    #[test]
    fn test_compute_market_id_none_equals_zero_salt() {
        let id1 = compute_market_id("uatom", "uusdc", "curator1", None);
        let id2 = compute_market_id("uatom", "uusdc", "curator1", Some(0));
        assert_eq!(id1, id2);
    }

    #[test]
    fn test_compute_market_id_is_hex() {
        let id = compute_market_id("uatom", "uusdc", "curator1", None);
        // SHA256 produces 32 bytes = 64 hex characters
        assert_eq!(id.len(), 64);
        assert!(id.chars().all(|c| c.is_ascii_hexdigit()));
    }
}
