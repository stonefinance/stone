//! Message types for the Pyth oracle adapter contract.
//!
//! This module defines the messages used to interact with the Pyth oracle adapter,
//! including instantiation, execution, and query messages. The adapter implements
//! the Stone Protocol's `OracleQueryMsg` interface for price queries.

use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::Decimal;

/// Price feed configuration for a denom.
///
/// Maps a token denomination to a Pyth price feed ID. The feed_id is a 32-byte
/// identifier encoded as a 64-character hex string.
///
/// # Example
///
/// ```json
/// {
///   "denom": "uatom",
///   "feed_id": "b00b60f88b03a6a625a8d1c048c3f66653edf217439983d037e7222c4e612819"
/// }
/// ```
#[cw_serde]
pub struct PriceFeedConfig {
    /// The denom to provide price for (e.g., "uatom", "uusdc").
    pub denom: String,
    /// The Pyth price feed ID (64-character hex string).
    /// Can optionally include a "0x" prefix which will be stripped during parsing.
    pub feed_id: String,
}

/// Instantiate message for the Pyth oracle adapter.
///
/// Called once when the contract is deployed. Sets up the initial configuration
/// including the Pyth contract address, confidence ratio threshold, and optional
/// initial price feeds.
///
/// # Fields
///
/// * `owner` - Address with admin privileges (can update config, add/remove feeds)
/// * `pyth_contract_addr` - Address of the deployed Pyth price feed contract
/// * `max_confidence_ratio` - Maximum allowed confidence/price ratio (e.g., 0.01 for 1%)
/// * `price_feeds` - Initial price feed configurations (can be empty)
///
/// # Example
///
/// ```json
/// {
///   "owner": "neutron1...",
///   "pyth_contract_addr": "neutron1...",
///   "max_confidence_ratio": "0.01",
///   "price_feeds": [
///     { "denom": "uatom", "feed_id": "b00b60f88b03a6a625a8d1c048c3f66653edf217439983d037e7222c4e612819" }
///   ]
/// }
/// ```
#[cw_serde]
pub struct InstantiateMsg {
    /// Contract owner address.
    pub owner: String,
    /// Pyth contract address.
    pub pyth_contract_addr: String,
    /// Maximum confidence ratio (e.g., 0.01 for 1%).
    /// Must be greater than 0 and less than or equal to 1.
    pub max_confidence_ratio: Decimal,
    /// Initial price feeds to configure.
    pub price_feeds: Vec<PriceFeedConfig>,
}

/// Execute messages for the Pyth oracle adapter.
///
/// These messages modify the contract state and require authorization.
/// All state-changing operations are restricted to the contract owner
/// except for `AcceptOwnership` which must be called by the pending owner.
#[cw_serde]
pub enum ExecuteMsg {
    /// Set a price feed for a denom.
    ///
    /// Adds or updates the mapping from a denom to a Pyth feed ID.
    /// If the denom already exists, its feed ID is updated.
    ///
    /// # Authorization
    ///
    /// Requires caller to be the contract owner.
    ///
    /// # Errors
    ///
    /// * `Unauthorized` - Caller is not the owner
    /// * `InvalidFeedId` - Feed ID is not a valid 64-character hex string
    SetPriceFeed { denom: String, feed_id: String },

    /// Remove a price feed for a denom.
    ///
    /// Removes the price feed mapping for the specified denom.
    ///
    /// # Authorization
    ///
    /// Requires caller to be the contract owner.
    ///
    /// # Errors
    ///
    /// * `Unauthorized` - Caller is not the owner
    /// * `PriceFeedNotConfigured` - No feed exists for the denom
    RemovePriceFeed { denom: String },

    /// Update contract configuration.
    ///
    /// Performs a partial update of the contract configuration.
    /// Only provided fields are updated; `None` values leave fields unchanged.
    ///
    /// # Authorization
    ///
    /// Requires caller to be the contract owner.
    ///
    /// # Errors
    ///
    /// * `Unauthorized` - Caller is not the owner
    /// * `InvalidConfidenceRatio` - New ratio is 0 or greater than 1
    UpdateConfig {
        pyth_contract_addr: Option<String>,
        max_confidence_ratio: Option<Decimal>,
    },

