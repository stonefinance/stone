use cosmwasm_schema::cw_serde;
use cosmwasm_std::{
    entry_point, to_json_binary, Binary, Decimal, Deps, DepsMut, Env, MessageInfo, Response,
    StdResult,
};
use cw_storage_plus::Map;
use stone_types::{OracleQueryMsg, PriceResponse};

pub const PRICES: Map<&str, Decimal> = Map::new("prices");

#[cw_serde]
pub struct InstantiateMsg {
    pub prices: Vec<PriceInit>,
}

#[cw_serde]
pub struct PriceInit {
    pub denom: String,
    pub price: String,
}

#[cw_serde]
pub enum ExecuteMsg {
    SetPrice { denom: String, price: String },
}

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: InstantiateMsg,
) -> StdResult<Response> {
    for price_init in msg.prices {
        let price: Decimal = price_init.price.parse().unwrap_or(Decimal::zero());
        PRICES.save(deps.storage, &price_init.denom, &price)?;
    }
    Ok(Response::new().add_attribute("action", "instantiate_mock_oracle"))
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: ExecuteMsg,
) -> StdResult<Response> {
    match msg {
        ExecuteMsg::SetPrice { denom, price } => {
            let price: Decimal = price.parse().unwrap_or(Decimal::zero());
            PRICES.save(deps.storage, &denom, &price)?;
            Ok(Response::new()
                .add_attribute("action", "set_price")
                .add_attribute("denom", denom))
        }
    }
}

#[entry_point]
pub fn query(deps: Deps, env: Env, msg: OracleQueryMsg) -> StdResult<Binary> {
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
