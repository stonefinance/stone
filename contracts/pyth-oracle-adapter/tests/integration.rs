//! Integration tests for the Pyth oracle adapter.
//!
//! These tests use cw-multi-test to test the full flow across contracts:
//! - Mock Pyth contract (from stone-testing)
//! - Pyth oracle adapter
//! - Factory (optional, if available)
//! - Market (optional, if available)

use cosmwasm_std::testing::MockApi;
use cosmwasm_std::{coin, Addr, Decimal, Empty, Timestamp};
use cw_multi_test::{App, AppBuilder, Contract, ContractWrapper, Executor, IntoAddr};
use pyth_oracle_adapter::contract as adapter_contract;
use pyth_oracle_adapter::msg::{
    ExecuteMsg as AdapterExecuteMsg, InstantiateMsg as AdapterInstantiateMsg, PriceFeedConfig,
    QueryMsg as AdapterQueryMsg,
};

/// Helper function to add context to errors using anyhow
#[allow(dead_code)]
fn app_error_context<T, E: std::fmt::Display>(result: Result<T, E>) -> anyhow::Result<T> {
    result.map_err(|e| anyhow::anyhow!("{}", e))
}
use stone_testing::{
    default_market_params, mock_pyth_contract, MockPriceFeedInit, MockPythExecuteMsg,
    MockPythInstantiateMsg, COLLATERAL_DENOM, DEBT_DENOM,
};
use stone_types::{
    FactoryExecuteMsg, FactoryInstantiateMsg, MarketConfigResponse, MarketQueryMsg,
    OracleConfigUnchecked, OracleType, PriceResponse,
};

// Feed IDs for testing (64-character hex strings)
const ATOM_FEED_ID: &str = "b00b60f88b03a6a625a8d1c048c3f45ef9e88f1ffb3f1032faea4f0ce7b493f8";
const BTC_FEED_ID: &str = "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
const USDC_FEED_ID: &str = "eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a";

fn adapter_wrapper() -> Box<dyn Contract<Empty>> {
    let contract = ContractWrapper::new(
        adapter_contract::execute,
        adapter_contract::instantiate,
        adapter_contract::query,
    );
    Box::new(contract)
}

fn mock_pyth_wrapper() -> Box<dyn Contract<Empty>> {
    Box::new(mock_pyth_contract())
}

/// Test environment with the mock Pyth and adapter deployed
struct TestEnv {
    app: App,
    owner: Addr,
    pyth_addr: Addr,
    adapter_addr: Addr,
}

/// Setup a basic test environment with mock Pyth and adapter
fn setup_env() -> TestEnv {
    let api = MockApi::default();
    let owner = api.addr_make("owner");

    let app = AppBuilder::new().build(|_router, _api, _storage| {});

    let mut env = TestEnv {
        app,
        owner: owner.clone(),
        pyth_addr: Addr::unchecked(""),
        adapter_addr: Addr::unchecked(""),
    };

    // Store contract codes
    let pyth_code_id = env.app.store_code(mock_pyth_wrapper());
    let adapter_code_id = env.app.store_code(adapter_wrapper());

    // Instantiate mock Pyth with initial feeds
    let pyth_addr = env
        .app
        .instantiate_contract(
            pyth_code_id,
            owner.clone(),
            &MockPythInstantiateMsg {
                feeds: vec![
                    MockPriceFeedInit {
                        id: ATOM_FEED_ID.to_string(),
                        price: 1_052_000_000i64, // $10.52 with expo -8
                        conf: 1_000_000u64,
                        expo: -8,
                        publish_time: 1_700_000_000i64,
                        ema_price: None,
                        ema_conf: None,
                    },
                    MockPriceFeedInit {
                        id: USDC_FEED_ID.to_string(),
                        price: 100_000_000i64, // $1.00 with expo -8
                        conf: 100_000u64,
                        expo: -8,
                        publish_time: 1_700_000_000i64,
                        ema_price: None,
                        ema_conf: None,
                    },
                ],
            },
            &[],
            "mock-pyth",
            None,
        )
        .unwrap();

    // Instantiate Pyth oracle adapter
    let adapter_addr = env
        .app
        .instantiate_contract(
            adapter_code_id,
            owner.clone(),
            &AdapterInstantiateMsg {
                owner: owner.to_string(),
                pyth_contract_addr: pyth_addr.to_string(),
                max_confidence_ratio: Decimal::percent(2), // 2% max confidence
                price_feeds: vec![
                    PriceFeedConfig {
                        denom: "uatom".to_string(),
                        feed_id: ATOM_FEED_ID.to_string(),
                    },
                    PriceFeedConfig {
                        denom: "uusdc".to_string(),
                        feed_id: USDC_FEED_ID.to_string(),
                    },
                ],
            },
            &[],
            "pyth-adapter",
            None,
        )
        .unwrap();

    env.pyth_addr = pyth_addr;
    env.adapter_addr = adapter_addr;
    env
}

