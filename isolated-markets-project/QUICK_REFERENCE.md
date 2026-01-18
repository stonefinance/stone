# Isolated Markets - Quick Reference Guide

## Factory Pattern Summary

### Two Contracts

**Factory Contract:**
- Stores `market_code_id` (WASM code)
- Deploys new market instances
- Tracks all created markets
- Collects creation fees

**Market Contract:**
- Individual lending market
- Owns its token balances
- Handles all lending/borrowing operations
- Independent from other markets

### Why This Matters

**Bad debt cannot spread between markets:**
```
❌ Single Contract:
  Markets share contract balance → bad debt drains shared liquidity

✅ Factory Pattern:
  Each market has own contract address → bad debt isolated to that market
```

---

## Market Contract Quick Reference

### State Structure

```rust
pub struct MarketState {
    // Identity
    pub collateral_denom: String,      // e.g., "uatom"
    pub debt_denom: String,             // e.g., "ibc/...USDC"
    pub curator: Addr,                  // Market creator/manager
    pub oracle: Addr,                   // Price oracle (immutable)
    pub factory: Addr,                  // Factory that created this market

    // Risk params
    pub loan_to_value: Decimal,                // e.g., 0.80 (80%)
    pub liquidation_threshold: Decimal,        // e.g., 0.85 (85%)
    pub liquidation_bonus: Decimal,            // e.g., 0.05 (5%)
    pub liquidation_protocol_fee: Decimal,     // e.g., 0.02 (2%)
    pub close_factor: Decimal,                 // e.g., 0.50 (50%)

    // Interest
    pub interest_rate_model: InterestRateModel,
    pub borrow_index: Decimal,          // Grows over time
    pub liquidity_index: Decimal,       // Grows over time
    pub borrow_rate: Decimal,           // Current APR
    pub liquidity_rate: Decimal,        // Current APR

    // Totals (scaled)
    pub total_supply_scaled: Uint128,
    pub total_debt_scaled: Uint128,
    pub total_collateral: Uint128,      // Unscaled

    // Fees
    pub protocol_fee: Decimal,          // 0-100% of interest
    pub curator_fee: Decimal,           // 0-25% of interest
    pub protocol_fee_collector: Option<Addr>,

    // Mutability
    pub is_mutable: bool,               // Can curator adjust LTV?
    pub ltv_last_update: u64,

    // Status
    pub enabled: bool,
    pub last_update: u64,
    pub created_at: u64,
}
```

### Storage Maps (No market_id needed!)

```rust
// User supplies (scaled)
pub const SUPPLIES: Map<&Addr, Uint128> = Map::new("supplies");

// User collateral (unscaled)
pub const COLLATERAL: Map<&Addr, Uint128> = Map::new("collateral");

// User debts (scaled)
pub const DEBTS: Map<&Addr, Uint128> = Map::new("debts");
```

### Execute Messages

```rust
pub enum MarketExecuteMsg {
    // Lenders
    Supply {
        recipient: Option<String>
    },
    Withdraw {
        amount: Option<Uint128>,        // None = withdraw all
        recipient: Option<String>
    },

    // Borrowers
    SupplyCollateral {
        recipient: Option<String>
    },
    WithdrawCollateral {
        amount: Option<Uint128>,
        recipient: Option<String>
    },
    Borrow {
        amount: Uint128,
        recipient: Option<String>
    },
    Repay {
        amount: Option<Uint128>,        // None = repay all
        on_behalf_of: Option<String>
    },

    // Liquidators
    Liquidate {
        borrower: String,
        max_debt_to_repay: Option<Uint128>
    },

    // Curator
    UpdateParams {
        updates: MarketParamsUpdate
    },
}
```

---

## Factory Contract Quick Reference

### State Structure

```rust
pub struct FactoryState {
    pub owner: Addr,
    pub market_code_id: u64,           // Stored WASM code for markets
    pub market_creation_fee: Coin,      // e.g., Coin { denom: "uosmo", amount: "1000000" }
    pub protocol_fee_collector: Addr,
    pub markets: Vec<Addr>,             // All created market addresses
}

// Indices for queries
pub const MARKETS_BY_CURATOR: Map<&Addr, Vec<Addr>> = Map::new("markets_by_curator");
pub const MARKETS_BY_PAIR: Map<(&str, &str), Vec<Addr>> = Map::new("markets_by_pair");
```

