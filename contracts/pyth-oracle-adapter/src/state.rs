//! State storage for the Pyth oracle adapter contract.

use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Decimal};
use cw_storage_plus::{Item, Map};

use crate::pyth_types::PriceIdentifier;

/// Contract configuration.
#[cw_serde]
pub struct Config {
    /// Contract owner address.
    pub owner: Addr,
    /// Pyth contract address.
    pub pyth_contract_addr: Addr,
    /// Maximum confidence ratio (e.g., 0.01 for 1%).
    pub max_confidence_ratio: Decimal,
}

/// Contract name for cw2 version tracking.
pub const CONTRACT_NAME: &str = "crates.io:pyth-oracle-adapter";
/// Contract version.
pub const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Contract configuration storage.
pub const CONFIG: Item<Config> = Item::new("config");

/// Pending owner for ownership transfer.
pub const PENDING_OWNER: Item<Addr> = Item::new("pending_owner");

/// Price feed mapping: denom -> PriceIdentifier.
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
