# Isolated Markets Contract - Design Specification

## Overview

The Isolated Markets protocol is a Morpho-inspired lending system using a **factory pattern** where each market is deployed as a separate contract instance. This provides true isolation - each market has its own contract address and token balances, preventing bad debt contagion between markets. Unlike the existing Red Bank cross-collateralized system, each isolated market operates independently with its own risk parameters.

**Architecture:** Factory pattern with separate contract per market
**Based on:** Red Bank contract architecture
**Inspired by:** Morpho Blue, Compound V3
**Date:** 2026-01-17
**Status:** ✅ Design Finalized - Ready for Implementation

---

## Executive Summary

### Key Design Decisions (Finalized)

| Decision Area | Choice | Rationale |
|--------------|--------|-----------|
| **Architecture** | Factory pattern (separate contract per market) | True isolation - prevents bad debt contagion between markets |
| **Market Deployment** | Factory instantiates new contract from stored code_id | Each market is independent contract instance |
| **LTV Mutability** | Optional: ±5% per week if mutable | Allows curator adaptation while preventing rapid changes |
| **Fee Distribution** | Direct transfer to protocol/curator | Simple, no intermediary storage |
| **Oracle** | Curator-specified per market, immutable | Curator responsibility, maximum flexibility, tested on creation |
| **Creation Cost** | Configurable by factory owner | Spam prevention, can be zero for testnets |
| **Liquidation** | Fixed bonus + protocol fee | Simple and predictable, all proceeds to protocol/curator |
| **Mars Integration** | None - standalone system | Simpler, no dependencies, deployable anywhere |

### Core Features

- **True Isolation**: Each market is a separate contract with its own token balances
- **Factory Pattern**: Factory contract deploys and tracks all market instances
- **Permissionless Creation**: Anyone can be a curator by paying creation fee
- **Curator Incentives**: Earn percentage of interest (0-25%)
- **Scaled Amounts**: Efficient interest accrual using Red Bank's index system
- **Independent Risk**: Each market has own LTV, liquidation threshold, interest rates
- **No Bad Debt Contagion**: Bad debt in one market cannot affect another market's liquidity

### Quick Reference Card

