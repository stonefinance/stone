# Isolated Markets - Technical Architecture Document

## Overview

This document provides detailed technical specifications for implementing the Isolated Markets contract. It includes pseudocode, state transitions, error handling, gas optimizations, and implementation guidelines.

**Project:** Isolated Markets Contract
**Based on:** [ISOLATED_MARKETS_SPEC.md](./ISOLATED_MARKETS_SPEC.md)
**Date:** 2026-01-15
**Status:** Implementation Ready

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Core Modules](#core-modules)
3. [State Management](#state-management)
4. [Entry Point Implementations](#entry-point-implementations)
5. [Interest Rate Module](#interest-rate-module)
6. [Health & Liquidation Module](#health--liquidation-module)
7. [Error Handling](#error-handling)
8. [Events](#events)
9. [Gas Optimization Strategies](#gas-optimization-strategies)
10. [Testing Strategy](#testing-strategy)
11. [Security Considerations](#security-considerations)

---

## Project Structure

```
isolated-markets/
├── Cargo.toml
├── schema/
│   └── ... (generated schemas)
├── src/
│   ├── contract.rs           # Entry points (instantiate, execute, query)
│   ├── state.rs              # Storage definitions
│   ├── error.rs              # Error types
│   ├── msg.rs                # Message types
│   ├── lib.rs                # Module exports
│   │
│   ├── market/
│   │   ├── mod.rs            # Market module exports
│   │   ├── create.rs         # Market creation logic
│   │   ├── update.rs         # Market parameter updates
│   │   └── validation.rs     # Market parameter validation
│   │
│   ├── operations/
│   │   ├── mod.rs            # Operations module exports
│   │   ├── supply.rs         # Supply/withdraw operations
│   │   ├── collateral.rs     # Collateral supply/withdraw
│   │   ├── borrow.rs         # Borrow operations
│   │   ├── repay.rs          # Repay operations
│   │   └── liquidate.rs      # Liquidation logic
│   │
│   ├── interest/
│   │   ├── mod.rs            # Interest module exports
│   │   ├── rates.rs          # Interest rate calculations
│   │   ├── accrual.rs        # Interest accrual logic
│   │   └── models.rs         # Interest rate models
│   │
│   ├── health/
│   │   ├── mod.rs            # Health module exports
│   │   ├── calculation.rs    # Health factor calculations
│   │   └── oracle.rs         # Oracle price queries
│   │
│   ├── helpers/
│   │   ├── mod.rs            # Helper exports
│   │   ├── math.rs           # Mathematical operations
│   │   ├── validation.rs     # Common validations
│   │   └── transfers.rs      # Token transfer helpers
│   │
│   └── query/
│       ├── mod.rs            # Query exports
│       ├── market.rs         # Market queries
│       └── position.rs       # User position queries
│
└── examples/
    └── schema.rs             # Schema generation
```

---

## Core Modules

### 1. Contract Entry Points (contract.rs)

```rust
use cosmwasm_std::{
    entry_point, Binary, Deps, DepsMut, Env, MessageInfo, Response, StdResult,
};
use crate::{error::ContractError, msg::{ExecuteMsg, InstantiateMsg, QueryMsg}};

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    // Validate and store config
    // Initialize owner
    // Return response
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::CreateMarket { .. } => execute_create_market(...),
        ExecuteMsg::UpdateMarketParams { .. } => execute_update_market_params(...),
        ExecuteMsg::Supply { .. } => execute_supply(...),
        ExecuteMsg::Withdraw { .. } => execute_withdraw(...),
        ExecuteMsg::SupplyCollateral { .. } => execute_supply_collateral(...),
        ExecuteMsg::WithdrawCollateral { .. } => execute_withdraw_collateral(...),
        ExecuteMsg::Borrow { .. } => execute_borrow(...),
        ExecuteMsg::Repay { .. } => execute_repay(...),
        ExecuteMsg::Liquidate { .. } => execute_liquidate(...),
        ExecuteMsg::UpdateOwner(update) => execute_update_owner(...),
        ExecuteMsg::UpdateConfig { .. } => execute_update_config(...),
    }
}

#[entry_point]
pub fn query(deps: Deps, env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Config {} => to_json_binary(&query_config(deps)?),
        QueryMsg::Market { market_id } => to_json_binary(&query_market(deps, env, market_id)?),
        QueryMsg::UserPosition { market_id, user } => {
            to_json_binary(&query_user_position(deps, env, market_id, user)?)
        }
        // ... other queries
    }
}
```

---

## State Management

### Storage Definitions (state.rs)

```rust
use cosmwasm_std::{Addr, Decimal, Uint128};
use cw_storage_plus::{Item, Map};
use mars_owner::Owner;

// Owner management
pub const OWNER: Owner = Owner::new("owner");

// Global configuration
pub const CONFIG: Item<Config> = Item::new("config");

#[cw_serde]
pub struct Config {
    pub protocol_fee_collector: Addr,
    pub market_creation_fee: Coin,
}

// Market state
pub const MARKETS: Map<&str, Market> = Map::new("markets");
pub const MARKET_PARAMS: Map<&str, MarketParams> = Map::new("market_params");

#[cw_serde]
pub struct Market {
    pub market_id: String,
    pub collateral_denom: String,
    pub debt_denom: String,
    pub curator: Addr,

    // Interest indices
    pub borrow_index: Decimal,        // Starts at 1.0
    pub liquidity_index: Decimal,     // Starts at 1.0

    // Current rates (APR)
    pub borrow_rate: Decimal,
    pub liquidity_rate: Decimal,

    // Totals
    pub total_supply_scaled: Uint128,
    pub total_debt_scaled: Uint128,
    pub total_collateral: Uint128,

    // Tracking
    pub last_update: u64,  // timestamp in seconds
    pub created_at: u64,
}

#[cw_serde]
pub struct MarketParams {
    pub collateral_denom: String,
    pub debt_denom: String,
    pub curator: Addr,
    pub oracle: Addr,

    // Risk parameters
    pub loan_to_value: Decimal,
    pub liquidation_threshold: Decimal,
    pub liquidation_bonus: Decimal,
    pub liquidation_protocol_fee: Decimal,
    pub close_factor: Decimal,

    // Interest
    pub interest_rate_model: InterestRateModel,

    // Fees
    pub protocol_fee: Decimal,
    pub curator_fee: Decimal,

    // Caps
    pub supply_cap: Option<Uint128>,
    pub borrow_cap: Option<Uint128>,

    // Mutability
    pub is_mutable: bool,
    pub ltv_last_update: u64,

    // Status
    pub enabled: bool,
}

// User positions
pub const SUPPLIES: Map<(&str, &Addr), Uint128> = Map::new("supplies");
pub const COLLATERAL: Map<(&str, &Addr), Uint128> = Map::new("collateral");
pub const DEBTS: Map<(&str, &Addr), Uint128> = Map::new("debts");

// Interest rate models
#[cw_serde]
pub enum InterestRateModel {
    Linear {
        optimal_utilization: Decimal,
        base_rate: Decimal,
        slope_1: Decimal,
        slope_2: Decimal,
    },
    // Future: Exponential, Dynamic, etc.
}
```

### State Transition Diagrams

#### Market Lifecycle

```
[Not Exist]
    |
    | CreateMarket (pay fee, validate params)
    v
[Active: enabled=true]
    |
    | Users: Supply, SupplyCollateral, Borrow, Repay, Withdraw
    | Interest accrues continuously
    | Liquidations can occur
    |
    | UpdateMarketParams (curator only)
    v
[Active: enabled=true or false]
    |
    | If enabled=false: No new borrows/supplies, only repay/withdraw
    |
    | (No deletion - markets are permanent)
```

#### User Position Lifecycle

```
[No Position]
    |
    | Supply or SupplyCollateral
    v
[Has Position]
    |
    +---> [Lender Only] (has supply, no debt, no collateral)
    |        |
    |        | Withdraw all
    |        v
    |     [No Position]
    |
    +---> [Borrower] (has collateral, has debt)
    |        |
    |        | If health_factor < 1.0
    |        v
    |     [Liquidatable]
    |        |
    |        | Liquidate
    |        v
    |     [Borrower or No Position]
    |
    +---> [Lender + Borrower] (has supply, has collateral, has debt)
           |
           | Withdraw all, repay all
           v
        [No Position]
```

---

## Entry Point Implementations

### 1. Instantiate

```rust
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    // Validate addresses
    let protocol_fee_collector = deps.api.addr_validate(&msg.protocol_fee_collector)?;

    // Validate market creation fee
    if msg.market_creation_fee.amount.is_zero() {
        // Zero is allowed (free creation)
    }

    // Store config
    let config = Config {
        protocol_fee_collector,
        market_creation_fee: msg.market_creation_fee,
    };
    CONFIG.save(deps.storage, &config)?;

    // Initialize owner
    let owner = deps.api.addr_validate(&msg.owner)?;
    OWNER.initialize(deps.storage, deps.api, owner)?;

    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("owner", msg.owner)
        .add_attribute("protocol_fee_collector", config.protocol_fee_collector))
}
```

### 2. Create Market

**File:** `src/market/create.rs`

```rust
use sha2::{Sha256, Digest};

pub fn execute_create_market(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    collateral_denom: String,
    debt_denom: String,
    oracle: String,
    params: CreateMarketParams,
    salt: Option<u64>,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;

    // Step 1: Validate payment of market creation fee
    validate_market_creation_fee(&info.funds, &config.market_creation_fee)?;

    // Step 2: Validate addresses
    let curator = info.sender.clone();
    let oracle_addr = deps.api.addr_validate(&oracle)?;

    // Step 3: Validate market parameters
    validate_market_params(
        &collateral_denom,
        &debt_denom,
        &params,
    )?;

    // Step 4: Test oracle (must return prices for both assets)
    let collateral_price = query_oracle_price(deps.as_ref(), &oracle_addr, &collateral_denom)?;
    let debt_price = query_oracle_price(deps.as_ref(), &oracle_addr, &debt_denom)?;

    if collateral_price.is_zero() || debt_price.is_zero() {
        return Err(ContractError::InvalidOraclePrice {});
    }

    // Step 5: Generate market ID
    let market_id = generate_market_id(
        &collateral_denom,
        &debt_denom,
        &curator,
        salt.unwrap_or(0),
    );

    // Step 6: Check for collision (should be impossible)
    if MARKETS.may_load(deps.storage, &market_id)?.is_some() {
        return Err(ContractError::MarketAlreadyExists { market_id });
    }

    // Step 7: Create market state
    let market = Market {
        market_id: market_id.clone(),
        collateral_denom: collateral_denom.clone(),
        debt_denom: debt_denom.clone(),
        curator: curator.clone(),
        borrow_index: Decimal::one(),
        liquidity_index: Decimal::one(),
        borrow_rate: Decimal::zero(),
        liquidity_rate: Decimal::zero(),
        total_supply_scaled: Uint128::zero(),
        total_debt_scaled: Uint128::zero(),
        total_collateral: Uint128::zero(),
        last_update: env.block.time.seconds(),
        created_at: env.block.time.seconds(),
    };

    // Step 8: Create market params
    let market_params = MarketParams {
        collateral_denom: collateral_denom.clone(),
        debt_denom: debt_denom.clone(),
        curator: curator.clone(),
        oracle: oracle_addr,
        loan_to_value: params.loan_to_value,
        liquidation_threshold: params.liquidation_threshold,
        liquidation_bonus: params.liquidation_bonus,
        liquidation_protocol_fee: params.liquidation_protocol_fee,
        close_factor: params.close_factor,
        interest_rate_model: params.interest_rate_model,
        protocol_fee: params.protocol_fee,
        curator_fee: params.curator_fee,
        supply_cap: params.supply_cap,
        borrow_cap: params.borrow_cap,
        is_mutable: params.is_mutable,
        ltv_last_update: env.block.time.seconds(),
        enabled: true,
    };

    // Step 9: Save to storage
    MARKETS.save(deps.storage, &market_id, &market)?;
    MARKET_PARAMS.save(deps.storage, &market_id, &market_params)?;

    // Step 10: Transfer creation fee to protocol
    let mut response = Response::new()
        .add_attribute("action", "create_market")
        .add_attribute("market_id", &market_id)
        .add_attribute("curator", curator)
        .add_attribute("collateral_denom", collateral_denom)
        .add_attribute("debt_denom", debt_denom);

    if !config.market_creation_fee.amount.is_zero() {
        response = response.add_message(BankMsg::Send {
            to_address: config.protocol_fee_collector.to_string(),
            amount: vec![config.market_creation_fee],
        });
    }

    Ok(response)
}

// Helper: Generate deterministic market ID
fn generate_market_id(
    collateral_denom: &str,
    debt_denom: &str,
    curator: &Addr,
    salt: u64,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(collateral_denom.as_bytes());
    hasher.update(debt_denom.as_bytes());
    hasher.update(curator.as_bytes());
    hasher.update(salt.to_le_bytes());

    let result = hasher.finalize();
    hex::encode(result)
}
```

**Validation Logic (market/validation.rs):**

```rust
pub fn validate_market_params(
    collateral_denom: &str,
    debt_denom: &str,
    params: &CreateMarketParams,
) -> Result<(), ContractError> {
    // Denoms must be different
    if collateral_denom == debt_denom {
        return Err(ContractError::SameCollateralAndDebt {});
    }

    // LTV must be less than liquidation threshold
    if params.loan_to_value >= params.liquidation_threshold {
        return Err(ContractError::InvalidLTV {
            ltv: params.loan_to_value,
            threshold: params.liquidation_threshold,
        });
    }

    // Liquidation threshold must be less than 1.0
    if params.liquidation_threshold >= Decimal::one() {
        return Err(ContractError::LiquidationThresholdTooHigh {});
    }

    // LTV bounds
    if params.loan_to_value < Decimal::percent(1) || params.loan_to_value > Decimal::percent(95) {
        return Err(ContractError::LTVOutOfBounds {});
    }

    // Liquidation bonus bounds (3-15%)
    if params.liquidation_bonus < Decimal::percent(3)
        || params.liquidation_bonus > Decimal::percent(15) {
        return Err(ContractError::LiquidationBonusOutOfBounds {});
    }

    // Liquidation protocol fee bounds (1-5%)
    if params.liquidation_protocol_fee < Decimal::percent(1)
        || params.liquidation_protocol_fee > Decimal::percent(5) {
        return Err(ContractError::LiquidationProtocolFeeOutOfBounds {});
    }

    // Close factor bounds (0-100%)
    if params.close_factor > Decimal::one() {
        return Err(ContractError::CloseFactorOutOfBounds {});
    }

    // Fee validation
    if params.protocol_fee + params.curator_fee >= Decimal::one() {
        return Err(ContractError::FeesTooHigh {});
    }

    // Curator fee max 25%
    if params.curator_fee > Decimal::percent(25) {
        return Err(ContractError::CuratorFeeTooHigh {});
    }

    // Validate interest rate model
    validate_interest_rate_model(&params.interest_rate_model)?;

    Ok(())
}

pub fn validate_interest_rate_model(model: &InterestRateModel) -> Result<(), ContractError> {
    match model {
        InterestRateModel::Linear {
            optimal_utilization,
            base_rate,
            slope_1,
            slope_2,
        } => {
            // Optimal utilization between 0 and 1
            if *optimal_utilization > Decimal::one() || optimal_utilization.is_zero() {
                return Err(ContractError::InvalidInterestRateModel {
                    reason: "optimal_utilization must be between 0 and 1".to_string(),
                });
            }

            // Rates must be non-negative
            if base_rate.is_negative() || slope_1.is_negative() || slope_2.is_negative() {
                return Err(ContractError::InvalidInterestRateModel {
                    reason: "rates cannot be negative".to_string(),
                });
            }

            // Max borrow rate check (e.g., 500% APR)
            let max_rate = *base_rate + *slope_1 + *slope_2;
            if max_rate > Decimal::percent(500) {
                return Err(ContractError::InvalidInterestRateModel {
                    reason: "maximum borrow rate exceeds 500%".to_string(),
                });
            }

            Ok(())
        }
    }
}

pub fn validate_market_creation_fee(
    funds: &[Coin],
    required_fee: &Coin,
) -> Result<(), ContractError> {
    if required_fee.amount.is_zero() {
        // No fee required
        return Ok(());
    }

    // Find matching coin
    let sent = funds.iter()
        .find(|c| c.denom == required_fee.denom)
        .map(|c| c.amount)
        .unwrap_or_else(Uint128::zero);

    if sent < required_fee.amount {
        return Err(ContractError::InsufficientCreationFee {
            required: required_fee.clone(),
            sent: Coin {
                denom: required_fee.denom.clone(),
                amount: sent,
            },
        });
    }

    Ok(())
}
```

### 3. Supply (Lend)

**File:** `src/operations/supply.rs`

```rust
pub fn execute_supply(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    market_id: String,
    recipient: Option<String>,
) -> Result<Response, ContractError> {
    // Step 1: Load market and params
    let mut market = MARKETS.load(deps.storage, &market_id)?;
    let params = MARKET_PARAMS.load(deps.storage, &market_id)?;

    // Step 2: Check market is enabled
    if !params.enabled {
        return Err(ContractError::MarketDisabled { market_id });
    }

    // Step 3: Apply accumulated interests
    apply_accumulated_interests(deps.storage, &mut market, &params, env.block.time.seconds())?;

    // Step 4: Get supplied amount (must be debt_denom)
    let supplied = cw_utils::must_pay(&info, &market.debt_denom)?;

    // Step 5: Check supply cap
    if let Some(cap) = params.supply_cap {
        let total_supply_underlying = market.total_supply_scaled
            .checked_mul_floor(market.liquidity_index)?;
        let new_total = total_supply_underlying.checked_add(supplied)?;

        if new_total > cap {
            return Err(ContractError::SupplyCapExceeded {
                cap,
                new_total,
            });
        }
    }

    // Step 6: Calculate scaled amount
    let scaled_amount = if market.liquidity_index.is_zero() {
        supplied  // Should never happen (index starts at 1.0)
    } else {
        Decimal::from_ratio(supplied, 1u128)
            .checked_div(market.liquidity_index)?
            .to_uint_floor()
    };

    // Step 7: Determine recipient
    let recipient_addr = if let Some(recipient) = recipient {
        deps.api.addr_validate(&recipient)?
    } else {
        info.sender.clone()
    };

    // Step 8: Update user position
    let current_supply = SUPPLIES
        .may_load(deps.storage, (&market_id, &recipient_addr))?
        .unwrap_or_else(Uint128::zero);

    let new_supply = current_supply.checked_add(scaled_amount)?;
    SUPPLIES.save(deps.storage, (&market_id, &recipient_addr), &new_supply)?;

    // Step 9: Update market totals
    market.total_supply_scaled = market.total_supply_scaled.checked_add(scaled_amount)?;

    // Step 10: Update interest rates based on new utilization
    update_interest_rates(&mut market, &params)?;

    // Step 11: Save market
    MARKETS.save(deps.storage, &market_id, &market)?;

    Ok(Response::new()
        .add_attribute("action", "supply")
        .add_attribute("market_id", market_id)
        .add_attribute("user", recipient_addr)
        .add_attribute("amount", supplied)
        .add_attribute("scaled_amount", scaled_amount))
}
```

### 4. Borrow

**File:** `src/operations/borrow.rs`

```rust
pub fn execute_borrow(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    market_id: String,
    amount: Uint128,
    recipient: Option<String>,
) -> Result<Response, ContractError> {
    // Step 1: Load market and params
    let mut market = MARKETS.load(deps.storage, &market_id)?;
    let params = MARKET_PARAMS.load(deps.storage, &market_id)?;

    // Step 2: Check market is enabled
    if !params.enabled {
        return Err(ContractError::MarketDisabled { market_id });
    }

    // Step 3: Apply accumulated interests
    apply_accumulated_interests(deps.storage, &mut market, &params, env.block.time.seconds())?;

    // Step 4: Check borrow cap
    if let Some(cap) = params.borrow_cap {
        let total_debt_underlying = market.total_debt_scaled
            .checked_mul_floor(market.borrow_index)?;
        let new_total = total_debt_underlying.checked_add(amount)?;

        if new_total > cap {
            return Err(ContractError::BorrowCapExceeded {
                cap,
                new_total,
            });
        }
    }

    // Step 5: Check available liquidity
    let total_supply = market.total_supply_scaled.checked_mul_floor(market.liquidity_index)?;
    let total_debt = market.total_debt_scaled.checked_mul_floor(market.borrow_index)?;
    let available = total_supply.checked_sub(total_debt)?;

    if amount > available {
        return Err(ContractError::InsufficientLiquidity {
            available,
            requested: amount,
        });
    }

    // Step 6: Calculate scaled debt amount
    let scaled_debt = Decimal::from_ratio(amount, 1u128)
        .checked_div(market.borrow_index)?
        .to_uint_floor();

    // Step 7: Update user debt
    let current_debt = DEBTS
        .may_load(deps.storage, (&market_id, &info.sender))?
        .unwrap_or_else(Uint128::zero);

    let new_debt = current_debt.checked_add(scaled_debt)?;
    DEBTS.save(deps.storage, (&market_id, &info.sender), &new_debt)?;

    // Step 8: Update market totals
    market.total_debt_scaled = market.total_debt_scaled.checked_add(scaled_debt)?;

    // Step 9: Check health factor (CRITICAL)
    check_health_factor(
        deps.as_ref(),
        &market_id,
        &info.sender,
        &market,
        &params,
    )?;

    // Step 10: Update interest rates
    update_interest_rates(&mut market, &params)?;

    // Step 11: Save market
    MARKETS.save(deps.storage, &market_id, &market)?;

    // Step 12: Transfer tokens to recipient
    let recipient_addr = if let Some(recipient) = recipient {
        deps.api.addr_validate(&recipient)?
    } else {
        info.sender.clone()
    };

    let transfer_msg = BankMsg::Send {
        to_address: recipient_addr.to_string(),
        amount: vec![Coin {
            denom: market.debt_denom.clone(),
            amount,
        }],
    };

    Ok(Response::new()
        .add_message(transfer_msg)
        .add_attribute("action", "borrow")
        .add_attribute("market_id", market_id)
        .add_attribute("user", info.sender)
        .add_attribute("amount", amount)
        .add_attribute("scaled_debt", scaled_debt))
}
```

### 5. Liquidate

**File:** `src/operations/liquidate.rs`

```rust
pub fn execute_liquidate(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    market_id: String,
    borrower: String,
    max_debt_to_repay: Option<Uint128>,
) -> Result<Response, ContractError> {
    let borrower_addr = deps.api.addr_validate(&borrower)?;

    // Step 1: Load market and params
    let mut market = MARKETS.load(deps.storage, &market_id)?;
    let params = MARKET_PARAMS.load(deps.storage, &market_id)?;
    let config = CONFIG.load(deps.storage)?;

    // Step 2: Apply accumulated interests
    apply_accumulated_interests(deps.storage, &mut market, &params, env.block.time.seconds())?;

    // Step 3: Load borrower positions
    let debt_scaled = DEBTS
        .may_load(deps.storage, (&market_id, &borrower_addr))?
        .ok_or(ContractError::NoDebtToLiquidate {})?;

    let collateral = COLLATERAL
        .may_load(deps.storage, (&market_id, &borrower_addr))?
        .ok_or(ContractError::NoCollateralToSeize {})?;

    // Step 4: Calculate underlying amounts
    let debt_amount = debt_scaled.checked_mul_floor(market.borrow_index)?;

    // Step 5: Get prices from oracle
    let collateral_price = query_oracle_price(deps.as_ref(), &params.oracle, &market.collateral_denom)?;
    let debt_price = query_oracle_price(deps.as_ref(), &params.oracle, &market.debt_denom)?;

    // Step 6: Calculate health factor
    let health_factor = calculate_health_factor(
        collateral,
        collateral_price,
        debt_amount,
        debt_price,
        params.liquidation_threshold,
    )?;

    // Step 7: Check if liquidatable
    if health_factor >= Decimal::one() {
        return Err(ContractError::PositionHealthy {
            health_factor,
        });
    }

    // Step 8: Calculate liquidation amounts
    let max_liquidatable_debt = debt_amount.checked_mul_floor(params.close_factor)?;
    let debt_to_repay = if let Some(max) = max_debt_to_repay {
        max.min(max_liquidatable_debt)
    } else {
        max_liquidatable_debt
    };

    // Step 9: Calculate collateral to seize
    // collateral_value = debt_to_repay * debt_price / collateral_price
    let debt_value = Decimal::from_ratio(debt_to_repay, 1u128)
        .checked_mul(debt_price)?;

    let base_collateral_value = debt_value.checked_div(collateral_price)?;
    let base_collateral = base_collateral_value.to_uint_floor();

    // Add liquidation bonus
    let liquidator_bonus = base_collateral.checked_mul_floor(params.liquidation_bonus)?;
    let protocol_fee = base_collateral.checked_mul_floor(params.liquidation_protocol_fee)?;

    let total_collateral_seized = base_collateral
        .checked_add(liquidator_bonus)?
        .checked_add(protocol_fee)?;

    // Ensure we don't seize more than available
    if total_collateral_seized > collateral {
        return Err(ContractError::InsufficientCollateral {
            available: collateral,
            needed: total_collateral_seized,
        });
    }

    // Step 10: Validate liquidator sent correct amount
    let paid = cw_utils::must_pay(&info, &market.debt_denom)?;
    if paid < debt_to_repay {
        return Err(ContractError::InsufficientRepayment {
            required: debt_to_repay,
            sent: paid,
        });
    }

    // Step 11: Update borrower debt
    let scaled_debt_decrease = Decimal::from_ratio(debt_to_repay, 1u128)
        .checked_div(market.borrow_index)?
        .to_uint_floor();

    let new_debt_scaled = debt_scaled.checked_sub(scaled_debt_decrease)?;

    if new_debt_scaled.is_zero() {
        DEBTS.remove(deps.storage, (&market_id, &borrower_addr));
    } else {
        DEBTS.save(deps.storage, (&market_id, &borrower_addr), &new_debt_scaled)?;
    }

    // Step 12: Update borrower collateral
    let new_collateral = collateral.checked_sub(total_collateral_seized)?;

    if new_collateral.is_zero() {
        COLLATERAL.remove(deps.storage, (&market_id, &borrower_addr));
    } else {
        COLLATERAL.save(deps.storage, (&market_id, &borrower_addr), &new_collateral)?;
    }

    // Step 13: Update market totals
    market.total_debt_scaled = market.total_debt_scaled.checked_sub(scaled_debt_decrease)?;
    market.total_collateral = market.total_collateral.checked_sub(total_collateral_seized)?;

    // Step 14: Update interest rates
    update_interest_rates(&mut market, &params)?;

    // Step 15: Save market
    MARKETS.save(deps.storage, &market_id, &market)?;

    // Step 16: Transfer collateral to liquidator and protocol
    let liquidator_collateral = base_collateral.checked_add(liquidator_bonus)?;

    let mut messages = vec![];

    // To liquidator
    messages.push(CosmosMsg::Bank(BankMsg::Send {
        to_address: info.sender.to_string(),
        amount: vec![Coin {
            denom: market.collateral_denom.clone(),
            amount: liquidator_collateral,
        }],
    }));

    // To protocol
    if !protocol_fee.is_zero() {
        messages.push(CosmosMsg::Bank(BankMsg::Send {
            to_address: config.protocol_fee_collector.to_string(),
            amount: vec![Coin {
                denom: market.collateral_denom.clone(),
                amount: protocol_fee,
            }],
        }));
    }

    // Refund excess payment
    if paid > debt_to_repay {
        let refund = paid.checked_sub(debt_to_repay)?;
        messages.push(CosmosMsg::Bank(BankMsg::Send {
            to_address: info.sender.to_string(),
            amount: vec![Coin {
                denom: market.debt_denom.clone(),
                amount: refund,
            }],
        }));
    }

    Ok(Response::new()
        .add_messages(messages)
        .add_attribute("action", "liquidate")
        .add_attribute("market_id", market_id)
        .add_attribute("borrower", borrower)
        .add_attribute("liquidator", info.sender)
        .add_attribute("debt_repaid", debt_to_repay)
        .add_attribute("collateral_seized", total_collateral_seized)
        .add_attribute("liquidator_bonus", liquidator_bonus)
        .add_attribute("protocol_fee", protocol_fee))
}
```

---

## Interest Rate Module

**File:** `src/interest/accrual.rs`

```rust
use cosmwasm_std::{Decimal, Storage, Uint128};
use crate::state::{Market, MarketParams, CONFIG};
use crate::helpers::math::SECONDS_PER_YEAR;

pub fn apply_accumulated_interests(
    storage: &mut dyn Storage,
    market: &mut Market,
    params: &MarketParams,
    current_time: u64,
) -> Result<(), ContractError> {
    let time_elapsed = current_time - market.last_update;

    // No time passed, no interest to accrue
    if time_elapsed == 0 {
        return Ok(());
    }

    // Convert to Decimal for calculations
    let time_elapsed_decimal = Decimal::from_ratio(time_elapsed, 1u128);
    let seconds_per_year = Decimal::from_ratio(SECONDS_PER_YEAR, 1u128);

    // Calculate utilization
    let total_supply = market.total_supply_scaled
        .checked_mul_floor(market.liquidity_index)?;
    let total_debt = market.total_debt_scaled
        .checked_mul_floor(market.borrow_index)?;

    let utilization = if !total_supply.is_zero() {
        Decimal::from_ratio(total_debt, total_supply)
    } else {
        Decimal::zero()
    };

    // Get borrow rate from interest rate model
    let borrow_rate = calculate_borrow_rate(&params.interest_rate_model, utilization)?;

    // Update borrow index: new = old * (1 + rate * time / seconds_per_year)
    let borrow_rate_per_second = borrow_rate.checked_div(seconds_per_year)?;
    let borrow_multiplier = Decimal::one()
        .checked_add(borrow_rate_per_second.checked_mul(time_elapsed_decimal)?)?;

    let new_borrow_index = market.borrow_index.checked_mul(borrow_multiplier)?;
    let borrow_index_delta = new_borrow_index.checked_sub(market.borrow_index)?;

    // Calculate total interest earned (in underlying debt tokens)
    let interest_earned = market.total_debt_scaled.checked_mul_floor(borrow_index_delta)?;

    // Distribute fees
    let protocol_fee_amount = interest_earned.checked_mul_floor(params.protocol_fee)?;
    let curator_fee_amount = interest_earned.checked_mul_floor(params.curator_fee)?;
    let supplier_interest = interest_earned
        .checked_sub(protocol_fee_amount)?
        .checked_sub(curator_fee_amount)?;

    // Update liquidity index
    if !market.total_supply_scaled.is_zero() {
        let current_total_supply_value = market.total_supply_scaled
            .checked_mul_floor(market.liquidity_index)?;

        let liquidity_index_increase = if !current_total_supply_value.is_zero() {
            Decimal::from_ratio(supplier_interest, current_total_supply_value)
        } else {
            Decimal::zero()
        };

        market.liquidity_index = market.liquidity_index
            .checked_add(liquidity_index_increase)?;
    }

    // Update borrow index
    market.borrow_index = new_borrow_index;

    // Transfer fees (add to protocol/curator supply positions as scaled amounts)
    if !protocol_fee_amount.is_zero() {
        let config = CONFIG.load(storage)?;
        transfer_fee_to_collector(
            storage,
            &market.market_id,
            &config.protocol_fee_collector,
            protocol_fee_amount,
            market.liquidity_index,
        )?;
    }

    if !curator_fee_amount.is_zero() {
        transfer_fee_to_collector(
            storage,
            &market.market_id,
            &params.curator,
            curator_fee_amount,
            market.liquidity_index,
        )?;
    }

    // Calculate liquidity rate for display
    let liquidity_rate = if !utilization.is_zero() {
        let protocol_and_curator_fee = params.protocol_fee.checked_add(params.curator_fee)?;
        let supplier_share = Decimal::one().checked_sub(protocol_and_curator_fee)?;

        borrow_rate
            .checked_mul(utilization)?
            .checked_mul(supplier_share)?
    } else {
        Decimal::zero()
    };

    // Update market state
    market.borrow_rate = borrow_rate;
    market.liquidity_rate = liquidity_rate;
    market.last_update = current_time;

    Ok(())
}

fn transfer_fee_to_collector(
    storage: &mut dyn Storage,
    market_id: &str,
    collector: &Addr,
    fee_amount: Uint128,
    liquidity_index: Decimal,
) -> Result<(), ContractError> {
    // Convert fee to scaled supply
    let scaled_fee = Decimal::from_ratio(fee_amount, 1u128)
        .checked_div(liquidity_index)?
        .to_uint_floor();

    // Add to collector's supply position
    let current_supply = SUPPLIES
        .may_load(storage, (market_id, collector))?
        .unwrap_or_else(Uint128::zero);

    let new_supply = current_supply.checked_add(scaled_fee)?;
    SUPPLIES.save(storage, (market_id, collector), &new_supply)?;

    Ok(())
}
```

**File:** `src/interest/rates.rs`

```rust
pub fn calculate_borrow_rate(
    model: &InterestRateModel,
    utilization: Decimal,
) -> Result<Decimal, ContractError> {
    match model {
        InterestRateModel::Linear {
            optimal_utilization,
            base_rate,
            slope_1,
            slope_2,
        } => {
            if utilization <= *optimal_utilization {
                // Below optimal: base + (utilization / optimal) * slope1
                let rate = *base_rate + utilization
                    .checked_mul(*slope_1)?
                    .checked_div(*optimal_utilization)?;
                Ok(rate)
            } else {
                // Above optimal: base + slope1 + ((utilization - optimal) / (1 - optimal)) * slope2
                let excess_utilization = utilization.checked_sub(*optimal_utilization)?;
                let excess_utilization_ratio = excess_utilization
                    .checked_div(Decimal::one().checked_sub(*optimal_utilization)?)?;

                let rate = *base_rate
                    + *slope_1
                    + excess_utilization_ratio.checked_mul(*slope_2)?;

                Ok(rate)
            }
        }
    }
}

pub fn update_interest_rates(
    market: &mut Market,
    params: &MarketParams,
) -> Result<(), ContractError> {
    // Calculate current utilization
    let total_supply = market.total_supply_scaled
        .checked_mul_floor(market.liquidity_index)?;
    let total_debt = market.total_debt_scaled
        .checked_mul_floor(market.borrow_index)?;

    let utilization = if !total_supply.is_zero() {
        Decimal::from_ratio(total_debt, total_supply)
    } else {
        Decimal::zero()
    };

    // Calculate new borrow rate
    let borrow_rate = calculate_borrow_rate(&params.interest_rate_model, utilization)?;

    // Calculate liquidity rate
    let protocol_and_curator_fee = params.protocol_fee.checked_add(params.curator_fee)?;
    let supplier_share = Decimal::one().checked_sub(protocol_and_curator_fee)?;

    let liquidity_rate = if !utilization.is_zero() {
        borrow_rate
            .checked_mul(utilization)?
            .checked_mul(supplier_share)?
    } else {
        Decimal::zero()
    };

    market.borrow_rate = borrow_rate;
    market.liquidity_rate = liquidity_rate;

    Ok(())
}
```

---

## Health & Liquidation Module

**File:** `src/health/calculation.rs`

```rust
pub fn calculate_health_factor(
    collateral_amount: Uint128,
    collateral_price: Decimal,
    debt_amount: Uint128,
    debt_price: Decimal,
    liquidation_threshold: Decimal,
) -> Result<Decimal, ContractError> {
    // If no debt, health is infinite (represented as very high number)
    if debt_amount.is_zero() {
        return Ok(Decimal::from_ratio(u128::MAX, 1u128));
    }

    // Calculate collateral value in USD
    let collateral_value = Decimal::from_ratio(collateral_amount, 1u128)
        .checked_mul(collateral_price)?;

    // Calculate adjusted collateral (collateral * liquidation_threshold)
    let adjusted_collateral_value = collateral_value
        .checked_mul(liquidation_threshold)?;

    // Calculate debt value in USD
    let debt_value = Decimal::from_ratio(debt_amount, 1u128)
        .checked_mul(debt_price)?;

    // Health factor = adjusted_collateral / debt
    let health_factor = adjusted_collateral_value.checked_div(debt_value)?;

    Ok(health_factor)
}

pub fn check_health_factor(
    deps: Deps,
    market_id: &str,
    user: &Addr,
    market: &Market,
    params: &MarketParams,
) -> Result<(), ContractError> {
    // Load user positions
    let collateral = COLLATERAL
        .may_load(deps.storage, (market_id, user))?
        .unwrap_or_else(Uint128::zero);

    let debt_scaled = DEBTS
        .may_load(deps.storage, (market_id, user))?
        .unwrap_or_else(Uint128::zero);

    // If no debt, always healthy
    if debt_scaled.is_zero() {
        return Ok(());
    }

    // Calculate underlying debt
    let debt_amount = debt_scaled.checked_mul_floor(market.borrow_index)?;

    // Get prices
    let collateral_price = query_oracle_price(deps, &params.oracle, &market.collateral_denom)?;
    let debt_price = query_oracle_price(deps, &params.oracle, &market.debt_denom)?;

    // Calculate health factor using LTV (for borrow), not liquidation threshold
    let health_factor = calculate_health_factor(
        collateral,
        collateral_price,
        debt_amount,
        debt_price,
        params.loan_to_value,  // Use LTV for borrow checks
    )?;

    // Must be >= 1.0 to borrow
    if health_factor < Decimal::one() {
        return Err(ContractError::InsufficientCollateral {
            health_factor,
        });
    }

    Ok(())
}
```

**File:** `src/health/oracle.rs`

```rust
use cosmwasm_std::{Deps, Addr, Decimal, QuerierWrapper};

#[cw_serde]
pub enum OracleQueryMsg {
    Price { denom: String },
}

#[cw_serde]
pub struct PriceResponse {
    pub price: Decimal,
}

pub fn query_oracle_price(
    deps: Deps,
    oracle: &Addr,
    denom: &str,
) -> Result<Decimal, ContractError> {
    let query_msg = OracleQueryMsg::Price {
        denom: denom.to_string(),
    };

    let response: PriceResponse = deps.querier.query_wasm_smart(
        oracle.to_string(),
        &query_msg,
    )?;

    if response.price.is_zero() {
        return Err(ContractError::InvalidOraclePrice {
            denom: denom.to_string(),
        });
    }

    Ok(response.price)
}
```

---

## Error Handling

**File:** `src/error.rs`

```rust
use cosmwasm_std::{StdError, Uint128, Decimal, Coin};
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("Unauthorized")]
    Unauthorized {},

    #[error("Market already exists: {market_id}")]
    MarketAlreadyExists { market_id: String },

    #[error("Market not found: {market_id}")]
    MarketNotFound { market_id: String },

    #[error("Market is disabled: {market_id}")]
    MarketDisabled { market_id: String },

    #[error("Collateral and debt denoms must be different")]
    SameCollateralAndDebt {},

    #[error("LTV ({ltv}) must be less than liquidation threshold ({threshold})")]
    InvalidLTV {
        ltv: Decimal,
        threshold: Decimal,
    },

    #[error("LTV must be between 1% and 95%")]
    LTVOutOfBounds {},

    #[error("Liquidation threshold must be less than 100%")]
    LiquidationThresholdTooHigh {},

    #[error("Liquidation bonus must be between 3% and 15%")]
    LiquidationBonusOutOfBounds {},

    #[error("Liquidation protocol fee must be between 1% and 5%")]
    LiquidationProtocolFeeOutOfBounds {},

    #[error("Close factor must be between 0% and 100%")]
    CloseFactorOutOfBounds {},

    #[error("Protocol fee + curator fee must be less than 100%")]
    FeesTooHigh {},

    #[error("Curator fee cannot exceed 25%")]
    CuratorFeeTooHigh {},

    #[error("Invalid interest rate model: {reason}")]
    InvalidInterestRateModel { reason: String },

    #[error("Insufficient creation fee. Required: {required:?}, sent: {sent:?}")]
    InsufficientCreationFee { required: Coin, sent: Coin },

    #[error("Invalid oracle price for {denom}")]
    InvalidOraclePrice { denom: String },

    #[error("Supply cap exceeded. Cap: {cap}, new total: {new_total}")]
    SupplyCapExceeded { cap: Uint128, new_total: Uint128 },

    #[error("Borrow cap exceeded. Cap: {cap}, new total: {new_total}")]
    BorrowCapExceeded { cap: Uint128, new_total: Uint128 },

    #[error("Insufficient liquidity. Available: {available}, requested: {requested}")]
    InsufficientLiquidity {
        available: Uint128,
        requested: Uint128,
    },

    #[error("Insufficient collateral. Health factor: {health_factor}")]
    InsufficientCollateral { health_factor: Decimal },

    #[error("Position is healthy. Health factor: {health_factor}")]
    PositionHealthy { health_factor: Decimal },

    #[error("No debt to liquidate")]
    NoDebtToLiquidate {},

    #[error("No collateral to seize")]
    NoCollateralToSeize {},

    #[error("Insufficient collateral to seize. Available: {available}, needed: {needed}")]
    InsufficientCollateralToSeize {
        available: Uint128,
        needed: Uint128,
    },

    #[error("Insufficient repayment. Required: {required}, sent: {sent}")]
    InsufficientRepayment { required: Uint128, sent: Uint128 },

    #[error("Market is not mutable")]
    MarketNotMutable {},

    #[error("LTV cooldown not passed. Last update: {last_update}, cooldown: {cooldown} seconds")]
    LTVCooldownNotPassed { last_update: u64, cooldown: u64 },

    #[error("LTV change exceeds maximum. Max change: {max_change}, requested: {requested}")]
    LTVChangeExceedsMax {
        max_change: Decimal,
        requested: Decimal,
    },

    #[error("Only curator can update market parameters")]
    NotCurator {},
}
```

---

## Events

All operations emit events for off-chain tracking. Key events:

```rust
// Market creation
Response::new()
    .add_attribute("action", "create_market")
    .add_attribute("market_id", market_id)
    .add_attribute("curator", curator)
    .add_attribute("collateral_denom", collateral_denom)
    .add_attribute("debt_denom", debt_denom)
    .add_attribute("ltv", ltv.to_string())
    .add_attribute("liquidation_threshold", liquidation_threshold.to_string())

// Supply
Response::new()
    .add_attribute("action", "supply")
    .add_attribute("market_id", market_id)
    .add_attribute("user", user)
    .add_attribute("amount", amount)
    .add_attribute("scaled_amount", scaled_amount)

// Borrow
Response::new()
    .add_attribute("action", "borrow")
    .add_attribute("market_id", market_id)
    .add_attribute("user", user)
    .add_attribute("amount", amount)
    .add_attribute("scaled_debt", scaled_debt)
    .add_attribute("health_factor", health_factor.to_string())

// Liquidation
Response::new()
    .add_attribute("action", "liquidate")
    .add_attribute("market_id", market_id)
    .add_attribute("borrower", borrower)
    .add_attribute("liquidator", liquidator)
    .add_attribute("debt_repaid", debt_repaid)
    .add_attribute("collateral_seized", collateral_seized)
    .add_attribute("liquidator_bonus", liquidator_bonus)
    .add_attribute("protocol_fee", protocol_fee)

// Interest accrual (emitted during apply_accumulated_interests)
Response::new()
    .add_attribute("action", "accrue_interest")
    .add_attribute("market_id", market_id)
    .add_attribute("borrow_index", borrow_index.to_string())
    .add_attribute("liquidity_index", liquidity_index.to_string())
    .add_attribute("borrow_rate", borrow_rate.to_string())
    .add_attribute("liquidity_rate", liquidity_rate.to_string())
```

---

## Gas Optimization Strategies

### 1. Minimize Storage Reads/Writes

```rust
// ❌ BAD: Multiple loads
let market = MARKETS.load(storage, market_id)?;
do_something();
let market = MARKETS.load(storage, market_id)?;  // Redundant read

// ✅ GOOD: Load once, mutate, save once
let mut market = MARKETS.load(storage, market_id)?;
do_something(&mut market);
do_something_else(&mut market);
MARKETS.save(storage, market_id, &market)?;
```

### 2. Use Scaled Amounts

```rust
// Store scaled amounts instead of underlying to avoid per-user interest updates
// This is the core optimization from Red Bank

pub struct UserPosition {
    pub supply_scaled: Uint128,  // ✅ Efficient
    pub debt_scaled: Uint128,    // ✅ Efficient
}

// NOT:
pub struct UserPosition {
    pub supply: Uint128,  // ❌ Would require updating every user every block
    pub debt: Uint128,    // ❌ Would require updating every user every block
}
```

### 3. Batch Operations

```rust
// Allow users to batch multiple operations in one transaction
ExecuteMsg::BatchOperations {
    operations: Vec<Operation>,
}

pub enum Operation {
    SupplyCollateral { market_id: String },
    Borrow { market_id: String, amount: Uint128 },
    // etc.
}
```

### 4. Lazy Interest Updates

```rust
// Only update interest when needed (user operation or query)
// Don't run background tasks to update interest

pub fn apply_accumulated_interests_if_needed(
    storage: &mut dyn Storage,
    market: &mut Market,
    params: &MarketParams,
    current_time: u64,
) -> Result<(), ContractError> {
    if current_time > market.last_update {
        apply_accumulated_interests(storage, market, params, current_time)?;
    }
    Ok(())
}
```

### 5. Efficient Math

```rust
use cosmwasm_std::Decimal;

// Use checked operations to prevent overflow
let result = a.checked_mul(b)?;
let result = a.checked_div(b)?;

// Use decimal operations for precision
let scaled = Decimal::from_ratio(amount, 1u128)
    .checked_div(index)?
    .to_uint_floor();
```

---

## Testing Strategy

### Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};

    #[test]
    fn test_market_creation() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let info = mock_info("creator", &[]);

        // Test market creation logic
        // Assert market ID generation
        // Assert storage updates
    }

    #[test]
    fn test_interest_accrual() {
        // Test interest calculations
        // Test index updates
        // Test fee distribution
    }

    #[test]
    fn test_health_factor_calculation() {
        // Test various health factor scenarios
        // Test liquidation threshold
        // Test LTV checks
    }

    #[test]
    fn test_liquidation_amounts() {
        // Test liquidation calculations
        // Test close factor
        // Test bonus and protocol fee
    }
}
```

### Integration Tests

```rust
#[cfg(test)]
mod integration_tests {
    #[test]
    fn test_full_lending_flow() {
        // 1. Create market
        // 2. User A supplies debt asset
        // 3. User B supplies collateral
        // 4. User B borrows
        // 5. Time passes, interest accrues
        // 6. User B repays
        // 7. User A withdraws with interest
    }

    #[test]
    fn test_liquidation_flow() {
        // 1. Setup market with borrower position
        // 2. Simulate price drop
        // 3. Liquidator liquidates
        // 4. Verify collateral transfer
        // 5. Verify protocol fee
    }
}
```

### Property-Based Tests

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn test_interest_never_decreases_debt(
        initial_debt in 1u128..1_000_000u128,
        rate in 0.0..1.0,
        time in 1u64..31_536_000u64,  // Up to 1 year
    ) {
        // Property: Interest accrual should never decrease debt
        let new_debt = calculate_debt_after_interest(initial_debt, rate, time);
        assert!(new_debt >= initial_debt);
    }

    #[test]
    fn test_health_factor_boundaries(
        collateral in 1u128..1_000_000u128,
        debt in 1u128..1_000_000u128,
    ) {
        // Property: Health factor should be consistent with liquidation logic
        let health = calculate_health_factor(collateral, debt, LTV);
        let liquidatable = health < Decimal::one();
        // Verify consistency
    }
}
```

### Invariant Tests

```rust
#[test]
fn test_invariant_total_supply_equals_sum_of_users() {
    // After any operation:
    // market.total_supply_scaled == sum(all user supplies)
}

#[test]
fn test_invariant_total_debt_equals_sum_of_users() {
    // After any operation:
    // market.total_debt_scaled == sum(all user debts)
}

#[test]
fn test_invariant_available_liquidity() {
    // After any operation:
    // available_liquidity = (total_supply * liq_index) - (total_debt * borrow_index)
    // available_liquidity >= 0
}
```

---

## Security Considerations

### Critical Checks Checklist

- [ ] **Market Creation**
  - [ ] Validate all parameters within bounds
  - [ ] Test oracle returns valid prices
  - [ ] Check collision on market ID (defensive)
  - [ ] Validate creation fee payment

- [ ] **Supply Operations**
  - [ ] Check market is enabled
  - [ ] Apply interest before calculations
  - [ ] Validate supply cap
  - [ ] Update indices correctly
  - [ ] Handle zero amounts

- [ ] **Borrow Operations**
  - [ ] Check market is enabled
  - [ ] Apply interest before calculations
  - [ ] Validate borrow cap
  - [ ] Check available liquidity
  - [ ] **CRITICAL: Check health factor after borrow**
  - [ ] Update indices correctly

- [ ] **Liquidation**
  - [ ] Verify position is unhealthy
  - [ ] Validate close factor
  - [ ] Check sufficient collateral exists
  - [ ] Validate liquidator payment
  - [ ] Calculate amounts correctly (no overflow)
  - [ ] Transfer collateral safely

- [ ] **Interest Accrual**
  - [ ] Handle zero utilization
  - [ ] Handle zero supply
  - [ ] Prevent negative rates
  - [ ] Cap maximum rates
  - [ ] Distribute fees correctly

- [ ] **Oracle Integration**
  - [ ] Handle oracle failures gracefully
  - [ ] Validate prices are non-zero
  - [ ] Check for stale prices (if oracle supports)

### Reentrancy Protection

CosmWasm is inherently protected against reentrancy (no callbacks during execution), but follow best practices:

```rust
// ✅ GOOD: Update state before external calls
DEBTS.save(storage, key, &new_debt)?;
let msg = BankMsg::Send { ... };
Ok(Response::new().add_message(msg))

// ❌ BAD: External call before state update (not possible in CosmWasm but conceptually)
let msg = BankMsg::Send { ... };
DEBTS.save(storage, key, &new_debt)?;  // Would fail if this pattern were possible
```

### Decimal Precision

```rust
// Always use checked operations
let result = a.checked_mul(b)?;

// Be aware of rounding direction
let scaled = amount.checked_div_floor(index)?;  // Round down (favor protocol)
let underlying = scaled.checked_mul_ceil(index)?;  // Round up (favor protocol)
```

### Access Control

```rust
// Owner-only operations
OWNER.assert_owner(deps.storage, &info.sender)?;

// Curator-only operations
if info.sender != params.curator {
    return Err(ContractError::NotCurator {});
}
```

---

## Implementation Checklist

### Phase 1: Core MVP

- [ ] Project setup with CosmWasm template
- [ ] State definitions (state.rs)
- [ ] Error types (error.rs)
- [ ] Message types (msg.rs)
- [ ] Instantiate function
- [ ] Market creation
  - [ ] Parameter validation
  - [ ] Market ID generation
  - [ ] Oracle price testing
  - [ ] Storage
- [ ] Supply operations
  - [ ] Supply debt asset
  - [ ] Withdraw debt asset
- [ ] Collateral operations
  - [ ] Supply collateral
  - [ ] Withdraw collateral (with health check)
- [ ] Borrow operations
  - [ ] Borrow with health check
  - [ ] Repay
- [ ] Interest rate module
  - [ ] Linear rate model
  - [ ] Interest accrual
  - [ ] Index updates
  - [ ] Fee distribution
- [ ] Health & liquidation
  - [ ] Health factor calculation
  - [ ] Oracle price queries
  - [ ] Liquidation execution
- [ ] Query endpoints
  - [ ] Config
  - [ ] Market info
  - [ ] User positions
  - [ ] Market list
- [ ] Unit tests for all modules
- [ ] Integration tests for user flows

### Phase 2: Advanced Features & Optimization

- [ ] Update market parameters
  - [ ] LTV updates with cooldown
  - [ ] Interest rate model updates
  - [ ] Cap updates
- [ ] Batch operations
- [ ] Gas optimizations
- [ ] Comprehensive error handling
- [ ] Event emissions
- [ ] Schema generation
- [ ] Property-based tests
- [ ] Invariant tests
- [ ] Documentation

### Phase 3: Security & Audit Prep

- [ ] Security review checklist
- [ ] Fuzz testing
- [ ] Gas benchmarking
- [ ] Audit preparation
  - [ ] Architecture documentation
  - [ ] Known limitations document
  - [ ] Test coverage report
- [ ] Testnet deployment
- [ ] External audit

---

## Constants

**File:** `src/helpers/math.rs`

```rust
use cosmwasm_std::Decimal;

// Time constants
pub const SECONDS_PER_YEAR: u64 = 31_536_000;  // 365 days

// Parameter bounds
pub const MIN_LTV: Decimal = Decimal::percent(1);
pub const MAX_LTV: Decimal = Decimal::percent(95);

pub const MIN_LIQUIDATION_BONUS: Decimal = Decimal::percent(3);
pub const MAX_LIQUIDATION_BONUS: Decimal = Decimal::percent(15);

pub const MIN_LIQUIDATION_PROTOCOL_FEE: Decimal = Decimal::percent(1);
pub const MAX_LIQUIDATION_PROTOCOL_FEE: Decimal = Decimal::percent(5);

pub const MAX_CURATOR_FEE: Decimal = Decimal::percent(25);

pub const LTV_UPDATE_COOLDOWN: u64 = 604_800;  // 7 days in seconds
pub const MAX_LTV_CHANGE_PER_UPDATE: Decimal = Decimal::percent(5);

// Interest rate bounds
pub const MAX_BORROW_RATE: Decimal = Decimal::percent(500);  // 500% APR max
```

---

## Next Steps

1. **Set up project structure** following the layout above
2. **Implement core storage** (state.rs, error.rs, msg.rs)
3. **Implement instantiate** and basic queries
4. **Implement market creation** with full validation
5. **Implement supply/withdraw operations**
6. **Implement borrow/repay operations**
7. **Implement interest accrual module**
8. **Implement health calculation and liquidation**
9. **Write comprehensive tests**
10. **Gas optimization pass**
11. **Security review**
12. **Audit preparation**

---

**Document Version:** 1.0
**Last Updated:** 2026-01-15
**Status:** Implementation Ready
**Next:** Begin Phase 1 implementation