### Execute Messages

```rust
pub enum FactoryExecuteMsg {
    CreateMarket {
        collateral_denom: String,
        debt_denom: String,
        oracle: String,
        params: CreateMarketParams,
    },
    UpdateMarketCodeId {
        new_code_id: u64            // Owner only
    },
    UpdateConfig {
        market_creation_fee: Option<Coin>,
        protocol_fee_collector: Option<String>,
    },
}
```

### Query Messages

```rust
pub enum FactoryQueryMsg {
    Config {},
    ListMarkets {
        start_after: Option<String>,
        limit: Option<u32>
    },
    MarketsByCurator {
        curator: String
    },
    MarketsByPair {
        collateral_denom: String,
        debt_denom: String
    },
}
```

---

## Key Operations

### Market Creation Flow

```
1. Curator → Factory.CreateMarket(params) + sends market_creation_fee
2. Factory validates params
3. Factory queries oracle for both prices (must succeed)
4. Factory instantiates new Market contract from market_code_id
5. Factory stores market address in MARKETS
6. Factory returns market contract address
7. Users interact with Market contract directly
```

### Supply Flow (Lender)

```
1. User → Market.Supply() + sends debt_asset tokens
2. Market updates interest indices
3. Market calculates scaled_amount = amount / liquidity_index
4. Market increases SUPPLIES[user] by scaled_amount
5. Market increases total_supply_scaled
6. User receives scaled shares
```

### Borrow Flow

```
1. User → Market.Borrow(amount)
2. Market updates interest indices
3. Market gets user's collateral and current debt
4. Market calculates health factor if borrow executed
5. Market checks: (collateral * price * LTV) >= (new_debt * debt_price)
6. Market increases DEBTS[user] by amount / borrow_index (scaled)
7. Market increases total_debt_scaled
8. Market transfers debt_asset to user
```

### Liquidation Flow

```
1. Liquidator → Market.Liquidate(borrower, max_debt_to_repay) + sends debt_asset
2. Market updates interest indices
3. Market calculates borrower health factor
4. Market checks: health_factor < 1.0 (liquidatable)
5. Market calculates:
   - debt_to_repay = min(max_debt_to_repay, debt * close_factor)
   - collateral_value_needed = debt_to_repay * debt_price / collateral_price
   - liquidator_bonus = collateral_value_needed * liquidation_bonus
   - protocol_fee = collateral_value_needed * liquidation_protocol_fee
   - total_collateral_seized = collateral_value_needed + liquidator_bonus + protocol_fee
6. Market reduces borrower debt (scaled)
7. Market reduces borrower collateral
8. Market transfers collateral to liquidator (+ bonus)
9. Market transfers protocol fee to protocol_fee_collector
```

---

## Critical Calculations

### Scaled Amounts

```rust
// Convert to scaled (when storing)
scaled_amount = amount / index

// Convert to current (when querying)
current_amount = scaled_amount * index
```

### Interest Rate Update

```rust
// Time-based accrual
time_elapsed = current_time - last_update
interest_accrued = borrow_rate * time_elapsed / SECONDS_PER_YEAR

// Update indices
new_borrow_index = borrow_index * (1 + interest_accrued)
new_liquidity_index = liquidity_index * (1 + liquidity_accrued)

// Calculate utilization
utilization = total_debt / (total_supply + total_debt)

// Get new rates from model
new_borrow_rate = interest_rate_model.get_borrow_rate(utilization)
new_liquidity_rate = new_borrow_rate * utilization * (1 - protocol_fee - curator_fee)
```

### Health Factor

```rust
// Get oracle prices
collateral_price = oracle.query_price(collateral_denom)
debt_price = oracle.query_price(debt_denom)

// Calculate values
collateral_value = collateral_amount * collateral_price
debt_value = debt_amount * debt_price

// Health factor
health_factor = (collateral_value * liquidation_threshold) / debt_value

// Checks
can_borrow = (collateral_value * LTV) >= (new_debt_value)
can_liquidate = health_factor < 1.0
```

### Liquidation Amounts