```
Factory Contract:
  - Stores market contract code_id
  - Deploys new market instances
  - Tracks all created markets
  - Collects creation fees

Market Creation:
  - Pay: market_creation_fee to factory
  - Factory instantiates new market contract
  - Each market gets unique contract address
  - Specify: collateral, debt, oracle (immutable)
  - Set: LTV, liquidation params, interest model, fees
  - Choose: is_mutable flag (permanent choice)

Market Parameters:
  - LTV: 0.01 - 0.95 (mutable: ±5%/week if flag set)
  - Liquidation Threshold: > LTV, < 1.0 (immutable)
  - Liquidation Bonus: 3-15% (immutable)
  - Protocol Fee: 0-100% of interest (immutable)
  - Curator Fee: 0-25% of interest (updatable)
  - Oracle: Set at creation (immutable)

User Operations:
  - Supply: Lend debt_asset, earn interest (scaled)
  - SupplyCollateral: Deposit collateral_asset (unscaled)
  - Borrow: Take debt_asset (check LTV, scaled debt)
  - Repay: Return debt_asset (scaled debt decrease)
  - Withdraw: Remove debt_asset supply (if liquidity)
  - WithdrawCollateral: Remove collateral (check LTV)

Health Factor:
  - Healthy: (collateral * price * liq_threshold) / debt > 1.0
  - Liquidatable: health_factor < 1.0
  - Liquidation: Up to close_factor % of debt
  - Bonus: liquidator + protocol fee from collateral

Interest Accrual:
  - Continuous via indices (like Red Bank)
  - Borrow index: tracks debt growth
  - Liquidity index: tracks supply growth
  - Fees: protocol → deployer, curator → curator
```

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Architecture Overview](#architecture-overview)
3. [Market Creation & Configuration](#market-creation--configuration)
4. [User Operations](#user-operations)
5. [Interest Rate Mechanism](#interest-rate-mechanism)
6. [Liquidation System](#liquidation-system)
7. [Data Structures](#data-structures)
8. [State Management](#state-management)
9. [Entry Points](#entry-points)
10. [Security Considerations](#security-considerations)
11. [Comparison with Red Bank](#comparison-with-red-bank)
12. [Implementation Phases](#implementation-phases)

---

## Core Concepts

### Isolated Markets

Each market is a **separate contract instance** with complete isolation:
- **Own contract address** - Unique address per market
- **Own token balances** - Each market contract holds its own collateral and debt tokens
- **One collateral asset** - The asset users deposit as collateral
- **One debt asset** - The asset users can borrow
- **Independent LTV** - Loan-to-value ratio specific to this market
- **No cross-collateralization** - Collateral in one market cannot back loans in another
- **No bad debt contagion** - Bad debt in Market A cannot drain Market B's liquidity
- **Curator-controlled** - Each market has a curator who sets parameters

### Key Roles

#### Curator
- Creates isolated markets
- Sets market parameters (LTV, liquidation threshold, interest rate model, etc.)
- Can update certain parameters within bounds if they specify parameters are modifyable on deployment of market. Else immutable
- Receives a portion of protocol fees (curator fee)

#### Lender
- Supplies debt assets to the market
- Earns interest from borrowers
- Can withdraw liquidity if available
- Receives scaled shares representing their position

#### Borrower
- Supplies collateral assets
- Borrows debt assets up to LTV limit
- Pays interest to lenders
- Must maintain position health or face liquidation

#### Liquidator
- Monitors unhealthy positions
- Repays debt to receive discounted collateral
- Permissionless liquidation execution

---

## Architecture Overview

### Design Principles

1. **True Isolation** - Each market is a separate contract with own token balances
2. **Factory Pattern** - Central factory deploys and tracks market instances
3. **Permissionless Creation** - Anyone can create a market as a curator
4. **Efficient Interest** - Use scaled amounts and indices (like Red Bank)
5. **No Bad Debt Contagion** - Bad debt in one market cannot affect others
6. **Composability** - Standard interfaces for integration
7. **Safety First** - Conservative defaults, clear risk parameters

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Factory Contract                          │
│  - Stores market_code_id                                    │
│  - Deploys new market instances                             │
│  - Tracks all markets                                       │
│  - Collects creation fees                                   │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Market A    │    │  Market B    │    │  Market C    │
│  Contract    │    │  Contract    │    │  Contract    │
│              │    │              │    │              │
│ ATOM/USDC    │    │ OSMO/USDC    │    │ stATOM/ATOM  │
│ addr: osmo1..│    │ addr: osmo2..│    │ addr: osmo3..│
│              │    │              │    │              │
│ Balance:     │    │ Balance:     │    │ Balance:     │
│ ATOM: 100K   │    │ OSMO: 500K   │    │ stATOM: 50K  │
│ USDC: 80K    │    │ USDC: 300K   │    │ ATOM: 40K    │
└──────────────┘    └──────────────┘    └──────────────┘
```

### High-Level Flow

```
1. Curator calls Factory.CreateMarket(params)
            ↓
2. Factory instantiates new Market contract
            ↓
3. Market contract address returned to curator
            ↓
4. Users interact directly with Market contract:
   - Lenders → Supply debt_asset → Earn interest
   - Borrowers → Supply collateral_asset → Borrow debt_asset → Pay interest
   - Liquidators → Monitor health → Liquidate if underwater
```

### Contract Interactions

```
Factory Contract
    │
    ├─→ Instantiate Market(code_id, init_msg)
    └─→ Track market addresses

Each Market Contract
    │
    ├─→ Oracle (price feeds)
    ├─→ Protocol Fee Collector (protocol revenue - optional)
    └─→ Users (supply, borrow, repay, liquidate)
```

### Why Factory Pattern?

**Problem with single contract:**
```
Single Contract holding multiple markets:
  - Market A: ATOM/USDC (100K USDC)
  - Market B: OSMO/USDC (300K USDC)
  - Total USDC in contract: 400K

If Market A suffers bad debt of 150K:
  → Contract only has 400K - 150K = 250K USDC
  → Market B thinks it has 300K but only 250K exists
  → First withdrawers from either market drain liquidity
  → Losses are socialized between markets
```

**Solution with factory:**
```
Market A Contract: owns 100K USDC at address osmo1...
Market B Contract: owns 300K USDC at address osmo2...

If Market A suffers bad debt of 150K:
  → Only Market A depositors lose funds
  → Market B's 300K USDC completely unaffected
  → True isolation
```

---

## Market Creation & Configuration

### Market Parameters

Each market is uniquely identified by `(collateral_denom, debt_denom, curator, market_id)` and has:

```rust
pub struct MarketParams {
    // Core identifiers
    pub collateral_denom: String,
    pub debt_denom: String,
    pub curator: Addr,

    // Oracle (immutable)
    pub oracle: Addr,                         // Price oracle contract - IMMUTABLE

    // Risk parameters
    pub loan_to_value: Decimal,               // e.g., 0.8 = 80% LTV
    pub liquidation_threshold: Decimal,       // e.g., 0.85 = liquidate at 85%
    pub liquidation_bonus: Decimal,           // e.g., 0.05 = 5% discount to liquidator
    pub liquidation_protocol_fee: Decimal,    // e.g., 0.02 = 2% of seized collateral to protocol
    pub close_factor: Decimal,                // e.g., 0.5 = can liquidate 50% of debt

    // Interest rate model
    pub interest_rate_model: InterestRateModel,

    // Fees
    pub protocol_fee: Decimal,                // e.g., 0.1 = 10% of interest to protocol
    pub curator_fee: Decimal,                 // e.g., 0.05 = 5% of interest to curator (max 25%)

    // Caps (optional)
    pub supply_cap: Option<Uint128>,          // Max debt_asset that can be supplied
    pub borrow_cap: Option<Uint128>,          // Max debt_asset that can be borrowed

    // Mutability
    pub is_mutable: bool,                     // If true, curator can adjust LTV (within limits)
    pub ltv_last_update: u64,                 // Timestamp of last LTV update (for cooldown)

    // Market status
    pub enabled: bool,                        // Can disable market temporarily
}
```

### Market Creation Process

1. **Curator calls `CreateMarket`** with parameters and pays `market_creation_fee`
2. **Validation:**
   - Collateral and debt denoms must be different
   - Collateral and debt assets must exist/be valid
   - Oracle address is valid contract
   - Test query oracle for both collateral and debt prices (must succeed)
   - LTV < Liquidation Threshold < 1.0
   - Liquidation bonus reasonable (e.g., 0.03 - 0.15)
   - Liquidation protocol fee reasonable (e.g., 0.01 - 0.05)
   - Protocol fee + curator fee < 1.0
   - Curator fee <= 0.25 (25% max)
   - Close factor between 0.0 and 1.0 (typically 0.5)
   - Interest rate model is valid
   - Sufficient funds sent for market_creation_fee
3. **Market ID Generation:**
   - Generate deterministic ID: `SHA256(collateral_denom || debt_denom || curator || salt)`
   - Convert hash to hex string (64 characters)
   - Check for collision (extremely unlikely but safe)
4. **Initialization:**
   - Initialize market state with indices = 1.0
   - Set total_collateral = 0, total_debt = 0, total_supply = 0
   - Record creation time
   - Set ltv_last_update = creation_time
5. **Store market** in `MARKETS` and `MARKET_PARAMS` maps
6. **Transfer creation fee** to protocol_fee_collector
7. **Emit `MarketCreated` event**

### Market Updates

Curators can update parameters with the following rules:

**Always Updatable (no restrictions):**
- Interest rate model parameters
- Supply cap and borrow cap
- Curator fee (within 0-25% bounds)
- Enabled/disabled status

**Conditionally Updatable (mutable markets only):**
- **LTV**: Only if `is_mutable == true`
  - Maximum change: ±5% from last value
  - Cooldown: 7 days (604,800 seconds) between updates
  - Absolute bounds: 0.01 ≤ LTV ≤ 0.95
  - Must maintain: LTV < liquidation_threshold

**Never Updatable (immutable):**
- Collateral denom
- Debt denom
- Oracle address
- Liquidation threshold
- Liquidation bonus
- Liquidation protocol fee
- Close factor
- Is_mutable flag (set at creation, permanent)

---

## User Operations

### Supply (Lend)

Users supply `debt_asset` to earn interest.

**Flow:**
1. User calls `Supply` with amount of `debt_asset`
2. Apply accumulated interests to market
3. Calculate scaled amount: `scaled = amount / liquidity_index`
4. Increase user's supply position (scaled)
5. Increase market's `total_supply_scaled`
6. Update interest rates based on new utilization
7. Transfer tokens from user to contract
8. Emit `Supply` event

**State changes:**
```rust
SUPPLIES: Map<(&MarketId, &Addr), Uint128>  // scaled supply amount
market.total_supply_scaled += scaled_amount
```

### Supply Collateral

Users supply `collateral_asset` to enable borrowing.

**Flow:**
1. User calls `SupplyCollateral` with amount of `collateral_asset`
2. Increase user's collateral position (unscaled, no interest earned)
3. Increase market's `total_collateral`
4. Transfer tokens from user to contract
5. Emit `SupplyCollateral` event

**State changes:**
```rust
COLLATERAL: Map<(&MarketId, &Addr), Uint128>  // collateral amount (not scaled)
market.total_collateral += amount
```

### Borrow

Users borrow `debt_asset` against their `collateral_asset`.

**Flow:**
1. User calls `Borrow` with amount of `debt_asset`
2. Apply accumulated interests to market
3. Calculate user's position:
   - `collateral_value = collateral_amount * collateral_price`
   - `current_debt_value = (debt_scaled * debt_index) * debt_price`
   - `new_debt_value = current_debt_value + (borrow_amount * debt_price)`
4. Check: `new_debt_value / collateral_value <= loan_to_value`
5. Calculate scaled debt: `scaled = amount / borrow_index`
6. Increase user's debt position (scaled)
7. Increase market's `total_debt_scaled`
8. Update interest rates based on new utilization
9. Transfer tokens from contract to user
10. Emit `Borrow` event

**State changes:**
```rust
DEBTS: Map<(&MarketId, &Addr), Uint128>  // scaled debt amount
market.total_debt_scaled += scaled_amount
```

### Repay

Users repay `debt_asset` to reduce their debt.

**Flow:**
1. User calls `Repay` with amount (or max to repay all)
2. Apply accumulated interests to market
3. Calculate current debt: `current_debt = debt_scaled * borrow_index`
4. Determine repay amount: `min(requested_amount, current_debt)`
5. Calculate scaled debt decrease: `scaled_decrease = repay_amount / borrow_index`
6. Decrease user's debt position (scaled)
7. Decrease market's `total_debt_scaled`
8. Update interest rates based on new utilization
9. Transfer tokens from user to contract
10. Refund excess if user sent more than owed
11. Emit `Repay` event

### Withdraw

Users withdraw previously supplied `debt_asset`.

**Flow:**
1. User calls `Withdraw` with amount (or max)
2. Apply accumulated interests to market
3. Calculate current supply: `current_supply = supply_scaled * liquidity_index`
4. Determine withdrawal amount: `min(requested_amount, current_supply, available_liquidity)`
5. Check available liquidity: `total_supply - total_debt >= withdraw_amount`
6. Calculate scaled supply decrease: `scaled_decrease = withdraw_amount / liquidity_index`
7. Decrease user's supply position (scaled)
8. Decrease market's `total_supply_scaled`
9. Update interest rates based on new utilization
10. Transfer tokens from contract to user
11. Emit `Withdraw` event

### Withdraw Collateral

Users withdraw their `collateral_asset`.

**Flow:**
1. User calls `WithdrawCollateral` with amount (or max)
2. Apply accumulated interests to market
3. Calculate user's position after withdrawal:
   - `new_collateral_value = (collateral_amount - withdraw_amount) * collateral_price`
   - `current_debt_value = (debt_scaled * debt_index) * debt_price`
4. If debt exists, check: `current_debt_value / new_collateral_value <= loan_to_value`
5. Decrease user's collateral position
6. Decrease market's `total_collateral`
7. Transfer tokens from contract to user
8. Emit `WithdrawCollateral` event

---

## Interest Rate Mechanism

### Interest Accrual

Interest accrues continuously using the same mechanism as Red Bank:

**Indices:**
- `liquidity_index` - Multiplier for supplier shares (starts at 1.0)
- `borrow_index` - Multiplier for borrower debt (starts at 1.0)

**Update formula (linear interest):**
```rust
time_elapsed = current_time - last_update_time
borrow_index_new = borrow_index_old * (1 + borrow_rate * time_elapsed / SECONDS_PER_YEAR)

interest_earned = (total_debt_scaled * borrow_index_new) - (total_debt_scaled * borrow_index_old)
protocol_fee_amount = interest_earned * protocol_fee
curator_fee_amount = interest_earned * curator_fee
supplier_interest = interest_earned - protocol_fee_amount - curator_fee_amount

liquidity_index_new = liquidity_index_old * (1 + (supplier_interest / (total_supply_scaled * liquidity_index_old)))
```

### Interest Rate Models

Support multiple models (like Red Bank):

#### Linear Model
```rust
pub struct LinearInterestRateModel {
    pub optimal_utilization: Decimal,  // e.g., 0.8
    pub base_rate: Decimal,            // e.g., 0.0
    pub slope_1: Decimal,              // e.g., 0.1 (before optimal)
    pub slope_2: Decimal,              // e.g., 3.0 (after optimal)
}

fn calculate_borrow_rate(utilization: Decimal, model: LinearInterestRateModel) -> Decimal {
    if utilization <= model.optimal_utilization {
        model.base_rate + (utilization * model.slope_1 / model.optimal_utilization)
    } else {
        let excess = utilization - model.optimal_utilization;
        model.base_rate + model.slope_1 + (excess * model.slope_2 / (1.0 - model.optimal_utilization))
    }
}
```

**Utilization:**
```rust
utilization = total_debt / total_supply
```

---

## Liquidation System

### Health Factor

A user position is unhealthy when:
```rust
health_factor = (collateral_amount * collateral_price * liquidation_threshold) / (debt_amount * debt_price)

// Liquidatable if health_factor < 1.0
```

### Liquidation Process

1. **Liquidator calls `Liquidate`** with:
   - `market_id`
   - `borrower` address
   - `max_debt_to_repay` (optional, default to max)

2. **Validation:**
   - Borrower has debt in this market
   - Borrower's position is unhealthy (health < 1.0)

3. **Calculate liquidation amounts:**
   ```rust
   // Get current debt and collateral
   borrower_debt = debt_scaled * borrow_index
   borrower_collateral = collateral_amount

   // Get prices
   collateral_price = query_oracle(collateral_denom)
   debt_price = query_oracle(debt_denom)

   // Calculate max liquidation (e.g., 50% of debt or close factor)
   max_liquidatable_debt = borrower_debt * close_factor  // e.g., close_factor = 0.5
   debt_to_repay = min(max_debt_to_repay, max_liquidatable_debt)

   // Calculate collateral to seize (with bonus)
   debt_value = debt_to_repay * debt_price
   collateral_value_needed = debt_value * (1 + liquidation_bonus)
   collateral_to_seize = collateral_value_needed / collateral_price

   // Ensure we don't seize more than borrower has
   collateral_to_seize = min(collateral_to_seize, borrower_collateral)
   ```

4. **Execute liquidation:**
   - Decrease borrower's debt by `debt_to_repay` (scaled)
   - Decrease borrower's collateral by `collateral_to_seize`
   - Transfer debt_asset from liquidator to contract
   - Transfer collateral_asset from contract to liquidator
   - Optional: Send protocol liquidation fee to fee collector

5. **Update market state:**
   - Decrease `total_debt_scaled`
   - Decrease `total_collateral`
   - Update interest rates

6. **Emit `Liquidate` event**

### Partial vs Full Liquidation

- **Close Factor:** Maximum percentage of debt that can be repaid in one transaction (e.g., 50%)
- **Full liquidation:** Only if position is very unhealthy or debt is small
- **Partial liquidation:** More common, allows borrower to recover

---

## Data Structures

### Core Storage

```rust
// Configuration
pub const OWNER: Owner = Owner::new("owner");
pub const CONFIG: Item<Config> = Item::new("config");

// Market storage - uniquely identified by market_id (SHA256 hash hex string)
pub const MARKETS: Map<&str, Market> = Map::new("markets");

// User positions - keyed by (market_id, user_address)
pub const SUPPLIES: Map<(&str, &Addr), Uint128> = Map::new("supplies");
pub const COLLATERAL: Map<(&str, &Addr), Uint128> = Map::new("collateral");
pub const DEBTS: Map<(&str, &Addr), Uint128> = Map::new("debts");

// Market parameters
pub const MARKET_PARAMS: Map<&str, MarketParams> = Map::new("market_params");

// Config structure
pub struct Config {
    pub protocol_fee_collector: Addr,
    pub market_creation_fee: Coin,
}
```

### Market State

```rust
pub struct Market {
    // Identifiers (duplicated for convenience)
    pub market_id: String,
    pub collateral_denom: String,
    pub debt_denom: String,
    pub curator: Addr,

    // Indices for interest accrual
    pub borrow_index: Decimal,
    pub liquidity_index: Decimal,

    // Current rates
    pub borrow_rate: Decimal,
    pub liquidity_rate: Decimal,

    // Totals (scaled for debt/supply, unscaled for collateral)
    pub total_supply_scaled: Uint128,
    pub total_debt_scaled: Uint128,
    pub total_collateral: Uint128,

    // Tracking
    pub last_update: u64,  // timestamp
    pub created_at: u64,
}
```

### Market Parameters

```rust
pub struct MarketParams {
    pub collateral_denom: String,
    pub debt_denom: String,
    pub curator: Addr,

    // Risk parameters
    pub loan_to_value: Decimal,
    pub liquidation_threshold: Decimal,
    pub liquidation_bonus: Decimal,
    pub close_factor: Decimal,  // e.g., 0.5 = can liquidate 50% of debt

    // Interest rate
    pub interest_rate_model: InterestRateModel,

    // Fees
    pub protocol_fee: Decimal,
    pub curator_fee: Decimal,

    // Caps
    pub supply_cap: Option<Uint128>,
    pub borrow_cap: Option<Uint128>,

    // Status
    pub enabled: bool,
}
```

### User Position Query Response

```rust
pub struct UserPosition {
    pub market_id: String,
    pub collateral_denom: String,
    pub debt_denom: String,

    // Current amounts (underlying, not scaled)
    pub collateral_amount: Uint128,
    pub supply_amount: Uint128,
    pub debt_amount: Uint128,

    // Values in USD (or reference currency)
    pub collateral_value: Decimal,
    pub supply_value: Decimal,
    pub debt_value: Decimal,

    // Health metrics
    pub health_factor: Option<Decimal>,  // None if no debt
    pub max_borrow_value: Decimal,       // Based on LTV
    pub liquidation_price: Option<Decimal>,  // Price at which liquidation occurs
}
```

---

## State Management

### Storage Access Patterns

**Read operations:**
- `Market` lookup by `market_id`
- User position lookups: `(market_id, user_addr)`
- Market params lookup by `market_id`

**Write operations:**
- Update market indices and rates
- Update user positions (supplies, collateral, debts)
- Update totals in market state

### Interest Update Pattern

Before any operation that depends on current amounts:
```rust
fn apply_accumulated_interests(
    storage: &mut dyn Storage,
    market_id: &str,
    current_time: u64
) -> Result<(), ContractError> {
    let mut market = MARKETS.load(storage, market_id)?;
    let params = MARKET_PARAMS.load(storage, market_id)?;

    let time_elapsed = current_time - market.last_update;
    if time_elapsed == 0 {
        return Ok(());
    }

    // Calculate utilization
    let total_supply = market.total_supply_scaled * market.liquidity_index;
    let total_debt = market.total_debt_scaled * market.borrow_index;
    let utilization = if total_supply > Uint128::zero() {
        Decimal::from_ratio(total_debt, total_supply)
    } else {
        Decimal::zero()
    };

    // Get borrow rate from interest rate model
    let borrow_rate = calculate_borrow_rate(utilization, params.interest_rate_model);

    // Update borrow index
    let borrow_index_delta = market.borrow_index * borrow_rate * time_elapsed / SECONDS_PER_YEAR;
    market.borrow_index += borrow_index_delta;

    // Calculate interest earned
    let interest_earned = market.total_debt_scaled * borrow_index_delta;

    // Distribute fees
    let protocol_fee_amount = interest_earned * params.protocol_fee;
    let curator_fee_amount = interest_earned * params.curator_fee;
    let supplier_interest = interest_earned - protocol_fee_amount - curator_fee_amount;

    // Update liquidity index
    if market.total_supply_scaled > Uint128::zero() {
        let liquidity_index_delta = supplier_interest / market.total_supply_scaled;
        market.liquidity_index += liquidity_index_delta;
    }

    // Store accrued fees (as scaled supply for protocol and curator)
    // ... fee distribution logic ...

    market.borrow_rate = borrow_rate;
    market.liquidity_rate = calculate_liquidity_rate(borrow_rate, utilization, params);
    market.last_update = current_time;

    MARKETS.save(storage, market_id, &market)?;
    Ok(())
}
```

---

## Entry Points

### Instantiate

```rust
pub struct InstantiateMsg {
    pub owner: String,
    pub protocol_fee_collector: String,
    pub market_creation_fee: Coin,  // Fee required to create a market (can be zero)
}
```

### Execute Messages

```rust
pub enum ExecuteMsg {
    // Market management (curator only for their markets)
    CreateMarket {
        collateral_denom: String,
        debt_denom: String,
        oracle: String,
        params: CreateMarketParams,
        salt: Option<u64>,  // For creating multiple markets with same collateral/debt pair
    },
    UpdateMarketParams {
        market_id: String,
        updates: MarketParamsUpdate,  // Only allowed fields per mutability rules
    },

    // Supply side (lenders)
    Supply {
        market_id: String,
        recipient: Option<String>,
    },
    Withdraw {
        market_id: String,
        amount: Option<Uint128>,  // None = withdraw all
        recipient: Option<String>,
    },

    // Borrow side
    SupplyCollateral {
        market_id: String,
        recipient: Option<String>,
    },
    WithdrawCollateral {
        market_id: String,
        amount: Option<Uint128>,
        recipient: Option<String>,
    },
    Borrow {
        market_id: String,
        amount: Uint128,
        recipient: Option<String>,
    },
    Repay {
        market_id: String,
        amount: Option<Uint128>,  // None = repay all
        on_behalf_of: Option<String>,
    },

    // Liquidation
    Liquidate {
        market_id: String,
        borrower: String,
        max_debt_to_repay: Option<Uint128>,
    },

    // Admin
    UpdateOwner(mars_owner::OwnerUpdate),
    UpdateConfig {
        protocol_fee_collector: Option<String>,
        market_creation_fee: Option<Coin>,
    },
}
```

### Query Messages

```rust
pub enum QueryMsg {
    // Configuration
    Config {},
    Owner {},

    // Market queries
    Market { market_id: String },
    Markets {
        start_after: Option<String>,
        limit: Option<u32>,
    },
    MarketParams { market_id: String },

    // User position queries
    UserPosition {
        market_id: String,
        user: String,
    },
    UserPositions {
        user: String,
        start_after: Option<String>,
        limit: Option<u32>,
    },

    // Position component queries
    UserSupply {
        market_id: String,
        user: String,
    },
    UserCollateral {
        market_id: String,
        user: String,
    },
    UserDebt {
        market_id: String,
        user: String,
    },

    // Market totals
    MarketTotals { market_id: String },

    // Liquidation check
    IsLiquidatable {
        market_id: String,
        user: String,
    },
}
```

---

## Security Considerations

### Critical Checks

1. **LTV Enforcement:**
   - Always check on borrow and collateral withdrawal
   - Use liquidation_threshold for liquidation, not LTV
   - LTV < liquidation_threshold to provide buffer

2. **Reentrancy Protection:**
   - Follow checks-effects-interactions pattern
   - Update state before external calls
   - Consider reentrancy guards if needed

3. **Oracle Manipulation:**
   - Use time-weighted average prices (TWAP) if available
   - Consider price deviation limits
   - Handle stale price data

4. **Interest Rate Bounds:**
   - Cap maximum borrow rate to prevent extreme values
   - Validate interest rate model parameters on market creation
   - Consider rate change limits

5. **Liquidation Safety:**
   - Ensure close_factor prevents full liquidation of large positions
   - Validate liquidation_bonus is reasonable
   - Check for sufficient collateral before liquidation

6. **Precision and Rounding:**
   - Always round in protocol's favor
   - Handle dust amounts (very small positions)
   - Use Uint256 for intermediate calculations if needed

7. **Market Creation Spam:**
   - Consider market creation fee
   - Minimum curator stake requirement
   - Rate limit market creation per curator

8. **Emergency Controls:**
   - Ability to pause individual markets
   - Ability to pause all borrowing/liquidations
   - Time-locked parameter updates for critical changes

### Attack Vectors to Consider

1. **Flash loan attacks:**
   - Market manipulation through rapid supply/borrow
   - Mitigation: Use TWAP oracles, borrow caps

2. **Oracle manipulation:**
   - Price manipulation to trigger liquidations
   - Mitigation: Multiple oracle sources, deviation checks

3. **Interest rate manipulation:**
   - Curator setting extreme parameters
   - Mitigation: Parameter bounds, validation

4. **Liquidation bot manipulation:**
   - Frontrunning liquidations
   - Mitigation: Fair liquidation ordering (by health factor)

5. **Supply cap bypass:**
   - Finding ways to exceed caps
   - Mitigation: Strict cap enforcement, consider all paths

---

## Comparison with Red Bank

| Feature | Red Bank | Isolated Markets |
|---------|----------|------------------|
| **Collateralization** | Cross-collateralized | Isolated per market |
| **Market creation** | Governance-controlled | Permissionless (curator) |
| **LTV** | Asset-level params | Per-market params |
| **Risk isolation** | Protocol-wide risk | Market-specific risk |
| **Interest rates** | Per-asset | Per-market |
| **Curator role** | None | Fee-earning curator per market |
| **Composability** | Single lending pool | Multiple independent markets |
| **Health calculation** | Multi-asset health | Single market health |
| **Use case** | Blue-chip assets | Long-tail assets, custom pairs |

### When to Use Each

**Red Bank:**
- Established assets (ATOM, OSMO, etc.)
- Cross-collateral borrowing needed
- Lower risk, more capital efficient
- Unified liquidity pools

**Isolated Markets:**
- New/experimental assets
- Custom collateral-debt pairs
- Risk-isolated lending
- Curator-driven markets
- Long-tail asset support

---

## Implementation Phases

### Phase 1: Core Protocol (MVP)
- [ ] Market creation and storage
- [ ] Supply/withdraw operations
- [ ] Collateral supply/withdraw
- [ ] Borrow/repay operations
- [ ] Interest rate accrual (linear model)
- [ ] Basic health factor calculation
- [ ] Liquidation mechanism
- [ ] Core queries

### Phase 2: Safety & Optimization
- [ ] Oracle integration
- [ ] Parameter validation and bounds
- [ ] Reentrancy protection
- [ ] Emergency pause functionality
- [ ] Gas optimization
- [ ] Comprehensive testing
- [ ] Audit preparation

### Phase 3: Advanced Features
- [ ] Multiple interest rate models
- [ ] Incentives integration
- [ ] Supply/borrow caps
- [ ] Market analytics queries
- [ ] Curator fee collection
- [ ] Protocol fee distribution

### Phase 4: UX & Integrations
- [ ] Batch operations (supply + borrow in one tx)
- [ ] Position migration
- [ ] Zap-in operations (swap + supply)
- [ ] Frontend SDK
- [ ] Indexer support
- [ ] Governance integration

---

## Design Decisions (FINALIZED)

### 1. Market ID Generation
**Decision:** Use hash-based deterministic IDs

**Implementation:**
```rust
market_id = hash(collateral_denom || debt_denom || curator || salt)
```

**Rationale:**
- **Deterministic**: Same parameters = same ID (predictable for integrations)
- **Collision-resistant**: Cryptographic hash prevents conflicts
- **No state dependency**: Doesn't require counter storage/reads
- **Curator control**: Salt parameter allows curator to create multiple markets for same pair

**Trade-offs:**
| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| Auto-increment | Simple, sequential, predictable order | Requires state counter, less flexible, not deterministic | ❌ Rejected |
| Hash-based | Deterministic, no collision, gas efficient | Non-sequential, requires salt for multiple markets | ✅ **Selected** |
| Curator-specified | Maximum flexibility | Collision risk, gaming potential, validation overhead | ❌ Rejected |

**Implementation details:**
- Use SHA256 hash truncated to hex string (64 chars)
- Salt is optional u64, defaults to 0
- Check for collision on creation (should be near-impossible)
- Store reverse mapping: `MARKET_ID_TO_PARAMS` for lookups

### 2. Curator Permissions
**Decision:** Mutable markets allow 5% LTV adjustment per week; immutable markets are fixed

**Parameters:**
```rust
pub struct MarketParams {
    // ... other fields ...
    pub is_mutable: bool,
    pub ltv_last_update: u64,  // timestamp
}
```

**LTV Update Rules:**
- Markets created with `is_mutable: true` allow curator LTV updates
- Maximum change: ±5% per week (e.g., 0.80 → 0.75-0.85)
- Cooldown: 7 days (604,800 seconds) between updates
- Direction: Can move up or down, cumulative from last update
- Bounds: Cannot exceed 0.95 or go below 0.01
- Immutable markets: No updates allowed after creation

**Other curator permissions:**
- Update interest rate model parameters (always, no timelock)
- Update supply/borrow caps (always, no timelock)
- Update curator_fee within bounds (0-25%, always)
- Enable/disable market (always)
- Cannot change: collateral_denom, debt_denom, oracle, liquidation_threshold

**Rationale:** Allows curators to adjust risk as markets mature while preventing rapid/extreme changes

### 3. Fee Distribution
**Decision:** Direct fee transfer to deployer address

**Implementation:**
- Protocol fees accumulate during interest updates
- Fees sent directly to `protocol_fee_collector` address (set in InstantiateMsg)
- No intermediary storage or claiming mechanism needed
- Reuse Mars protocol fee patterns from Red Bank

**Fee types:**
```rust
pub struct FeeConfig {
    pub protocol_fee: Decimal,      // % of interest to deployer (e.g., 0.10 = 10%)
    pub curator_fee: Decimal,        // % of interest to curator (e.g., 0.05 = 5%)
}
```

**Fee calculation (on interest accrual):**
```rust
total_interest = borrow_interest_accrued
protocol_amount = total_interest * protocol_fee
curator_amount = total_interest * curator_fee
supplier_amount = total_interest - protocol_amount - curator_amount

// Transfer directly
transfer(protocol_fee_collector, debt_denom, protocol_amount)
transfer(curator, debt_denom, curator_amount)
```

**Curator fee constraints:**
- Maximum: 25% (prevents extractive fees)
- Minimum: 0% (optional)
- Set at market creation, updatable by curator within bounds

### 4. Oracle Selection
**Decision:** Curator defines oracle address on market creation (immutable)

**Implementation:**
```rust
pub struct MarketParams {
    // ... other fields ...
    pub oracle: Addr,  // Immutable after creation
}
```

**Oracle interface:**
- Must implement standard `QueryMsg::Price { denom }` interface
- Returns price in USD or reference asset
- No fallback mechanism (keep simple for MVP)
- Curator responsible for oracle reliability

**Validation on market creation:**
- Oracle address must be valid contract
- Test query both collateral and debt prices (must not error)
- No ongoing oracle validation (gas optimization)

**Risk mitigation:**
- Document oracle requirements clearly
- Recommend using established Mars Protocol oracle
- Users can assess oracle risk before participating
- Future: Add oracle registry/whitelist option

### 5. Market Creation Costs
**Decision:** Configurable creation fee set by deployer

**Implementation:**
```rust
pub struct Config {
    pub address_provider: Addr,
    pub protocol_fee_collector: Addr,
    pub market_creation_fee: Coin,  // e.g., Coin { denom: "uosmo", amount: 1_000_000 }
}

// Execute message
CreateMarket { ... }  // Curator must send funds >= market_creation_fee
```

**Fee handling:**
- Set during instantiation
- Updatable by contract owner via `UpdateConfig`
- Can be set to zero (free creation)
- Paid in specified denom (typically native chain token)
- Sent directly to `protocol_fee_collector`
- Prevents spam market creation

**Recommended values:**
- Testnet: 0 (free for experimentation)
- Mainnet: 100-1000 USD equivalent (prevents spam, not prohibitive)

### 6. Liquidation Incentive Structure
**Decision:** Fixed liquidation bonus, protocol fee on liquidations

**Implementation:**
```rust
pub struct MarketParams {
    // ... other fields ...
    pub liquidation_bonus: Decimal,         // e.g., 0.05 = 5% discount to liquidator
    pub liquidation_protocol_fee: Decimal,  // e.g., 0.02 = 2% of collateral seized
}
```

**Liquidation flow:**
```rust
// 1. Calculate amounts
debt_to_repay = min(requested, max_liquidatable)
collateral_value_needed = debt_to_repay * debt_price / collateral_price
liquidator_bonus = collateral_value_needed * liquidation_bonus
protocol_fee_amount = collateral_value_needed * liquidation_protocol_fee
total_collateral_seized = collateral_value_needed + liquidator_bonus + protocol_fee_amount

// 2. Transfers
// - debt_asset from liquidator to contract
// - collateral_asset (liquidator portion) to liquidator
// - collateral_asset (protocol fee) to deployer
transfer(liquidator, collateral_denom, collateral_value_needed + liquidator_bonus)
transfer(protocol_fee_collector, collateral_denom, protocol_fee_amount)
```

**Parameters:**
- `liquidation_bonus`: 3-10% typical (set at market creation)
- `liquidation_protocol_fee`: 1-3% typical (set at market creation)
- Both fixed for market lifetime
- Future improvement: Dynamic bonuses based on health factor

### 7. Integration with Existing Mars Contracts
**Decision:** NO integration - standalone contract

**Independence:**
- ❌ No shared address provider
- ❌ No shared oracle (curators specify their own)
- ❌ No incentives integration
- ❌ No params contract dependency
- ❌ No credit manager integration

**Implications:**
- Simpler implementation
- No governance dependencies
- Curator fully responsible for parameters
- Can deploy anywhere (not Mars-specific)
- Cleaner separation of concerns

**Configuration:**
```rust
pub struct InstantiateMsg {
    pub owner: String,
    pub protocol_fee_collector: String,
    pub market_creation_fee: Coin,
    // No address_provider needed
}
```

**Oracle handling:**
- Each market specifies its own oracle contract
- Curators can use Mars oracle if desired
- Or use any compatible price oracle
- Maximum flexibility

---

## Next Steps

### ✅ Completed
1. ~~Review specification with team and stakeholders~~
2. ~~Finalize all design decisions~~

### 🎯 Ready to Begin

3. **Create detailed technical architecture document**
   - Function-level pseudocode for critical operations
   - State transition diagrams
   - Error handling specifications
   - Gas optimization strategies

4. **Set up new repository** for isolated markets contract
   - Initialize CosmWasm project structure
   - Set up CI/CD pipelines
   - Configure testing framework
   - Add project dependencies

5. **Begin Phase 1 (MVP) implementation**
   - Implement market creation with hash-based IDs
   - Implement supply/withdraw operations with scaled amounts
   - Implement collateral supply/withdraw
   - Implement borrow/repay with health checks
   - Implement interest rate accrual
   - Implement liquidation mechanism
   - Add all query endpoints

6. **Develop comprehensive test suite**
   - Unit tests for all modules
   - Integration tests for user flows
   - Property-based tests for invariants
   - Fuzzing for edge cases
   - Gas benchmarking

7. **Security preparation**
   - Internal security review
   - Document known limitations
   - Plan external audit with established firm
   - Prepare testnet deployment

---

## References

- [Morpho Blue Documentation](https://docs.morpho.org/)
- [Mars Red Bank Implementation](./contracts/red-bank/)
- [Compound V2 Whitepaper](https://compound.finance/documents/Compound.Whitepaper.pdf)
- [AAVE V3 Technical Paper](https://github.com/aave/aave-v3-core)

---

## Document History

| Version | Date | Status | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-15 | Draft | Initial specification created |
| 2.0 | 2026-01-15 | ✅ **Finalized** | All design decisions approved, ready for implementation |

---

**Document Version:** 2.0
**Last Updated:** 2026-01-15
**Status:** ✅ Finalized - Implementation Ready
**Approver:** Stone Finance
