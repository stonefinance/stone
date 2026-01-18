# Getting Started - Isolated Markets Implementation

This guide will walk you through implementing the Isolated Markets factory pattern from scratch.

## Prerequisites

- Rust 1.70+
- CosmWasm 1.5+
- Understanding of:
  - Lending protocols basics
  - CosmWasm contract development
  - Mars Red Bank architecture (review reference contracts)

## Step 1: Read the Documentation

### Recommended Order

1. **[README.md](README.md)** (10 min)
   - Understand why factory pattern
   - Learn architecture overview
   - Review project structure

2. **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** (15 min)
   - Learn state structures
   - Review key operations
   - Understand calculations

3. **[FACTORY_PATTERN_CHANGES.md](docs/FACTORY_PATTERN_CHANGES.md)** (20 min)
   - Deep dive on single contract vs factory
   - Understand storage key changes
   - Review deployment flow

4. **[ISOLATED_MARKETS_SPEC.md](docs/ISOLATED_MARKETS_SPEC.md)** (45 min)
   - Complete design specification
   - All design decisions explained
   - Parameter bounds and rules

5. **[ISOLATED_MARKETS_TECHNICAL_ARCHITECTURE.md](docs/ISOLATED_MARKETS_TECHNICAL_ARCHITECTURE.md)** (60 min)
   - Detailed pseudocode for all operations
   - Error handling specifications
   - State transition diagrams

6. **[ISOLATED_MARKETS_IMPLEMENTATION_GUIDE.md](docs/ISOLATED_MARKETS_IMPLEMENTATION_GUIDE.md)** (30 min)
   - Step-by-step implementation phases
   - Testing strategy
   - Time estimates

### Key Concepts to Understand

Before starting implementation, ensure you understand:

#### 1. Scaled Amounts
```rust
// Why: Interest accrues continuously, we can't update every user's balance
// Solution: Store "scaled" amounts that represent shares

// When user supplies 1000 tokens and liquidity_index = 1.0
scaled_amount = 1000 / 1.0 = 1000

// Later, liquidity_index = 1.1 (10% interest accrued)
current_balance = 1000 * 1.1 = 1100

// User earned 100 tokens without any balance update!
```

#### 2. Indices
```rust
// borrow_index: tracks debt growth over time
// liquidity_index: tracks supply growth over time

// Both start at 1.0
// Both only increase (never decrease)
// Updated based on interest rate * time elapsed
```

#### 3. Health Factor
```rust
// Determines if a position is healthy or liquidatable

health_factor = (collateral * price * liquidation_threshold) / debt

// > 1.0 = healthy
// < 1.0 = liquidatable
// = 1.0 = borderline
```

#### 4. LTV vs Liquidation Threshold
```rust
// LTV (Loan-to-Value): Maximum initial borrow
// Example: 80% LTV means you can borrow up to 80% of collateral value

// Liquidation Threshold: When position becomes liquidatable
// Example: 85% threshold means liquidatable when debt reaches 85% of collateral value

// Gap between them (85% - 80% = 5%) is safety buffer
```

## Step 2: Review Reference Implementations

Study the Red Bank contracts in `contracts-reference/red-bank/`:

### Essential Files to Study

1. **state.rs** (30 min)
   - How Mars structures storage
   - Map usage patterns
   - State organization
   - **Note:** You'll simplify keys (remove market_id)

2. **interest_rates.rs** (45 min)
   - Interest rate model implementation
   - Index update calculations
   - Utilization calculations
   - **Use this directly:** Logic is identical

3. **borrow.rs** (30 min)
   - Borrow flow
   - Health checks before borrow
   - Scaled debt storage
   - **Adaptation needed:** Remove market_id from keys

4. **repay.rs** (20 min)
   - Repay flow
   - Debt reduction
   - Full vs partial repayment
   - **Adaptation needed:** Remove market_id from keys

5. **liquidate.rs** (45 min)
   - Liquidation logic
   - Collateral seizure calculations
   - Bonus distributions
   - **Adaptation needed:** Add protocol fee to liquidation bonus

6. **health.rs** (30 min)
   - Health factor calculations
   - Oracle price queries
   - Collateral value calculations
   - **Use this directly:** Logic is identical

### What to Extract

