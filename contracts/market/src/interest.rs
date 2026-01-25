use cosmwasm_std::{BankMsg, Coin, Decimal, Storage, Uint128};

use crate::error::ContractError;
use crate::state::{CONFIG, PARAMS, STATE};

/// Seconds per year for interest calculations
pub const SECONDS_PER_YEAR: u64 = 31_536_000;

/// Apply accumulated interest to the market state.
/// This updates borrow_index, liquidity_index, and distributes fees.
/// Returns bank messages for fee transfers (if any).
pub fn apply_accumulated_interest(
    storage: &mut dyn Storage,
    current_time: u64,
) -> Result<Vec<BankMsg>, ContractError> {
    let mut state = STATE.load(storage)?;
    let params = PARAMS.load(storage)?;
    let config = CONFIG.load(storage)?;

    let time_elapsed = current_time.saturating_sub(state.last_update);
    if time_elapsed == 0 {
        return Ok(vec![]);
    }

    // If no debt, just update timestamp
    if state.total_debt_scaled.is_zero() {
        state.last_update = current_time;
        state.borrow_rate = params
            .interest_rate_model
            .calculate_borrow_rate(Decimal::zero());
        state.liquidity_rate = Decimal::zero();
        STATE.save(storage, &state)?;
        return Ok(vec![]);
    }

    // Calculate current utilization
    let utilization = state.utilization();

    // Get borrow rate from interest rate model
    let borrow_rate = params
        .interest_rate_model
        .calculate_borrow_rate(utilization);

    // Calculate borrow index increase
    // Linear interest: index_new = index_old * (1 + rate * time / year)
    let time_fraction = Decimal::from_ratio(time_elapsed, SECONDS_PER_YEAR);
    let borrow_index_delta = state
        .borrow_index
        .checked_mul(borrow_rate)?
        .checked_mul(time_fraction)?;
    let new_borrow_index = state.borrow_index.checked_add(borrow_index_delta)?;

    // Calculate interest earned (in debt token units)
    let interest_earned = state
        .total_debt_scaled
        .checked_mul_floor(borrow_index_delta)?;

    // Calculate fee amounts
    let protocol_fee_amount = interest_earned.checked_mul_floor(params.protocol_fee)?;
    let curator_fee_amount = interest_earned.checked_mul_floor(params.curator_fee)?;
    let total_fees = protocol_fee_amount.checked_add(curator_fee_amount)?;
    let supplier_interest = interest_earned.saturating_sub(total_fees);

    // Update liquidity index for suppliers
    let new_liquidity_index = if state.total_supply_scaled.is_zero() {
        state.liquidity_index
    } else {
        // Suppliers receive their share of interest
        let current_supply = state
            .total_supply_scaled
            .checked_mul_floor(state.liquidity_index)?;
        if current_supply.is_zero() {
            state.liquidity_index
        } else {
            let liquidity_index_delta = Decimal::from_ratio(supplier_interest, current_supply);
            state.liquidity_index.checked_add(liquidity_index_delta)?
        }
    };

    // Calculate liquidity rate (APY for suppliers)
    let liquidity_rate = if utilization.is_zero() {
        Decimal::zero()
    } else {
        let fee_share = Decimal::one()
            .checked_sub(params.protocol_fee)?
            .checked_sub(params.curator_fee)?;
        borrow_rate
            .checked_mul(utilization)?
            .checked_mul(fee_share)?
    };

    // Update state
    state.borrow_index = new_borrow_index;
    state.liquidity_index = new_liquidity_index;
    state.borrow_rate = borrow_rate;
    state.liquidity_rate = liquidity_rate;
    state.last_update = current_time;

    STATE.save(storage, &state)?;

    // Create fee transfer messages
    let mut messages = vec![];

    // Protocol fee
    if !protocol_fee_amount.is_zero() {
        messages.push(BankMsg::Send {
            to_address: config.protocol_fee_collector.to_string(),
            amount: vec![Coin {
                denom: config.debt_denom.clone(),
                amount: protocol_fee_amount,
            }],
        });
    }

    // Curator fee
    if !curator_fee_amount.is_zero() {
        messages.push(BankMsg::Send {
            to_address: config.curator.to_string(),
            amount: vec![Coin {
                denom: config.debt_denom,
                amount: curator_fee_amount,
            }],
        });
    }

    Ok(messages)
}

/// Get current user supply amount (unscaled).
pub fn get_user_supply(storage: &dyn Storage, user: &str) -> Result<Uint128, ContractError> {
    let state = STATE.load(storage)?;
    let scaled = crate::state::SUPPLIES
        .may_load(storage, user)?
        .unwrap_or_default();
    Ok(stone_types::scaled_to_amount(scaled, state.liquidity_index))
}

/// Get current user debt amount (unscaled).
pub fn get_user_debt(storage: &dyn Storage, user: &str) -> Result<Uint128, ContractError> {
    let state = STATE.load(storage)?;
    let scaled = crate::state::DEBTS
        .may_load(storage, user)?
        .unwrap_or_default();
    Ok(stone_types::scaled_to_amount(scaled, state.borrow_index))
}