/// Test: Deploy mock Pyth → deploy adapter → query prices → verify conversion
#[test]
fn test_adapter_queries_pyth_and_converts_price() {
    let env = setup_env();

    // Query price through the adapter
    let price_resp: PriceResponse = env
        .app
        .wrap()
        .query_wasm_smart(
            env.adapter_addr.clone(),
            &AdapterQueryMsg::Price {
                denom: "uatom".to_string(),
            },
        )
        .unwrap();

    // Verify the response
    assert_eq!(price_resp.denom, "uatom");
    // Price: 1_052_000_000 * 10^-8 = 10.52
    let expected_price = Decimal::from_atomics(1052u128, 2).unwrap();
    assert_eq!(price_resp.price, expected_price);
    assert_eq!(price_resp.updated_at, 1_700_000_000u64);

    // Query USDC price
    let usdc_resp: PriceResponse = env
        .app
        .wrap()
        .query_wasm_smart(
            env.adapter_addr.clone(),
            &AdapterQueryMsg::Price {
                denom: "uusdc".to_string(),
            },
        )
        .unwrap();

    assert_eq!(usdc_resp.denom, "uusdc");
    // Price: 100_000_000 * 10^-8 = 1.00
    assert_eq!(usdc_resp.price, Decimal::one());
}

/// Test: Update mock Pyth prices → verify adapter reflects changes
#[test]
fn test_adapter_reflects_pyth_price_updates() {
    let mut env = setup_env();

    // Initial price check
    let initial_resp: PriceResponse = env
        .app
        .wrap()
        .query_wasm_smart(
            env.adapter_addr.clone(),
            &AdapterQueryMsg::Price {
                denom: "uatom".to_string(),
            },
        )
        .unwrap();

    let initial_price = initial_resp.price;
    assert_eq!(initial_price, Decimal::from_atomics(1052u128, 2).unwrap());

    // Update the price in mock Pyth via execute message
    env.app
        .execute_contract(
            env.owner.clone(),
            env.pyth_addr.clone(),
            &MockPythExecuteMsg::UpdateFeed {
                id: ATOM_FEED_ID.to_string(),
                price: 1_200_000_000i64, // New price: $12.00
                conf: 1_000_000u64,
                publish_time: 1_700_000_100i64,
            },
            &[],
        )
        .unwrap();

    // Query price again - should reflect the update
    let updated_resp: PriceResponse = env
        .app
        .wrap()
        .query_wasm_smart(
            env.adapter_addr.clone(),
            &AdapterQueryMsg::Price {
                denom: "uatom".to_string(),
            },
        )
        .unwrap();

    // New price: 1_200_000_000 * 10^-8 = 12.00
    let expected_new_price = Decimal::from_atomics(1200u128, 2).unwrap();
    assert_eq!(updated_resp.price, expected_new_price);
    assert_eq!(updated_resp.updated_at, 1_700_000_100u64);
}

/// Test: High confidence feed → adapter rejects
#[test]
fn test_adapter_rejects_high_confidence_feed() {
    let api = MockApi::default();
    let owner = api.addr_make("owner");

    let mut app = AppBuilder::new().build(|_router, _api, _storage| {});

    // Store contract codes
    let pyth_code_id = app.store_code(mock_pyth_wrapper());
    let adapter_code_id = app.store_code(adapter_wrapper());

    // Instantiate mock Pyth with a high confidence feed
    // Confidence ratio: 50_000_000 / 1_052_000_000 = ~4.75%
    // With max_confidence_ratio of 2%, this should fail
    let pyth_addr = app
        .instantiate_contract(
            pyth_code_id,
            owner.clone(),
            &MockPythInstantiateMsg {
                feeds: vec![MockPriceFeedInit {
                    id: ATOM_FEED_ID.to_string(),
                    price: 1_052_000_000i64,
                    conf: 50_000_000u64, // High confidence (>2% of price)
                    expo: -8,
                    publish_time: 1_700_000_000i64,
                    ema_price: None,
                    ema_conf: None,
                }],
            },
            &[],
            "mock-pyth",
            None,
        )
        .unwrap();

    // Instantiate adapter with 2% max confidence ratio
    let adapter_addr = app
        .instantiate_contract(
            adapter_code_id,
            owner.clone(),
            &AdapterInstantiateMsg {
                owner: owner.to_string(),
                pyth_contract_addr: pyth_addr.to_string(),
                max_confidence_ratio: Decimal::percent(2), // 2% max
                price_feeds: vec![PriceFeedConfig {
                    denom: "uatom".to_string(),
                    feed_id: ATOM_FEED_ID.to_string(),
                }],
            },
            &[],
            "pyth-adapter",
            None,
        )
        .unwrap();

    // Query should fail due to high confidence
    let result: Result<PriceResponse, _> = app.wrap().query_wasm_smart(
        adapter_addr,
        &AdapterQueryMsg::Price {
            denom: "uatom".to_string(),
        },
    );

    assert!(result.is_err());
    let err_str = result.unwrap_err().to_string();
    assert!(
        err_str.contains("Confidence too high"),
        "Expected confidence error, got: {}",
        err_str
    );
}

