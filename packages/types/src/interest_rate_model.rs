use cosmwasm_schema::cw_serde;
use cosmwasm_std::Decimal;

/// Interest rate model for calculating borrow rates based on utilization.
#[cw_serde]
pub enum InterestRateModel {
    /// Linear interest rate model with a kink at optimal utilization.
    /// - Below optimal: base_rate + (utilization / optimal) * slope_1
    /// - Above optimal: base_rate + slope_1 + ((utilization - optimal) / (1 - optimal)) * slope_2
    Linear {
        /// Target utilization rate (e.g., 0.8 = 80%)
        optimal_utilization: Decimal,
        /// Base interest rate when utilization is 0 (e.g., 0.0)
        base_rate: Decimal,
        /// Interest rate slope below optimal utilization (e.g., 0.04 = 4%)
        slope_1: Decimal,
        /// Interest rate slope above optimal utilization (e.g., 3.0 = 300%)
        slope_2: Decimal,
    },
}

impl InterestRateModel {
    /// Calculate the borrow rate for a given utilization.
    pub fn calculate_borrow_rate(&self, utilization: Decimal) -> Decimal {
        match self {
            InterestRateModel::Linear {
                optimal_utilization,
                base_rate,
                slope_1,
                slope_2,
            } => {
                if utilization <= *optimal_utilization {
                    // Below or at optimal: linear increase with slope_1
                    if optimal_utilization.is_zero() {
                        *base_rate
                    } else {
                        *base_rate + (utilization * *slope_1 / *optimal_utilization)
                    }
                } else {
                    // Above optimal: steeper increase with slope_2
                    let excess = utilization - *optimal_utilization;
                    let remaining = Decimal::one() - *optimal_utilization;
                    if remaining.is_zero() {
                        *base_rate + *slope_1
                    } else {
                        *base_rate + *slope_1 + (excess * *slope_2 / remaining)
                    }
                }
            }
        }
    }

    /// Validate the interest rate model parameters.
    pub fn validate(&self) -> bool {
        match self {
            InterestRateModel::Linear {
                optimal_utilization,
                base_rate,
                slope_1,
                slope_2,
            } => {
                // Optimal utilization must be between 0 and 1
                *optimal_utilization <= Decimal::one()
                    // Base rate must be non-negative
                    && *base_rate >= Decimal::zero()
                    // Slopes must be non-negative
                    && *slope_1 >= Decimal::zero()
                    && *slope_2 >= Decimal::zero()
            }
        }
    }
}

impl Default for InterestRateModel {
    fn default() -> Self {
        InterestRateModel::Linear {
            optimal_utilization: Decimal::percent(80),
            base_rate: Decimal::zero(),
            slope_1: Decimal::percent(4),
            slope_2: Decimal::percent(300),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_linear_model_below_optimal() {
        let model = InterestRateModel::Linear {
            optimal_utilization: Decimal::percent(80),
            base_rate: Decimal::zero(),
            slope_1: Decimal::percent(4),
            slope_2: Decimal::percent(300),
        };

        // At 0% utilization
        let rate = model.calculate_borrow_rate(Decimal::zero());
        assert_eq!(rate, Decimal::zero());

        // At 40% utilization (halfway to optimal)
        let rate = model.calculate_borrow_rate(Decimal::percent(40));
        assert_eq!(rate, Decimal::percent(2)); // 4% * (40/80) = 2%

        // At 80% utilization (optimal)
        let rate = model.calculate_borrow_rate(Decimal::percent(80));
        assert_eq!(rate, Decimal::percent(4)); // slope_1 = 4%
    }

    #[test]
    fn test_linear_model_above_optimal() {
        let model = InterestRateModel::Linear {
            optimal_utilization: Decimal::percent(80),
            base_rate: Decimal::zero(),
            slope_1: Decimal::percent(4),
            slope_2: Decimal::percent(300),
        };

        // At 90% utilization (halfway between optimal and 100%)
        let rate = model.calculate_borrow_rate(Decimal::percent(90));
        // 4% + 300% * (10/20) = 4% + 150% = 154%
        assert_eq!(rate, Decimal::percent(154));

        // At 100% utilization
        let rate = model.calculate_borrow_rate(Decimal::percent(100));
        // 4% + 300% = 304%
        assert_eq!(rate, Decimal::percent(304));
    }

    #[test]
    fn test_validate() {
        let valid = InterestRateModel::default();
        assert!(valid.validate());

        let invalid = InterestRateModel::Linear {
            optimal_utilization: Decimal::percent(150), // > 100%
            base_rate: Decimal::zero(),
            slope_1: Decimal::percent(4),
            slope_2: Decimal::percent(300),
        };
        assert!(!invalid.validate());
    }
}
