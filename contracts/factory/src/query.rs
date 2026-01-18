use cosmwasm_std::{Deps, Order, StdResult};
use cw_storage_plus::Bound;

use stone_types::{
    compute_market_id, ComputeMarketIdResponse, FactoryConfigResponse, MarketCountResponse,
    MarketResponse, MarketsResponse,
};

use crate::state::{
    CONFIG, MARKETS, MARKETS_BY_ADDRESS, MARKETS_BY_COLLATERAL, MARKETS_BY_CURATOR,
    MARKETS_BY_DEBT, MARKET_COUNT,
};

const DEFAULT_LIMIT: u32 = 10;
const MAX_LIMIT: u32 = 30;

pub fn config(deps: Deps) -> StdResult<FactoryConfigResponse> {
    let config = CONFIG.load(deps.storage)?;
    Ok(FactoryConfigResponse {
        owner: config.owner.to_string(),
        protocol_fee_collector: config.protocol_fee_collector.to_string(),
        market_creation_fee: config.market_creation_fee,
        market_code_id: config.market_code_id,
    })
}

pub fn market(deps: Deps, market_id: String) -> StdResult<MarketResponse> {
    let record = MARKETS.load(deps.storage, &market_id)?;
    Ok(MarketResponse {
        market_id: record.market_id,
        address: record.address.to_string(),
        curator: record.curator.to_string(),
        collateral_denom: record.collateral_denom,
        debt_denom: record.debt_denom,
        created_at: record.created_at,
    })
}

pub fn market_by_address(deps: Deps, address: String) -> StdResult<MarketResponse> {
    let addr = deps.api.addr_validate(&address)?;
    let market_id = MARKETS_BY_ADDRESS.load(deps.storage, &addr)?;
    market(deps, market_id)
}

pub fn markets(
    deps: Deps,
    start_after: Option<String>,
    limit: Option<u32>,
) -> StdResult<MarketsResponse> {
    let limit = limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT) as usize;
    let start = start_after.as_deref().map(Bound::exclusive);

    let markets: Vec<MarketResponse> = MARKETS
        .range(deps.storage, start, None, Order::Ascending)
        .take(limit)
        .map(|item| {
            let (_, record) = item?;
            Ok(MarketResponse {
                market_id: record.market_id,
                address: record.address.to_string(),
                curator: record.curator.to_string(),
                collateral_denom: record.collateral_denom,
                debt_denom: record.debt_denom,
                created_at: record.created_at,
            })
        })
        .collect::<StdResult<Vec<_>>>()?;

    Ok(MarketsResponse { markets })
}

pub fn markets_by_curator(
    deps: Deps,
    curator: String,
    start_after: Option<String>,
    limit: Option<u32>,
) -> StdResult<MarketsResponse> {
    let curator_addr = deps.api.addr_validate(&curator)?;
    let limit = limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT) as usize;

    // When no start_after, we need to start from the beginning of this curator's entries
    let start = match start_after.as_ref() {
        Some(s) => Some(Bound::exclusive((&curator_addr, s.as_str()))),
        None => Some(Bound::inclusive((&curator_addr, ""))),
    };

    let market_ids: Vec<String> = MARKETS_BY_CURATOR
        .range(
            deps.storage,
            start,
            Some(Bound::inclusive((
                &curator_addr,
                "\u{ffff}", // Max string for range end
            ))),
            Order::Ascending,
        )
        .take(limit)
        .map(|item| {
            let ((_, market_id), _) = item?;
            Ok(market_id.to_string())
        })
        .collect::<StdResult<Vec<_>>>()?;

    let markets: Vec<MarketResponse> = market_ids
        .into_iter()
        .map(|id| market(deps, id))
        .collect::<StdResult<Vec<_>>>()?;

    Ok(MarketsResponse { markets })
}

