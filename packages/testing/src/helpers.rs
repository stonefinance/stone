use cosmwasm_std::{Coin, Decimal, Uint128};
use stone_types::{CreateMarketParams, InterestRateModel};

/// Default test addresses
pub const OWNER: &str = "owner";
pub const CURATOR: &str = "curator";
pub const USER1: &str = "user1";
pub const USER2: &str = "user2";
pub const LIQUIDATOR: &str = "liquidator";
pub const FEE_COLLECTOR: &str = "fee_collector";

/// Default test denoms
pub const COLLATERAL_DENOM: &str = "uatom";
pub const DEBT_DENOM: &str = "uusdc";

/// Seconds per year for interest calculations
pub const SECONDS_PER_YEAR: u64 = 31_536_000;

/// 7 days in seconds (LTV update cooldown)
pub const LTV_COOLDOWN_SECONDS: u64 = 604_800;

/// Create default market params for testing.
pub fn default_market_params() -> CreateMarketParams {
    CreateMarketParams {
        loan_to_value: Decimal::percent(80),
        liquidation_threshold: Decimal::percent(85),
        liquidation_bonus: Decimal::percent(5),
        liquidation_protocol_fee: Decimal::percent(2),
        close_factor: Decimal::percent(50),
        interest_rate_model: InterestRateModel::default(),
        protocol_fee: Decimal::percent(10),
        curator_fee: Decimal::percent(5),
        supply_cap: None,
        borrow_cap: None,
        is_mutable: false,
    }
}

/// Create market params with custom LTV and liquidation threshold.
pub fn market_params_with_ltv(ltv: u64, liq_threshold: u64) -> CreateMarketParams {
    CreateMarketParams {
        loan_to_value: Decimal::percent(ltv),
        liquidation_threshold: Decimal::percent(liq_threshold),
        ..default_market_params()
    }
}

/// Create mutable market params for testing LTV updates.
pub fn mutable_market_params() -> CreateMarketParams {
    CreateMarketParams {
        is_mutable: true,
        ..default_market_params()
    }
}

/// Create coins for testing.
pub fn coins(amount: u128, denom: &str) -> Vec<Coin> {
    vec![Coin {
        denom: denom.to_string(),
        amount: Uint128::new(amount),
    }]
}

/// Create a single coin for testing.
pub fn coin(amount: u128, denom: &str) -> Coin {
    Coin {
        denom: denom.to_string(),
        amount: Uint128::new(amount),
    }
}

/// Calculate expected interest accrual.
/// Returns (new_borrow_index, new_liquidity_index).
pub fn calculate_expected_indices(
    borrow_index: Decimal,
    liquidity_index: Decimal,
    borrow_rate: Decimal,
    total_supply_scaled: Uint128,
    total_debt_scaled: Uint128,
    protocol_fee: Decimal,
    curator_fee: Decimal,
    time_elapsed: u64,
) -> (Decimal, Decimal) {
    // Calculate borrow index increase
    let time_fraction = Decimal::from_ratio(time_elapsed, SECONDS_PER_YEAR);
    let borrow_index_delta = borrow_index * borrow_rate * time_fraction;
    let new_borrow_index = borrow_index + borrow_index_delta;

    // Calculate interest earned
    let interest_earned = total_debt_scaled.mul_floor(borrow_index_delta);

    // Calculate supplier share after fees
    let total_fees = protocol_fee + curator_fee;
    let supplier_share = Decimal::one() - total_fees;
    let supplier_interest = interest_earned.mul_floor(supplier_share);

    // Calculate new liquidity index
    let new_liquidity_index = if total_supply_scaled.is_zero() {
        liquidity_index
    } else {
        let liquidity_index_delta =
            Decimal::from_ratio(supplier_interest, total_supply_scaled.mul_floor(liquidity_index));
        liquidity_index + liquidity_index_delta
    };

    (new_borrow_index, new_liquidity_index)
}

