# Stone Finance - Project Plan

## Overview

Stone Finance is a monorepo containing the Isolated Markets lending protocol and associated infrastructure. The core product is a Morpho-inspired isolated lending system using a factory pattern where each market is deployed as a separate contract instance.

**Key Innovation:** True isolation - each market has its own contract address and token balances, preventing bad debt contagion between markets.

---

## Repository Structure

```
stone-finance/
├── README.md                           # Project overview
├── PROJECT_PLAN.md                     # This document
├── Cargo.toml                          # Workspace root
├── rustfmt.toml                        # Rust formatting config
├── .cargo/config.toml                  # Cargo configuration
│
├── contracts/                          # CosmWasm smart contracts
│   ├── factory/                        # Factory contract - deploys markets
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── contract.rs             # Entry points
│   │       ├── execute.rs              # Execute handlers
│   │       ├── query.rs                # Query handlers
│   │       ├── state.rs                # Storage definitions
│   │       └── error.rs                # Error types
│   │
│   └── market/                         # Individual market contract
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           ├── contract.rs             # Entry points
│           ├── execute/                # Execute handlers (modular)
│           │   ├── mod.rs
│           │   ├── supply.rs
│           │   ├── withdraw.rs
│           │   ├── borrow.rs
│           │   ├── repay.rs
│           │   ├── collateral.rs
│           │   ├── liquidate.rs
│           │   └── admin.rs
│           ├── query.rs                # Query handlers
│           ├── state.rs                # Storage definitions
│           ├── interest.rs             # Interest rate logic
│           ├── health.rs               # Health factor calculations
│           └── error.rs                # Error types
│
├── packages/                           # Shared libraries
│   ├── types/                          # Shared type definitions
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── factory.rs              # Factory messages & types
│   │       ├── market.rs               # Market messages & types
│   │       ├── oracle.rs               # Oracle interface types
│   │       └── interest_rate_model.rs  # Interest rate model types
│   │
│   └── testing/                        # Test utilities
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           ├── mock_oracle.rs          # Mock oracle for tests
│           └── helpers.rs              # Test helper functions
│
├── bots/                               # Off-chain infrastructure
│   └── liquidator/                     # Liquidation bot (future)
│       ├── Cargo.toml
│       └── src/
│           └── main.rs
│
├── scripts/                            # Deployment & utility scripts
│   ├── deploy.sh                       # Deployment script
│   ├── optimize.sh                     # WASM optimization
│   └── schema.sh                       # Schema generation
│
├── schemas/                            # Generated JSON schemas
│   ├── factory/
│   └── market/
│
└── isolated-markets-project/           # Existing specs & reference code
    ├── docs/                           # Detailed specifications
    └── contracts-reference/            # Mars Protocol reference
```

---

## Implementation Phases

### Phase 1: Project Setup (Day 1)

**Goal:** Establish the monorepo structure with proper Rust/CosmWasm configuration.

- [ ] Create workspace `Cargo.toml` at root
- [ ] Create `.cargo/config.toml` with wasm32 target settings
- [ ] Create `rustfmt.toml` for consistent formatting
- [ ] Set up `packages/types` crate with basic structure
- [ ] Set up `packages/testing` crate skeleton
- [ ] Set up `contracts/factory` crate skeleton
- [ ] Set up `contracts/market` crate skeleton
- [ ] Create optimization script (`scripts/optimize.sh`)
- [ ] Verify `cargo build` and `cargo test` work

**Deliverables:**
- Compiling workspace with all crates
- Basic CI-ready structure

---

### Phase 2: Types Package (Days 2-3)

**Goal:** Define all shared types, messages, and interfaces.

- [ ] Define `InterestRateModel` enum (Linear model)
- [ ] Define `MarketParams` struct (LTV, liquidation params, fees, caps)
- [ ] Define `Market` struct (indices, totals, timestamps)
- [ ] Define `CreateMarketParams` for market creation
- [ ] Define `MarketParamsUpdate` for curator updates
- [ ] Define Factory `InstantiateMsg`, `ExecuteMsg`, `QueryMsg`
- [ ] Define Market `InstantiateMsg`, `ExecuteMsg`, `QueryMsg`
- [ ] Define Oracle query interface (`PriceResponse`)
- [ ] Define query response types (`UserPosition`, `MarketResponse`, etc.)
- [ ] Add comprehensive documentation comments

**Deliverables:**
- Complete `packages/types` with all message and state types
- JSON schema generation working

---

### Phase 3: Market Contract - Core State & Interest (Days 4-6)

**Goal:** Implement market state management and interest accrual.