```rust
// Maximum liquidatable debt
max_liquidatable_debt = borrower_debt * close_factor

// Actual debt to repay
debt_to_repay = min(max_debt_to_repay, max_liquidatable_debt)

// Collateral needed (in debt asset value)
collateral_value_needed = debt_to_repay * debt_price / collateral_price

// Bonuses
liquidator_bonus_value = collateral_value_needed * liquidation_bonus
protocol_fee_value = collateral_value_needed * liquidation_protocol_fee

// Total collateral seized
total_seized = collateral_value_needed + liquidator_bonus_value + protocol_fee_value

// Transfers
// - debt_asset from liquidator to market
// - (collateral_value_needed + liquidator_bonus_value) to liquidator
// - protocol_fee_value to protocol_fee_collector
```

---

## Parameter Bounds

### Market Creation Parameters

```rust
// LTV
0.01 <= loan_to_value <= 0.95

// Liquidation threshold
loan_to_value < liquidation_threshold < 1.0

// Liquidation bonus
0.03 <= liquidation_bonus <= 0.15

// Liquidation protocol fee
0.01 <= liquidation_protocol_fee <= 0.05

// Close factor
0.0 < close_factor <= 1.0
// Typical: 0.5 (can liquidate 50% of debt at once)

// Protocol fee
0.0 <= protocol_fee <= 1.0

// Curator fee
0.0 <= curator_fee <= 0.25  // Max 25%

// Constraint
protocol_fee + curator_fee < 1.0
```

### LTV Update Rules (if is_mutable = true)

```rust
// Maximum change per update
max_ltv_change = 0.05  // ±5%

// Cooldown period
ltv_update_cooldown = 604_800  // 7 days in seconds

// Bounds
new_ltv >= old_ltv - 0.05
new_ltv <= old_ltv + 0.05
new_ltv >= 0.01
new_ltv <= 0.95
new_ltv < liquidation_threshold
current_time >= ltv_last_update + 604_800
```

---

## Storage Key Patterns

### Old (Single Contract)
```rust
// Had to include market_id everywhere
SUPPLIES: Map<(&str, &Addr), Uint128>      // (market_id, user)
COLLATERAL: Map<(&str, &Addr), Uint128>    // (market_id, user)
DEBTS: Map<(&str, &Addr), Uint128>         // (market_id, user)
MARKETS: Map<&str, Market>                  // market_id → market
```

### New (Factory Pattern)
```rust
// Market Contract (no market_id needed!)
SUPPLIES: Map<&Addr, Uint128>              // user → scaled_amount
COLLATERAL: Map<&Addr, Uint128>            // user → amount
DEBTS: Map<&Addr, Uint128>                 // user → scaled_amount
STATE: Item<MarketState>                    // single market state

// Factory Contract
MARKETS: IndexedMap<u64, Addr, MarketIndexes>  // counter → market_addr
MARKETS_BY_CURATOR: Map<&Addr, Vec<Addr>>      // curator → [market_addrs]
MARKETS_BY_PAIR: Map<(&str, &str), Vec<Addr>>  // (coll, debt) → [market_addrs]
```

---

## Common Errors

```rust
pub enum ContractError {
    Unauthorized {},
    InvalidDenom { denom: String },
    InsufficientLiquidity {},
    HealthFactorAboveOne {},        // Cannot liquidate
    HealthFactorBelowOne {},        // Cannot borrow/withdraw
    InvalidLTV {},
    InvalidLiquidationThreshold {},
    InvalidLiquidationBonus {},
    InvalidFee {},
    OracleError { msg: String },
    MarketDisabled {},
    MarketNotMutable {},
    LTVUpdateTooSoon {},
    LTVChangeTooLarge {},
    InsufficientCollateral {},
    NoDebtToRepay {},
    NoSupplyToWithdraw {},
    InvalidCloseF {},
    // ... more errors
}
```

---

## Testing Checklist

### Unit Tests
- [ ] Interest rate calculations
- [ ] Index updates (borrow_index, liquidity_index)
- [ ] Scaled amount conversions
- [ ] Health factor computation
- [ ] Liquidation amount calculations
- [ ] Fee distribution calculations
- [ ] LTV update validation

