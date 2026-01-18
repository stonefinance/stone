use cosmwasm_schema::cw_serde;
use cosmwasm_std::{
    to_json_binary, Binary, Decimal, Deps, DepsMut, Env, MessageInfo, Response,
    StdResult,
};
use cw_storage_plus::Map;
use stone_types::{OracleQueryMsg, PriceResponse};

/// Storage for mock oracle prices
pub const PRICES: Map<&str, Decimal> = Map::new("prices");

/// Mock oracle instantiate message
#[cw_serde]
pub struct MockOracleInstantiateMsg {
    pub prices: Vec<(String, Decimal)>,
}

/// Mock oracle execute message
#[cw_serde]
pub enum MockOracleExecuteMsg {
    SetPrice { denom: String, price: Decimal },
    SetPrices { prices: Vec<(String, Decimal)> },
}

/// Mock oracle contract entry points for use in tests.

pub fn mock_oracle_instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: MockOracleInstantiateMsg,
) -> StdResult<Response> {
    for (denom, price) in msg.prices {
        PRICES.save(deps.storage, &denom, &price)?;
    }
    Ok(Response::new().add_attribute("action", "instantiate_mock_oracle"))
}

pub fn mock_oracle_execute(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: MockOracleExecuteMsg,
) -> StdResult<Response> {
    match msg {
        MockOracleExecuteMsg::SetPrice { denom, price } => {
            PRICES.save(deps.storage, &denom, &price)?;
            Ok(Response::new()
                .add_attribute("action", "set_price")
                .add_attribute("denom", denom)
                .add_attribute("price", price.to_string()))
        }
        MockOracleExecuteMsg::SetPrices { prices } => {
            for (denom, price) in prices {
                PRICES.save(deps.storage, &denom, &price)?;
            }
            Ok(Response::new().add_attribute("action", "set_prices"))
        }
    }
}

pub fn mock_oracle_query(deps: Deps, env: Env, msg: OracleQueryMsg) -> StdResult<Binary> {
    match msg {
        OracleQueryMsg::Price { denom } => {
            let price = PRICES.load(deps.storage, &denom)?;
            to_json_binary(&PriceResponse {
                denom,
                price,
                updated_at: env.block.time.seconds(),
            })
        }
    }
}

/// Helper to create a mock oracle contract for cw-multi-test.
#[allow(dead_code)]
pub fn mock_oracle_contract() -> cw_multi_test::ContractWrapper<
    MockOracleExecuteMsg,
    MockOracleInstantiateMsg,
    OracleQueryMsg,
    cosmwasm_std::StdError,
    cosmwasm_std::StdError,
    cosmwasm_std::StdError,
> {
    use cw_multi_test::ContractWrapper;

    ContractWrapper::new(mock_oracle_execute, mock_oracle_instantiate, mock_oracle_query)
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{message_info, mock_dependencies, mock_env, MockApi};

    #[test]
    fn test_mock_oracle_instantiate() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let api = MockApi::default();
        let creator = api.addr_make("creator");
        let info = message_info(&creator, &[]);

        let msg = MockOracleInstantiateMsg {
            prices: vec![
                ("uatom".to_string(), Decimal::from_ratio(10u128, 1u128)),
                ("uusdc".to_string(), Decimal::one()),
            ],
        };

        let res = mock_oracle_instantiate(deps.as_mut(), env, info, msg).unwrap();
        assert_eq!(res.attributes.len(), 1);

        // Verify prices were stored
        let atom_price = PRICES.load(&deps.storage, "uatom").unwrap();
        assert_eq!(atom_price, Decimal::from_ratio(10u128, 1u128));

        let usdc_price = PRICES.load(&deps.storage, "uusdc").unwrap();
        assert_eq!(usdc_price, Decimal::one());
    }

    #[test]
    fn test_mock_oracle_set_price() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let api = MockApi::default();
        let anyone = api.addr_make("anyone");
        let info = message_info(&anyone, &[]);

        // First instantiate with empty prices
        let init_msg = MockOracleInstantiateMsg { prices: vec![] };
        mock_oracle_instantiate(deps.as_mut(), env.clone(), info.clone(), init_msg).unwrap();

        // Set a price
        let msg = MockOracleExecuteMsg::SetPrice {
            denom: "uatom".to_string(),
            price: Decimal::from_ratio(15u128, 1u128),
        };
        let res = mock_oracle_execute(deps.as_mut(), env, info, msg).unwrap();
        assert_eq!(res.attributes.len(), 3);

        // Verify price was stored
        let atom_price = PRICES.load(&deps.storage, "uatom").unwrap();
        assert_eq!(atom_price, Decimal::from_ratio(15u128, 1u128));
    }

    #[test]
    fn test_mock_oracle_query_price() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let api = MockApi::default();
        let creator = api.addr_make("creator");
        let info = message_info(&creator, &[]);

        let msg = MockOracleInstantiateMsg {
            prices: vec![("uatom".to_string(), Decimal::from_ratio(10u128, 1u128))],
        };
        mock_oracle_instantiate(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Query price
        let query_msg = OracleQueryMsg::Price {
            denom: "uatom".to_string(),
        };
        let res = mock_oracle_query(deps.as_ref(), env.clone(), query_msg).unwrap();
        let price_response: PriceResponse = cosmwasm_std::from_json(res).unwrap();

        assert_eq!(price_response.denom, "uatom");
        assert_eq!(price_response.price, Decimal::from_ratio(10u128, 1u128));
        assert_eq!(price_response.updated_at, env.block.time.seconds());
    }

    #[test]
    fn test_mock_oracle_query_missing_price() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let api = MockApi::default();
        let creator = api.addr_make("creator");
        let info = message_info(&creator, &[]);

        let msg = MockOracleInstantiateMsg { prices: vec![] };
        mock_oracle_instantiate(deps.as_mut(), env.clone(), info, msg).unwrap();

        // Query non-existent price
        let query_msg = OracleQueryMsg::Price {
            denom: "uatom".to_string(),
        };
        let res = mock_oracle_query(deps.as_ref(), env, query_msg);
        assert!(res.is_err());
    }
}
