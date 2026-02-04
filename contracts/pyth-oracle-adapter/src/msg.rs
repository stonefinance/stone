//! Message types for the Pyth oracle adapter contract.

use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::Decimal;

/// Price feed configuration for a denom.
#[cw_serde]
pub struct PriceFeedConfig {
    /// The denom to provide price for.
    pub denom: String,
    /// The Pyth price feed ID (64-character hex string).
    pub feed_id: String,
}

/// Instantiate message.
#[cw_serde]
pub struct InstantiateMsg {
    /// Contract owner address.
    pub owner: String,
    /// Pyth contract address.
    pub pyth_contract_addr: String,
    /// Maximum confidence ratio (e.g., 0.01 for 1%).
    pub max_confidence_ratio: Decimal,
    /// Initial price feeds to configure.
    pub price_feeds: Vec<PriceFeedConfig>,
}

/// Execute messages.
#[cw_serde]
pub enum ExecuteMsg {
    /// Set a price feed for a denom.
    SetPriceFeed { denom: String, feed_id: String },
    /// Remove a price feed for a denom.
    RemovePriceFeed { denom: String },
    /// Update contract configuration.
    UpdateConfig {
        pyth_contract_addr: Option<String>,
        max_confidence_ratio: Option<Decimal>,
    },
    /// Transfer ownership to a new address.
    TransferOwnership { new_owner: String },
    /// Accept ownership transfer.
    AcceptOwnership {},
}

/// Query messages.
#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    /// Query price for a denom.
    /// Implements the Stone OracleQueryMsg interface.
    #[returns(stone_types::PriceResponse)]
    Price { denom: String },
    /// Query contract configuration.
    #[returns(ConfigResponse)]
    Config {},
    /// Query price feed info for a denom.
    #[returns(PriceFeedInfo)]
    PriceFeed { denom: String },
    /// Query all configured price feeds with pagination.
    #[returns(Vec<PriceFeedInfo>)]
    AllPriceFeeds {
        start_after: Option<String>,
        limit: Option<u32>,
    },
}

/// Configuration response.
#[cw_serde]
pub struct ConfigResponse {
    /// Contract owner address.
    pub owner: String,
    /// Pyth contract address.
    pub pyth_contract_addr: String,
    /// Maximum confidence ratio.
    pub max_confidence_ratio: Decimal,
}

/// Price feed information response.
#[cw_serde]
pub struct PriceFeedInfo {
    /// The denom.
    pub denom: String,
    /// The Pyth price feed ID (64-character hex string).
    pub feed_id: String,
}