Create notes on:
- How interest accrual works
- Scaled amount patterns
- Error handling approaches
- Helper functions you can reuse
- Test patterns

## Step 3: Set Up Project Structure

### Option A: New Repository (Recommended)

```bash
# Create new project
cargo new isolated-markets --lib
cd isolated-markets

# Add to Cargo.toml
[workspace]
members = ["contracts/*", "packages/*"]

# Create structure
mkdir -p contracts/factory/src
mkdir -p contracts/market/src
mkdir -p packages/types/src
mkdir -p packages/testing/src
```

### Option B: Add to Existing Repo

```bash
# If adding to existing Mars repo
cd core-contracts
mkdir -p contracts/isolated-markets-factory/src
mkdir -p contracts/isolated-markets-market/src
```

### Directory Structure

```
isolated-markets/
├── Cargo.toml                     # Workspace manifest
├── contracts/
│   ├── factory/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── contract.rs       # Entry points
│   │       ├── execute.rs        # Execute handlers
│   │       ├── query.rs          # Query handlers
│   │       ├── state.rs          # Storage
│   │       └── error.rs          # Errors
│   └── market/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           ├── contract.rs       # Entry points
│           ├── execute/
│           │   ├── mod.rs
│           │   ├── supply.rs
│           │   ├── withdraw.rs
│           │   ├── borrow.rs
│           │   ├── repay.rs
│           │   ├── collateral.rs
│           │   └── liquidate.rs
│           ├── query.rs
│           ├── state.rs
│           ├── interest.rs       # Interest rate logic
│           ├── health.rs         # Health factor logic
│           ├── helpers.rs
│           └── error.rs
└── packages/
    ├── types/
    │   └── src/
    │       ├── factory/
    │       │   ├── mod.rs
    │       │   ├── msg.rs        # Factory messages
    │       │   └── state.rs      # Factory types
    │       └── market/
    │           ├── mod.rs
    │           ├── msg.rs        # Market messages
    │           └── state.rs      # Market types
    └── testing/
        └── src/
            └── mock_helpers.rs
```

## Step 4: Implementation Phases

### Phase 1: Types Package (2-3 hours)

Start with message and state type definitions.

**packages/types/src/market/msg.rs:**
```rust
use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Decimal, Uint128};

#[cw_serde]
pub struct InstantiateMsg {
    pub collateral_denom: String,
    pub debt_denom: String,
    pub curator: String,
    pub oracle: String,
    pub factory: String,
    pub params: MarketParams,
}

#[cw_serde]
pub struct MarketParams {
    pub loan_to_value: Decimal,
    pub liquidation_threshold: Decimal,
    pub liquidation_bonus: Decimal,
    pub liquidation_protocol_fee: Decimal,
    pub close_factor: Decimal,
    pub interest_rate_model: InterestRateModel,
    pub protocol_fee: Decimal,
    pub curator_fee: Decimal,
    pub supply_cap: Option<Uint128>,
    pub borrow_cap: Option<Uint128>,
    pub is_mutable: bool,
}

#[cw_serde]
pub enum ExecuteMsg {
    Supply { recipient: Option<String> },
    Withdraw { amount: Option<Uint128>, recipient: Option<String> },
    SupplyCollateral { recipient: Option<String> },
    WithdrawCollateral { amount: Option<Uint128>, recipient: Option<String> },
    Borrow { amount: Uint128, recipient: Option<String> },
    Repay { amount: Option<Uint128>, on_behalf_of: Option<String> },
    Liquidate { borrower: String, max_debt_to_repay: Option<Uint128> },
    UpdateParams { updates: MarketParamsUpdate },
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(MarketStateResponse)]
    MarketState {},

    #[returns(UserPositionResponse)]
    UserPosition { user: String },

    #[returns(UserDebtResponse)]
    UserDebt { user: String },
}
```

