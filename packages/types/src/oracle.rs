use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::Decimal;

/// Oracle query interface.
/// This defines the interface that oracles must implement.
#[cw_serde]
#[derive(QueryResponses)]
pub enum OracleQueryMsg {
    /// Query price for a specific denom
    #[returns(PriceResponse)]
    Price { denom: String },
}

/// Price response from oracle.
#[cw_serde]
pub struct PriceResponse {
    /// The denom being priced
    pub denom: String,
    /// Price in USD (or reference currency)
    pub price: Decimal,
    /// Timestamp of the price
    pub updated_at: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_price_response_serialization() {
        let response = PriceResponse {
            denom: "uatom".to_string(),
            price: Decimal::from_ratio(10u128, 1u128),
            updated_at: 1000,
        };

        let json = cosmwasm_std::to_json_string(&response).unwrap();
        let parsed: PriceResponse = cosmwasm_std::from_json(json).unwrap();

        assert_eq!(parsed.denom, "uatom");
        assert_eq!(parsed.price, Decimal::from_ratio(10u128, 1u128));
        assert_eq!(parsed.updated_at, 1000);
    }
}