/// Calculate health factor.
pub fn calculate_health_factor(
    collateral_amount: Uint128,
    collateral_price: Decimal,
    debt_amount: Uint128,
    debt_price: Decimal,
    liquidation_threshold: Decimal,
) -> Option<Decimal> {
    if debt_amount.is_zero() {
        return None;
    }

    let collateral_value = Decimal::from_ratio(collateral_amount, 1u128) * collateral_price;
    let debt_value = Decimal::from_ratio(debt_amount, 1u128) * debt_price;

    Some((collateral_value * liquidation_threshold) / debt_value)
}

/// Check if a position is liquidatable.
pub fn is_liquidatable(health_factor: Option<Decimal>) -> bool {
    match health_factor {
        Some(hf) => hf < Decimal::one(),
        None => false, // No debt means not liquidatable
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_market_params() {
        let params = default_market_params();
        assert_eq!(params.loan_to_value, Decimal::percent(80));
        assert_eq!(params.liquidation_threshold, Decimal::percent(85));
        assert_eq!(params.liquidation_bonus, Decimal::percent(5));
        assert!(!params.is_mutable);
    }

    #[test]
    fn test_mutable_market_params() {
        let params = mutable_market_params();
        assert!(params.is_mutable);
    }

    #[test]
    fn test_coins_helper() {
        let c = coins(1000, "uatom");
        assert_eq!(c.len(), 1);
        assert_eq!(c[0].amount, Uint128::new(1000));
        assert_eq!(c[0].denom, "uatom");
    }

    #[test]
    fn test_health_factor_no_debt() {
        let hf = calculate_health_factor(
            Uint128::new(1000),
            Decimal::from_ratio(10u128, 1u128),
            Uint128::zero(),
            Decimal::one(),
            Decimal::percent(85),
        );
        assert!(hf.is_none());
    }

    #[test]
    fn test_health_factor_healthy() {
        // 1000 ATOM at $10 = $10,000 collateral
        // 5000 USDC debt at $1 = $5,000 debt
        // HF = (10000 * 0.85) / 5000 = 1.7
        let hf = calculate_health_factor(
            Uint128::new(1000),
            Decimal::from_ratio(10u128, 1u128),
            Uint128::new(5000),
            Decimal::one(),
            Decimal::percent(85),
        );
        assert!(hf.is_some());
        let hf = hf.unwrap();
        assert!(hf > Decimal::one());
        assert!(!is_liquidatable(Some(hf)));
    }

    #[test]
    fn test_health_factor_liquidatable() {
        // 1000 ATOM at $5 = $5,000 collateral
        // 5000 USDC debt at $1 = $5,000 debt
        // HF = (5000 * 0.85) / 5000 = 0.85
        let hf = calculate_health_factor(
            Uint128::new(1000),
            Decimal::from_ratio(5u128, 1u128),
            Uint128::new(5000),
            Decimal::one(),
            Decimal::percent(85),
        );
        assert!(hf.is_some());
        let hf = hf.unwrap();
        assert!(hf < Decimal::one());
        assert!(is_liquidatable(Some(hf)));
    }

    #[test]
    fn test_calculate_expected_indices() {
        let borrow_index = Decimal::one();
        let liquidity_index = Decimal::one();
        let borrow_rate = Decimal::percent(10); // 10% APR
        let total_supply_scaled = Uint128::new(10000);
        let total_debt_scaled = Uint128::new(5000);
        let protocol_fee = Decimal::percent(10);
        let curator_fee = Decimal::percent(5);
        let time_elapsed = SECONDS_PER_YEAR; // 1 year

        let (new_borrow, new_liquidity) = calculate_expected_indices(
            borrow_index,
            liquidity_index,
            borrow_rate,
            total_supply_scaled,
            total_debt_scaled,
            protocol_fee,
            curator_fee,
            time_elapsed,
        );

        // After 1 year at 10% rate, borrow index should be 1.1
        assert_eq!(new_borrow, Decimal::from_ratio(11u128, 10u128));

        // Interest earned = 5000 * 0.1 = 500
        // Supplier share = 500 * 0.85 = 425
        // Liquidity index increase = 425 / 10000 = 0.0425
        // New liquidity index = 1.0425
        assert!(new_liquidity > Decimal::one());
        assert!(new_liquidity < Decimal::from_ratio(105u128, 100u128));
    }
}