pub fn markets_by_collateral(
    deps: Deps,
    collateral_denom: String,
    start_after: Option<String>,
    limit: Option<u32>,
) -> StdResult<MarketsResponse> {
    let limit = limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT) as usize;

    // When no start_after, we need to start from the beginning of this denom's entries
    let start = match start_after.as_ref() {
        Some(s) => Some(Bound::exclusive((collateral_denom.as_str(), s.as_str()))),
        None => Some(Bound::inclusive((collateral_denom.as_str(), ""))),
    };

    let market_ids: Vec<String> = MARKETS_BY_COLLATERAL
        .range(
            deps.storage,
            start,
            Some(Bound::inclusive((
                collateral_denom.as_str(),
                "\u{ffff}",
            ))),
            Order::Ascending,
        )
        .take(limit)
        .map(|item| {
            let ((_, market_id), _) = item?;
            Ok(market_id.to_string())
        })
        .collect::<StdResult<Vec<_>>>()?;

    let markets: Vec<MarketResponse> = market_ids
        .into_iter()
        .map(|id| market(deps, id))
        .collect::<StdResult<Vec<_>>>()?;

    Ok(MarketsResponse { markets })
}

pub fn markets_by_debt(
    deps: Deps,
    debt_denom: String,
    start_after: Option<String>,
    limit: Option<u32>,
) -> StdResult<MarketsResponse> {
    let limit = limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT) as usize;

    // When no start_after, we need to start from the beginning of this denom's entries
    let start = match start_after.as_ref() {
        Some(s) => Some(Bound::exclusive((debt_denom.as_str(), s.as_str()))),
        None => Some(Bound::inclusive((debt_denom.as_str(), ""))),
    };

    let market_ids: Vec<String> = MARKETS_BY_DEBT
        .range(
            deps.storage,
            start,
            Some(Bound::inclusive((debt_denom.as_str(), "\u{ffff}"))),
            Order::Ascending,
        )
        .take(limit)
        .map(|item| {
            let ((_, market_id), _) = item?;
            Ok(market_id.to_string())
        })
        .collect::<StdResult<Vec<_>>>()?;

    let markets: Vec<MarketResponse> = market_ids
        .into_iter()
        .map(|id| market(deps, id))
        .collect::<StdResult<Vec<_>>>()?;

    Ok(MarketsResponse { markets })
}

pub fn market_count(deps: Deps) -> StdResult<MarketCountResponse> {
    let count = MARKET_COUNT.may_load(deps.storage)?.unwrap_or(0);
    Ok(MarketCountResponse { count })
}

