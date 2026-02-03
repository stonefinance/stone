use cosmwasm_std::{Decimal, Storage, Uint128};

use crate::error::ContractError;
use crate::state::{ACCRUED_CURATOR_FEES, ACCRUED_PROTOCOL_FEES, PARAMS, STATE};

/// Seconds per year for interest calculations
pub const SECONDS_PER_YEAR: u64 = 31_536_000;

/// Apply accumulated interest to the market state.
/// This updates borrow_index, liquidity_index, and accrues fees.
/// Fees are stored as claimable balances rather than being sent immediately,
/// since interest is virtual (index-based) and tokens don't exist until borrowers repay.
pub fn apply_accumulated_interest(
    storage: &mut dyn Storage,
    current_time: u64,
) -> Result<(), ContractError> {
    let mut state = STATE.load(storage)?;
    let params = PARAMS.load(storage)?;

    let time_elapsed = current_time.saturating_sub(state.last_update);

    // Calculate current utilization and rates (even if no time elapsed, rates should reflect current utilization)
    let utilization = state.utilization();
    let borrow_rate = params
        .interest_rate_model
        .calculate_borrow_rate(utilization);
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

    // If no time elapsed, just update rates and return (no interest accrual or index changes)
    if time_elapsed == 0 {
        state.borrow_rate = borrow_rate;
        state.liquidity_rate = liquidity_rate;
        STATE.save(storage, &state)?;
        return Ok(());
    }

    // If no debt, update timestamp and rates
    if state.total_debt_scaled.is_zero() {
        state.last_update = current_time;
        state.borrow_rate = borrow_rate;
        state.liquidity_rate = liquidity_rate;
        STATE.save(storage, &state)?;
        return Ok(());
    }

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

    // Update state (rates were already calculated above)
    state.borrow_index = new_borrow_index;
    state.liquidity_index = new_liquidity_index;
    state.borrow_rate = borrow_rate;
    state.liquidity_rate = liquidity_rate;
    state.last_update = current_time;

    STATE.save(storage, &state)?;

    // Accrue fees to claimable balances (instead of sending immediately)
    // This fixes C-2: Fees are virtual (index-based) and tokens don't exist until borrowers repay
    if !protocol_fee_amount.is_zero() {
        let current = ACCRUED_PROTOCOL_FEES.may_load(storage)?.unwrap_or_default();
        let new = current.checked_add(protocol_fee_amount)?;
        ACCRUED_PROTOCOL_FEES.save(storage, &new)?;
    }

    if !curator_fee_amount.is_zero() {
        let current = ACCRUED_CURATOR_FEES.may_load(storage)?.unwrap_or_default();
        let new = current.checked_add(curator_fee_amount)?;
        ACCRUED_CURATOR_FEES.save(storage, &new)?;
    }

    Ok(())
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

/// Calculate current rates based on utilization and interest rate model.
/// This should be called after state updates to get accurate rates for events.
pub fn calculate_current_rates(
    storage: &dyn Storage,
) -> Result<(cosmwasm_std::Decimal, cosmwasm_std::Decimal), ContractError> {
    use cosmwasm_std::Decimal;

    let state = STATE.load(storage)?;
    let params = PARAMS.load(storage)?;

    let utilization = state.utilization();
    let borrow_rate = params
        .interest_rate_model
        .calculate_borrow_rate(utilization);

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

    Ok((borrow_rate, liquidity_rate))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{ACCRUED_CURATOR_FEES, ACCRUED_PROTOCOL_FEES, CONFIG, STATE};
    use cosmwasm_std::testing::mock_dependencies;
    use cosmwasm_std::Addr;
    use stone_types::{
        InterestRateModel, MarketConfig, MarketParams, MarketState, OracleConfig, OracleType,
    };

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
            salt: None,
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

        // Initialize accrued fees to zero
        ACCRUED_PROTOCOL_FEES
            .save(deps.as_mut().storage, &Uint128::zero())
            .unwrap();
        ACCRUED_CURATOR_FEES
            .save(deps.as_mut().storage, &Uint128::zero())
            .unwrap();
    }

    #[test]
    fn test_no_interest_when_no_time_elapsed() {
        let mut deps = mock_dependencies();
        setup_market(&mut deps);

        apply_accumulated_interest(deps.as_mut().storage, 1000).unwrap();

        let state = STATE.load(deps.as_ref().storage).unwrap();
        assert_eq!(state.borrow_index, Decimal::one());

        // No fees should be accrued
        let protocol_fees = ACCRUED_PROTOCOL_FEES
            .may_load(deps.as_ref().storage)
            .unwrap()
            .unwrap_or_default();
        let curator_fees = ACCRUED_CURATOR_FEES
            .may_load(deps.as_ref().storage)
            .unwrap()
            .unwrap_or_default();
        assert!(protocol_fees.is_zero());
        assert!(curator_fees.is_zero());
    }

    #[test]
    fn test_no_interest_when_no_debt() {
        let mut deps = mock_dependencies();
        setup_market(&mut deps);

        // Add some supply but no debt
        let mut state = STATE.load(deps.as_ref().storage).unwrap();
        state.total_supply_scaled = Uint128::new(10000);
        STATE.save(deps.as_mut().storage, &state).unwrap();

        apply_accumulated_interest(deps.as_mut().storage, 2000).unwrap();

        let state = STATE.load(deps.as_ref().storage).unwrap();
        assert_eq!(state.borrow_index, Decimal::one());
        assert_eq!(state.last_update, 2000);

        // No fees should be accrued without debt
        let protocol_fees = ACCRUED_PROTOCOL_FEES
            .may_load(deps.as_ref().storage)
            .unwrap()
            .unwrap_or_default();
        let curator_fees = ACCRUED_CURATOR_FEES
            .may_load(deps.as_ref().storage)
            .unwrap()
            .unwrap_or_default();
        assert!(protocol_fees.is_zero());
        assert!(curator_fees.is_zero());
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
        apply_accumulated_interest(deps.as_mut().storage, 1000 + SECONDS_PER_YEAR).unwrap();

        let state = STATE.load(deps.as_ref().storage).unwrap();

        // At 50% utilization (below 80% optimal), rate = 0 + 4% * (50/80) = 2.5%
        // After 1 year, borrow_index should be ~1.025
        assert!(state.borrow_index > Decimal::one());
        assert!(state.borrow_index < Decimal::from_ratio(103u128, 100u128));

        // Fees should be accrued (protocol: 10%, curator: 5%)
        let protocol_fees = ACCRUED_PROTOCOL_FEES
            .may_load(deps.as_ref().storage)
            .unwrap()
            .unwrap_or_default();
        let curator_fees = ACCRUED_CURATOR_FEES
            .may_load(deps.as_ref().storage)
            .unwrap()
            .unwrap_or_default();

        // Interest earned = 5000 * 0.025 = 125
        // Protocol fee = 125 * 0.10 = 12.5
        // Curator fee = 125 * 0.05 = 6.25
        assert!(!protocol_fees.is_zero());
        assert!(!curator_fees.is_zero());
    }

    #[test]
    fn test_fee_accrual_at_100_percent_utilization() {
        // This test verifies the fix for M-3: Market Freeze at 100% Utilization
        // Previously, at 100% utilization with zero available liquidity,
        // apply_accumulated_interest would try to send fees via BankMsg::Send
        // which would fail because the contract has no tokens (all supplied are borrowed).
        // Now fees are accrued to state and can be claimed when tokens are available.
        let mut deps = mock_dependencies();
        setup_market(&mut deps);

        // Set up 100% utilization: 10000 supply, 10000 debt
        let mut state = STATE.load(deps.as_ref().storage).unwrap();
        state.total_supply_scaled = Uint128::new(10000);
        state.total_debt_scaled = Uint128::new(10000);
        STATE.save(deps.as_mut().storage, &state).unwrap();

        // At 100% utilization, available_liquidity = 0
        let state = STATE.load(deps.as_ref().storage).unwrap();
        assert_eq!(state.available_liquidity(), Uint128::zero());

        // Advance one year - this should NOT fail even at 100% utilization
        apply_accumulated_interest(deps.as_mut().storage, 1000 + SECONDS_PER_YEAR).unwrap();

        // Verify interest was accrued
        let state = STATE.load(deps.as_ref().storage).unwrap();
        assert!(state.borrow_index > Decimal::one());

        // Verify fees were accrued to state, not sent
        let protocol_fees = ACCRUED_PROTOCOL_FEES
            .may_load(deps.as_ref().storage)
            .unwrap()
            .unwrap_or_default();
        let curator_fees = ACCRUED_CURATOR_FEES
            .may_load(deps.as_ref().storage)
            .unwrap()
            .unwrap_or_default();

        // Fees should be accrued (virtual, not sent)
        assert!(!protocol_fees.is_zero());
        assert!(!curator_fees.is_zero());
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
