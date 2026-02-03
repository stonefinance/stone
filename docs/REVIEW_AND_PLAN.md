# Stone Finance — Security Review & Remaining Work Plan

**Reviewer:** 🔍 Claude Opus 4.5 Reviewer  
**Date:** 2026-02-02  
**Scope:** All Rust source in `contracts/`, `packages/` (~7,244 lines)  
**Commit:** HEAD of main branch

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Security Findings](#2-security-findings)
   - [Critical](#21-critical)
   - [Important](#22-important)
   - [Suggestions](#23-suggestions)
3. [Code Quality Assessment](#3-code-quality-assessment)
4. [Remaining Work Plan](#4-remaining-work-plan)
5. [GitHub Issue Breakdown](#5-github-issue-breakdown)

---

## 1. Executive Summary

Stone Finance implements an isolated lending markets protocol for CosmWasm, inspired by Morpho's design. The codebase consists of:

- **Market contract** (~4,000 lines): Core lending logic (supply, borrow, repay, liquidate, collateral management, interest accrual)
- **Factory contract** (~1,300 lines): Market deployment, indexing, ownership management  
- **Types package** (~1,000 lines): Shared messages, types, math utilities
- **Testing package** (~440 lines): Mock oracle, test helpers

**Overall assessment:** The codebase is well-structured and follows idiomatic CosmWasm patterns. Core lending mechanics are sound. There are **5 critical findings**, **8 important findings**, and **12 suggestions**. The most serious issues relate to rounding direction (systematically favoring users over protocol), missing oracle staleness enforcement at query time, and fee distribution creating insolvency risk.

---

## 2. Security Findings

### 2.1 Critical

#### C-1: Rounding Favors Users in All Directions (Loss of Protocol Funds)

**Location:** `packages/types/src/math.rs` lines 5-18, used throughout  
**Severity:** 🔴 Critical  

Both `amount_to_scaled()` and `scaled_to_amount()` round down. This means:

- **Supply:** `scaled = amount / index` rounds down → user gets slightly fewer shares (correct, favors protocol)
- **Withdraw:** `amount = scaled * index` rounds down → user gets slightly less (correct, favors protocol)
- **Borrow:** `scaled_debt = amount / borrow_index` rounds **down** → user's recorded debt is **less** than what they actually borrowed (**WRONG — favors user**)
- **Repay:** `scaled_decrease = repay_amount / borrow_index` rounds **down** → user removes fewer debt shares than the value they repaid (**correct, favors protocol**)

The critical issue is in borrowing: `amount_to_scaled(borrow_amount, borrow_index)` rounds down, recording less debt than was actually lent. Over many borrows, this creates a systematic shortfall.

**Fix:** Create `amount_to_scaled_ceil()` for debt operations that rounds up:
```rust
pub fn amount_to_scaled_ceil(amount: Uint128, index: Decimal) -> Uint128 {
    // scaled = ceil(amount / index)
    let numerator = index.numerator();
    let denominator = index.denominator();
    amount.multiply_ratio(denominator, numerator) 
        + if amount.multiply_ratio(denominator, numerator)
            .multiply_ratio(numerator, denominator) < amount 
          { Uint128::one() } else { Uint128::zero() }
}
```

Use `amount_to_scaled_ceil` when recording new debt (borrow), and the existing `amount_to_scaled` (round-down) when recording repayments.

**Similarly:** `scaled_to_amount` should round UP for debt reads (`get_user_debt`) so that displayed/checked debt is never understated.

---

#### C-2: Interest Fee Distribution Sends Tokens the Contract May Not Hold

**Location:** `contracts/market/src/interest.rs` lines 100-125  
**Severity:** 🔴 Critical  

`apply_accumulated_interest()` calculates protocol and curator fees from accrued interest, then creates `BankMsg::Send` to transfer these fees. However:

1. The interest is **virtual** — it increases the borrow index, meaning future repayments will be larger, but the contract doesn't receive these tokens until borrowers actually repay.
2. The code sends real tokens from the contract's balance based on virtual interest calculations.
3. If utilization is high and fees are sent before borrowers repay, the contract could be drained below what it owes suppliers.

**Impact:** The contract could become insolvent — unable to honor supplier withdrawals because fee tokens were sent out before being collected from borrowers.

**Fix:** Fees should be accrued as claimable balances (stored in state), not sent immediately. Create a `claim_fees()` function that sends accumulated fees only from available liquidity. Alternatively, compute fees as scaled amounts added to fee-collector positions and let them be withdrawn like regular supply.

---

#### C-3: No Oracle Price Staleness Check at Query Time in Market Contract

**Location:** `contracts/market/src/health.rs` lines 8-21  
**Severity:** 🔴 Critical  

The `query_price()` function in the market contract extracts only `response.price` and discards `response.updated_at`. The `OracleType` has `max_staleness_secs` configured, but **this is only validated during market creation** (in `contracts/factory/src/execute.rs:validate_price_query`), not during ongoing operations.

This means:
- A stale oracle price (hours or days old) will be accepted for health factor checks, liquidations, and borrow limit calculations.
- An attacker could exploit stale prices to borrow more than they should or avoid liquidation.

**Fix:** Add staleness validation to the market's `query_price`:
```rust
pub fn query_price(deps: Deps, env: &Env, oracle_config: &OracleConfig, denom: &str) -> Result<Decimal, ContractError> {
    let response: PriceResponse = deps.querier.query_wasm_smart(/* ... */)?;
    
    // Validate staleness
    let max_staleness = oracle_config.oracle_type.max_staleness_secs();
    if env.block.time.seconds() > response.updated_at + max_staleness {
        return Err(ContractError::OraclePriceStale { /* ... */ });
    }
    
    // Validate non-zero
    if response.price.is_zero() {
        return Err(ContractError::OracleZeroPrice { denom: denom.to_string() });
    }
    
    Ok(response.price)
}
```

**Note:** This requires threading `env` through all health check functions and execute handlers. The `query` entry point for `UserPosition` currently does NOT have access to `env` for time — it passes `_env` unused. This needs refactoring.

---

#### C-4: Liquidation Should Work Even When Market Is Disabled

**Location:** `contracts/market/src/execute/liquidate.rs` line 16  
**Severity:** 🔴 Critical  

All execute functions, including `execute_liquidate`, check `if !params.enabled { return Err(MarketDisabled) }`. This means if a curator disables a market, **no positions can be liquidated**, even unhealthy ones.

This creates a scenario where:
1. Curator disables market
2. Prices move against borrowers
3. Positions become deeply underwater
4. No one can liquidate → bad debt accumulates
5. Suppliers lose funds

**Fix:** Remove the `enabled` check from `execute_liquidate` and `execute_repay` (repayment should always be allowed too). Only block new supply, new borrow, and possibly new collateral deposits when disabled.

---

#### C-5: `div_decimal` Panics on Zero Decimal Input

**Location:** `packages/types/src/math.rs` lines 10-17  
**Severity:** 🔴 Critical  

```rust
pub fn div_decimal(amount: Uint128, decimal: Decimal) -> Uint128 {
    let numerator = decimal.numerator();
    let denominator = decimal.denominator();
    amount.multiply_ratio(denominator, numerator)  // panics if numerator == 0
}
```

If `decimal` is `Decimal::zero()`, then `numerator` is 0, and `multiply_ratio` panics with division by zero. While indices start at `Decimal::one()` and should only increase, a bug or state corruption could result in a zero index, which would make the contract permanently stuck (all operations that read supply/debt would panic).

**Fix:** Add a zero check:
```rust
pub fn div_decimal(amount: Uint128, decimal: Decimal) -> Result<Uint128, ContractError> {
    if decimal.is_zero() {
        return Err(ContractError::DivideByZero);
    }
    // ...
}
```

Or at minimum, use `checked_multiply_ratio` and propagate the error.

---

### 2.2 Important

#### I-1: No Instantiation Parameter Validation in Market Contract

**Location:** `contracts/market/src/contract.rs` lines 15-57  
**Severity:** 🟡 Important  

The market's `instantiate` function saves params directly from the message without validation. The factory validates params before creating a market, but if the market contract is ever instantiated directly (not via factory), invalid parameters could be set:
- LTV > liquidation_threshold
- Liquidation threshold ≥ 1.0
- protocol_fee + curator_fee ≥ 1.0

**Fix:** Add the same `validate_market_params()` check from the factory into the market's instantiate function.

---

#### I-2: Close Factor Not Enforced for Small Positions

**Location:** `contracts/market/src/execute/liquidate.rs` lines 57-58  
**Severity:** 🟡 Important  

```rust
let max_liquidatable = borrower_debt.checked_mul_floor(params.close_factor)?;
let actual_debt_repaid = debt_to_repay.min(max_liquidatable).min(borrower_debt);
```

The close factor limits how much can be liquidated at once (e.g., 50%). However, for very small positions, this could prevent efficient liquidation. More critically, there's no mechanism for **full liquidation of dust positions** — if remaining debt after partial liquidation is below economically viable thresholds, the position becomes un-liquidatable and bad debt.

**Fix:** Add a "full liquidation" path: if remaining debt after close-factor liquidation would be below a configurable threshold (e.g., $10 worth), allow 100% liquidation.

---

#### I-3: Factory Reply Handler Salt Mismatch

**Location:** `contracts/factory/src/execute.rs` lines 259-268  
**Severity:** 🟡 Important  

In `handle_instantiate_reply`, the market ID is recomputed from the market's config, but uses `None` for salt:
```rust
let market_id = compute_market_id(
    &market_config.collateral_denom,
    &market_config.debt_denom,
    &market_config.curator,
    None, // We don't have salt here, but that's OK for now
);
```

If a market was created with `salt: Some(5)`, the ID computed in the reply handler won't match the ID computed in `create_market`. The `create_market` function checks for collision using the salted ID, but the reply stores with the unsalted ID, causing:
1. Duplicate market registration becomes possible
2. Market lookup by ID fails for salted markets

**Fix:** Store pending market info (including salt and computed market_id) in transient state before the submessage, then read it in the reply handler. Pattern: `PENDING_MARKET: Item<PendingMarket>`.

---

#### I-4: Missing Validation That `protocol_fee + curator_fee < 1.0` on Curator Fee Update

**Location:** `contracts/market/src/execute/admin.rs` lines 83-87  
**Severity:** 🟡 Important  

When the curator updates `curator_fee`, only the 25% cap is checked. There's no validation that `protocol_fee + new_curator_fee < 1.0`. If protocol_fee is 80% and curator sets fee to 25%, the total is 105% and `fee_share` in interest calculation becomes negative (underflow via `Decimal::one().checked_sub(1.05)` → error).

**Fix:** Add: `if params.protocol_fee + new_fee >= Decimal::one() { return Err(...) }`

---

#### I-5: Donation Attack / First Depositor Share Inflation

**Location:** `contracts/market/src/execute/supply.rs`  
**Severity:** 🟡 Important  

Classic ERC-4626 vault inflation attack applies:
1. First depositor supplies 1 wei of debt token → gets 1 scaled share
2. Attacker donates large amount directly to contract (via bank send)
3. Second depositor supplies X tokens → gets 0 scaled shares due to rounding

This doesn't directly apply because `liquidity_index` is tracked separately and donation doesn't change the index. However, there's a related risk: if someone sends tokens directly to the market contract (not via `Supply`), those tokens are "orphaned" — they inflate `available_liquidity()` (since that's derived from supply vs debt, not actual balance) and can never be recovered.

**Fix:** Consider tracking actual contract balance vs virtual balance, or add a `sweep()` admin function. For the classic inflation attack, consider requiring a minimum initial supply (e.g., 1000 units).

---

#### I-6: `supply_collateral` Does Not Accrue Interest Before State Reads

**Location:** `contracts/market/src/execute/collateral.rs` line 10  
**Severity:** 🟡 Important  

`execute_supply_collateral` does not call `apply_accumulated_interest()`. While collateral is not scaled (no interest accrual), the issue is that this operation can happen between blocks without updating interest, leading to slightly stale state. More importantly, if any subsequent operation within the same transaction depends on fresh interest state, it could use outdated indices.

**Fix:** Call `apply_accumulated_interest` in `supply_collateral` for consistency, same as all other operations do.

---

#### I-7: Liquidation Bonus + Protocol Fee Can Exceed Available Collateral Without Proper Proportioning

**Location:** `contracts/market/src/execute/liquidate.rs` lines 68-96  
**Severity:** 🟡 Important  

When total_collateral_seized is capped at borrower's available collateral, the code attempts proportional scaling:
```rust
let scale = Decimal::from_ratio(total_collateral_seized, uncapped_total);
let scaled_collateral = collateral_needed.checked_mul_floor(scale)?;
let scaled_protocol = protocol_fee_amount.checked_mul_floor(scale)?;
```

The issue: `scaled_collateral + scaled_protocol` due to rounding may not equal `total_collateral_seized`. The liquidator receives `final_collateral_seized - final_protocol_fee`, but if rounding causes `scaled_protocol` to be slightly too large, the liquidator's incentive is reduced unfairly.

Also, the `scaled_debt` recalculation converts value → tokens through price division, introducing additional rounding error.

**Fix:** Calculate liquidator_collateral first (as the residual), ensuring the liquidator always gets at least the minimum incentive. Use `total_collateral_seized - protocol_fee` rather than independent scaling of both.

---

#### I-8: Query Functions Silently Swallow Oracle Errors

**Location:** `contracts/market/src/query.rs` lines 68-75  
**Severity:** 🟡 Important  

```rust
let collateral_price = query_price(deps, /* ... */).unwrap_or(Decimal::zero());
let debt_price = query_price(deps, /* ... */).unwrap_or(Decimal::zero());
```

If the oracle is down or returns an error, `user_position`, `user_supply`, `user_debt`, and `user_collateral` queries silently return zero for all values. This could mislead frontends into showing users have $0 positions when the oracle is simply unavailable.

**Fix:** Either propagate the error (so frontends know the query failed) or include an `oracle_available: bool` field in the response so UIs can show a warning.

---

### 2.3 Suggestions

#### S-1: `Env` Not Passed to Query Entry Point for Time-Dependent Calculations

The `query` entry point passes `_env` (unused). Queries like `UserPosition` and `IsLiquidatable` show stale interest state — they read stored indices without accruing interest to the current block time. This means query results will be slightly stale (lagging behind the last execute call).

**Suggestion:** Compute "simulated" current indices in query functions by reading current time from `env` and applying the time-weighted interest delta (read-only, don't save).

---

#### S-2: No Migration Entry Point

Neither market nor factory contracts have a `migrate` entry point. This means contracts cannot be upgraded after deployment.

**Suggestion:** Add `#[entry_point] pub fn migrate()` stubs with version checking using `cw2`. Even if no migration logic is needed now, having the entry point allows future upgrades.

---

#### S-3: Interest Rate Model Validation Could Be Stricter

`InterestRateModel::validate()` allows `optimal_utilization` of 0 and slopes of 0. While these don't cause panics (handled with `if optimal_utilization.is_zero()` checks), a model with all zeros would mean no interest is ever charged, which is likely a misconfiguration.

**Suggestion:** Add minimum bounds, e.g., `optimal_utilization >= 1%`, `slope_2 > slope_1`.

---

#### S-4: Market ID Hashing Uses FNV Not SHA256

`compute_market_id` uses a custom FNV-based hash mixing function. While this produces unique IDs for different inputs, FNV is not collision-resistant like SHA256. For a protocol where market IDs are security-relevant (preventing duplicates), a cryptographic hash would be safer.

**Suggestion:** Use `cosmwasm_std::sha256` or `Sha256` from the `sha2` crate. The comment says "SHA256 produces 32 bytes" but the actual implementation is FNV.

---

#### S-5: Hardcoded LTV Cooldown and Max Change Constants

**Location:** `contracts/market/src/execute/admin.rs` lines 5-8  

```rust
pub const LTV_COOLDOWN_SECONDS: u64 = 604_800; // TODO don't hardcode
pub const MAX_LTV_CHANGE: Decimal = Decimal::raw(50_000_000_000_000_000); // 0.05 // todo don't hardcode
```

The TODOs in the code itself acknowledge these should be configurable.

**Suggestion:** Move to `MarketParams` or a separate governance config. This prevents needing contract upgrades to adjust governance parameters.

---

#### S-6: No `wasm` Feature Guard on `contract.rs` Entry Points

The factory correctly uses `#[cfg(not(feature = "library"))]` on `pub mod contract`, but both contracts expose entry points. When used as a library dependency, the entry points should be hidden.

**Suggestion:** Already implemented correctly — confirming this is fine.

---

#### S-7: Consider Using `cosmwasm_std::Decimal256` for Intermediate Calculations

Intermediate products in interest and health calculations could overflow `Decimal` (which is 128-bit). For example, `collateral_amount * collateral_price * liquidation_threshold` with large values could exceed Decimal's precision.

**Suggestion:** Use `Decimal256` for intermediate calculations where inputs could be large, then convert back.

---

#### S-8: Withdraw Recipient Address Not Validated

**Location:** `contracts/market/src/execute/withdraw.rs` line 68  

```rust
let recipient_addr = match recipient {
    Some(addr) => addr,  // Not validated!
    None => info.sender.to_string(),
};
```

The recipient for `withdraw` and `withdraw_collateral` is used directly as a string without `addr_validate`. The `supply` function correctly validates recipients, but withdraw does not.

**Suggestion:** Add `deps.api.addr_validate(&addr)?` for consistency and safety.

---

#### S-9: Events Should Use Wasm Events (`wasm-` prefix) Not Just Attributes

Current events use `Response::add_attribute` which emits in the `wasm` event type. This is correct for CosmWasm, but consider also emitting typed events via `Response::add_event` for cleaner indexing.

**Suggestion:** Low priority — current approach works fine with the indexer design in `INDEXER_PLAN.md`.

---

#### S-10: No Rate Limiting on `AccrueInterest` Calls

`AccrueInterest` can be called by anyone and updates state on every call. While it's idempotent within the same block (time_elapsed = 0 path), excessive calls still incur gas costs and state reads.

**Suggestion:** Low priority — the no-op path is cheap. Could add minimum interval enforcement if gas costs become a concern.

---

#### S-11: Factory Does Not Validate `market_code_id` is a Valid WASM Code

`update_market_code_id` accepts any `u64` without verifying it's an uploaded code. Setting an invalid code_id would cause all subsequent `CreateMarket` calls to fail.

**Suggestion:** Query `CodeInfoResponse` to verify the code_id exists before saving.

---

#### S-12: Consider Adding Emergency Pause Mechanism

There's no way to globally pause the protocol in case of an exploit discovery. The curator can disable individual markets, but there's no factory-level pause.

**Suggestion:** Add a factory-level `pause()` / `unpause()` that markets can check via a query to the factory. Only needed for critical situations.

---

## 3. Code Quality Assessment

### Strengths

| Area | Assessment |
|---|---|
| **Architecture** | Excellent. Clean separation: types package, factory, market. Modular execute handlers. |
| **Error handling** | Good. No `unwrap()` in production paths. Proper error types with `thiserror`. Math uses `checked_*` operations. Overflow protection enabled in release profile. |
| **Testing** | Good coverage. 80 market + 24 factory + 4 integration tests. Tests cover happy paths, error conditions, and edge cases. |
| **Storage** | Efficient. Uses `cw-storage-plus` `Map` for user positions, `Item` for singletons. Factory has proper secondary indices. |
| **Access control** | Solid. Curator-only admin, factory-only instantiation, two-step ownership transfer on factory. |
| **Events** | Comprehensive. All operations emit full market state snapshots per DEVELOPMENT_SUMMARY.md improvements. |
| **Documentation** | Good inline documentation. Comprehensive docs/ directory with event reference, indexer plan, frontend plan. |

### Areas for Improvement

| Area | Issue |
|---|---|
| **Math precision** | Need separate round-up functions for debt operations (see C-1) |
| **Query staleness** | Queries return stale interest state — no simulated accrual (see S-1) |
| **Migration** | No `migrate` entry points (see S-2) |
| **Test types** | Mostly unit tests with mock_dependencies. Only 4 multi-test integration tests. No property/fuzz tests. |
| **Invariant checks** | No on-chain invariant assertions (e.g., `assert!(total_supply >= total_debt)` after operations) |

### Test Coverage Gaps

| Scenario | Status |
|---|---|
| Interest accrual over multiple periods | ⚠️ Only 1-year tested |
| Liquidation + interest interaction | ❌ Not tested |
| Concurrent operations (supply + borrow in same block) | ❌ Not tested |
| Oracle failure during operations | ❌ Not tested |
| Extreme values (Uint128::MAX, very small amounts) | ❌ Not tested |
| Position fully repaid then re-borrowed | ❌ Not tested |
| Factory market creation with salt | ⚠️ Unit test only, not integration |
| Multiple markets sharing oracle | ❌ Not tested |
| Market disabled then re-enabled | ❌ Not tested |
| Full lifecycle with interest over time | ❌ Not tested in multi-test |

---

## 4. Remaining Work Plan

### Phase 0: Critical Security Fixes (1-2 weeks)

Must-fix before any deployment or audit.

| # | Task | Priority | Effort |
|---|---|---|---|
| 0.1 | Fix rounding direction for debt operations (C-1) | 🔴 P0 | 2 days |
| 0.2 | Fix fee distribution insolvency risk (C-2) | 🔴 P0 | 3 days |
| 0.3 | Add oracle staleness checks at query time (C-3) | 🔴 P0 | 2 days |
| 0.4 | Allow liquidation + repay when market disabled (C-4) | 🔴 P0 | 0.5 days |
| 0.5 | Fix `div_decimal` panic on zero (C-5) | 🔴 P0 | 0.5 days |
| 0.6 | Fix factory reply handler salt mismatch (I-3) | 🔴 P0 | 1 day |

**Subtotal:** ~9 days

### Phase 1: Important Fixes & Hardening (1-2 weeks)

| # | Task | Priority | Effort |
|---|---|---|---|
| 1.1 | Add param validation to market instantiate (I-1) | 🟡 P1 | 0.5 days |
| 1.2 | Add full liquidation for dust positions (I-2) | 🟡 P1 | 1 day |
| 1.3 | Validate total fees on curator_fee update (I-4) | 🟡 P1 | 0.5 days |
| 1.4 | Minimum initial supply to prevent inflation attack (I-5) | 🟡 P1 | 1 day |
| 1.5 | Add interest accrual to supply_collateral (I-6) | 🟡 P1 | 0.5 days |
| 1.6 | Fix liquidation proportional rounding (I-7) | 🟡 P1 | 1 day |
| 1.7 | Handle oracle errors in queries properly (I-8) | 🟡 P1 | 1 day |
| 1.8 | Validate withdraw recipient addresses (S-8) | 🟡 P1 | 0.5 days |
| 1.9 | Add `migrate` entry points (S-2) | 🟡 P1 | 0.5 days |

**Subtotal:** ~6.5 days

### Phase 2: Enhanced Testing (1-2 weeks)

| # | Task | Priority | Effort |
|---|---|---|---|
| 2.1 | Multi-test integration: full user lifecycle with interest | 🟡 P1 | 2 days |
| 2.2 | Multi-test integration: liquidation scenario with price changes | 🟡 P1 | 1 day |
| 2.3 | Multi-test integration: multiple markets via factory | 🟡 P1 | 1 day |
| 2.4 | Edge case tests: extreme values, dust amounts, zero prices | 🟡 P1 | 2 days |
| 2.5 | Property/fuzz tests for math functions | 🟢 P2 | 2 days |
| 2.6 | Invariant tests: supply >= debt, indices only increase | 🟡 P1 | 1 day |
| 2.7 | Test disabled market behavior (liquidation still works) | 🟡 P1 | 0.5 days |
| 2.8 | Test interest accrual over many small periods vs one large | 🟡 P1 | 0.5 days |

**Subtotal:** ~10 days

### Phase 3: Production Readiness (1-2 weeks)

| # | Task | Priority | Effort |
|---|---|---|---|
| 3.1 | Simulated interest accrual in queries (S-1) | 🟢 P2 | 2 days |
| 3.2 | Make LTV cooldown/max-change configurable (S-5) | 🟢 P2 | 1 day |
| 3.3 | Use SHA256 for market IDs (S-4) | 🟢 P2 | 0.5 days |
| 3.4 | Validate factory code_id on update (S-11) | 🟢 P2 | 0.5 days |
| 3.5 | Add emergency pause mechanism (S-12) | 🟢 P2 | 2 days |
| 3.6 | Schema generation (`scripts/schema.sh` working) | 🟢 P2 | 0.5 days |
| 3.7 | WASM optimization + size verification | 🟢 P2 | 0.5 days |
| 3.8 | Deployment scripts for testnet | 🟢 P2 | 1 day |

**Subtotal:** ~8 days

### Phase 4: Audit Preparation (1 week)

| # | Task | Priority | Effort |
|---|---|---|---|
| 4.1 | Write trust assumptions document | 🟢 P2 | 1 day |
| 4.2 | Document known limitations / design tradeoffs | 🟢 P2 | 1 day |
| 4.3 | Create audit brief with scope, architecture, threat model | 🟢 P2 | 1 day |
| 4.4 | Internal security checklist sign-off | 🟢 P2 | 0.5 days |
| 4.5 | Final review of all checked_* math for overflow potential | 🟢 P2 | 1 day |
| 4.6 | Clean up TODO comments in code | 🟢 P2 | 0.5 days |

**Subtotal:** ~5 days

### Phase 5: Infrastructure & Integration (Parallel Track)

These can proceed in parallel with Phases 0-2 since they're in different parts of the codebase.

| # | Task | Current Status | Effort |
|---|---|---|---|
| 5.1 | Indexer (TypeScript, Prisma, GraphQL) | Scaffolded in `indexer/` — src, tests, prisma schema exist | 2-3 weeks remaining |
| 5.2 | Frontend (Next.js) | Exists in `frontend/` — appears functional | 2-3 weeks remaining |
| 5.3 | E2E tests (Playwright) | Scaffolded in `e2e/` — 6 test files exist | 1 week remaining |
| 5.4 | CI/CD | GitHub Actions exist: `ci.yml`, `e2e.yml`, `staging-deploy.yml`, `preview-*` | Verify & enhance |
| 5.5 | Liquidator bot | Planned in PROJECT_PLAN.md, not started | 2-3 weeks |
| 5.6 | Testnet deployment | Scripts exist in `scripts/` | 1-2 days |

---

## 5. GitHub Issue Breakdown

### Milestone 1: Security Fixes (Must-Fix)

```
Issue #1: [CRITICAL] Fix rounding direction for debt operations
  Labels: security, critical, contracts
  Description: amount_to_scaled rounds down for debt, causing protocol to record less
  debt than actually lent. Create amount_to_scaled_ceil and scaled_to_amount_ceil for
  debt operations. Update borrow.rs, liquidate.rs, get_user_debt.
  Acceptance: All debt rounding favors protocol. New math tests for boundary values.

Issue #2: [CRITICAL] Fix interest fee distribution insolvency risk
  Labels: security, critical, contracts  
  Description: Interest fees are sent immediately as BankMsg but the contract doesn't
  hold those tokens until borrowers repay. Accrue fees in state instead.
  Acceptance: Fees stored as claimable amounts. New claim_fees() function. Tests verify
  available_liquidity never goes negative after fee claims.

Issue #3: [CRITICAL] Add oracle staleness checks to market operations
  Labels: security, critical, contracts
  Description: Market's query_price discards updated_at timestamp. Oracle staleness 
  config exists but isn't enforced during borrow/liquidate/withdraw_collateral.
  Acceptance: Stale prices rejected with OraclePriceStale error. Tests with stale oracle.

Issue #4: [CRITICAL] Allow liquidation and repay when market is disabled
  Labels: security, critical, contracts
  Description: Market disabled blocks all operations including liquidation, creating
  bad debt risk.
  Acceptance: Disabled market allows liquidate, repay, withdraw, withdraw_collateral.
  Blocks only supply, supply_collateral, borrow.

Issue #5: [CRITICAL] Fix div_decimal panic on zero input
  Labels: security, critical, contracts
  Description: div_decimal panics if decimal is zero (division by zero in 
  multiply_ratio). Should return error instead.
  Acceptance: Zero-safe division with error propagation. No panic possible.

Issue #6: [CRITICAL] Fix factory reply handler salt mismatch  
  Labels: security, critical, contracts
  Description: handle_instantiate_reply recomputes market_id with None salt, causing
  mismatch with salted market creation.
  Acceptance: Store pending market info including salt before submessage, read in reply.
```

### Milestone 2: Important Hardening

```
Issue #7: Validate market params on instantiation (not just factory-side)
Issue #8: Full liquidation for dust positions below threshold
Issue #9: Validate total fee cap on curator fee update
Issue #10: First depositor protection (minimum initial supply)
Issue #11: Accrue interest in supply_collateral for consistency
Issue #12: Fix liquidation collateral proportioning rounding
Issue #13: Handle oracle errors in query functions (don't silently return zero)
Issue #14: Validate withdraw recipient addresses
Issue #15: Add migrate entry points with cw2 version checks
```

### Milestone 3: Testing

```
Issue #16: Integration test: full lending lifecycle with interest over time
Issue #17: Integration test: liquidation with price changes
Issue #18: Integration test: multiple markets via factory
Issue #19: Edge case tests: extreme values, dust, zero oracle prices
Issue #20: Property tests for math functions (amount_to_scaled round-trip)
Issue #21: Invariant tests (supply >= debt, indices monotonic)
Issue #22: Test disabled market still allows liquidation (after #4)
```

### Milestone 4: Production & Audit Prep

```
Issue #23: Simulated interest accrual in query functions
Issue #24: Configurable LTV cooldown and max change
Issue #25: Use SHA256 for market ID generation
Issue #26: Emergency pause mechanism (factory-level)
Issue #27: Schema generation + WASM build verification in CI
Issue #28: Testnet deployment scripts + runbook
Issue #29: Audit preparation document (trust model, scope, known limitations)
```

---

## Timeline Summary

| Phase | Duration | Dependencies |
|---|---|---|
| Phase 0: Critical Fixes | 1-2 weeks | None — start immediately |
| Phase 1: Important Fixes | 1-2 weeks | Can overlap with Phase 0 |
| Phase 2: Testing | 1-2 weeks | After Phase 0 + 1 |
| Phase 3: Production Ready | 1-2 weeks | After Phase 1 |
| Phase 4: Audit Prep | 1 week | After Phase 2 + 3 |
| **Total to Audit-Ready** | **5-8 weeks** | |
| Phase 5: Infrastructure | 4-6 weeks | Parallel with Phases 0-3 |

---

## Appendix: File-by-File Verdict

| File | Lines | Verdict |
|---|---|---|
| `packages/types/src/math.rs` | 92 | 🔴 Fix rounding (C-1, C-5) |
| `packages/types/src/market.rs` | 425 | ✅ Clean |
| `packages/types/src/interest_rate_model.rs` | 144 | ✅ Clean, consider stricter validation (S-3) |
| `packages/types/src/oracle.rs` | 143 | ✅ Clean |
| `packages/types/src/factory.rs` | 274 | ⚠️ FNV hash should be SHA256 (S-4) |
| `packages/types/src/error.rs` | 122 | ✅ Clean |
| `contracts/market/src/contract.rs` | 220 | ⚠️ Add param validation (I-1) |
| `contracts/market/src/state.rs` | 102 | ✅ Clean |
| `contracts/market/src/interest.rs` | 345 | 🔴 Fee distribution risk (C-2) |
| `contracts/market/src/health.rs` | 523 | 🔴 No staleness check (C-3) |
| `contracts/market/src/query.rs` | 365 | ⚠️ Silent oracle errors (I-8) |
| `contracts/market/src/error.rs` | 97 | ✅ Clean |
| `contracts/market/src/execute/supply.rs` | 301 | ✅ Clean |
| `contracts/market/src/execute/withdraw.rs` | 310 | ⚠️ Recipient not validated (S-8) |
| `contracts/market/src/execute/collateral.rs` | 362 | ⚠️ No interest accrual (I-6) |
| `contracts/market/src/execute/borrow.rs` | 364 | ⚠️ Uses round-down for debt (C-1) |
| `contracts/market/src/execute/repay.rs` | 331 | ✅ Repay should work when disabled (C-4) |
| `contracts/market/src/execute/liquidate.rs` | 453 | 🔴 Disabled check (C-4), proportioning (I-7) |
| `contracts/market/src/execute/admin.rs` | 467 | ⚠️ Fee validation gap (I-4), hardcoded constants (S-5) |
| `contracts/factory/src/contract.rs` | 211 | ✅ Clean |
| `contracts/factory/src/execute.rs` | 572 | 🔴 Salt mismatch in reply (I-3) |
| `contracts/factory/src/query.rs` | 400 | ✅ Clean |
| `contracts/factory/src/state.rs` | 95 | ✅ Clean |
| `contracts/factory/src/error.rs` | 37 | ✅ Clean |

---

*End of review. Do NOT create GitHub issues from this document yet — review with team first.*