- [ ] Implement `state.rs` with storage items:
  - `CONFIG` (oracle, curator, denoms, params)
  - `MARKET` (indices, totals, rates, timestamps)
  - `SUPPLIES` (user → scaled supply amount)
  - `COLLATERAL` (user → collateral amount)
  - `DEBTS` (user → scaled debt amount)
- [ ] Implement `interest.rs`:
  - `calculate_borrow_rate()` using linear model
  - `calculate_liquidity_rate()` from borrow rate and utilization
  - `apply_accumulated_interest()` - update indices and distribute fees
- [ ] Implement `health.rs`:
  - `calculate_health_factor()` for a user position
  - `is_liquidatable()` helper
  - `get_max_borrow()` based on collateral and LTV
- [ ] Implement contract `instantiate` entry point
- [ ] Write unit tests for interest calculations
- [ ] Write unit tests for health factor calculations

**Deliverables:**
- Market contract initializable
- Interest accrual logic tested
- Health calculations tested

---

### Phase 4: Market Contract - Supply & Withdraw (Days 7-8)

**Goal:** Implement lender operations.

- [ ] Implement `execute/supply.rs`:
  - Validate debt asset sent
  - Apply accumulated interest
  - Calculate scaled amount
  - Update user supply and market totals
  - Transfer tokens to contract
- [ ] Implement `execute/withdraw.rs`:
  - Apply accumulated interest
  - Calculate current supply from scaled
  - Check available liquidity
  - Decrease user supply and market totals
  - Transfer tokens to user
- [ ] Implement supply cap validation
- [ ] Write integration tests for supply flow
- [ ] Write integration tests for withdraw flow
- [ ] Test partial and full withdrawals

**Deliverables:**
- Working supply/withdraw operations
- Edge cases tested (caps, liquidity limits)

---

### Phase 5: Market Contract - Collateral Operations (Days 9-10)

**Goal:** Implement collateral management.

- [ ] Implement `execute/collateral.rs`:
  - `supply_collateral()` - deposit collateral asset
  - `withdraw_collateral()` - remove collateral (with LTV check)
- [ ] Implement LTV validation on collateral withdrawal
- [ ] Query oracle for prices during validation
- [ ] Write tests for collateral supply
- [ ] Write tests for collateral withdrawal with debt
- [ ] Test LTV boundary conditions

**Deliverables:**
- Working collateral operations
- Oracle integration tested
- LTV enforcement verified

---

### Phase 6: Market Contract - Borrow & Repay (Days 11-13)

**Goal:** Implement borrower operations.

- [ ] Implement `execute/borrow.rs`:
  - Apply accumulated interest
  - Query oracle for collateral and debt prices
  - Calculate position values
  - Validate against LTV
  - Calculate scaled debt amount
  - Update user debt and market totals
  - Transfer debt asset to user
- [ ] Implement `execute/repay.rs`:
  - Apply accumulated interest
  - Calculate current debt from scaled
  - Handle partial and full repayment
  - Decrease user debt and market totals
  - Refund excess payment
- [ ] Implement borrow cap validation
- [ ] Write integration tests for borrow flow
- [ ] Write integration tests for repay flow
- [ ] Test LTV enforcement on borrow
- [ ] Test interest accrual on debt

**Deliverables:**
- Working borrow/repay operations
- Interest accumulates correctly on debt
- LTV enforcement on borrow

---

### Phase 7: Market Contract - Liquidation (Days 14-16)

**Goal:** Implement liquidation mechanism.

- [ ] Implement `execute/liquidate.rs`:
  - Validate borrower has debt
  - Check position is unhealthy (health < 1.0)
  - Calculate max liquidatable amount (close factor)
  - Calculate collateral to seize (with bonus)
  - Calculate protocol fee portion
  - Update borrower positions
  - Transfer debt from liquidator
  - Transfer collateral to liquidator
  - Transfer protocol fee to collector
- [ ] Implement liquidation events
- [ ] Write tests for liquidation trigger conditions
- [ ] Write tests for partial liquidation
- [ ] Write tests for liquidation amounts and bonuses
- [ ] Test that liquidation improves health factor

**Deliverables:**
- Working liquidation mechanism
- Correct incentive distribution
- Health improvement verified

---

### Phase 8: Market Contract - Queries & Admin (Days 17-18)

**Goal:** Complete market contract functionality.

- [ ] Implement all query handlers:
  - `config()` - market configuration
  - `market()` - current market state with rates
  - `user_position()` - full position with health
  - `user_supply()`, `user_collateral()`, `user_debt()`
  - `market_totals()`
  - `is_liquidatable()`
- [ ] Implement `execute/admin.rs`:
  - `update_params()` - curator parameter updates
  - Validate LTV change limits (±5%, 7-day cooldown)
  - Handle enable/disable market