**packages/types/src/market/state.rs:**
```rust
use cosmwasm_std::{Addr, Decimal, Uint128};
use cw_serde;

#[cw_serde]
pub struct MarketState {
    // Identity
    pub collateral_denom: String,
    pub debt_denom: String,
    pub curator: Addr,
    pub oracle: Addr,
    pub factory: Addr,

    // Risk parameters
    pub loan_to_value: Decimal,
    pub liquidation_threshold: Decimal,
    pub liquidation_bonus: Decimal,
    pub liquidation_protocol_fee: Decimal,
    pub close_factor: Decimal,

    // Interest
    pub interest_rate_model: InterestRateModel,
    pub borrow_index: Decimal,
    pub liquidity_index: Decimal,
    pub borrow_rate: Decimal,
    pub liquidity_rate: Decimal,

    // Totals
    pub total_supply_scaled: Uint128,
    pub total_debt_scaled: Uint128,
    pub total_collateral: Uint128,

    // Fees
    pub protocol_fee: Decimal,
    pub curator_fee: Decimal,
    pub protocol_fee_collector: Option<Addr>,

    // Mutability
    pub is_mutable: bool,
    pub ltv_last_update: u64,

    // Status
    pub enabled: bool,
    pub last_update: u64,
    pub created_at: u64,
}

#[cw_serde]
pub struct InterestRateModel {
    pub optimal_utilization: Decimal,
    pub base_rate: Decimal,
    pub slope_1: Decimal,
    pub slope_2: Decimal,
}
```

### Phase 2: Market Contract State (1-2 hours)

**contracts/market/src/state.rs:**
```rust
use cw_storage_plus::{Item, Map};
use cosmwasm_std::{Addr, Uint128};
use isolated_markets_types::market::MarketState;

// Market state (single item since one market per contract)
pub const STATE: Item<MarketState> = Item::new("state");

// User positions - NO market_id needed!
pub const SUPPLIES: Map<&Addr, Uint128> = Map::new("supplies");
pub const COLLATERAL: Map<&Addr, Uint128> = Map::new("collateral");
pub const DEBTS: Map<&Addr, Uint128> = Map::new("debts");
```

**Key difference from Red Bank:**
```rust
// Red Bank (multi-market):
pub const SUPPLIES: Map<(&str, &Addr), Uint128> = Map::new("supplies");
//                         ^^^^^ market_id needed

// Isolated Markets (one market per contract):
pub const SUPPLIES: Map<&Addr, Uint128> = Map::new("supplies");
//                      ^^^^^^ just user address!
```

### Phase 3: Market Contract - Interest Rate Logic (3-4 hours)

Copy and adapt from `contracts-reference/red-bank/interest_rates.rs`.

**contracts/market/src/interest.rs:**

Key functions to implement:
1. `update_interest_indices()` - Update borrow_index and liquidity_index
2. `calculate_borrow_rate()` - From interest rate model
3. `calculate_liquidity_rate()` - From borrow rate minus fees
4. `get_scaled_liquidity_amount()` - Convert amount to scaled
5. `get_liquidity_amount()` - Convert scaled to amount

This module can be almost directly copied from Red Bank with minimal changes.

### Phase 4: Market Contract - Supply/Withdraw (4-5 hours)

**contracts/market/src/execute/supply.rs:**

```rust
pub fn execute_supply(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    recipient: Option<String>,
) -> Result<Response, ContractError> {
    // 1. Load state
    let mut state = STATE.load(deps.storage)?;

    // 2. Check market enabled
    if !state.enabled {
        return Err(ContractError::MarketDisabled {});
    }

    // 3. Validate funds sent
    let amount = validate_sent_funds(&info.funds, &state.debt_denom)?;

    // 4. Update interest indices
    update_interest_indices(deps.storage, &env, &mut state)?;

    // 5. Calculate scaled amount
    let scaled_amount = amount
        .checked_mul_floor(state.liquidity_index)?;

    // 6. Update recipient supply
    let recipient_addr = recipient
        .map(|r| deps.api.addr_validate(&r))
        .transpose()?
        .unwrap_or(info.sender.clone());

    SUPPLIES.update(
        deps.storage,
        &recipient_addr,
        |existing| -> StdResult<_> {
            Ok(existing.unwrap_or_default() + scaled_amount)
        },
    )?;

    // 7. Update total supply
    state.total_supply_scaled += scaled_amount;

    // 8. Save state
    STATE.save(deps.storage, &state)?;

    // 9. Emit events and return
    Ok(Response::new()
        .add_attribute("action", "supply")
        .add_attribute("user", recipient_addr)
        .add_attribute("amount", amount)
        .add_attribute("scaled_amount", scaled_amount))
}
```

Study Red Bank's `deposit.rs` for complete implementation.

### Phase 5: Market Contract - Borrow/Repay (5-6 hours)

