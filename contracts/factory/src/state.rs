use cosmwasm_std::Addr;
use cw_storage_plus::{Item, Map};
use stone_types::{FactoryConfig, MarketRecord};

/// Contract name for cw2 migration info
pub const CONTRACT_NAME: &str = "crates.io:stone-factory";
/// Contract version for cw2 migration info
pub const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Factory configuration
pub const CONFIG: Item<FactoryConfig> = Item::new("config");

/// Pending owner for two-step ownership transfer
pub const PENDING_OWNER: Item<Addr> = Item::new("pending_owner");

/// Pending market salt for the currently in-flight market instantiation.
/// 
/// This is a single Item (not a Map) because the factory only supports one pending
/// market instantiation at a time. If future changes allow multiple instantiations
/// per execute/tx, this should be reconsidered (e.g., keyed by a sequence counter).
/// 
/// Stores the salt used during market creation to properly compute market ID in reply handler.
pub const PENDING_MARKET_SALTS: Item<Option<u64>> = Item::new("pending_market_salts");

/// Markets indexed by market_id
pub const MARKETS: Map<&str, MarketRecord> = Map::new("markets");

/// Markets indexed by contract address (for reverse lookup)
pub const MARKETS_BY_ADDRESS: Map<&Addr, String> = Map::new("markets_by_addr");

/// Index of markets by curator
pub const MARKETS_BY_CURATOR: Map<(&Addr, &str), ()> = Map::new("markets_by_curator");

/// Index of markets by collateral denom
pub const MARKETS_BY_COLLATERAL: Map<(&str, &str), ()> = Map::new("markets_by_collateral");

/// Index of markets by debt denom
pub const MARKETS_BY_DEBT: Map<(&str, &str), ()> = Map::new("markets_by_debt");

/// Total number of markets created
pub const MARKET_COUNT: Item<u64> = Item::new("market_count");

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::mock_dependencies;
    use cosmwasm_std::{Coin, Uint128};

    #[test]
    fn test_config_storage() {
        let mut deps = mock_dependencies();

        let config = FactoryConfig {
            owner: Addr::unchecked("owner"),
            protocol_fee_collector: Addr::unchecked("fee_collector"),
            market_creation_fee: Coin {
                denom: "uosmo".to_string(),
                amount: Uint128::new(1000000),
            },
            market_code_id: 1,
        };

        CONFIG.save(deps.as_mut().storage, &config).unwrap();
        let loaded = CONFIG.load(deps.as_ref().storage).unwrap();

        assert_eq!(loaded.owner, Addr::unchecked("owner"));
        assert_eq!(loaded.market_code_id, 1);
    }

    #[test]
    fn test_market_storage() {
        let mut deps = mock_dependencies();

        let market = MarketRecord {
            market_id: "abc123".to_string(),
            address: Addr::unchecked("market_contract"),
            curator: Addr::unchecked("curator"),
            collateral_denom: "uatom".to_string(),
            debt_denom: "uusdc".to_string(),
            created_at: 1000,
        };

        MARKETS
            .save(deps.as_mut().storage, &market.market_id, &market)
            .unwrap();
        let loaded = MARKETS.load(deps.as_ref().storage, "abc123").unwrap();

        assert_eq!(loaded.address, Addr::unchecked("market_contract"));
        assert_eq!(loaded.curator, Addr::unchecked("curator"));
    }

    #[test]
    fn test_market_count() {
        let mut deps = mock_dependencies();

        MARKET_COUNT.save(deps.as_mut().storage, &0).unwrap();
        let count = MARKET_COUNT.load(deps.as_ref().storage).unwrap();
        assert_eq!(count, 0);

        MARKET_COUNT.save(deps.as_mut().storage, &5).unwrap();
        let count = MARKET_COUNT.load(deps.as_ref().storage).unwrap();
        assert_eq!(count, 5);
    }
}