- [ ] Write query tests
- [ ] Write admin operation tests

**Deliverables:**
- Complete market contract
- All queries working
- Curator controls tested

---

### Phase 9: Factory Contract (Days 19-21)

**Goal:** Implement factory for market deployment.

- [ ] Implement factory `state.rs`:
  - `CONFIG` (owner, fee collector, creation fee, market code ID)
  - `MARKETS` (market_id → contract address)
  - `MARKET_COUNT` (total markets created)
- [ ] Implement `execute.rs`:
  - `create_market()`:
    - Validate parameters
    - Generate market ID (hash-based)
    - Collect creation fee
    - Instantiate market contract
    - Store market address
  - `update_config()` - owner only
  - `update_market_code_id()` - for upgrades
- [ ] Implement `query.rs`:
  - `config()`
  - `market()` - get market address by ID
  - `markets()` - paginated list
  - `market_count()`
- [ ] Write factory unit tests
- [ ] Write factory integration tests

**Deliverables:**
- Factory deploys market contracts
- Market tracking working
- Fee collection working

---

### Phase 10: Testing Package & Integration Tests (Days 22-25)

**Goal:** Comprehensive test coverage.

- [ ] Implement `packages/testing`:
  - Mock oracle contract
  - Test helpers for common operations
  - Multi-contract test setup utilities
- [ ] Write end-to-end integration tests:
  - Full user lifecycle (supply → borrow → repay → withdraw)
  - Multi-user scenarios
  - Liquidation scenarios
  - Market creation via factory
- [ ] Write invariant tests:
  - Total supply ≥ total debt
  - Indices only increase
  - User debt increases with time
  - Liquidation improves health
- [ ] Write edge case tests:
  - Zero amounts
  - Dust amounts
  - Cap limits
  - Price edge cases

**Deliverables:**
- High test coverage (>90%)
- All critical paths tested
- Edge cases handled

---

### Phase 11: Optimization & Documentation (Days 26-28)

**Goal:** Production readiness.

- [ ] Gas optimization review
- [ ] Storage optimization review
- [ ] Generate JSON schemas for all contracts
- [ ] Write deployment documentation
- [ ] Write integration guide for frontends
- [ ] Create example deployment scripts
- [ ] Verify WASM builds optimize correctly
- [ ] Document all error codes

**Deliverables:**
- Optimized contracts
- Complete documentation
- Deployment-ready artifacts

---

### Phase 12: Security Review Prep (Days 29-30)

**Goal:** Prepare for external audit.

- [ ] Internal security review checklist
- [ ] Document known limitations
- [ ] Review all math for overflow/underflow
- [ ] Review all access controls
- [ ] Check reentrancy vectors
- [ ] Document trust assumptions
- [ ] Prepare audit brief

**Deliverables:**
- Security documentation
- Audit-ready codebase

---

## Future Phases (Post-MVP)

### Liquidation Bot
- Implement `bots/liquidator` for automated liquidations
- Price monitoring
- Transaction submission
- Profitability calculations

### Additional Features
- Multiple interest rate models
- Batch operations
- Position migration
- Incentives integration

---

## Dependencies

**Core CosmWasm:**
- `cosmwasm-std` = "2.0"
- `cosmwasm-schema` = "2.0"
- `cw-storage-plus` = "2.0"
- `cw2` = "2.0"

**Utilities:**
- `thiserror` = "1.0"
- `schemars` = "0.8"
- `serde` = "1.0"

**Testing:**
- `cw-multi-test` = "2.0"

---

## Reference Materials

All specifications and reference implementations are in:
- [isolated-markets-project/docs/](isolated-markets-project/docs/) - Detailed specs
- [isolated-markets-project/contracts-reference/](isolated-markets-project/contracts-reference/) - Mars Protocol reference code
- [isolated-markets-project/QUICK_REFERENCE.md](isolated-markets-project/QUICK_REFERENCE.md) - Developer cheat sheet

---

## Getting Started

1. **Read the spec:** Start with `isolated-markets-project/PROJECT_SUMMARY.md`
2. **Understand the architecture:** Review `isolated-markets-project/ARCHITECTURE_DIAGRAMS.md`
3. **Follow implementation guide:** Use `isolated-markets-project/GETTING_STARTED.md`
4. **Reference Mars code:** Adapt patterns from `isolated-markets-project/contracts-reference/`

---

## Success Criteria

- [ ] All contracts compile to WASM
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Gas usage is reasonable
- [ ] Documentation is complete
- [ ] Security review completed
- [ ] Testnet deployment successful

---

**Document Version:** 1.0
**Created:** 2025-01-18
**Status:** Ready for Implementation
