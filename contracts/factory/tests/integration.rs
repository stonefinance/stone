use cosmwasm_std::testing::MockApi;
use cosmwasm_std::{coin, Addr, Decimal, Empty, Uint128};
use cw_multi_test::{App, AppBuilder, Contract, ContractWrapper, Executor};
use stone_factory::contract as factory_contract;
use stone_market::contract as market_contract;
use stone_testing::{
    default_market_params, mock_oracle_contract, MockOracleInstantiateMsg, COLLATERAL_DENOM,
    DEBT_DENOM,
};
use stone_types::{
    FactoryExecuteMsg, FactoryInstantiateMsg, FactoryQueryMsg, MarketConfigResponse,
    MarketCountResponse, MarketQueryMsg, MarketsResponse, OracleConfigUnchecked, OracleType,
};

fn factory_wrapper() -> Box<dyn Contract<Empty>> {
    let contract = ContractWrapper::new(
        factory_contract::execute,
        factory_contract::instantiate,
        factory_contract::query,
    )
    .with_reply(factory_contract::reply);
    Box::new(contract)
}

fn market_wrapper() -> Box<dyn Contract<Empty>> {
    let contract = ContractWrapper::new(
        market_contract::execute,
        market_contract::instantiate,
        market_contract::query,
    );
    Box::new(contract)
}

struct TestEnv {
    app: App,
    curator: Addr,
    collector: Addr,
    factory_addr: Addr,
    oracle_addr: Addr,
}

fn setup_env_with_oracle(prices: Vec<(String, Decimal)>) -> TestEnv {
    let api = MockApi::default();
    let owner = api.addr_make("owner");
    let curator = api.addr_make("curator");
    let collector = api.addr_make("fee_collector");

    let mut app = AppBuilder::new().build(|router, _, storage| {
        router
            .bank
            .init_balance(storage, &curator, vec![coin(2_000_000, "uosmo")])
            .unwrap();
    });

    let factory_id = app.store_code(factory_wrapper());
    let market_id = app.store_code(market_wrapper());
    let oracle_id = app.store_code(Box::new(mock_oracle_contract()));

    let oracle_addr = app
        .instantiate_contract(
            oracle_id,
            owner.clone(),
            &MockOracleInstantiateMsg { prices },
            &[],
            "mock-oracle",
            None,
        )
        .unwrap();

    let factory_addr = app
        .instantiate_contract(
            factory_id,
            owner.clone(),
            &FactoryInstantiateMsg {
                owner: owner.to_string(),
                protocol_fee_collector: collector.to_string(),
                market_creation_fee: coin(1_000, "uosmo"),
                market_code_id: market_id,
            },
            &[],
            "factory",
            None,
        )
        .unwrap();

    TestEnv {
        app,
        curator,
        collector,
        factory_addr,
        oracle_addr,
    }
}

fn setup_env() -> TestEnv {
    setup_env_with_oracle(vec![
        (
            COLLATERAL_DENOM.to_string(),
            Decimal::from_ratio(10u128, 1u128),
        ),
        (DEBT_DENOM.to_string(), Decimal::one()),
    ])
}