/// Test: Query price feed info
#[test]
fn test_query_price_feed_info() {
    let env = setup_env();

    let feed_info: pyth_oracle_adapter::msg::PriceFeedInfo = env
        .app
        .wrap()
        .query_wasm_smart(
            env.adapter_addr.clone(),
            &AdapterQueryMsg::PriceFeed {
                denom: "uatom".to_string(),
            },
        )
        .unwrap();

    assert_eq!(feed_info.denom, "uatom");
    assert_eq!(feed_info.feed_id, ATOM_FEED_ID);
}

/// Test: Query all price feeds with pagination
#[test]
fn test_query_all_price_feeds() {
    let env = setup_env();

    let feeds: Vec<pyth_oracle_adapter::msg::PriceFeedInfo> = env
        .app
        .wrap()
        .query_wasm_smart(
            env.adapter_addr.clone(),
            &AdapterQueryMsg::AllPriceFeeds {
                start_after: None,
                limit: None,
            },
        )
        .unwrap();

    assert_eq!(feeds.len(), 2);
    // Should be sorted by denom ascending
    assert_eq!(feeds[0].denom, "uatom");
    assert_eq!(feeds[0].feed_id, ATOM_FEED_ID);
    assert_eq!(feeds[1].denom, "uusdc");
    assert_eq!(feeds[1].feed_id, USDC_FEED_ID);
}

/// Test: Query config
#[test]
fn test_query_config() {
    let env = setup_env();

    let config: pyth_oracle_adapter::msg::ConfigResponse = env
        .app
        .wrap()
        .query_wasm_smart(env.adapter_addr.clone(), &AdapterQueryMsg::Config {})
        .unwrap();

    assert_eq!(config.owner, env.owner.to_string());
    assert_eq!(config.pyth_contract_addr, env.pyth_addr.to_string());
    assert_eq!(config.max_confidence_ratio, Decimal::percent(2));
}

/// Test: Set price feed (owner only)
#[test]
fn test_set_price_feed_as_owner() {
    let mut env = setup_env();

    // Add a new price feed for BTC
    env.app
        .execute_contract(
            env.owner.clone(),
            env.adapter_addr.clone(),
            &AdapterExecuteMsg::SetPriceFeed {
                denom: "ubtc".to_string(),
                feed_id: BTC_FEED_ID.to_string(),
            },
            &[],
        )
        .unwrap();

    // Verify the feed was added
    let feed_info: pyth_oracle_adapter::msg::PriceFeedInfo = env
        .app
        .wrap()
        .query_wasm_smart(
            env.adapter_addr.clone(),
            &AdapterQueryMsg::PriceFeed {
                denom: "ubtc".to_string(),
            },
        )
        .unwrap();

    assert_eq!(feed_info.denom, "ubtc");
    assert_eq!(feed_info.feed_id, BTC_FEED_ID);
}

/// Test: Set price feed fails for non-owner
#[test]
fn test_set_price_feed_unauthorized() {
    let mut env = setup_env();
    let not_owner = "not_owner".into_addr();

    // Try to add a price feed as non-owner
    let result = env.app.execute_contract(
        not_owner,
        env.adapter_addr.clone(),
        &AdapterExecuteMsg::SetPriceFeed {
            denom: "ubtc".to_string(),
            feed_id: BTC_FEED_ID.to_string(),
        },
        &[],
    );

    assert!(result.is_err());
    let err_str = result.unwrap_err().root_cause().to_string();
    assert!(
        err_str.contains("Unauthorized"),
        "Expected unauthorized error, got: {}",
        err_str
    );
}

/// Test: Remove price feed (owner only)
#[test]
fn test_remove_price_feed() {
    let mut env = setup_env();

    // Verify feed exists
    let feeds_before: Vec<pyth_oracle_adapter::msg::PriceFeedInfo> = env
        .app
        .wrap()
        .query_wasm_smart(
            env.adapter_addr.clone(),
            &AdapterQueryMsg::AllPriceFeeds {
                start_after: None,
                limit: None,
            },
        )
        .unwrap();
    assert_eq!(feeds_before.len(), 2);

    // Remove uatom feed
    env.app
        .execute_contract(
            env.owner.clone(),
            env.adapter_addr.clone(),
            &AdapterExecuteMsg::RemovePriceFeed {
                denom: "uatom".to_string(),
            },
            &[],
        )
        .unwrap();

    // Verify feed was removed
    let feeds_after: Vec<pyth_oracle_adapter::msg::PriceFeedInfo> = env
        .app
        .wrap()
        .query_wasm_smart(
            env.adapter_addr.clone(),
            &AdapterQueryMsg::AllPriceFeeds {
                start_after: None,
                limit: None,
            },
        )
        .unwrap();
    assert_eq!(feeds_after.len(), 1);
    assert_eq!(feeds_after[0].denom, "uusdc");
}