### Integration Tests
- [ ] Market creation via factory
- [ ] Supply → withdraw flow
- [ ] Borrow → repay flow
- [ ] Full liquidation scenario
- [ ] Multiple users interacting
- [ ] Parameter updates by curator
- [ ] Multiple markets (ensure isolation)

### Invariants
- [ ] total_debt_scaled * borrow_index >= sum(user debts)
- [ ] total_supply_scaled * liquidity_index >= sum(user supplies)
- [ ] contract balance >= required balance
- [ ] health_factor < 1.0 ⟺ can liquidate
- [ ] Indices only increase (never decrease)
- [ ] Liquidations improve health factor

### Edge Cases
- [ ] First depositor (potential index manipulation)
- [ ] Complete liquidation
- [ ] Borrow with no collateral
- [ ] Withdraw more than supplied
- [ ] Repay more than owed
- [ ] Oracle price = 0
- [ ] Oracle unavailable
- [ ] Market disabled during operation

---

## Deployment Checklist

### Pre-Deployment
- [ ] Compile contracts (market + factory)
- [ ] Run all tests
- [ ] Gas benchmarks
- [ ] Security review
- [ ] Audit (if mainnet)

### Testnet Deployment
- [ ] Upload market.wasm → get MARKET_CODE_ID
- [ ] Upload factory.wasm → get FACTORY_CODE_ID
- [ ] Instantiate factory with MARKET_CODE_ID
- [ ] Create test market
- [ ] Perform all operations (supply, borrow, repay, liquidate)
- [ ] Verify isolation between markets
- [ ] Test parameter updates
- [ ] Test factory upgrades (UpdateMarketCodeId)

### Mainnet Deployment
- [ ] Same steps as testnet
- [ ] Set appropriate market_creation_fee
- [ ] Set protocol_fee_collector
- [ ] Create initial markets
- [ ] Monitor for issues
- [ ] Prepare emergency procedures

---

## Reference Implementation Mapping

### Red Bank → Market Contract

| Red Bank File | Market Contract Module | Purpose |
|--------------|----------------------|---------|
| interest_rates.rs | interest.rs | Interest rate calculations |
| borrow.rs | borrow.rs | Borrow logic (remove market_id) |
| repay.rs | repay.rs | Repay logic (remove market_id) |
| deposit.rs | supply.rs | Supply logic (rename, remove market_id) |
| withdraw.rs | withdraw.rs | Withdraw logic (remove market_id) |
| liquidate.rs | liquidate.rs | Liquidation logic (remove market_id) |
| health.rs | health.rs | Health factor calculations |
| collateral.rs | collateral.rs | Collateral management (remove market_id) |
| state.rs | state.rs | Storage structures (simplify keys) |

### New Modules Needed

- **factory/contract.rs** - Factory instantiate, execute, query
- **factory/state.rs** - Factory storage structures
- **market/contract.rs** - Market instantiate, execute, query
- **market/state.rs** - Market storage structures

---

## Quick Command Reference

### Query Market State
```bash
wasmd query wasm contract-state smart $MARKET_ADDR \
  '{"market_state":{}}'
```

### Query User Position
```bash
wasmd query wasm contract-state smart $MARKET_ADDR \
  '{"user_position":{"user":"osmo1..."}}'
```

### Supply
```bash
wasmd tx wasm execute $MARKET_ADDR \
  '{"supply":{}}' \
  --amount 1000000$DEBT_DENOM \
  --from user
```

### Borrow
```bash
wasmd tx wasm execute $MARKET_ADDR \
  '{"borrow":{"amount":"500000"}}' \
  --from user
```

### Liquidate
```bash
wasmd tx wasm execute $MARKET_ADDR \
  '{"liquidate":{"borrower":"osmo1...","max_debt_to_repay":"1000000"}}' \
  --amount 1000000$DEBT_DENOM \
  --from liquidator
```

### Create Market
```bash
wasmd tx wasm execute $FACTORY_ADDR \
  '{"create_market":{"collateral_denom":"uatom","debt_denom":"ibc/...USDC","oracle":"osmo1...","params":{...}}}' \
  --amount 1000000uosmo \
  --from curator
```

---

**Quick Reference Version:** 1.0
**Last Updated:** 2026-01-17
**Architecture:** Factory Pattern
