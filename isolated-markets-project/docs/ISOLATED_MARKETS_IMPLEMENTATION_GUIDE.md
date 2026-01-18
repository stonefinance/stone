# Isolated Markets - Implementation Quick Start Guide

## Overview

This guide provides step-by-step instructions for implementing the Isolated Markets contract. Follow this guide sequentially to build the MVP.

**Prerequisites:**
- Rust 1.70+
- CosmWasm 1.5+
- cargo-generate
- Familiarity with CosmWasm development

**Related Documents:**
- [Design Specification](./ISOLATED_MARKETS_SPEC.md) - Full design and requirements
- [Technical Architecture](./ISOLATED_MARKETS_TECHNICAL_ARCHITECTURE.md) - Detailed pseudocode and architecture

---

## Step 1: Project Setup (1-2 hours)

### Initialize Project

```bash
# Create new CosmWasm project
cargo generate --git https://github.com/CosmWasm/cw-template.git --name isolated-markets
cd isolated-markets

# Add dependencies to Cargo.toml
```

### Update Cargo.toml

```toml
[package]
name = "isolated-markets"
version = "0.1.0"
authors = ["Your Name <you@example.com>"]
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
cosmwasm-std = "1.5"
cosmwasm-storage = "1.5"
cw-storage-plus = "1.2"
cw2 = "1.1"
cw-utils = "1.0"
schemars = "0.8"
serde = { version = "1.0", default-features = false, features = ["derive"] }
thiserror = "1.0"
mars-owner = { git = "https://github.com/mars-protocol/common.git" }
sha2 = "0.10"
hex = "0.4"

[dev-dependencies]
cosmwasm-schema = "1.5"
cw-multi-test = "0.20"

[profile.release]
opt-level = 3
debug = false
rpath = false
lto = true
debug-assertions = false
codegen-units = 1
panic = 'abort'
incremental = false
overflow-checks = true
```

### Create Module Structure

```bash
mkdir -p src/{market,operations,interest,health,helpers,query}
touch src/{market,operations,interest,health,helpers,query}/mod.rs
```

---

## Step 2: Define Core Types (2-3 hours)

### src/msg.rs

```rust
use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Coin, Decimal, Uint128};
use crate::state::InterestRateModel;

#[cw_serde]
pub struct InstantiateMsg {
    pub owner: String,
    pub protocol_fee_collector: String,
    pub market_creation_fee: Coin,
}

#[cw_serde]
pub enum ExecuteMsg {
    CreateMarket {
        collateral_denom: String,
        debt_denom: String,
        oracle: String,
        params: CreateMarketParams,
        salt: Option<u64>,
    },
    UpdateMarketParams {
        market_id: String,
        updates: MarketParamsUpdate,
    },
    Supply {
        market_id: String,
        recipient: Option<String>,
    },
    Withdraw {
        market_id: String,
        amount: Option<Uint128>,
        recipient: Option<String>,
    },
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
        amount: Option<Uint128>,
        on_behalf_of: Option<String>,
    },
    Liquidate {
        market_id: String,
        borrower: String,
        max_debt_to_repay: Option<Uint128>,
    },
    UpdateOwner(mars_owner::OwnerUpdate),
    UpdateConfig {
        protocol_fee_collector: Option<String>,
        market_creation_fee: Option<Coin>,
    },
}

#[cw_serde]
pub struct CreateMarketParams {
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
pub struct MarketParamsUpdate {
    pub interest_rate_model: Option<InterestRateModel>,
    pub curator_fee: Option<Decimal>,
    pub supply_cap: Option<Uint128>,
    pub borrow_cap: Option<Uint128>,
    pub enabled: Option<bool>,
    pub loan_to_value: Option<Decimal>,  // Only if is_mutable
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(ConfigResponse)]
    Config {},

    #[returns(MarketResponse)]
    Market { market_id: String },

    #[returns(MarketsResponse)]
    Markets {
        start_after: Option<String>,
        limit: Option<u32>,
    },

    #[returns(MarketParamsResponse)]
    MarketParams { market_id: String },

    #[returns(UserPositionResponse)]
    UserPosition {
        market_id: String,
        user: String,
    },

    #[returns(UserPositionsResponse)]
    UserPositions {
        user: String,
        start_after: Option<String>,
        limit: Option<u32>,
    },

    #[returns(Uint128)]
    UserSupply {
        market_id: String,
        user: String,
    },

    #[returns(Uint128)]
    UserCollateral {
        market_id: String,
        user: String,
    },

    #[returns(Uint128)]
    UserDebt {
        market_id: String,
        user: String,
    },

    #[returns(MarketTotalsResponse)]
    MarketTotals { market_id: String },
}

// Response types
#[cw_serde]
pub struct ConfigResponse {
    pub owner: Addr,
    pub protocol_fee_collector: Addr,
    pub market_creation_fee: Coin,
}

#[cw_serde]
pub struct MarketResponse {
    pub market_id: String,
    pub collateral_denom: String,
    pub debt_denom: String,
    pub curator: Addr,
    pub borrow_index: Decimal,
    pub liquidity_index: Decimal,
    pub borrow_rate: Decimal,
    pub liquidity_rate: Decimal,
    pub total_supply: Uint128,
    pub total_debt: Uint128,
    pub total_collateral: Uint128,
    pub last_update: u64,
    pub created_at: u64,
}

#[cw_serde]
pub struct MarketsResponse {
    pub markets: Vec<MarketResponse>,
}

#[cw_serde]
pub struct MarketParamsResponse {
    pub collateral_denom: String,
    pub debt_denom: String,
    pub curator: Addr,
    pub oracle: Addr,
    pub loan_to_value: Decimal,
    pub liquidation_threshold: Decimal,
    pub liquidation_bonus: Decimal,
    pub liquidation_protocol_fee: Decimal,
    pub close_factor: Decimal,
    pub protocol_fee: Decimal,
    pub curator_fee: Decimal,
    pub supply_cap: Option<Uint128>,
    pub borrow_cap: Option<Uint128>,
    pub is_mutable: bool,
    pub enabled: bool,
}

#[cw_serde]
pub struct UserPositionResponse {
    pub market_id: String,
    pub collateral_amount: Uint128,
    pub supply_amount: Uint128,
    pub debt_amount: Uint128,
    pub health_factor: Option<Decimal>,
}

#[cw_serde]
pub struct UserPositionsResponse {
    pub positions: Vec<UserPositionResponse>,
}

#[cw_serde]
pub struct MarketTotalsResponse {
    pub total_supply: Uint128,
    pub total_debt: Uint128,
    pub total_collateral: Uint128,
    pub utilization: Decimal,
}
```