/// Get user collateral amount (not scaled, stored as-is).
pub fn get_user_collateral(storage: &dyn Storage, user: &str) -> Result<Uint128, ContractError> {
    Ok(crate::state::COLLATERAL
        .may_load(storage, user)?
        .unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::mock_dependencies;
    use cosmwasm_std::Addr;
    use stone_types::{InterestRateModel, MarketConfig, MarketParams, MarketState, OracleConfig, OracleType};

    fn setup_market(
        deps: &mut cosmwasm_std::OwnedDeps<
            cosmwasm_std::MemoryStorage,
            cosmwasm_std::testing::MockApi,
            cosmwasm_std::testing::MockQuerier,
        >,
    ) {
        let config = MarketConfig {
            factory: Addr::unchecked("factory"),
            curator: Addr::unchecked("curator"),
            oracle_config: OracleConfig {
                address: Addr::unchecked("oracle"),
                oracle_type: OracleType::Generic {
                    expected_code_id: None,
                    max_staleness_secs: 300,
                },
            },
            collateral_denom: "uatom".to_string(),
            debt_denom: "uusdc".to_string(),
            protocol_fee_collector: Addr::unchecked("collector"),
        };
        CONFIG.save(deps.as_mut().storage, &config).unwrap();

        let params = MarketParams {
            loan_to_value: Decimal::percent(80),
            liquidation_threshold: Decimal::percent(85),
            liquidation_bonus: Decimal::percent(5),
            liquidation_protocol_fee: Decimal::percent(2),
            close_factor: Decimal::percent(50),
            interest_rate_model: InterestRateModel::Linear {
                optimal_utilization: Decimal::percent(80),
                base_rate: Decimal::zero(),
                slope_1: Decimal::percent(4),
                slope_2: Decimal::percent(300),
            },
            protocol_fee: Decimal::percent(10),
            curator_fee: Decimal::percent(5),
            supply_cap: None,
            borrow_cap: None,
            enabled: true,
            is_mutable: false,
            ltv_last_update: 0,
        };
        PARAMS.save(deps.as_mut().storage, &params).unwrap();

        let state = MarketState::new(1000);
        STATE.save(deps.as_mut().storage, &state).unwrap();
    }

    #[test]
    fn test_no_interest_when_no_time_elapsed() {
        let mut deps = mock_dependencies();
        setup_market(&mut deps);

        let messages = apply_accumulated_interest(deps.as_mut().storage, 1000).unwrap();
        assert!(messages.is_empty());

        let state = STATE.load(deps.as_ref().storage).unwrap();
        assert_eq!(state.borrow_index, Decimal::one());
    }

    #[test]
    fn test_no_interest_when_no_debt() {
        let mut deps = mock_dependencies();
        setup_market(&mut deps);

        // Add some supply but no debt
        let mut state = STATE.load(deps.as_ref().storage).unwrap();
        state.total_supply_scaled = Uint128::new(10000);
        STATE.save(deps.as_mut().storage, &state).unwrap();

        let messages = apply_accumulated_interest(deps.as_mut().storage, 2000).unwrap();
        assert!(messages.is_empty());

        let state = STATE.load(deps.as_ref().storage).unwrap();
        assert_eq!(state.borrow_index, Decimal::one());
        assert_eq!(state.last_update, 2000);
    }

    #[test]
    fn test_interest_accrual_one_year() {
        let mut deps = mock_dependencies();
        setup_market(&mut deps);

        // Set up 50% utilization: 10000 supply, 5000 debt
        let mut state = STATE.load(deps.as_ref().storage).unwrap();
        state.total_supply_scaled = Uint128::new(10000);
        state.total_debt_scaled = Uint128::new(5000);
        STATE.save(deps.as_mut().storage, &state).unwrap();

        // Advance one year
        let _messages =
            apply_accumulated_interest(deps.as_mut().storage, 1000 + SECONDS_PER_YEAR).unwrap();

        let state = STATE.load(deps.as_ref().storage).unwrap();

        // At 50% utilization (below 80% optimal), rate = 0 + 4% * (50/80) = 2.5%
        // After 1 year, borrow_index should be ~1.025
        assert!(state.borrow_index > Decimal::one());
        assert!(state.borrow_index < Decimal::from_ratio(103u128, 100u128));
    }

    #[test]
    fn test_get_user_supply_with_index() {
        let mut deps = mock_dependencies();
        setup_market(&mut deps);

        // Set liquidity index to 1.1
        let mut state = STATE.load(deps.as_ref().storage).unwrap();
        state.liquidity_index = Decimal::from_ratio(11u128, 10u128);
        STATE.save(deps.as_mut().storage, &state).unwrap();

        // User has 1000 scaled supply
        crate::state::SUPPLIES
            .save(deps.as_mut().storage, "user1", &Uint128::new(1000))
            .unwrap();

        // Actual supply = 1000 * 1.1 = 1100
        let supply = get_user_supply(deps.as_ref().storage, "user1").unwrap();
        assert_eq!(supply, Uint128::new(1100));
    }

    #[test]
    fn test_get_user_debt_with_index() {
        let mut deps = mock_dependencies();
        setup_market(&mut deps);

        // Set borrow index to 1.2
        let mut state = STATE.load(deps.as_ref().storage).unwrap();
        state.borrow_index = Decimal::from_ratio(12u128, 10u128);
        STATE.save(deps.as_mut().storage, &state).unwrap();

        // User has 500 scaled debt
        crate::state::DEBTS
            .save(deps.as_mut().storage, "user1", &Uint128::new(500))
            .unwrap();

        // Actual debt = 500 * 1.2 = 600
        let debt = get_user_debt(deps.as_ref().storage, "user1").unwrap();
        assert_eq!(debt, Uint128::new(600));
    }

    #[test]
    fn test_get_user_collateral() {
        let mut deps = mock_dependencies();
        setup_market(&mut deps);

        crate::state::COLLATERAL
            .save(deps.as_mut().storage, "user1", &Uint128::new(1000))
            .unwrap();

        let collateral = get_user_collateral(deps.as_ref().storage, "user1").unwrap();
        assert_eq!(collateral, Uint128::new(1000));
    }
}
