use cosmwasm_std::{Decimal, Decimal256, Uint128, Uint256};

use crate::error::ContractError;

/// Convert Uint128 to Decimal256 for intermediate calculations that need wider range.
/// This prevents overflow when multiplying large token amounts by prices.
pub fn u128_to_decimal256(amount: Uint128) -> Decimal256 {
    Decimal256::from_ratio(Uint256::from(amount), Uint256::one())
}

/// Convert Decimal to Decimal256 using native cosmwasm-std `From` trait.
pub fn decimal_to_decimal256(decimal: Decimal) -> Decimal256 {
    Decimal256::from(decimal)
}

/// Convert Decimal256 back to Decimal using native cosmwasm-std `TryFrom` trait.
/// Returns an error if the value exceeds the Decimal range.
pub fn decimal256_to_decimal(value: Decimal256) -> Result<Decimal, ContractError> {
    Decimal::try_from(value).map_err(|_| ContractError::MathOverflow {
        reason: "Decimal256 value too large for Decimal".to_string(),
    })
}

/// Convert Uint256 to Uint128 using native cosmwasm-std `TryFrom` trait.
/// Returns an error if the value exceeds the Uint128 range.
pub fn uint256_to_uint128(value: Uint256) -> Result<Uint128, ContractError> {
    Uint128::try_from(value).map_err(|_| ContractError::MathOverflow {
        reason: "Uint256 value too large for Uint128".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_u128_to_decimal256() {
        let amount = Uint128::new(1_000_000);
        let result = u128_to_decimal256(amount);
        assert_eq!(result, Decimal256::from_ratio(1_000_000u128, 1u128));
    }

    #[test]
    fn test_u128_to_decimal256_large() {
        let amount = Uint128::MAX;
        let result = u128_to_decimal256(amount);
        // Should not panic even with MAX value
        assert!(result > Decimal256::zero());
    }

    #[test]
    fn test_decimal_to_decimal256_native() {
        let decimal = Decimal::percent(85);
        let result = decimal_to_decimal256(decimal);
        assert_eq!(result, Decimal256::percent(85));
    }

    #[test]
    fn test_decimal256_to_decimal_native() {
        let value = Decimal256::percent(170);
        let result = decimal256_to_decimal(value).unwrap();
        assert_eq!(result, Decimal::percent(170));
    }

    #[test]
    fn test_decimal256_to_decimal_overflow() {
        // Decimal256 can represent values much larger than Decimal
        // Decimal max ≈ 340282366920938463463.374607431768211455
        // Create a value that exceeds Decimal range
        let huge = Decimal256::from_ratio(Uint256::from(u128::MAX), Uint256::one())
            .checked_mul(Decimal256::from_ratio(1000u128, 1u128))
            .unwrap();
        let result = decimal256_to_decimal(huge);
        assert!(result.is_err());
    }

    #[test]
    fn test_uint256_to_uint128_success() {
        let value = Uint256::from(42u128);
        let result = uint256_to_uint128(value).unwrap();
        assert_eq!(result, Uint128::new(42));
    }

    #[test]
    fn test_uint256_to_uint128_max() {
        let value = Uint256::from(u128::MAX);
        let result = uint256_to_uint128(value).unwrap();
        assert_eq!(result, Uint128::MAX);
    }

    #[test]
    fn test_uint256_to_uint128_overflow() {
        let value = Uint256::from(u128::MAX) + Uint256::one();
        let result = uint256_to_uint128(value);
        assert!(result.is_err());
    }
}