### src/state.rs

```rust
use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Coin, Decimal, Uint128};
use cw_storage_plus::{Item, Map};
use mars_owner::Owner;

pub const OWNER: Owner = Owner::new("owner");
pub const CONFIG: Item<Config> = Item::new("config");
pub const MARKETS: Map<&str, Market> = Map::new("markets");
pub const MARKET_PARAMS: Map<&str, MarketParams> = Map::new("market_params");
pub const SUPPLIES: Map<(&str, &Addr), Uint128> = Map::new("supplies");
pub const COLLATERAL: Map<(&str, &Addr), Uint128> = Map::new("collateral");
pub const DEBTS: Map<(&str, &Addr), Uint128> = Map::new("debts");

#[cw_serde]
pub struct Config {
    pub protocol_fee_collector: Addr,
    pub market_creation_fee: Coin,
}

#[cw_serde]
pub struct Market {
    pub market_id: String,
    pub collateral_denom: String,
    pub debt_denom: String,
    pub curator: Addr,
    pub borrow_index: Decimal,
    pub liquidity_index: Decimal,
    pub borrow_rate: Decimal,
    pub liquidity_rate: Decimal,
    pub total_supply_scaled: Uint128,
    pub total_debt_scaled: Uint128,
    pub total_collateral: Uint128,
    pub last_update: u64,
    pub created_at: u64,
}

#[cw_serde]
pub struct MarketParams {
    pub collateral_denom: String,
    pub debt_denom: String,
    pub curator: Addr,
    pub oracle: Addr,
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
    pub ltv_last_update: u64,
    pub enabled: bool,
}

#[cw_serde]
pub enum InterestRateModel {
    Linear {
        optimal_utilization: Decimal,
        base_rate: Decimal,
        slope_1: Decimal,
        slope_2: Decimal,
    },
}
```

### src/error.rs

Copy from technical architecture document (complete error types).

---

## Step 3: Implement Contract Entry Points (2-3 hours)

### src/contract.rs