/// Test: Query for unconfigured denom fails
#[test]
fn test_query_unconfigured_denom_fails() {
    let env = setup_env();

    let result: Result<PriceResponse, _> = env.app.wrap().query_wasm_smart(
        env.adapter_addr,
        &AdapterQueryMsg::Price {
            denom: "unknown".to_string(),
        },
    );

    assert!(result.is_err());
    let err_str = result.unwrap_err().to_string();
    assert!(
        err_str.contains("Price feed not configured"),
        "Expected price feed not configured error, got: {}",
        err_str
    );
}

/// Test: Negative price from Pyth fails
#[test]
fn test_adapter_rejects_negative_price() {
    let api = MockApi::default();
    let owner = api.addr_make("owner");

    let mut app = AppBuilder::new().build(|_router, _api, _storage| {});

    // Store contract codes
    let pyth_code_id = app.store_code(mock_pyth_wrapper());
    let adapter_code_id = app.store_code(adapter_wrapper());

    // Instantiate mock Pyth with a negative price
    let pyth_addr = app
        .instantiate_contract(
            pyth_code_id,
            owner.clone(),
            &MockPythInstantiateMsg {
                feeds: vec![MockPriceFeedInit {
                    id: ATOM_FEED_ID.to_string(),
                    price: -100i64, // Negative price
                    conf: 1_000_000u64,
                    expo: -8,
                    publish_time: 1_700_000_000i64,
                    ema_price: None,
                    ema_conf: None,
                }],
            },
            &[],
            "mock-pyth",
            None,
        )
        .unwrap();

    // Instantiate adapter
    let adapter_addr = app
        .instantiate_contract(
            adapter_code_id,
            owner.clone(),
            &AdapterInstantiateMsg {
                owner: owner.to_string(),
                pyth_contract_addr: pyth_addr.to_string(),
                max_confidence_ratio: Decimal::percent(10),
                price_feeds: vec![PriceFeedConfig {
                    denom: "uatom".to_string(),
                    feed_id: ATOM_FEED_ID.to_string(),
                }],
            },
            &[],
            "pyth-adapter",
            None,
        )
        .unwrap();

    // Query should fail due to negative price
    let result: Result<PriceResponse, _> = app.wrap().query_wasm_smart(
        adapter_addr,
        &AdapterQueryMsg::Price {
            denom: "uatom".to_string(),
        },
    );

    assert!(result.is_err());
    let err_str = result.unwrap_err().to_string();
    assert!(
        err_str.contains("Negative or zero price"),
        "Expected negative price error, got: {}",
        err_str
    );
}

/// Test: Zero price from Pyth fails
#[test]
fn test_adapter_rejects_zero_price() {
    let api = MockApi::default();
    let owner = api.addr_make("owner");

    let mut app = AppBuilder::new().build(|_router, _api, _storage| {});

    // Store contract codes
    let pyth_code_id = app.store_code(mock_pyth_wrapper());
    let adapter_code_id = app.store_code(adapter_wrapper());

    // Instantiate mock Pyth with zero price
    let pyth_addr = app
        .instantiate_contract(
            pyth_code_id,
            owner.clone(),
            &MockPythInstantiateMsg {
                feeds: vec![MockPriceFeedInit {
                    id: ATOM_FEED_ID.to_string(),
                    price: 0i64, // Zero price
                    conf: 0u64,
                    expo: -8,
                    publish_time: 1_700_000_000i64,
                    ema_price: None,
                    ema_conf: None,
                }],
            },
            &[],
            "mock-pyth",
            None,
        )
        .unwrap();

    // Instantiate adapter
    let adapter_addr = app
        .instantiate_contract(
            adapter_code_id,
            owner.clone(),
            &AdapterInstantiateMsg {
                owner: owner.to_string(),
                pyth_contract_addr: pyth_addr.to_string(),
                max_confidence_ratio: Decimal::percent(10),
                price_feeds: vec![PriceFeedConfig {
                    denom: "uatom".to_string(),
                    feed_id: ATOM_FEED_ID.to_string(),
                }],
            },
            &[],
            "pyth-adapter",
            None,
        )
        .unwrap();

    // Query should fail due to zero price
    let result: Result<PriceResponse, _> = app.wrap().query_wasm_smart(
        adapter_addr,
        &AdapterQueryMsg::Price {
            denom: "uatom".to_string(),
        },
    );

    assert!(result.is_err());
    let err_str = result.unwrap_err().to_string();
    assert!(
        err_str.contains("Negative or zero price"),
        "Expected negative or zero price error, got: {}",
        err_str
    );
}