pub fn compute_market_id_query(
    collateral_denom: String,
    debt_denom: String,
    curator: String,
    salt: Option<u64>,
) -> ComputeMarketIdResponse {
    let market_id = compute_market_id(&collateral_denom, &debt_denom, &curator, salt);
    ComputeMarketIdResponse { market_id }
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{mock_dependencies, MockApi};
    use cosmwasm_std::{Addr, Coin, Uint128};
    use stone_types::{FactoryConfig, MarketRecord};

    // Generate consistent test addresses
    fn test_addrs() -> (Addr, Addr, Addr, Addr, Addr, Addr, Addr) {
        let api = MockApi::default();
        (
            api.addr_make("owner"),
            api.addr_make("collector"),
            api.addr_make("addr1"),
            api.addr_make("addr2"),
            api.addr_make("addr3"),
            api.addr_make("curator1"),
            api.addr_make("curator2"),
        )
    }

    fn setup_test_data(deps: &mut cosmwasm_std::OwnedDeps<cosmwasm_std::MemoryStorage, cosmwasm_std::testing::MockApi, cosmwasm_std::testing::MockQuerier>) {
        let (owner, collector, addr1, addr2, addr3, curator1, curator2) = test_addrs();

        // Setup config
        let config = FactoryConfig {
            owner,
            protocol_fee_collector: collector,
            market_creation_fee: Coin {
                denom: "uosmo".to_string(),
                amount: Uint128::new(1000000),
            },
            market_code_id: 1,
        };
        CONFIG.save(deps.as_mut().storage, &config).unwrap();

        // Setup some markets
        let markets = vec![
            MarketRecord {
                market_id: "market1".to_string(),
                address: addr1,
                curator: curator1.clone(),
                collateral_denom: "uatom".to_string(),
                debt_denom: "uusdc".to_string(),
                created_at: 1000,
            },
            MarketRecord {
                market_id: "market2".to_string(),
                address: addr2,
                curator: curator1,
                collateral_denom: "uosmo".to_string(),
                debt_denom: "uusdc".to_string(),
                created_at: 2000,
            },
            MarketRecord {
                market_id: "market3".to_string(),
                address: addr3,
                curator: curator2,
                collateral_denom: "uatom".to_string(),
                debt_denom: "uosmo".to_string(),
                created_at: 3000,
            },
        ];

        for market in markets {
            MARKETS
                .save(deps.as_mut().storage, &market.market_id, &market)
                .unwrap();
            MARKETS_BY_ADDRESS
                .save(deps.as_mut().storage, &market.address, &market.market_id)
                .unwrap();
            MARKETS_BY_CURATOR
                .save(
                    deps.as_mut().storage,
                    (&market.curator, &market.market_id),
                    &(),
                )
                .unwrap();
            MARKETS_BY_COLLATERAL
                .save(
                    deps.as_mut().storage,
                    (&market.collateral_denom, &market.market_id),
                    &(),
                )
                .unwrap();
            MARKETS_BY_DEBT
                .save(
                    deps.as_mut().storage,
                    (&market.debt_denom, &market.market_id),
                    &(),
                )
                .unwrap();
        }
        MARKET_COUNT.save(deps.as_mut().storage, &3).unwrap();
    }

    #[test]
    fn test_query_config() {
        let mut deps = mock_dependencies();
        setup_test_data(&mut deps);
        let (owner, ..) = test_addrs();

        let result = config(deps.as_ref()).unwrap();
        assert_eq!(result.owner, owner.to_string());
        assert_eq!(result.market_code_id, 1);
    }

    #[test]
    fn test_query_market() {
        let mut deps = mock_dependencies();
        setup_test_data(&mut deps);
        let (_, _, _, _, _, curator1, _) = test_addrs();

        let result = market(deps.as_ref(), "market1".to_string()).unwrap();
        assert_eq!(result.market_id, "market1");
        assert_eq!(result.curator, curator1.to_string());
        assert_eq!(result.collateral_denom, "uatom");
    }

    #[test]
    fn test_query_market_by_address() {
        let mut deps = mock_dependencies();
        setup_test_data(&mut deps);
        let (_, _, _, addr2, ..) = test_addrs();

        let result = market_by_address(deps.as_ref(), addr2.to_string()).unwrap();
        assert_eq!(result.market_id, "market2");
    }

    #[test]
    fn test_query_markets_pagination() {
        let mut deps = mock_dependencies();
        setup_test_data(&mut deps);

        // Get first page
        let result = markets(deps.as_ref(), None, Some(2)).unwrap();
        assert_eq!(result.markets.len(), 2);

        // Get second page
        let last_id = result.markets.last().unwrap().market_id.clone();
        let result = markets(deps.as_ref(), Some(last_id), Some(2)).unwrap();
        assert_eq!(result.markets.len(), 1);
    }

    #[test]
    fn test_query_markets_by_curator() {
        let mut deps = mock_dependencies();
        setup_test_data(&mut deps);
        let (_, _, _, _, _, curator1, curator2) = test_addrs();

        let result = markets_by_curator(deps.as_ref(), curator1.to_string(), None, None).unwrap();
        assert_eq!(result.markets.len(), 2);

        let result = markets_by_curator(deps.as_ref(), curator2.to_string(), None, None).unwrap();
        assert_eq!(result.markets.len(), 1);
    }

    #[test]
    fn test_query_markets_by_collateral() {
        let mut deps = mock_dependencies();
        setup_test_data(&mut deps);

        let result =
            markets_by_collateral(deps.as_ref(), "uatom".to_string(), None, None).unwrap();
        assert_eq!(result.markets.len(), 2);
    }

    #[test]
    fn test_query_markets_by_debt() {
        let mut deps = mock_dependencies();
        setup_test_data(&mut deps);

        let result = markets_by_debt(deps.as_ref(), "uusdc".to_string(), None, None).unwrap();
        assert_eq!(result.markets.len(), 2);
    }

    #[test]
    fn test_query_market_count() {
        let mut deps = mock_dependencies();
        setup_test_data(&mut deps);

        let result = market_count(deps.as_ref()).unwrap();
        assert_eq!(result.count, 3);
    }

    #[test]
    fn test_compute_market_id_query() {
        let result = compute_market_id_query(
            "uatom".to_string(),
            "uusdc".to_string(),
            "curator1".to_string(),
            None,
        );
        assert_eq!(result.market_id.len(), 64);
    }
}