```rust
#[cfg(not(feature = "library"))]
use cosmwasm_std::entry_point;
use cosmwasm_std::{Binary, Deps, DepsMut, Env, MessageInfo, Response, StdResult};
use cw2::set_contract_version;

use crate::error::ContractError;
use crate::msg::{ExecuteMsg, InstantiateMsg, QueryMsg};
use crate::state::{Config, CONFIG, OWNER};

const CONTRACT_NAME: &str = "crates.io:isolated-markets";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    let protocol_fee_collector = deps.api.addr_validate(&msg.protocol_fee_collector)?;

    let config = Config {
        protocol_fee_collector,
        market_creation_fee: msg.market_creation_fee,
    };
    CONFIG.save(deps.storage, &config)?;

    let owner = deps.api.addr_validate(&msg.owner)?;
    OWNER.initialize(deps.storage, deps.api, owner)?;

    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("owner", msg.owner)
        .add_attribute("protocol_fee_collector", config.protocol_fee_collector))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::CreateMarket { collateral_denom, debt_denom, oracle, params, salt } => {
            crate::market::create::execute(deps, env, info, collateral_denom, debt_denom, oracle, params, salt)
        }
        ExecuteMsg::Supply { market_id, recipient } => {
            crate::operations::supply::execute_supply(deps, env, info, market_id, recipient)
        }
        ExecuteMsg::Borrow { market_id, amount, recipient } => {
            crate::operations::borrow::execute_borrow(deps, env, info, market_id, amount, recipient)
        }
        // ... other execute handlers
        _ => unimplemented!("Handler not yet implemented"),
    }
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Config {} => to_json_binary(&crate::query::query_config(deps)?),
        QueryMsg::Market { market_id } => {
            to_json_binary(&crate::query::market::query_market(deps, env, market_id)?)
        }
        // ... other query handlers
        _ => unimplemented!("Query not yet implemented"),
    }
}
```

---

## Step 4: Implement Market Creation (4-6 hours)

Create the following files in order:

1. **src/helpers/math.rs** - Constants and math helpers
2. **src/market/validation.rs** - Parameter validation
3. **src/health/oracle.rs** - Oracle price queries
4. **src/market/create.rs** - Market creation logic

Follow the pseudocode in the Technical Architecture document.

**Key Points:**
- Use SHA256 for market ID generation
- Validate all parameters thoroughly
- Test oracle before storing market
- Handle creation fee payment

---

## Step 5: Implement Supply/Withdraw (3-4 hours)

### src/operations/supply.rs

Implement:
- `execute_supply()` - Supply debt assets
- `execute_withdraw()` - Withdraw debt assets

**Key Points:**
- Apply interest before calculations
- Use scaled amounts for storage
- Check supply caps
- Update market totals
- Update interest rates after operation

---

## Step 6: Implement Collateral Operations (2-3 hours)

### src/operations/collateral.rs

Implement:
- `execute_supply_collateral()` - Supply collateral
- `execute_withdraw_collateral()` - Withdraw collateral

**Key Points:**
- Collateral is NOT scaled (no interest earned)
- Check health factor on withdrawal if user has debt
- Update market totals

---

## Step 7: Implement Borrow/Repay (4-5 hours)

### src/operations/borrow.rs

Implement `execute_borrow()`

**Critical:**
- Check health factor AFTER updating debt
- Use LTV for borrow checks
- Check available liquidity
- Check borrow caps

### src/operations/repay.rs

Implement `execute_repay()`

**Key Points:**
- Allow repaying more than owed (refund excess)
- Allow repaying on behalf of another user
- Remove debt entry if fully repaid

---

## Step 8: Implement Interest Rate Module (5-6 hours)

### src/interest/models.rs

Implement `calculate_borrow_rate()` for Linear model

### src/interest/rates.rs

Implement `update_interest_rates()`

### src/interest/accrual.rs

Implement `apply_accumulated_interests()`

**Critical:**
- This is called before EVERY operation
- Must handle edge cases (zero supply, zero debt)
- Fee distribution to protocol and curator
- Update both indices correctly

---

## Step 9: Implement Health & Liquidation (5-7 hours)

### src/health/calculation.rs

Implement:
- `calculate_health_factor()`
- `check_health_factor()`

### src/operations/liquidate.rs

Implement `execute_liquidate()`

**Critical:**
- Verify position is unhealthy (health < 1.0)
- Calculate liquidation amounts correctly
- Respect close factor
- Transfer bonus to liquidator
- Transfer protocol fee
- Handle partial liquidations

---

## Step 10: Implement Queries (3-4 hours)

### src/query/mod.rs

Implement all query functions:
- `query_config()`
- `query_market()`
- `query_markets()` (with pagination)
- `query_market_params()`
- `query_user_position()`
- `query_user_positions()` (with pagination)
- Individual position queries

**Key Points:**
- Apply interest for accurate results
- Calculate underlying amounts from scaled
- Handle non-existent positions gracefully

---

## Step 11: Write Tests (8-10 hours)

### Unit Tests

For each module:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};

    #[test]
    fn test_function_name() {
        // Setup
        let mut deps = mock_dependencies();

        // Execute
        let result = function_to_test(...);

        // Assert
        assert!(result.is_ok());
    }
}
```

### Integration Tests

Create `tests/integration_tests.rs`:

```rust
use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
use isolated_markets::contract::{execute, instantiate, query};
use isolated_markets::msg::*;