/// Test: Update config (owner only)
#[test]
fn test_update_config() {
    let mut env = setup_env();

    // Update max_confidence_ratio
    env.app
        .execute_contract(
            env.owner.clone(),
            env.adapter_addr.clone(),
            &AdapterExecuteMsg::UpdateConfig {
                pyth_contract_addr: None,
                max_confidence_ratio: Some(Decimal::percent(5)),
            },
            &[],
        )
        .unwrap();

    // Verify config was updated
    let config: pyth_oracle_adapter::msg::ConfigResponse = env
        .app
        .wrap()
        .query_wasm_smart(env.adapter_addr.clone(), &AdapterQueryMsg::Config {})
        .unwrap();

    assert_eq!(config.max_confidence_ratio, Decimal::percent(5));
}

/// Test: Transfer ownership flow
#[test]
fn test_transfer_ownership() {
    let mut env = setup_env();
    let new_owner = "new_owner".into_addr();

    // Transfer ownership
    env.app
        .execute_contract(
            env.owner.clone(),
            env.adapter_addr.clone(),
            &AdapterExecuteMsg::TransferOwnership {
                new_owner: new_owner.to_string(),
            },
            &[],
        )
        .unwrap();

    // New owner accepts
    env.app
        .execute_contract(
            new_owner.clone(),
            env.adapter_addr.clone(),
            &AdapterExecuteMsg::AcceptOwnership {},
            &[],
        )
        .unwrap();

    // Verify config was updated
    let config: pyth_oracle_adapter::msg::ConfigResponse = env
        .app
        .wrap()
        .query_wasm_smart(env.adapter_addr, &AdapterQueryMsg::Config {})
        .unwrap();

    assert_eq!(config.owner, new_owner.to_string());
}

// ============================================================================
// Full Stack Tests (Pyth → adapter → factory → market)
// ============================================================================

fn factory_wrapper() -> Box<dyn Contract<Empty>> {
    use stone_factory::contract as factory_contract;
    let contract = ContractWrapper::new(
        factory_contract::execute,
        factory_contract::instantiate,
        factory_contract::query,
    )
    .with_reply(factory_contract::reply);
    Box::new(contract)
}

fn market_wrapper() -> Box<dyn Contract<Empty>> {
    use stone_market::contract as market_contract;
    let contract = ContractWrapper::new(
        market_contract::execute,
        market_contract::instantiate,
        market_contract::query,
    );
    Box::new(contract)
}

/// Full stack test environment
struct FullStackEnv {
    app: App,
    owner: Addr,
    curator: Addr,
    _collector: Addr,
    pyth_addr: Addr,
    adapter_addr: Addr,
    factory_addr: Addr,
    adapter_code_id: u64,
}

/// Setup full stack with factory and market
fn setup_full_stack_env() -> FullStackEnv {
    let api = MockApi::default();
    let owner = api.addr_make("owner");
    let curator = api.addr_make("curator");
    let collector = api.addr_make("collector");

    let app = AppBuilder::new().build(|router, _api, storage| {
        router
            .bank
            .init_balance(storage, &curator, vec![coin(2_000_000, "uosmo")])
            .unwrap();
    });

    let mut env = FullStackEnv {
        app,
        owner: owner.clone(),
        curator: curator.clone(),
        _collector: collector.clone(),
        pyth_addr: Addr::unchecked(""),
        adapter_addr: Addr::unchecked(""),
        factory_addr: Addr::unchecked(""),
        adapter_code_id: 0,
    };

    // Store contract codes
    let pyth_code_id = env.app.store_code(mock_pyth_wrapper());
    let adapter_code_id = env.app.store_code(adapter_wrapper());
    let factory_code_id = env.app.store_code(factory_wrapper());
    let market_code_id = env.app.store_code(market_wrapper());

    env.adapter_code_id = adapter_code_id;

    // Instantiate mock Pyth
    let pyth_addr = env
        .app
        .instantiate_contract(
            pyth_code_id,
            owner.clone(),
            &MockPythInstantiateMsg {
                feeds: vec![
                    MockPriceFeedInit {
                        id: ATOM_FEED_ID.to_string(),
                        price: 10_000_000_000i64, // $100.00 with expo -8
                        conf: 1_000_000u64,
                        expo: -8,
                        publish_time: 1_700_000_000i64,
                        ema_price: None,
                        ema_conf: None,
                    },
                    MockPriceFeedInit {
                        id: USDC_FEED_ID.to_string(),
                        price: 100_000_000i64, // $1.00 with expo -8
                        conf: 100_000u64,
                        expo: -8,
                        publish_time: 1_700_000_000i64,
                        ema_price: None,
                        ema_conf: None,
                    },
                ],
            },
            &[],
            "mock-pyth",
            None,
        )
        .unwrap();

    // Instantiate Pyth oracle adapter
    let adapter_addr = env
        .app
        .instantiate_contract(
            adapter_code_id,
            owner.clone(),
            &AdapterInstantiateMsg {
                owner: owner.to_string(),
                pyth_contract_addr: pyth_addr.to_string(),
                max_confidence_ratio: Decimal::percent(2),
                price_feeds: vec![
                    PriceFeedConfig {
                        denom: COLLATERAL_DENOM.to_string(),
                        feed_id: ATOM_FEED_ID.to_string(),
                    },
                    PriceFeedConfig {
                        denom: DEBT_DENOM.to_string(),
                        feed_id: USDC_FEED_ID.to_string(),
                    },
                ],
            },
            &[],
            "pyth-adapter",
            None,
        )
        .unwrap();

    // Instantiate factory
    let factory_addr = env
        .app
        .instantiate_contract(
            factory_code_id,
            owner.clone(),
            &FactoryInstantiateMsg {
                owner: owner.to_string(),
                protocol_fee_collector: collector.to_string(),
                market_creation_fee: coin(1_000, "uosmo"),
                market_code_id,
            },
            &[],
            "factory",
            None,
        )
        .unwrap();

    env.pyth_addr = pyth_addr;
    env.adapter_addr = adapter_addr;
    env.factory_addr = factory_addr;
    env
}