**Key steps for borrow:**
1. Update interest indices
2. Load user collateral and current debt
3. Calculate health factor IF borrow executes
4. Check LTV constraint
5. Update debt (scaled)
6. Transfer tokens
7. Emit events

Study Red Bank's `borrow.rs` and `repay.rs`.

### Phase 6: Market Contract - Collateral (3-4 hours)

**SupplyCollateral:**
- Simpler than supply (no scaling needed)
- Just update COLLATERAL map and total_collateral

**WithdrawCollateral:**
- Check health factor after withdrawal
- Ensure health factor stays > 1.0

Study Red Bank's `collateral.rs`.

### Phase 7: Market Contract - Liquidation (6-8 hours)

Most complex operation. Key steps:

1. Update interest indices
2. Calculate borrower health factor
3. Verify health factor < 1.0
4. Calculate max liquidatable debt (close_factor)
5. Calculate collateral to seize:
   - Base collateral value
   - Liquidator bonus
   - Protocol fee
6. Update borrower debt and collateral
7. Transfer tokens:
   - Debt from liquidator to contract
   - Collateral to liquidator (with bonus)
   - Protocol fee to collector
8. Emit detailed events

Study Red Bank's `liquidate.rs` and adapt for protocol fee.

### Phase 8: Factory Contract (4-5 hours)

**contracts/factory/src/state.rs:**
```rust
use cw_storage_plus::{Item, Map};
use cosmwasm_std::{Addr, Coin};

pub const CONFIG: Item<Config> = Item::new("config");
pub const MARKETS: Map<u64, Addr> = Map::new("markets");
pub const MARKET_COUNTER: Item<u64> = Item::new("market_counter");

// Indices for queries
pub const MARKETS_BY_CURATOR: Map<&Addr, Vec<Addr>> = Map::new("markets_by_curator");
pub const MARKETS_BY_PAIR: Map<(&str, &str), Vec<Addr>> = Map::new("markets_by_pair");

pub struct Config {
    pub owner: Addr,
    pub market_code_id: u64,
    pub market_creation_fee: Coin,
    pub protocol_fee_collector: Addr,
}
```

**contracts/factory/src/execute.rs:**

```rust
pub fn execute_create_market(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    collateral_denom: String,
    debt_denom: String,
    oracle: String,
    params: CreateMarketParams,
) -> Result<Response, ContractError> {
    // 1. Load config
    let config = CONFIG.load(deps.storage)?;

    // 2. Validate creation fee paid
    validate_creation_fee(&info.funds, &config.market_creation_fee)?;

    // 3. Validate params
    validate_market_params(&params)?;

    // 4. Validate oracle (query prices)
    validate_oracle(deps.as_ref(), &oracle, &collateral_denom, &debt_denom)?;

    // 5. Increment market counter
    let market_id = MARKET_COUNTER.load(deps.storage).unwrap_or(0) + 1;
    MARKET_COUNTER.save(deps.storage, &market_id)?;

    // 6. Create market instantiate message
    let market_init_msg = MarketInstantiateMsg {
        collateral_denom: collateral_denom.clone(),
        debt_denom: debt_denom.clone(),
        curator: info.sender.to_string(),
        oracle,
        factory: env.contract.address.to_string(),
        params,
    };

    // 7. Instantiate market contract
    let instantiate_msg = WasmMsg::Instantiate {
        admin: Some(config.owner.to_string()),
        code_id: config.market_code_id,
        msg: to_json_binary(&market_init_msg)?,
        funds: vec![],
        label: format!("Isolated Market #{}", market_id),
    };

    // 8. The submessage reply will store the market address
    let submsg = SubMsg::reply_on_success(instantiate_msg, INSTANTIATE_REPLY_ID);

    Ok(Response::new()
        .add_submessage(submsg)
        .add_attribute("action", "create_market")
        .add_attribute("curator", info.sender)
        .add_attribute("market_id", market_id.to_string()))
}

// Reply handler to capture instantiated market address
pub fn reply_instantiate_market(
    deps: DepsMut,
    msg: Reply,
) -> Result<Response, ContractError> {
    // Parse instantiate response to get contract address
    let res = parse_reply_instantiate_data(msg)?;
    let market_addr = deps.api.addr_validate(&res.contract_address)?;

    // Store in MARKETS map
    let market_id = MARKET_COUNTER.load(deps.storage)?;
    MARKETS.save(deps.storage, market_id, &market_addr)?;

    // TODO: Update indices (MARKETS_BY_CURATOR, MARKETS_BY_PAIR)

    Ok(Response::new()
        .add_attribute("market_address", market_addr))
}
```

