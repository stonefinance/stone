use cw_storage_plus::{Item, Map};
use stone_types::{MarketConfig, MarketParams, MarketState};

#[cfg(test)]
use stone_types::{OracleConfig, OracleType};

pub const CONTRACT_NAME: &str = "crates.io:stone-market";
pub const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Market configuration (immutable after instantiation)
pub const CONFIG: Item<MarketConfig> = Item::new("config");

/// Market parameters (some updatable by curator)
pub const PARAMS: Item<MarketParams> = Item::new("params");

/// Market state (indices, totals, rates)
pub const STATE: Item<MarketState> = Item::new("state");

/// User supply positions (scaled amounts)
/// Key: user address
pub const SUPPLIES: Map<&str, cosmwasm_std::Uint128> = Map::new("supplies");

/// User collateral positions (unscaled amounts)
/// Key: user address
pub const COLLATERAL: Map<&str, cosmwasm_std::Uint128> = Map::new("collateral");

/// User debt positions (scaled amounts)
/// Key: user address
pub const DEBTS: Map<&str, cosmwasm_std::Uint128> = Map::new("debts");

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::mock_dependencies;
    use cosmwasm_std::{Addr, Decimal, Uint128};

    #[test]
    fn test_config_storage() {
        let mut deps = mock_dependencies();

        let config = MarketConfig {
            factory: Addr::unchecked("factory"),
            curator: Addr::unchecked("curator"),
            oracle_config: OracleConfig {
                address: Addr::unchecked("oracle"),
                oracle_type: OracleType::Generic {
                    expected_code_id: None,
                    max_staleness_secs: 300,
                },
            },
            collateral_denom: "uatom".to_string(),
            debt_denom: "uusdc".to_string(),
            protocol_fee_collector: Addr::unchecked("collector"),
        };

        CONFIG.save(deps.as_mut().storage, &config).unwrap();
        let loaded = CONFIG.load(deps.as_ref().storage).unwrap();

        assert_eq!(loaded.curator, Addr::unchecked("curator"));
        assert_eq!(loaded.collateral_denom, "uatom");
    }

    #[test]
    fn test_state_storage() {
        let mut deps = mock_dependencies();

        let state = MarketState::new(1000);
        STATE.save(deps.as_mut().storage, &state).unwrap();

        let loaded = STATE.load(deps.as_ref().storage).unwrap();
        assert_eq!(loaded.borrow_index, Decimal::one());
        assert_eq!(loaded.created_at, 1000);
    }

    #[test]
    fn test_user_positions_storage() {
        let mut deps = mock_dependencies();

        SUPPLIES
            .save(deps.as_mut().storage, "user1", &Uint128::new(1000))
            .unwrap();
        COLLATERAL
            .save(deps.as_mut().storage, "user1", &Uint128::new(500))
            .unwrap();
        DEBTS
            .save(deps.as_mut().storage, "user1", &Uint128::new(200))
            .unwrap();

        assert_eq!(
            SUPPLIES.load(deps.as_ref().storage, "user1").unwrap(),
            Uint128::new(1000)
        );
        assert_eq!(
            COLLATERAL.load(deps.as_ref().storage, "user1").unwrap(),
            Uint128::new(500)
        );
        assert_eq!(
            DEBTS.load(deps.as_ref().storage, "user1").unwrap(),
            Uint128::new(200)
        );
    }
}
