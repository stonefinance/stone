//! State storage for the Pyth oracle adapter contract.
//!
//! This module defines the contract's state storage structures and their
//! default values. State is organized into:
//! - Configuration (owner, Pyth contract, confidence settings)
//! - Ownership transfer state (pending owner)
//! - Price feed mappings (denom → Pyth feed ID)

use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Decimal};
use cw_storage_plus::{Item, Map};

use crate::pyth_types::PriceIdentifier;

/// Contract configuration.
///
/// Stores the core configuration parameters for the adapter.
/// This is set at instantiation and can be updated via `ExecuteMsg::UpdateConfig`.
#[cw_serde]
pub struct Config {
    /// Contract owner address.
    ///
    /// The owner has exclusive rights to:
    /// - Add/remove price feeds
    /// - Update configuration
    /// - Initiate ownership transfer
    pub owner: Addr,
    /// Pyth contract address.
    ///
    /// The address of the deployed Pyth price feed contract on Neutron.
    /// This contract is queried for all price data.
    pub pyth_contract_addr: Addr,
    /// Maximum confidence ratio (e.g., 0.01 for 1%).
    ///
    /// Prices with confidence/price ratios exceeding this value will be
    /// rejected. This provides a quality threshold for price data.
    ///
    /// # Example
    ///
    /// If max_confidence_ratio is 0.01 and Pyth returns:
    /// - Price: $100
    /// - Confidence: $2
    ///
    /// The confidence ratio is 0.02 (2%), which exceeds 0.01, so the
    /// price query will fail with `ContractError::ConfidenceTooHigh`.
    pub max_confidence_ratio: Decimal,
}

/// Contract name for cw2 version tracking.
///
/// Used by cw2 to track contract versions for migration purposes.
/// This follows the cw2 convention of using the crate name.
pub const CONTRACT_NAME: &str = "crates.io:pyth-oracle-adapter";

/// Contract version.
///
/// Automatically set from the Cargo.toml version at compile time.
/// Used by cw2 for migration tracking.
pub const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

// ============================================================================
// State Items
// ============================================================================

/// Contract configuration storage.
///
/// Stores the `Config` struct at a fixed key "config".
pub const CONFIG: Item<Config> = Item::new("config");

/// Pending owner for ownership transfer.
///
/// Stores the address of the pending owner during a two-step ownership
/// transfer. This is `None` when no transfer is in progress.
///
/// # Ownership Transfer Flow
///
/// 1. Owner calls `ExecuteMsg::TransferOwnership { new_owner }`
///    - Sets PENDING_OWNER to `Some(new_owner)`
///
/// 2. New owner calls `ExecuteMsg::AcceptOwnership {}`
///    - Verifies caller == PENDING_OWNER
///    - Sets CONFIG.owner to caller
///    - Sets PENDING_OWNER to `None`
pub const PENDING_OWNER: Item<Addr> = Item::new("pending_owner");

/// Price feed mapping: denom -> PriceIdentifier.
///
/// Maps token denominations to their corresponding Pyth price feed IDs.
/// This is the core data structure that enables price queries.
///
/// # Query Flow
///
/// 1. User queries `Price { denom: "uatom" }`
/// 2. Contract looks up `PRICE_FEEDS.load("uatom")` → `PriceIdentifier`
/// 3. Contract queries Pyth contract with this feed ID
/// 4. Contract validates and returns the price
///
/// # Example
///
/// ```rust,ignore
/// PRICE_FEEDS.save(storage, "uatom", &PriceIdentifier::from_hex("b00b60f..."))?;
/// let feed_id = PRICE_FEEDS.load(storage, "uatom")?;
/// ```
pub const PRICE_FEEDS: Map<&str, PriceIdentifier> = Map::new("price_feeds");

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::mock_dependencies;

    #[test]
    fn test_config_storage() {
        let mut deps = mock_dependencies();

        let config = Config {
            owner: Addr::unchecked("owner"),
            pyth_contract_addr: Addr::unchecked("pyth"),
            max_confidence_ratio: Decimal::percent(1),
        };

        CONFIG.save(deps.as_mut().storage, &config).unwrap();
        let loaded = CONFIG.load(deps.as_ref().storage).unwrap();

        assert_eq!(loaded.owner, Addr::unchecked("owner"));
        assert_eq!(loaded.pyth_contract_addr, Addr::unchecked("pyth"));
        assert_eq!(loaded.max_confidence_ratio, Decimal::percent(1));
    }

    #[test]
    fn test_pending_owner_storage() {
        let mut deps = mock_dependencies();

        let pending = Addr::unchecked("new_owner");
        PENDING_OWNER.save(deps.as_mut().storage, &pending).unwrap();

        let loaded = PENDING_OWNER.load(deps.as_ref().storage).unwrap();
        assert_eq!(loaded, Addr::unchecked("new_owner"));
    }

    #[test]
    fn test_price_feeds_storage() {
        let mut deps = mock_dependencies();

        let feed_id = PriceIdentifier::new([1u8; 32]);
        PRICE_FEEDS
            .save(deps.as_mut().storage, "uatom", &feed_id)
            .unwrap();

        let loaded = PRICE_FEEDS.load(deps.as_ref().storage, "uatom").unwrap();
        assert_eq!(loaded, feed_id);
    }
}