### Phase 9: Testing (Ongoing)

#### Unit Tests (Per Module)

Test each module in isolation:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scaled_amount_calculation() {
        let amount = Uint128::new(1000);
        let index = Decimal::from_ratio(11u128, 10u128); // 1.1

        let scaled = amount.checked_div_floor(index).unwrap();
        assert_eq!(scaled, Uint128::new(909)); // 1000 / 1.1 = 909

        let current = scaled.checked_mul_floor(index).unwrap();
        assert_eq!(current, Uint128::new(999)); // Rounding
    }

    #[test]
    fn test_health_factor() {
        let collateral = Uint128::new(1000);
        let collateral_price = Decimal::from_ratio(100u128, 1u128);
        let debt = Uint128::new(500);
        let debt_price = Decimal::one();
        let liq_threshold = Decimal::from_ratio(85u128, 100u128);

        let health = calculate_health_factor(
            collateral,
            collateral_price,
            debt,
            debt_price,
            liq_threshold,
        );

        // (1000 * 100 * 0.85) / 500 = 170
        assert_eq!(health, Decimal::from_ratio(170u128, 1u128));
    }
}
```

#### Integration Tests

Test full user flows:

```rust
#[cfg(test)]
mod integration_tests {
    use crate::tests::helpers::*;

    #[test]
    fn test_full_supply_borrow_repay_withdraw() {
        let mut app = mock_app();
        let (factory_addr, market_code_id) = setup_factory(&mut app);
        let market_addr = create_test_market(&mut app, &factory_addr);

        // Lender supplies 10000 USDC
        supply(&mut app, &market_addr, "lender", 10000, "uusdc");

        // Borrower supplies 1 BTC collateral
        supply_collateral(&mut app, &market_addr, "borrower", 1, "ubtc");

        // Borrower borrows 5000 USDC (assuming BTC = $10k, LTV = 80%)
        borrow(&mut app, &market_addr, "borrower", 5000, "uusdc");

        // Time passes, interest accrues
        app.update_block(|block| block.time = block.time.plus_seconds(86400));

        // Borrower repays
        repay(&mut app, &market_addr, "borrower", 5100, "uusdc");

        // Borrower withdraws collateral
        withdraw_collateral(&mut app, &market_addr, "borrower", 1, "ubtc");

        // Lender withdraws (got interest)
        withdraw(&mut app, &market_addr, "lender", None, "uusdc");

        // Verify lender received > 10000 (earned interest)
    }

    #[test]
    fn test_liquidation_flow() {
        // Setup market
        // Borrower borrows max
        // Price of collateral drops
        // Health factor < 1.0
        // Liquidator liquidates
        // Verify collateral seized correctly
        // Verify protocol fee collected
        // Verify borrower debt reduced
    }

    #[test]
    fn test_market_isolation() {
        // Create two markets both using USDC
        // Market A: BTC/USDC
        // Market B: ETH/USDC
        // Lender supplies to both
        // Market A suffers bad debt somehow
        // Verify Market B lenders can still withdraw full amounts
    }
}
```

## Step 5: Schema Generation

Generate JSON schemas for all messages:

```bash
cd contracts/factory
cargo schema