/// Test: Create market with OracleType::Pyth pointing to adapter
#[test]
fn test_create_market_with_pyth_oracle() {
    let mut env = setup_full_stack_env();

    let create_msg = FactoryExecuteMsg::CreateMarket {
        collateral_denom: COLLATERAL_DENOM.to_string(),
        debt_denom: DEBT_DENOM.to_string(),
        oracle_config: OracleConfigUnchecked {
            address: env.adapter_addr.to_string(),
            oracle_type: OracleType::Pyth {
                expected_code_id: env.adapter_code_id,
                max_staleness_secs: 300,
                max_confidence_ratio: Decimal::percent(2),
            },
        },
        params: Box::new(default_market_params()),
        salt: None,
    };

    env.app
        .execute_contract(
            env.curator.clone(),
            env.factory_addr.clone(),
            &create_msg,
            &[coin(1_000, "uosmo")],
        )
        .unwrap();

    // Query market count
    let count: stone_types::MarketCountResponse = env
        .app
        .wrap()
        .query_wasm_smart(
            env.factory_addr.clone(),
            &stone_types::FactoryQueryMsg::MarketCount {},
        )
        .unwrap();
    assert_eq!(count.count, 1);

    // Query market address
    let markets: stone_types::MarketsResponse = env
        .app
        .wrap()
        .query_wasm_smart(
            env.factory_addr.clone(),
            &stone_types::FactoryQueryMsg::Markets {
                start_after: None,
                limit: None,
            },
        )
        .unwrap();
    assert_eq!(markets.markets.len(), 1);

    let market_addr = Addr::unchecked(markets.markets[0].address.clone());

    // Verify market config
    let market_config: MarketConfigResponse = env
        .app
        .wrap()
        .query_wasm_smart(market_addr, &MarketQueryMsg::Config {})
        .unwrap();

    assert_eq!(market_config.factory, env.factory_addr.to_string());
    assert_eq!(market_config.curator, env.curator.to_string());
    assert_eq!(market_config.oracle, env.adapter_addr.to_string());
    assert_eq!(market_config.collateral_denom, COLLATERAL_DENOM);
    assert_eq!(market_config.debt_denom, DEBT_DENOM);
}

/// Test: Factory validates adapter code ID at market creation
#[test]
fn test_factory_rejects_wrong_adapter_code_id() {
    let mut env = setup_full_stack_env();

    let create_msg = FactoryExecuteMsg::CreateMarket {
        collateral_denom: COLLATERAL_DENOM.to_string(),
        debt_denom: DEBT_DENOM.to_string(),
        oracle_config: OracleConfigUnchecked {
            address: env.adapter_addr.to_string(),
            oracle_type: OracleType::Pyth {
                expected_code_id: 99999, // Wrong code ID
                max_staleness_secs: 300,
                max_confidence_ratio: Decimal::percent(2),
            },
        },
        params: Box::new(default_market_params()),
        salt: None,
    };

    let result = env.app.execute_contract(
        env.curator.clone(),
        env.factory_addr.clone(),
        &create_msg,
        &[coin(1_000, "uosmo")],
    );

    assert!(result.is_err());
    let err_str = result.unwrap_err().root_cause().to_string();
    assert!(
        err_str.contains("Oracle code ID mismatch"),
        "Expected code ID mismatch error, got: {}",
        err_str
    );
}

/// Test: Factory rejects adapter missing price feeds for requested denoms
#[test]
fn test_factory_rejects_missing_feed_for_denom() {
    let mut env = setup_full_stack_env();

    // Try to create market with a denom that the adapter doesn't have a feed for
    let create_msg = FactoryExecuteMsg::CreateMarket {
        collateral_denom: "uosmo".to_string(), // Not configured in adapter
        debt_denom: DEBT_DENOM.to_string(),
        oracle_config: OracleConfigUnchecked {
            address: env.adapter_addr.to_string(),
            oracle_type: OracleType::Pyth {
                expected_code_id: env.adapter_code_id,
                max_staleness_secs: 300,
                max_confidence_ratio: Decimal::percent(2),
            },
        },
        params: Box::new(default_market_params()),
        salt: None,
    };

    let result = env.app.execute_contract(
        env.curator.clone(),
        env.factory_addr.clone(),
        &create_msg,
        &[coin(1_000, "uosmo")],
    );

    assert!(result.is_err());
    let err_str = result.unwrap_err().root_cause().to_string();
    assert!(
        err_str.contains("Invalid oracle") || err_str.contains("Price feed not configured"),
        "Expected invalid oracle error, got: {}",
        err_str
    );
}

