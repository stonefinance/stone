# Implementation Checklist

Use this checklist to track your progress implementing the Isolated Markets protocol.

## Phase 0: Preparation

- [ ] Read [README.md](README.md) - understand why factory pattern
- [ ] Read [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - learn state structures
- [ ] Read [GETTING_STARTED.md](GETTING_STARTED.md) - understand implementation steps
- [ ] Read [FACTORY_PATTERN_CHANGES.md](docs/FACTORY_PATTERN_CHANGES.md) - understand architectural changes
- [ ] Review [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md) - visualize the system
- [ ] Study `contracts-reference/red-bank/interest_rates.rs` - interest accrual
- [ ] Study `contracts-reference/red-bank/borrow.rs` - borrow logic
- [ ] Study `contracts-reference/red-bank/liquidate.rs` - liquidation logic
- [ ] Study `contracts-reference/red-bank/health.rs` - health factor calculations

## Phase 1: Project Setup (1-2 hours)

- [ ] Create new CosmWasm project
  ```bash
  cargo new isolated-markets --lib
  cd isolated-markets
  ```
- [ ] Set up workspace structure
  - [ ] `contracts/factory/`
  - [ ] `contracts/market/`
  - [ ] `packages/types/`
  - [ ] `packages/testing/`
- [ ] Configure `Cargo.toml` workspace
- [ ] Add dependencies (cosmwasm-std, cw-storage-plus, etc.)
- [ ] Set up CI/CD pipeline
- [ ] Initialize git repository

## Phase 2: Types Package (2-3 hours)

### Market Types

- [ ] `packages/types/src/market/mod.rs`
- [ ] `packages/types/src/market/msg.rs`
  - [ ] `InstantiateMsg`
  - [ ] `ExecuteMsg` (Supply, Withdraw, Borrow, Repay, etc.)
  - [ ] `QueryMsg` with `QueryResponses`
  - [ ] Response types
- [ ] `packages/types/src/market/state.rs`
  - [ ] `MarketState` struct
  - [ ] `InterestRateModel` struct
  - [ ] `MarketParams` struct
  - [ ] `MarketParamsUpdate` struct

### Factory Types

- [ ] `packages/types/src/factory/mod.rs`
- [ ] `packages/types/src/factory/msg.rs`
  - [ ] `InstantiateMsg`
  - [ ] `ExecuteMsg` (CreateMarket, UpdateMarketCodeId, UpdateConfig)
  - [ ] `QueryMsg` with `QueryResponses`
  - [ ] Response types
- [ ] `packages/types/src/factory/state.rs`
  - [ ] `Config` struct
  - [ ] `CreateMarketParams` struct

### Shared Types

- [ ] `packages/types/src/error.rs` - Common error types
- [ ] `packages/types/src/lib.rs` - Re-exports

## Phase 3: Market Contract - Core State (1-2 hours)

- [ ] `contracts/market/src/state.rs`
  - [ ] `STATE: Item<MarketState>`
  - [ ] `SUPPLIES: Map<&Addr, Uint128>` (NO market_id!)
  - [ ] `COLLATERAL: Map<&Addr, Uint128>`
  - [ ] `DEBTS: Map<&Addr, Uint128>`
- [ ] `contracts/market/src/error.rs`
  - [ ] All error variants
  - [ ] Conversions from std errors
- [ ] `contracts/market/src/lib.rs`
  - [ ] Module declarations
  - [ ] Re-exports

## Phase 4: Market Contract - Interest Rate Logic (3-4 hours)

Based on `contracts-reference/red-bank/interest_rates.rs`

- [ ] `contracts/market/src/interest.rs`
  - [ ] `update_interest_indices()` - Core function
  - [ ] `calculate_borrow_rate()` - From interest rate model
  - [ ] `calculate_liquidity_rate()` - From borrow rate minus fees
  - [ ] `get_scaled_liquidity_amount()` - amount / index
  - [ ] `get_liquidity_amount()` - scaled * index
  - [ ] `get_scaled_debt_amount()` - amount / index
  - [ ] `get_debt_amount()` - scaled * index
- [ ] Unit tests for interest calculations
  - [ ] Test index updates
  - [ ] Test scaled conversions
  - [ ] Test rate calculations
  - [ ] Test edge cases (zero utilization, 100% utilization)

## Phase 5: Market Contract - Health & Oracle (2-3 hours)

Based on `contracts-reference/red-bank/health.rs`

- [ ] `contracts/market/src/health.rs`
  - [ ] `calculate_health_factor()` - Main function
  - [ ] `query_oracle_price()` - Query price from oracle
  - [ ] `validate_ltv()` - Check LTV constraint
  - [ ] Helper functions
- [ ] `contracts/market/src/oracle.rs` (optional separate file)
  - [ ] Oracle interface
  - [ ] Price queries
  - [ ] Error handling
- [ ] Unit tests
  - [ ] Test health factor calculations
  - [ ] Test with various price scenarios
  - [ ] Test edge cases (zero price, extreme prices)

## Phase 6: Market Contract - Supply/Withdraw (4-5 hours)

Based on `contracts-reference/red-bank/deposit.rs` and `withdraw.rs`

- [ ] `contracts/market/src/execute/supply.rs`
  - [ ] `execute_supply()` - Main function
  - [ ] Validate funds sent
  - [ ] Update interest indices
  - [ ] Calculate scaled amount
  - [ ] Update user supply
  - [ ] Update total supply
  - [ ] Emit events
- [ ] `contracts/market/src/execute/withdraw.rs`
  - [ ] `execute_withdraw()` - Main function
  - [ ] Update interest indices
  - [ ] Calculate withdrawable amount
  - [ ] Check liquidity available
  - [ ] Update user supply
  - [ ] Update total supply
  - [ ] Transfer tokens
  - [ ] Emit events
- [ ] Unit tests
  - [ ] Test supply flow
  - [ ] Test withdraw flow
  - [ ] Test insufficient liquidity
  - [ ] Test withdraw all
  - [ ] Test multiple users

## Phase 7: Market Contract - Collateral (3-4 hours)

Based on `contracts-reference/red-bank/collateral.rs`

- [ ] `contracts/market/src/execute/collateral.rs`
  - [ ] `execute_supply_collateral()` - Simpler (no scaling)
  - [ ] `execute_withdraw_collateral()` - Check health factor
  - [ ] Helper functions
- [ ] Unit tests
  - [ ] Test supply collateral
  - [ ] Test withdraw collateral
  - [ ] Test health factor check on withdrawal
  - [ ] Test edge cases

## Phase 8: Market Contract - Borrow/Repay (5-6 hours)

Based on `contracts-reference/red-bank/borrow.rs` and `repay.rs`

- [ ] `contracts/market/src/execute/borrow.rs`
  - [ ] `execute_borrow()` - Main function
  - [ ] Update interest indices
  - [ ] Load user collateral and debt
  - [ ] Calculate new health factor
  - [ ] Check LTV constraint
  - [ ] Update debt (scaled)
  - [ ] Update total debt
  - [ ] Transfer tokens
  - [ ] Emit events
- [ ] `contracts/market/src/execute/repay.rs`
  - [ ] `execute_repay()` - Main function
  - [ ] Update interest indices
  - [ ] Validate funds sent
  - [ ] Calculate repay amount (handle None = full repay)
  - [ ] Update debt (scaled)
  - [ ] Update total debt
  - [ ] Handle overpayment
  - [ ] Emit events
- [ ] Unit tests
  - [ ] Test borrow flow
  - [ ] Test borrow LTV check
  - [ ] Test repay flow
  - [ ] Test repay all
  - [ ] Test repay on behalf of
  - [ ] Test interest accrual between borrow and repay

## Phase 9: Market Contract - Liquidation (6-8 hours)

Based on `contracts-reference/red-bank/liquidate.rs` with protocol fee addition

- [ ] `contracts/market/src/execute/liquidate.rs`
  - [ ] `execute_liquidate()` - Main function
  - [ ] Update interest indices
  - [ ] Calculate borrower health factor
  - [ ] Verify health_factor < 1.0
  - [ ] Calculate max liquidatable debt (close_factor)
  - [ ] Calculate collateral to seize:
    - [ ] Base collateral value
    - [ ] Liquidator bonus
    - [ ] Protocol fee
  - [ ] Update borrower debt (scaled)
  - [ ] Update borrower collateral
  - [ ] Update totals
  - [ ] Transfer tokens:
    - [ ] Debt from liquidator to contract
    - [ ] Collateral to liquidator (with bonus)
    - [ ] Protocol fee to collector
  - [ ] Emit detailed events
- [ ] Unit tests
  - [ ] Test liquidation flow
  - [ ] Test health factor check
  - [ ] Test close factor
  - [ ] Test collateral calculations
  - [ ] Test bonus distributions
  - [ ] Test protocol fee
  - [ ] Test edge cases (full liquidation, small liquidation)

## Phase 10: Market Contract - Parameter Updates (2-3 hours)

- [ ] `contracts/market/src/execute/update_params.rs`
  - [ ] `execute_update_params()` - Main function
  - [ ] Verify curator
  - [ ] Validate LTV update (if mutable):
    - [ ] Check is_mutable flag
    - [ ] Check cooldown period
    - [ ] Check max change (±5%)
    - [ ] Check bounds
    - [ ] Update ltv_last_update
  - [ ] Validate other params
  - [ ] Update state
  - [ ] Emit events
- [ ] Unit tests
  - [ ] Test curator updates
  - [ ] Test unauthorized attempts
  - [ ] Test LTV updates (mutable markets)
  - [ ] Test LTV update rejection (immutable markets)
  - [ ] Test cooldown enforcement
  - [ ] Test bounds enforcement

## Phase 11: Market Contract - Entry Points (2-3 hours)

- [ ] `contracts/market/src/contract.rs`
  - [ ] `instantiate()` - Initialize market
    - [ ] Validate all parameters
    - [ ] Initialize indices = 1.0
    - [ ] Initialize totals = 0
    - [ ] Save state
    - [ ] Emit event
  - [ ] `execute()` - Route execute messages
  - [ ] `query()` - Route query messages
  - [ ] `migrate()` - Migration logic (optional)

## Phase 12: Market Contract - Queries (3-4 hours)

- [ ] `contracts/market/src/query.rs`
  - [ ] `query_market_state()` - Return full market state
  - [ ] `query_user_position()` - All user positions
    - [ ] Update indices for accurate values
    - [ ] Calculate current supply
    - [ ] Calculate current debt
    - [ ] Return collateral
  - [ ] `query_user_debt()` - Just debt
  - [ ] `query_user_collateral()` - Just collateral
  - [ ] `query_utilization()` - Current utilization rate
  - [ ] `query_interest_rates()` - Current rates
  - [ ] `query_health_factor()` - User health factor
- [ ] Unit tests for all queries

## Phase 13: Factory Contract - State & Types (1-2 hours)

- [ ] `contracts/factory/src/state.rs`
  - [ ] `CONFIG: Item<Config>`
  - [ ] `MARKETS: Map<u64, Addr>`
  - [ ] `MARKET_COUNTER: Item<u64>`
  - [ ] `MARKETS_BY_CURATOR: Map<&Addr, Vec<Addr>>`
  - [ ] `MARKETS_BY_PAIR: Map<(&str, &str), Vec<Addr>>`
- [ ] `contracts/factory/src/error.rs`
  - [ ] Factory-specific errors

## Phase 14: Factory Contract - Market Creation (4-5 hours)

- [ ] `contracts/factory/src/execute.rs`
  - [ ] `execute_create_market()` - Main function
    - [ ] Load config
    - [ ] Validate creation fee paid
    - [ ] Validate market params:
      - [ ] collateral_denom != debt_denom
      - [ ] LTV < liquidation_threshold < 1.0
      - [ ] Bonus/fee bounds
      - [ ] Fee constraints
    - [ ] Validate oracle (test queries):
      - [ ] Query collateral price
      - [ ] Query debt price
    - [ ] Increment market counter
    - [ ] Create market instantiate message
    - [ ] Submit as SubMsg with reply
  - [ ] `reply_instantiate_market()` - Reply handler
    - [ ] Parse contract address from reply
    - [ ] Store in MARKETS
    - [ ] Update indices (curator, pair)
    - [ ] Transfer creation fee to collector
    - [ ] Emit event
- [ ] Helper functions
  - [ ] `validate_market_params()`
  - [ ] `validate_oracle()`
  - [ ] `validate_creation_fee()`

## Phase 15: Factory Contract - Config Updates (1-2 hours)

- [ ] `contracts/factory/src/execute.rs` (continued)
  - [ ] `execute_update_market_code_id()` - Owner only
  - [ ] `execute_update_config()` - Owner only
    - [ ] Update market_creation_fee
    - [ ] Update protocol_fee_collector

## Phase 16: Factory Contract - Entry Points & Queries (2-3 hours)

- [ ] `contracts/factory/src/contract.rs`
  - [ ] `instantiate()` - Initialize factory
  - [ ] `execute()` - Route messages
  - [ ] `query()` - Route queries
  - [ ] `reply()` - Handle instantiate reply
- [ ] `contracts/factory/src/query.rs`
  - [ ] `query_config()` - Return config
  - [ ] `query_markets()` - List all markets (paginated)
  - [ ] `query_markets_by_curator()` - Filter by curator
  - [ ] `query_markets_by_pair()` - Filter by collateral/debt pair
  - [ ] `query_market_count()` - Total markets created

## Phase 17: Unit Tests - Market Contract (10-12 hours)

- [ ] `contracts/market/src/tests/`
  - [ ] `test_instantiate.rs`
  - [ ] `test_supply.rs`
  - [ ] `test_withdraw.rs`
  - [ ] `test_collateral.rs`
  - [ ] `test_borrow.rs`
  - [ ] `test_repay.rs`
  - [ ] `test_liquidate.rs`
  - [ ] `test_interest.rs`
  - [ ] `test_health.rs`
  - [ ] `test_update_params.rs`
  - [ ] `test_queries.rs`

## Phase 18: Unit Tests - Factory Contract (3-4 hours)

- [ ] `contracts/factory/src/tests/`
  - [ ] `test_instantiate.rs`
  - [ ] `test_create_market.rs`
  - [ ] `test_update_config.rs`
  - [ ] `test_queries.rs`

## Phase 19: Integration Tests (15-20 hours)

- [ ] Set up `packages/testing/src/`
  - [ ] Mock helpers
  - [ ] Test setup utilities
- [ ] Integration test suite
  - [ ] `tests/test_full_flow.rs`
    - [ ] Deploy factory
    - [ ] Create market
    - [ ] User supplies
    - [ ] User borrows
    - [ ] Interest accrues
    - [ ] User repays
    - [ ] User withdraws
  - [ ] `tests/test_liquidation.rs`
    - [ ] Setup borrower position
    - [ ] Simulate price drop
    - [ ] Execute liquidation
    - [ ] Verify collateral distribution
  - [ ] `tests/test_market_isolation.rs`
    - [ ] Create two markets with same debt asset
    - [ ] Simulate bad debt in one
    - [ ] Verify other market unaffected
  - [ ] `tests/test_multiple_users.rs`
    - [ ] Multiple lenders
    - [ ] Multiple borrowers
    - [ ] Verify accounting
  - [ ] `tests/test_parameter_updates.rs`
    - [ ] Mutable market LTV updates
    - [ ] Immutable market restrictions
    - [ ] Curator fee updates
  - [ ] `tests/test_edge_cases.rs`
    - [ ] First depositor
    - [ ] Full liquidation
    - [ ] Zero amounts
    - [ ] Oracle failures

## Phase 20: Property-Based Testing (Optional, 4-6 hours)

- [ ] Set up proptest
- [ ] Property tests
  - [ ] Invariant: total_supply_scaled * liquidity_index >= sum(user_supplies)
  - [ ] Invariant: total_debt_scaled * borrow_index >= sum(user_debts)
  - [ ] Invariant: contract_balance >= required_balance
  - [ ] Invariant: indices never decrease
  - [ ] Invariant: liquidations improve health factor

## Phase 21: Schema Generation (1 hour)

- [ ] Generate schemas for factory
  ```bash
  cd contracts/factory && cargo schema
  ```
- [ ] Generate schemas for market
  ```bash
  cd contracts/market && cargo schema
  ```
- [ ] Verify schemas in `contracts/*/schema/`
- [ ] Commit schemas to repo

## Phase 22: Documentation (4-6 hours)

- [ ] Write contract documentation
  - [ ] Factory contract README
  - [ ] Market contract README
  - [ ] Examples
- [ ] Write deployment guide
- [ ] Write integration guide for frontends
- [ ] Update all specs with any changes
- [ ] Document deviations from original design

## Phase 23: Optimization (3-5 hours)

- [ ] Profile gas usage
- [ ] Optimize hot paths
- [ ] Minimize storage reads/writes
- [ ] Review for unnecessary computations
- [ ] Consider caching frequently accessed data

## Phase 24: Security Review Preparation (3-4 hours)

- [ ] Document all assumptions
- [ ] Document known limitations
- [ ] Create threat model
- [ ] List critical invariants
- [ ] Prepare security questionnaire
- [ ] Self-review checklist:
  - [ ] Integer overflow protection
  - [ ] Reentrancy (not applicable in CosmWasm but check)
  - [ ] Access control
  - [ ] Input validation
  - [ ] Oracle manipulation resistance
  - [ ] Front-running considerations

## Phase 25: Local Testing (2-3 hours)

- [ ] Set up local test environment (LocalOsmosis or wasmd)
- [ ] Build optimized WASM
  ```bash
  docker run --rm -v "$(pwd)":/code \
    --mount type=volume,source="$(basename "$(pwd)")_cache",target=/code/target \
    --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
    cosmwasm/rust-optimizer:0.12.13
  ```
- [ ] Verify WASM
  ```bash
  cosmwasm-check artifacts/factory.wasm
  cosmwasm-check artifacts/market.wasm
  ```
- [ ] Upload to local chain
- [ ] Instantiate factory
- [ ] Create test markets
- [ ] Perform all operations manually
- [ ] Verify correct behavior

## Phase 26: Testnet Deployment (4-6 hours)

- [ ] Select testnet (Osmosis testnet, Neutron testnet, etc.)
- [ ] Get testnet tokens
- [ ] Upload contracts to testnet
- [ ] Record code IDs
- [ ] Instantiate factory
- [ ] Create initial test markets
- [ ] Invite users to test
- [ ] Monitor for issues
- [ ] Iterate on feedback

## Phase 27: Security Audit (External, 4-8 weeks)

- [ ] Select audit firm (Oak Security, Halborn, etc.)
- [ ] Provide documentation
- [ ] Provide test coverage reports
- [ ] Answer auditor questions
- [ ] Review audit findings
- [ ] Implement fixes
- [ ] Re-audit critical changes
- [ ] Receive final audit report

## Phase 28: Mainnet Preparation (1-2 weeks)

- [ ] Address all audit findings
- [ ] Final code freeze
- [ ] Final testing round
- [ ] Prepare deployment scripts
- [ ] Prepare monitoring/alerting
- [ ] Prepare emergency procedures
- [ ] Prepare documentation for users
- [ ] Set mainnet parameters:
  - [ ] market_creation_fee (e.g., 100-1000 USD equivalent)
  - [ ] protocol_fee_collector address
  - [ ] owner address

## Phase 29: Mainnet Deployment

- [ ] Upload contracts to mainnet
- [ ] Verify contract hashes match audited code
- [ ] Instantiate factory with production config
- [ ] Create initial markets (if applicable)
- [ ] Announce to community
- [ ] Monitor closely for first 48 hours
- [ ] Have emergency response team on standby

## Phase 30: Post-Launch (Ongoing)

- [ ] Monitor metrics
- [ ] Respond to user feedback
- [ ] Plan upgrades
- [ ] Community building
- [ ] Integrations (frontends, aggregators, etc.)
- [ ] Analytics/indexer setup

---

## Estimated Timeline

| Phase | Time Estimate | Cumulative |
|-------|--------------|------------|
| 0-2 (Prep & Setup) | 3-5 hours | 5 hours |
| 3-12 (Market Contract) | 30-40 hours | 45 hours |
| 13-16 (Factory Contract) | 8-12 hours | 57 hours |
| 17-19 (Testing) | 28-36 hours | 93 hours |
| 20-24 (Optimization & Security) | 15-20 hours | 113 hours |
| 25-26 (Deployment) | 6-9 hours | 122 hours |
| **Total (MVP to Testnet)** | **~120 hours** | - |

With a team of 2-3 developers: **3-4 weeks to testnet deployment**

Audit + Mainnet: Additional **6-10 weeks**

---

## Progress Tracking

Track your progress by checking off items as you complete them. Use this as a living document throughout your implementation.

Good luck! 🚀