#[test]
fn test_full_lending_flow() {
    let mut deps = mock_dependencies();

    // 1. Instantiate
    // 2. Create market
    // 3. Supply
    // 4. Supply collateral
    // 5. Borrow
    // 6. Fast forward time
    // 7. Repay with interest
    // 8. Withdraw
}
```

---

## Step 12: Schema Generation (1 hour)

### examples/schema.rs

```rust
use cosmwasm_schema::write_api;
use isolated_markets::msg::{ExecuteMsg, InstantiateMsg, QueryMsg};

fn main() {
    write_api! {
        instantiate: InstantiateMsg,
        execute: ExecuteMsg,
        query: QueryMsg,
    }
}
```

Generate schemas:

```bash
cargo schema
```

---

## Step 13: Build & Test (2-3 hours)

### Build

```bash
# Build for development
cargo build

# Build optimized WASM
cargo wasm

# Build release WASM (requires docker)
docker run --rm -v "$(pwd)":/code \
  --mount type=volume,source="$(basename "$(pwd)")_cache",target=/code/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/rust-optimizer:0.14.0
```

### Run Tests

```bash
# Run all tests
cargo test

# Run specific test
cargo test test_market_creation

# Run with output
cargo test -- --nocapture

# Run integration tests only
cargo test --test integration_tests
```

### Check Coverage

```bash
# Install tarpaulin
cargo install cargo-tarpaulin

# Run coverage
cargo tarpaulin --out Html
```

---

## Common Issues & Solutions

### Issue: Interest accrual overflow

**Solution:** Use Uint256 for intermediate calculations:

```rust
use cosmwasm_std::Uint256;

let large_value = Uint256::from(a) * Uint256::from(b);
let result = (large_value / Uint256::from(c)).try_into()?;
```

### Issue: Health factor edge cases

**Solution:** Handle zero debt specially:

```rust
if debt_amount.is_zero() {
    return Ok(Decimal::MAX);  // Infinite health
}
```

### Issue: Rounding errors in scaled amounts

**Solution:** Always round in protocol's favor:

```rust
// When calculating debt (favor protocol = round up)
let scaled_debt = amount.checked_div_ceil(index)?;

// When calculating repayment (favor protocol = round down)
let underlying_debt = scaled.checked_mul_floor(index)?;
```

---

## Debugging Tips

### 1. Add Debug Logs

```rust
#[cfg(test)]
use cosmwasm_std::testing::MOCK_CONTRACT_ADDR;

println!("Debug: market_id={}, amount={}", market_id, amount);
```

### 2. Use Response Attributes

```rust
Response::new()
    .add_attribute("debug_borrow_index", market.borrow_index.to_string())
    .add_attribute("debug_health_factor", health_factor.to_string())
```

### 3. Write Focused Tests

```rust
#[test]
fn test_specific_edge_case() {
    // Minimal setup for specific scenario
    // Easier to debug than full integration test
}
```

---

## Implementation Order Summary

1. ✅ Project setup (1-2 hours)
2. ✅ Core types (msg, state, error) (2-3 hours)
3. ✅ Contract entry points (2-3 hours)
4. ✅ Market creation (4-6 hours)
5. ✅ Supply/withdraw (3-4 hours)
6. ✅ Collateral operations (2-3 hours)
7. ✅ Borrow/repay (4-5 hours)
8. ✅ Interest rate module (5-6 hours)
9. ✅ Health & liquidation (5-7 hours)
10. ✅ Queries (3-4 hours)
11. ✅ Tests (8-10 hours)
12. ✅ Schema generation (1 hour)
13. ✅ Build & test (2-3 hours)

**Total Estimated Time:** 42-57 hours (5-7 days of focused work)

---

## Next Steps After MVP

Once MVP is complete:

1. **Code review** - Internal review of all code
2. **Gas optimization** - Profile and optimize expensive operations
3. **Documentation** - Document all public APIs
4. **Advanced features** - Implement Phase 2 features
5. **Security review** - Internal security assessment
6. **Testnet deployment** - Deploy to testnet for external testing
7. **External audit** - Hire auditing firm
8. **Mainnet deployment** - Production deployment

---

## Resources

### CosmWasm Documentation
- [CosmWasm Book](https://book.cosmwasm.com/)
- [CosmWasm Docs](https://docs.cosmwasm.com/)
- [cw-plus](https://github.com/CosmWasm/cw-plus)

### Mars Protocol
- [Mars Protocol GitHub](https://github.com/mars-protocol)
- [Red Bank Contract](https://github.com/mars-protocol/red-bank)

### Tools
- [CosmWasm IDE](https://ide.cosmwasm.com/)
- [LocalOsmosis](https://github.com/osmosis-labs/LocalOsmosis)

---

**Good luck with implementation! Follow this guide sequentially for best results.**

**Document Version:** 1.0
**Last Updated:** 2026-01-15