/// Test: Stale publish_time → market rejects via max_staleness_secs
#[test]
fn test_market_rejects_stale_price() {
    let api = MockApi::default();
    let owner = api.addr_make("owner");
    let curator = api.addr_make("curator");
    let collector = api.addr_make("collector");

    let mut app = AppBuilder::new().build(|router, _api, storage| {
        router
            .bank
            .init_balance(storage, &curator, vec![coin(2_000_000, "uosmo")])
            .unwrap();
    });

    // Store contract codes
    let pyth_code_id = app.store_code(mock_pyth_wrapper());
    let adapter_code_id = app.store_code(adapter_wrapper());
    let factory_code_id = app.store_code(factory_wrapper());
    let market_code_id = app.store_code(market_wrapper());

    // Set explicit block time close to the publish_time we will use
    // This ensures the price will be fresh when we query it
    let publish_time = 1_700_000_000i64;
    app.update_block(|block| {
        block.time = Timestamp::from_seconds(publish_time as u64);
    });

    // Instantiate mock Pyth with current publish_time
    let pyth_addr = app
        .instantiate_contract(
            pyth_code_id,
            owner.clone(),
            &MockPythInstantiateMsg {
                feeds: vec![
                    MockPriceFeedInit {
                        id: ATOM_FEED_ID.to_string(),
                        price: 10_000_000_000i64,
                        conf: 1_000_000u64,
                        expo: -8,
                        publish_time,
                        ema_price: None,
                        ema_conf: None,
                    },
                    MockPriceFeedInit {
                        id: USDC_FEED_ID.to_string(),
                        price: 100_000_000i64,
                        conf: 100_000u64,
                        expo: -8,
                        publish_time,
                        ema_price: None,
                        ema_conf: None,
                    },
                ],
            },
            &[],
            "mock-pyth",
            None,
        )
        .unwrap();

    // Instantiate Pyth oracle adapter
    let adapter_addr = app
        .instantiate_contract(
            adapter_code_id,
            owner.clone(),
            &AdapterInstantiateMsg {
                owner: owner.to_string(),
                pyth_contract_addr: pyth_addr.to_string(),
                max_confidence_ratio: Decimal::percent(2),
                price_feeds: vec![
                    PriceFeedConfig {
                        denom: COLLATERAL_DENOM.to_string(),
                        feed_id: ATOM_FEED_ID.to_string(),
                    },
                    PriceFeedConfig {
                        denom: DEBT_DENOM.to_string(),
                        feed_id: USDC_FEED_ID.to_string(),
                    },
                ],
            },
            &[],
            "pyth-adapter",
            None,
        )
        .unwrap();

    // Instantiate factory
    let factory_addr = app
        .instantiate_contract(
            factory_code_id,
            owner.clone(),
            &FactoryInstantiateMsg {
                owner: owner.to_string(),
                protocol_fee_collector: collector.to_string(),
                market_creation_fee: coin(1_000, "uosmo"),
                market_code_id,
            },
            &[],
            "factory",
            None,
        )
        .unwrap();

    // First verify that market creation works with fresh prices
    let create_msg = FactoryExecuteMsg::CreateMarket {
        collateral_denom: COLLATERAL_DENOM.to_string(),
        debt_denom: DEBT_DENOM.to_string(),
        oracle_config: OracleConfigUnchecked {
            address: adapter_addr.to_string(),
            oracle_type: OracleType::Pyth {
                expected_code_id: adapter_code_id,
                max_staleness_secs: 300, // 5 minutes tolerance
                max_confidence_ratio: Decimal::percent(2),
            },
        },
        params: Box::new(default_market_params()),
        salt: None,
    };

    app.execute_contract(
        curator.clone(),
        factory_addr.clone(),
        &create_msg,
        &[coin(1_000, "uosmo")],
    )
    .unwrap();

    // Now test stale price rejection
    // Create new feeds with an updated publish_time
    let new_publish_time = 1_800_000_000i64;

    // Create a new mock Pyth with fresh feeds
    let pyth_addr_stale = app
        .instantiate_contract(
            pyth_code_id,
            owner.clone(),
            &MockPythInstantiateMsg {
                feeds: vec![
                    MockPriceFeedInit {
                        id: ATOM_FEED_ID.to_string(),
                        price: 10_000_000_000i64,
                        conf: 1_000_000u64,
                        expo: -8,
                        publish_time: new_publish_time,
                        ema_price: None,
                        ema_conf: None,
                    },
                    MockPriceFeedInit {
                        id: USDC_FEED_ID.to_string(),
                        price: 100_000_000i64,
                        conf: 100_000u64,
                        expo: -8,
                        publish_time: new_publish_time,
                        ema_price: None,
                        ema_conf: None,
                    },
                ],
            },
            &[],
            "mock-pyth-stale",
            None,
        )
        .unwrap();

    // Create a new adapter pointing to the stale feeds
    let adapter_addr_stale = app
        .instantiate_contract(
            adapter_code_id,
            owner.clone(),
            &AdapterInstantiateMsg {
                owner: owner.to_string(),
                pyth_contract_addr: pyth_addr_stale.to_string(),
                max_confidence_ratio: Decimal::percent(2),
                price_feeds: vec![
                    PriceFeedConfig {
                        denom: COLLATERAL_DENOM.to_string(),
                        feed_id: ATOM_FEED_ID.to_string(),
                    },
                    PriceFeedConfig {
                        denom: DEBT_DENOM.to_string(),
                        feed_id: USDC_FEED_ID.to_string(),
                    },
                ],
            },
            &[],
            "pyth-adapter-stale",
            None,
        )
        .unwrap();

    // Advance block time well past max_staleness_secs from publish_time
    // new_publish_time + 120 seconds > max_staleness_secs of 60
    app.update_block(|block| {
        block.time = Timestamp::from_seconds(new_publish_time as u64 + 120);
    });

    // Try to create market with very short max_staleness
    // The market will reject because the price is too old
    let create_msg_stale = FactoryExecuteMsg::CreateMarket {
        collateral_denom: COLLATERAL_DENOM.to_string(),
        debt_denom: DEBT_DENOM.to_string(),
        oracle_config: OracleConfigUnchecked {
            address: adapter_addr_stale.to_string(),
            oracle_type: OracleType::Pyth {
                expected_code_id: adapter_code_id,
                max_staleness_secs: 60, // Only 60 seconds tolerance
                max_confidence_ratio: Decimal::percent(2),
            },
        },
        params: Box::new(default_market_params()),
        salt: Some(1u64),
    };

    let result = app.execute_contract(
        curator,
        factory_addr,
        &create_msg_stale,
        &[coin(1_000, "uosmo")],
    );

    assert!(result.is_err());
    let err_str = result.unwrap_err().root_cause().to_string();
    assert!(
        err_str.contains("stale") || err_str.contains("Stale"),
        "Expected stale price error, got: {}",
        err_str
    );
}

