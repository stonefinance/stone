use cosmwasm_std::{Decimal, Fraction, Uint128};

use crate::error::ContractError;

/// Multiply Uint128 by Decimal, rounding down.
/// scaled = amount / index => amount = scaled * index
pub fn mul_decimal(amount: Uint128, decimal: Decimal) -> Uint128 {
    amount.mul_floor(decimal)
}

/// Multiply Uint128 by Decimal, rounding up.
/// Use for debt calculations to ensure protocol never understates debt.
pub fn mul_decimal_ceil(amount: Uint128, decimal: Decimal) -> Uint128 {
    amount.mul_ceil(decimal)
}

/// Divide Uint128 by Decimal, rounding down.
/// scaled = amount / index
pub fn div_decimal(amount: Uint128, decimal: Decimal) -> Result<Uint128, ContractError> {
    if decimal.is_zero() {
        return Err(ContractError::DivideByZero {});
    }
    // amount / decimal = amount * (1 / decimal)
    // For division: scaled = amount * (denominator / numerator)
    let numerator = decimal.numerator();
    let denominator = decimal.denominator();
    Ok(amount.multiply_ratio(denominator, numerator))
}

/// Divide Uint128 by Decimal, rounding up.
/// Use for debt calculations to ensure protocol never understates debt.
pub fn div_decimal_ceil(amount: Uint128, decimal: Decimal) -> Result<Uint128, ContractError> {
    if decimal.is_zero() {
        return Err(ContractError::DivideByZero {});
    }
    // ceil(amount / decimal) = floor((amount + decimal - 1) / decimal)
    // Using: ceil(a/b) = (a + b - 1) / b
    let numerator = decimal.numerator();
    let denominator = decimal.denominator();
    // amount / (numerator/denominator) = amount * denominator / numerator
    // We need: ceil(amount * denominator / numerator)
    let amount_times_denom = amount.checked_multiply_ratio(denominator, 1u128).map_err(|_| ContractError::DivideByZero {})?;
    // ceil(x / y) = (x + y - 1) / y
    let adjusted = amount_times_denom.checked_add(numerator.checked_sub(1u128.into()).map_err(|_| ContractError::DivideByZero {})?)
        .map_err(|_| ContractError::DivideByZero {})?;
    adjusted.checked_div(numerator).map_err(|_| ContractError::DivideByZero.into())
}

/// Convert an amount to scaled amount using an index, rounding down.
/// scaled = amount / index
/// Use for supply/withdraw/repay operations (favors protocol).
pub fn amount_to_scaled(amount: Uint128, index: Decimal) -> Result<Uint128, ContractError> {
    div_decimal(amount, index)
}

/// Convert an amount to scaled amount using an index, rounding up.
/// scaled = ceil(amount / index)
/// Use for borrow operations to ensure recorded debt >= actual borrowed amount.
pub fn amount_to_scaled_ceil(amount: Uint128, index: Decimal) -> Result<Uint128, ContractError> {
    div_decimal_ceil(amount, index)
}

/// Convert a scaled amount back to actual amount using an index, rounding down.
/// amount = scaled * index
/// Use for supply/withdraw calculations (favors protocol).
pub fn scaled_to_amount(scaled: Uint128, index: Decimal) -> Uint128 {
    mul_decimal(scaled, index)
}

/// Convert a scaled amount back to actual amount using an index, rounding up.
/// amount = ceil(scaled * index)
/// Use for debt queries and health checks to ensure displayed debt is never understated.
pub fn scaled_to_amount_ceil(scaled: Uint128, index: Decimal) -> Uint128 {
    mul_decimal_ceil(scaled, index)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mul_decimal() {
        let amount = Uint128::new(1000);
        let decimal = Decimal::percent(50);
        assert_eq!(mul_decimal(amount, decimal), Uint128::new(500));
    }

    #[test]
    fn test_mul_decimal_index() {
        let amount = Uint128::new(1000);
        let index = Decimal::from_ratio(11u128, 10u128); // 1.1
        assert_eq!(mul_decimal(amount, index), Uint128::new(1100));
    }

    #[test]
    fn test_div_decimal() {
        let amount = Uint128::new(1100);
        let index = Decimal::from_ratio(11u128, 10u128); // 1.1
        assert_eq!(div_decimal(amount, index).unwrap(), Uint128::new(1000));
    }

    #[test]
    fn test_div_decimal_zero() {
        let amount = Uint128::new(1000);
        let decimal = Decimal::zero();
        assert_eq!(div_decimal(amount, decimal), Err(ContractError::DivideByZero {}));
    }

    #[test]
    fn test_div_decimal_ceil_zero() {
        let amount = Uint128::new(1000);
        let decimal = Decimal::zero();
        assert_eq!(div_decimal_ceil(amount, decimal), Err(ContractError::DivideByZero {}));
    }

    #[test]
    fn test_amount_to_scaled_zero() {
        let amount = Uint128::new(1000);
        let index = Decimal::zero();
        assert_eq!(amount_to_scaled(amount, index), Err(ContractError::DivideByZero {}));
    }

    #[test]
    fn test_amount_to_scaled_ceil_zero() {
        let amount = Uint128::new(1000);
        let index = Decimal::zero();
        assert_eq!(amount_to_scaled_ceil(amount, index), Err(ContractError::DivideByZero {}));
    }

    #[test]
    fn test_amount_to_scaled() {
        // Supply 1000 with index 1.0 => scaled = 1000
        let amount = Uint128::new(1000);
        let index = Decimal::one();
        assert_eq!(amount_to_scaled(amount, index).unwrap(), Uint128::new(1000));

        // Supply 1100 with index 1.1 => scaled = 1000
        let amount = Uint128::new(1100);
        let index = Decimal::from_ratio(11u128, 10u128);
        assert_eq!(amount_to_scaled(amount, index).unwrap(), Uint128::new(1000));
    }

    #[test]
    fn test_scaled_to_amount() {
        // Scaled 1000 with index 1.0 => amount = 1000
        let scaled = Uint128::new(1000);
        let index = Decimal::one();
        assert_eq!(scaled_to_amount(scaled, index), Uint128::new(1000));

        // Scaled 1000 with index 1.1 => amount = 1100
        let scaled = Uint128::new(1000);
        let index = Decimal::from_ratio(11u128, 10u128);
        assert_eq!(scaled_to_amount(scaled, index), Uint128::new(1100));
    }

    #[test]
    fn test_round_trip() {
        let original = Uint128::new(12345);
        let index = Decimal::from_ratio(123u128, 100u128); // 1.23
        let scaled = amount_to_scaled(original, index).unwrap();
        let recovered = scaled_to_amount(scaled, index);
        // Should be close (may lose precision due to rounding)
        assert!(recovered <= original);
        assert!(original - recovered < Uint128::new(2));
    }
}