cd ../market
cargo schema
```

This creates schemas in `contracts/*/schema/` for frontend integration.

## Step 6: Build and Optimize

### Development Builds
```bash
cargo build
cargo test
```

### Optimized WASM
```bash
# Install optimizer
cargo install cosmwasm-check

# Build optimized
docker run --rm -v "$(pwd)":/code \
  --mount type=volume,source="$(basename "$(pwd)")_cache",target=/code/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/rust-optimizer:0.12.13

# Verify
cosmwasm-check artifacts/factory.wasm
cosmwasm-check artifacts/market.wasm
```

## Step 7: Local Testing

Use LocalOsmosis or wasmd:

```bash
# Start local chain
bash scripts/start_local_osmosis.sh

# Deploy
bash scripts/deploy_local.sh

# Interact
bash scripts/create_test_market.sh
bash scripts/test_supply.sh
bash scripts/test_borrow.sh
bash scripts/test_liquidation.sh
```

## Step 8: Testnet Deployment

See [ISOLATED_MARKETS_IMPLEMENTATION_GUIDE.md](docs/ISOLATED_MARKETS_IMPLEMENTATION_GUIDE.md) for detailed testnet deployment instructions.

## Common Pitfalls to Avoid

### 1. Forgetting to Update Interest Indices
```rust
// ❌ Wrong - forgot to update indices
pub fn execute_borrow(...) {
    let state = STATE.load(deps.storage)?;
    // ... borrow logic ...
}

// ✅ Correct
pub fn execute_borrow(...) {
    let mut state = STATE.load(deps.storage)?;
    update_interest_indices(deps.storage, &env, &mut state)?; // <-- Essential!
    // ... borrow logic ...
}
```

### 2. Using market_id in Keys
```rust
// ❌ Wrong - this is single contract pattern
SUPPLIES.save(deps.storage, (&market_id, &user), &amount)?;

// ✅ Correct - factory pattern doesn't need market_id
SUPPLIES.save(deps.storage, &user, &amount)?;
```

### 3. Forgetting Scaled Conversions
```rust
// ❌ Wrong - storing current amount (will be incorrect after interest accrues)
DEBTS.save(deps.storage, &user, &borrow_amount)?;

// ✅ Correct - store scaled amount
let scaled_debt = borrow_amount.checked_div_floor(state.borrow_index)?;
DEBTS.save(deps.storage, &user, &scaled_debt)?;
```

### 4. Not Checking Health Factor
```rust
// ❌ Wrong - allowing withdrawal without health check
pub fn execute_withdraw_collateral(...) {
    let collateral = COLLATERAL.load(deps.storage, &user)?;
    COLLATERAL.save(deps.storage, &user, &(collateral - amount))?;
}

// ✅ Correct - check health factor after withdrawal
pub fn execute_withdraw_collateral(...) {
    let new_collateral = collateral - amount;
    let health_factor = calculate_health_factor(..., new_collateral, ...)?;
    if health_factor < Decimal::one() {
        return Err(ContractError::HealthFactorBelowOne {});
    }
    COLLATERAL.save(deps.storage, &user, &new_collateral)?;
}
```

### 5. Incorrect Liquidation Calculations
```rust
// ❌ Wrong - forgetting protocol fee
let collateral_seized = collateral_value + bonus;

// ✅ Correct - include protocol fee
let collateral_seized = collateral_value + liquidator_bonus + protocol_fee;
```

## Getting Help

- Review reference implementations in `contracts-reference/`
- Check Red Bank tests for patterns
- Read CosmWasm documentation: https://docs.cosmwasm.com/
- Review cw-storage-plus examples: https://github.com/CosmWasm/cw-storage-plus

## Timeline Estimate

Based on one experienced CosmWasm developer:

| Phase | Component | Time |
|-------|-----------|------|
| 1 | Types package | 2-3 hours |
| 2 | Market state | 1-2 hours |
| 3 | Interest logic | 3-4 hours |
| 4 | Supply/Withdraw | 4-5 hours |
| 5 | Borrow/Repay | 5-6 hours |
| 6 | Collateral | 3-4 hours |
| 7 | Liquidation | 6-8 hours |
| 8 | Factory | 4-5 hours |
| 9 | Unit tests | 10-12 hours |
| 10 | Integration tests | 15-20 hours |
| 11 | Optimization | 3-5 hours |
| 12 | Documentation | 4-6 hours |
| **Total** | **End-to-end MVP** | **60-80 hours** |

For a team of 2-3 developers working in parallel: **2-3 weeks**

## Next Steps

1. ✅ Read all documentation
2. ✅ Study reference implementations
3. ⬜ Set up project structure
4. ⬜ Implement types package
5. ⬜ Implement market contract (phases 2-7)
6. ⬜ Implement factory contract (phase 8)
7. ⬜ Write comprehensive tests (phase 9)
8. ⬜ Local testing
9. ⬜ Testnet deployment
10. ⬜ Security review
11. ⬜ Audit
12. ⬜ Mainnet deployment

Good luck with your implementation! 🚀
