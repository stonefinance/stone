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
    amount
        .checked_multiply_ratio(denominator, numerator)
        .map_err(|_| ContractError::MathOverflow {})
}

/// Divide Uint128 by Decimal, rounding up.
/// Use for debt calculations to ensure protocol never understates debt.
pub fn div_decimal_ceil(amount: Uint128, decimal: Decimal) -> Uint128 {
    // ceil(amount / decimal) = floor((amount + decimal - 1) / decimal)
    // Using: ceil(a/b) = (a + b - 1) / b
    let numerator = decimal.numerator();
    let denominator = decimal.denominator();
    // amount / (numerator/denominator) = amount * denominator / numerator
    // We need: ceil(amount * denominator / numerator)
    let amount_times_denom = amount.checked_multiply_ratio(denominator, 1u128).unwrap();
    // ceil(x / y) = (x + y - 1) / y
    let adjusted = amount_times_denom
        .checked_add(numerator.checked_sub(1u128.into()).unwrap())
        .unwrap();
    adjusted.checked_div(numerator).unwrap()
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
pub fn amount_to_scaled_ceil(amount: Uint128, index: Decimal) -> Uint128 {
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
    fn test_mul_decimal_ceil() {
        // Exact division: 1000 * 0.5 = 500
        let amount = Uint128::new(1000);
        let decimal = Decimal::percent(50);
        assert_eq!(mul_decimal_ceil(amount, decimal), Uint128::new(500));

        // With index 1.1: 1000 * 1.1 = 1100 (exact)
        let amount = Uint128::new(1000);
        let index = Decimal::from_ratio(11u128, 10u128);
        assert_eq!(mul_decimal_ceil(amount, index), Uint128::new(1100));
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
        assert_eq!(
            div_decimal(amount, decimal),
            Err(ContractError::DivideByZero {})
        );
    }

    #[test]
    fn test_amount_to_scaled_zero() {
        let amount = Uint128::new(1000);
        let index = Decimal::zero();
        assert_eq!(
            amount_to_scaled(amount, index),
            Err(ContractError::DivideByZero {})
        );
    }

    #[test]
    fn test_div_decimal_ceil() {
        // Exact division: 1100 / 1.1 = 1000
        let amount = Uint128::new(1100);
        let index = Decimal::from_ratio(11u128, 10u128); // 1.1
        assert_eq!(div_decimal_ceil(amount, index), Uint128::new(1000));

        // Division with remainder: 1000 / 1.1 = 909.09... -> ceil = 910
        let amount = Uint128::new(1000);
        let index = Decimal::from_ratio(11u128, 10u128); // 1.1
        assert_eq!(div_decimal_ceil(amount, index), Uint128::new(910));
    }

    #[test]
    fn test_div_decimal_ceil_rounding_edge_cases() {
        // Edge case: amount = 1, index = 1.1
        // 1 / 1.1 = 0.909... -> ceil = 1
        let amount = Uint128::new(1);
        let index = Decimal::from_ratio(11u128, 10u128);
        assert_eq!(div_decimal(amount, index).unwrap(), Uint128::new(0)); // floor
        assert_eq!(div_decimal_ceil(amount, index), Uint128::new(1)); // ceil

        // Edge case: amount = 100, index = 3 (not divisible)
        // 100 / 3 = 33.33... -> ceil = 34
        let amount = Uint128::new(100);
        let index = Decimal::from_ratio(3u128, 1u128);
        assert_eq!(div_decimal(amount, index).unwrap(), Uint128::new(33));
        assert_eq!(div_decimal_ceil(amount, index), Uint128::new(34));
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
    fn test_amount_to_scaled_ceil() {
        // Borrow 1000 with index 1.0 => scaled = 1000 (exact)
        let amount = Uint128::new(1000);
        let index = Decimal::one();
        assert_eq!(amount_to_scaled_ceil(amount, index), Uint128::new(1000));

        // Borrow 1000 with index 1.1 => scaled = ceil(909.09...) = 910
        // This is critical: borrower receives 1000 but owes 910 scaled shares
        // At index 1.1, 910 shares = 1001 (rounded up), protecting protocol
        let amount = Uint128::new(1000);
        let index = Decimal::from_ratio(11u128, 10u128);
        assert_eq!(amount_to_scaled_ceil(amount, index), Uint128::new(910));
    }

    #[test]
    fn test_amount_to_scaled_ceil_security() {
        // Security-critical test: small borrows at high index
        // If someone borrows 1 token at index 1.5:
        // floor: 1 / 1.5 = 0 (they get free money!)
        // ceil: ceil(0.66...) = 1 (they owe at least 1 share)
        let amount = Uint128::new(1);
        let index = Decimal::from_ratio(15u128, 10u128); // 1.5
        let floor_scaled = amount_to_scaled(amount, index).unwrap();
        let ceil_scaled = amount_to_scaled_ceil(amount, index);
        assert_eq!(floor_scaled, Uint128::new(0)); // Dangerous with floor!
        assert_eq!(ceil_scaled, Uint128::new(1)); // Safe with ceil
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
    fn test_scaled_to_amount_ceil() {
        // For health checks: scaled 1000 at index 1.1 = 1100
        let scaled = Uint128::new(1000);
        let index = Decimal::from_ratio(11u128, 10u128);
        assert_eq!(scaled_to_amount_ceil(scaled, index), Uint128::new(1100));

        // Edge case: scaled 1 at tiny index increase
        // Should round up to ensure debt is never understated
        let scaled = Uint128::new(1);
        let index = Decimal::from_ratio(1000000000000000001u128, 1000000000000000000u128);
        let floor_result = scaled_to_amount(scaled, index);
        let ceil_result = scaled_to_amount_ceil(scaled, index);
        // Both should be 1 or 2 depending on precision, but ceil >= floor
        assert!(ceil_result >= floor_result);
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

    #[test]
    fn test_round_trip_ceil() {
        // For borrow: use ceil when recording debt
        // For querying: use ceil when reading debt
        // This ensures debt is never understated
        let borrow_amount = Uint128::new(1000);
        let index = Decimal::from_ratio(11u128, 10u128); // 1.1

        // Record debt with ceil
        let scaled_debt = amount_to_scaled_ceil(borrow_amount, index);
        // Read debt with ceil
        let recorded_debt = scaled_to_amount_ceil(scaled_debt, index);

        // The recorded debt should be >= borrowed amount
        assert!(recorded_debt >= borrow_amount);

        // Verify: scaled = ceil(1000/1.1) = 910
        // recorded = ceil(910 * 1.1) = ceil(1001) = 1001
        assert_eq!(scaled_debt, Uint128::new(910));
        assert_eq!(recorded_debt, Uint128::new(1001));
    }

    #[test]
    fn test_borrow_vs_repay_rounding() {
        // Demonstrate the rounding asymmetry that protects the protocol:
        // - Borrow records MORE debt shares (ceil)
        // - Repay removes FEWER debt shares (floor)

        let index = Decimal::from_ratio(11u128, 10u128); // 1.1
        let borrow_amount = Uint128::new(1000);

        // Borrow: record debt with ceil -> 910 shares
        let scaled_from_borrow = amount_to_scaled_ceil(borrow_amount, index);
        assert_eq!(scaled_from_borrow, Uint128::new(910));

        // Repay same amount: calculate shares to remove with floor
        let scaled_for_repay = amount_to_scaled(borrow_amount, index).unwrap();
        assert_eq!(scaled_for_repay, Uint128::new(909));

        // User borrowed 1000, but must repay to remove 910 shares
        // If they repay 1000, only 909 shares are removed
        // 1 share remains = protocol profit (protects against bad debt)
        assert!(scaled_from_borrow > scaled_for_repay);
    }
}