/// Test: Price drop propagates through adapter
#[test]
fn test_price_drop_propagates_through_adapter() {
    let mut env = setup_full_stack_env();

    // Create market with Pyth oracle
    let create_msg = FactoryExecuteMsg::CreateMarket {
        collateral_denom: COLLATERAL_DENOM.to_string(),
        debt_denom: DEBT_DENOM.to_string(),
        oracle_config: OracleConfigUnchecked {
            address: env.adapter_addr.to_string(),
            oracle_type: OracleType::Pyth {
                expected_code_id: env.adapter_code_id,
                max_staleness_secs: 3600, // 1 hour for testing
                max_confidence_ratio: Decimal::percent(2),
            },
        },
        params: Box::new(default_market_params()),
        salt: None,
    };

    env.app
        .execute_contract(
            env.curator.clone(),
            env.factory_addr.clone(),
            &create_msg,
            &[coin(1_000, "uosmo")],
        )
        .unwrap();

    // Get market address
    let markets: stone_types::MarketsResponse = env
        .app
        .wrap()
        .query_wasm_smart(
            env.factory_addr.clone(),
            &stone_types::FactoryQueryMsg::Markets {
                start_after: None,
                limit: None,
            },
        )
        .unwrap();
    let market_addr = Addr::unchecked(markets.markets[0].address.clone());

    // Verify initial market state - prices should be available
    let market_config: MarketConfigResponse = env
        .app
        .wrap()
        .query_wasm_smart(market_addr.clone(), &MarketQueryMsg::Config {})
        .unwrap();
    assert_eq!(market_config.oracle, env.adapter_addr.to_string());

    // Update Pyth price (simulate price drop)
    env.app
        .execute_contract(
            env.owner.clone(),
            env.pyth_addr.clone(),
            &MockPythExecuteMsg::UpdateFeed {
                id: ATOM_FEED_ID.to_string(),
                price: 5_000_000_000i64, // Drop from $100 to $50
                conf: 1_000_000u64,
                publish_time: 1_700_000_100i64,
            },
            &[],
        )
        .unwrap();

    // Verify the new price is reflected in the adapter
    let new_price: PriceResponse = env
        .app
        .wrap()
        .query_wasm_smart(
            env.adapter_addr.clone(),
            &AdapterQueryMsg::Price {
                denom: COLLATERAL_DENOM.to_string(),
            },
        )
        .unwrap();

    // New price: 5_000_000_000 * 10^-8 = 50.00
    assert_eq!(new_price.price, Decimal::from_atomics(50u128, 0).unwrap());
}