    /// Transfer ownership to a new address.
    ///
    /// Initiates a two-step ownership transfer. The new owner must call
    /// `AcceptOwnership` to complete the transfer.
    ///
    /// # Authorization
    ///
    /// Requires caller to be the current contract owner.
    ///
    /// # Flow
    ///
    /// 1. Current owner calls `TransferOwnership { new_owner }`
    /// 2. New owner calls `AcceptOwnership {}`
    /// 3. Ownership is transferred
    ///
    /// # Errors
    ///
    /// * `Unauthorized` - Caller is not the owner
    TransferOwnership { new_owner: String },

    /// Accept ownership transfer.
    ///
    /// Completes the two-step ownership transfer. Must be called by the
    /// address previously set as the pending owner.
    ///
    /// # Authorization
    ///
    /// Requires caller to be the pending owner.
    ///
    /// # Errors
    ///
    /// * `PendingOwnerNotSet` - No ownership transfer is pending
    /// * `NotPendingOwner` - Caller is not the pending owner
    AcceptOwnership {},
}

/// Query messages for the Pyth oracle adapter.
///
/// These messages read contract state and do not require authorization.
/// The `Price` query implements the Stone Protocol's `OracleQueryMsg` interface.
#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    /// Query price for a denom.
    ///
    /// Implements the Stone `OracleQueryMsg` interface. Returns the current
    /// price for the specified denom, converted from Pyth's format to a Decimal.
    ///
    /// # Validation
    ///
    /// * Verifies the denom has a configured feed ID
    /// * Queries the Pyth contract for the latest price
    /// * Validates the price is positive
    /// * Validates the confidence ratio is within bounds
    /// * Converts the price to a Decimal
    ///
    /// # Errors
    ///
    /// * `PriceFeedNotConfigured` - No feed ID configured for denom
    /// * `NegativeOrZeroPrice` - Pyth returned price <= 0
    /// * `ConfidenceTooHigh` - Confidence ratio exceeds max_confidence_ratio
    /// * `InvalidTimestamp` - Pyth returned negative publish_time
    #[returns(stone_types::PriceResponse)]
    Price { denom: String },

    /// Query contract configuration.
    ///
    /// Returns the current contract configuration including owner,
    /// Pyth contract address, and max confidence ratio.
    #[returns(ConfigResponse)]
    Config {},

    /// Query price feed info for a denom.
    ///
    /// Returns the feed ID configured for a specific denom.
    /// This is useful for verifying feed configurations.
    ///
    /// # Errors
    ///
    /// * `PriceFeedNotConfigured` - No feed exists for the denom
    #[returns(PriceFeedInfo)]
    PriceFeed { denom: String },

    /// Query all configured price feeds with pagination.
    ///
    /// Returns a list of all configured price feeds, optionally paginated.
    /// Results are ordered by denom in ascending lexicographic order.
    ///
    /// # Parameters
    ///
    /// * `start_after` - If provided, start pagination after this denom
    /// * `limit` - Maximum number of results (default: 10, max: 30)
    #[returns(Vec<PriceFeedInfo>)]
    AllPriceFeeds {
        start_after: Option<String>,
        limit: Option<u32>,
    },
}

/// Configuration response.
///
/// Returned by the `Config` query. Contains all configuration parameters
/// for the contract.
#[cw_serde]
pub struct ConfigResponse {
    /// Contract owner address.
    pub owner: String,
    /// Pyth contract address.
    pub pyth_contract_addr: String,
    /// Maximum confidence ratio (e.g., 0.01 for 1%).
    pub max_confidence_ratio: Decimal,
}

/// Price feed information response.
///
/// Returned by `PriceFeed` and `AllPriceFeeds` queries.
/// Contains the mapping from a denom to its Pyth feed ID.
#[cw_serde]
pub struct PriceFeedInfo {
    /// The denom.
    pub denom: String,
    /// The Pyth price feed ID (64-character hex string).
    pub feed_id: String,
}