#[test]
fn create_market_deploys_and_indexes() {
    let mut env = setup_env();

    let create_msg = FactoryExecuteMsg::CreateMarket {
        collateral_denom: COLLATERAL_DENOM.to_string(),
        debt_denom: DEBT_DENOM.to_string(),
        oracle_config: OracleConfigUnchecked {
            address: env.oracle_addr.to_string(),
            oracle_type: OracleType::Generic {
                expected_code_id: None,
                max_staleness_secs: 300,
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

    let count: MarketCountResponse = env
        .app
        .wrap()
        .query_wasm_smart(env.factory_addr.clone(), &FactoryQueryMsg::MarketCount {})
        .unwrap();
    assert_eq!(count.count, 1);

    let markets: MarketsResponse = env
        .app
        .wrap()
        .query_wasm_smart(
            env.factory_addr.clone(),
            &FactoryQueryMsg::Markets {
                start_after: None,
                limit: None,
            },
        )
        .unwrap();
    assert_eq!(markets.markets.len(), 1);

    let market_addr = Addr::unchecked(markets.markets[0].address.clone());
    let market_config: MarketConfigResponse = env
        .app
        .wrap()
        .query_wasm_smart(market_addr, &MarketQueryMsg::Config {})
        .unwrap();

    assert_eq!(market_config.factory, env.factory_addr.to_string());
    assert_eq!(market_config.curator, env.curator.to_string());
    assert_eq!(market_config.oracle, env.oracle_addr.to_string());
    assert_eq!(market_config.collateral_denom, COLLATERAL_DENOM);
    assert_eq!(market_config.debt_denom, DEBT_DENOM);

    let by_curator: MarketsResponse = env
        .app
        .wrap()
        .query_wasm_smart(
            env.factory_addr.clone(),
            &FactoryQueryMsg::MarketsByCurator {
                curator: env.curator.to_string(),
                start_after: None,
                limit: None,
            },
        )
        .unwrap();
    assert_eq!(by_curator.markets.len(), 1);

    let collector_balance = env
        .app
        .wrap()
        .query_balance(env.collector.clone(), "uosmo")
        .unwrap();
    assert_eq!(collector_balance.amount, Uint128::new(1_000));
}

#[test]
fn create_market_requires_fee() {
    let mut env = setup_env();

    let create_msg = FactoryExecuteMsg::CreateMarket {
        collateral_denom: COLLATERAL_DENOM.to_string(),
        debt_denom: DEBT_DENOM.to_string(),
        oracle_config: OracleConfigUnchecked {
            address: env.oracle_addr.to_string(),
            oracle_type: OracleType::Generic {
                expected_code_id: None,
                max_staleness_secs: 300,
            },
        },
        params: Box::new(default_market_params()),
        salt: None,
    };

    let err = env
        .app
        .execute_contract(
            env.curator.clone(),
            env.factory_addr.clone(),
            &create_msg,
            &[],
        )
        .unwrap_err();

    let err_chain: Vec<String> = err.chain().map(|err| err.to_string()).collect();
    assert!(
        err_chain
            .iter()
            .any(|msg| msg.contains("Insufficient creation fee")),
        "{err_chain:?}"
    );
}

#[test]
fn create_market_rejects_invalid_oracle() {
    let mut env = setup_env_with_oracle(vec![(
        COLLATERAL_DENOM.to_string(),
        Decimal::from_ratio(10u128, 1u128),
    )]);

    let create_msg = FactoryExecuteMsg::CreateMarket {
        collateral_denom: COLLATERAL_DENOM.to_string(),
        debt_denom: DEBT_DENOM.to_string(),
        oracle_config: OracleConfigUnchecked {
            address: env.oracle_addr.to_string(),
            oracle_type: OracleType::Generic {
                expected_code_id: None,
                max_staleness_secs: 300,
            },
        },
        params: Box::new(default_market_params()),
        salt: None,
    };

    let err = env
        .app
        .execute_contract(
            env.curator.clone(),
            env.factory_addr.clone(),
            &create_msg,
            &[coin(1_000, "uosmo")],
        )
        .unwrap_err();

    let err_chain: Vec<String> = err.chain().map(|err| err.to_string()).collect();
    assert!(
        err_chain.iter().any(|msg| msg.contains("Invalid oracle")),
        "{err_chain:?}"
    );
}

#[test]
fn create_market_rejects_duplicates() {
    let mut env = setup_env();

    let create_msg = FactoryExecuteMsg::CreateMarket {
        collateral_denom: COLLATERAL_DENOM.to_string(),
        debt_denom: DEBT_DENOM.to_string(),
        oracle_config: OracleConfigUnchecked {
            address: env.oracle_addr.to_string(),
            oracle_type: OracleType::Generic {
                expected_code_id: None,
                max_staleness_secs: 300,
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

    let err = env
        .app
        .execute_contract(
            env.curator.clone(),
            env.factory_addr.clone(),
            &create_msg,
            &[coin(1_000, "uosmo")],
        )
        .unwrap_err();

    let err_chain: Vec<String> = err.chain().map(|err| err.to_string()).collect();
    assert!(
        err_chain
            .iter()
            .any(|msg| msg.contains("Market already exists")),
        "{err_chain:?}"
    );
}
