# Stone Finance — Review Validation Report

**Validator:** 🔍 Claude Opus 4.5 Reviewer (Subagent)  
**Date:** 2026-02-02  
**Scope:** Validation of `REVIEW_AND_PLAN.md` against all Rust source in `contracts/`, `packages/`  
**Original Reviewer:** Claude Opus 4.5 (main agent)

---

## Table of Contents

1. [Confirmed Findings](#1-confirmed-findings)
2. [Disputed Findings](#2-disputed-findings)
3. [Missing Findings](#3-missing-findings)
4. [Roadmap Feedback](#4-roadmap-feedback)

---

## 1. Confirmed Findings

### C-1: Rounding Favors Users in Debt Operations — ✅ CONFIRMED (Critical)

**Verdict:** Real, correctly described, severity correct.

**Code evidence (`packages/types/src/math.rs:22-25`, `contracts/market/src/execute/borrow.rs:50`):**
```rust
// In borrow.rs:
let scaled_amount = stone_types::amount_to_scaled(amount, state.borrow_index);
```

`amount_to_scaled` calls `div_decimal` which uses `amount.multiply_ratio(denominator, numerator)` — this rounds down. When recording new debt, rounding down means `scaled_debt * borrow_index < actual_borrowed_amount`, systematically understating each borrower's debt.

**Additional nuance the reviewer missed:** `get_user_debt()` in `interest.rs:122-127` also rounds down via `scaled_to_amount(scaled, borrow_index)` → `amount.mul_floor(decimal)`. This means debt is also **understated when read** for health factor checks, LTV checks, and liquidation eligibility. A position that should be liquidatable might appear healthy due to debt understatement. This compounds the issue beyond just the borrow recording path.

**Rounding in withdraw also slightly favors users:** In `execute_withdraw`, a partial withdrawal computes `scaled_decrease = amount_to_scaled(withdraw_amount, liquidity_index)` which rounds down. The user receives `withdraw_amount` tokens but has `scaled_decrease` (rounded down) shares removed — keeping slightly more shares than they should. This is minor but adds up over many partial withdrawals.

**Fix suggestion is sound**, though the ceil implementation could be simpler using `Uint128::checked_multiply_ratio` with `RoundingDirection::Up` (added in cosmwasm-std 1.3+), or using `(amount * denominator + numerator - 1) / numerator`.

---

### C-2: Interest Fee Distribution Creates Insolvency Risk — ✅ CONFIRMED (Critical)

**Verdict:** Real, correctly described, severity correct.

**Code evidence (`contracts/market/src/interest.rs:69-101`):**
```rust
let interest_earned = state.total_debt_scaled.checked_mul_floor(borrow_index_delta)?;
let protocol_fee_amount = interest_earned.checked_mul_floor(params.protocol_fee)?;
// ...
messages.push(BankMsg::Send { to_address: ..., amount: vec![Coin { amount: protocol_fee_amount, .. }] });
```

**I verified the insolvency scenario with concrete numbers:**

Under **normal utilization** (~80%), the virtual accounting is self-consistent — the fee amount deducted from interest accurately reduces the liquidity_index growth, so `available_liquidity()` and actual contract balance stay in sync.

**However, the critical failure mode is at high utilization:**
1. Supply = 10,000 USDC, Debt = 9,999 USDC. Contract balance = 1 USDC.
2. One year passes without repayment. At ~100% utilization, borrow rate ≈ 304%.
3. `interest_earned` ≈ 9,999 × 3.04 ≈ 30,397 USDC (virtual).
4. `total_fees` ≈ 30,397 × 0.15 ≈ 4,559 USDC.
5. Contract only holds 1 USDC → `BankMsg::Send` for 4,559 USDC **fails**.
6. Since **every execute function** calls `apply_accumulated_interest()` first, the entire market is **bricked** — no operation can execute.

This is worse than the reviewer described. It's not just "could become insolvent" — it's a **complete market freeze** because the failed BankMsg prevents any state transitions.

**Additional edge case:** If all suppliers withdraw (total_supply_scaled → 0) but debt remains, interest still accrues and tries to send fees from a contract with 0 balance. Same bricking outcome.

---

### C-3: No Oracle Staleness Check at Query Time — ✅ CONFIRMED (Critical)

**Verdict:** Real, correctly described, severity correct.

**Code evidence (`contracts/market/src/health.rs:8-21`):**
```rust
pub fn query_price(deps: Deps, oracle: &str, denom: &str) -> Result<Decimal, ContractError> {
    let response: PriceResponse = deps.querier.query_wasm_smart(oracle, &OracleQueryMsg::Price { denom: denom.to_string() })?;
    Ok(response.price)  // Discards response.updated_at entirely
}
```

The `OracleType` has `max_staleness_secs()` available, the `OracleConfig` is in storage, and the error type `OraclePriceStale` already exists in `packages/types/src/error.rs`. Everything is in place except the actual check.

**Contrast with factory (`contracts/factory/src/execute.rs:111-128`):**
```rust
fn validate_price_query(...) -> Result<(), ContractError> {
    // ...
    let max_staleness = oracle_config.oracle_type.max_staleness_secs();
    if current_time > response.updated_at + max_staleness {
        return Err(TypesError::OraclePriceStale { ... }.into());
    }
    // ...
}
```

The factory validates staleness at market creation, proving the pattern is already established in the codebase. The market contract simply doesn't implement it.

**The reviewer correctly identified** that `env` is passed as `_env` (unused) in the query entry point, requiring refactoring to thread time through health checks.

---

### C-4: Liquidation Blocked When Market Disabled — ✅ CONFIRMED (Critical)

**Verdict:** Real, correctly described, severity correct.

**Code evidence (verified all execute handlers):**

| Handler | `enabled` check | Should be blocked? |
|---|---|---|
| `execute_supply` | ✅ Checked | ✅ Yes — block new supply |
| `execute_withdraw` | ✅ Checked | ❌ **No — suppliers trapped!** |
| `execute_supply_collateral` | ✅ Checked | ✅ Yes — block new collateral |
| `execute_withdraw_collateral` | ✅ Checked | ❌ **No — collateral holders trapped!** |
| `execute_borrow` | ✅ Checked | ✅ Yes — block new borrows |
| `execute_repay` | ✅ Checked | ❌ **No — can't repay debt!** |
| `execute_liquidate` | ✅ Checked | ❌ **No — bad debt accumulates!** |

**The reviewer's analysis is correct but understates the scope.** It's not just liquidation that should be unblocked — withdraw, withdraw_collateral, and repay should ALL work when disabled. The current code **traps all user funds** when a curator disables the market. A malicious or reckless curator can effectively freeze all positions.

---

### C-5: `div_decimal` Panics on Zero — ✅ CONFIRMED, but **SEVERITY DOWNGRADE suggested: Important**

**Verdict:** Real, but the conditions to trigger it require a prior critical bug.

**Code evidence (`packages/types/src/math.rs:10-14`):**
```rust
pub fn div_decimal(amount: Uint128, decimal: Decimal) -> Uint128 {
    let numerator = decimal.numerator();
    let denominator = decimal.denominator();
    amount.multiply_ratio(denominator, numerator)  // Panics if numerator == 0
}
```

Both `borrow_index` and `liquidity_index` are initialized to `Decimal::one()` in `MarketState::new()` and only increase through interest accrual:
```rust
let new_borrow_index = state.borrow_index.checked_add(borrow_index_delta)?;
```

For either index to reach zero would require: (a) state corruption, (b) a migration bug, or (c) some other code path that manually sets the index. None of these exist in the current code.

**Recommendation:** Downgrade to **Important**. The defensive fix (returning `Result` instead of panicking) is correct practice and should be done, but it's not a Critical vulnerability since it requires impossible state conditions under normal operation. Making it return an error instead of panicking is good defense-in-depth.

---

### I-1 through I-8: All Confirmed

| Finding | Verdict | Notes |
|---|---|---|
| **I-1: No param validation in market instantiate** | ✅ Real | Verified: `contract.rs:18-57` saves params without any validation |
| **I-2: Close factor blocks dust liquidation** | ✅ Real | Verified: no minimum dust threshold in `liquidate.rs:57-58` |
| **I-3: Factory reply salt mismatch** | ✅ Real, **severity upgrade to Critical** | The `None` salt in reply handler (`execute.rs:262`) creates registration corruption for salted markets. See [Missing Finding M-1](#m-1) |
| **I-4: Total fee cap not checked on curator update** | ✅ Real | Verified: `admin.rs:83-87` only checks 25% cap, not `protocol_fee + curator_fee < 1.0` |
| **I-5: First depositor / donation attack** | ✅ Partially real | See [Disputed Finding D-1](#d-1) |
| **I-6: supply_collateral no interest accrual** | ✅ Real | Verified: `collateral.rs:10` uses `_env` — doesn't call `apply_accumulated_interest()` |
| **I-7: Liquidation proportioning rounding** | ✅ Real | Verified: `liquidate.rs:89-96` independently rounds `scaled_collateral` and `scaled_protocol` |
| **I-8: Queries swallow oracle errors** | ✅ Real | Verified: `query.rs:70-75` uses `.unwrap_or(Decimal::zero())` for both prices |

---

## 2. Disputed Findings

### D-1: I-5 Donation Attack / First Depositor — Partially Incorrect Analysis

The reviewer states: *"tokens sent directly to the market contract... inflate `available_liquidity()`"*

**This is wrong.** `available_liquidity()` is computed from virtual values (`total_supply() - total_debt()`), which are derived purely from scaled amounts and indices — NOT from the contract's bank balance:

```rust
// packages/types/src/market.rs:101-108
pub fn available_liquidity(&self) -> Uint128 {
    let supply = self.total_supply();   // total_supply_scaled * liquidity_index
    let debt = self.total_debt();       // total_debt_scaled * borrow_index
    if supply > debt { supply - debt } else { Uint128::zero() }
}
```

Directly-sent tokens are simply **lost** — they don't inflate any computed value. They sit in the contract balance unreferenced by any accounting.

**The core concern (first depositor share inflation)** is correctly identified as not directly applicable due to the index-based model (rather than balance-based like ERC-4626). The recommendation for minimum initial supply is still reasonable as a belt-and-suspenders defense.

**Corrected severity:** Still Important, but for the "lost tokens" scenario, not the "inflated available_liquidity" scenario. The recommendation for a `sweep()` function is sound.

---

### D-2: S-6 — Not a Finding, Reviewer Confirms It's Fine

The reviewer includes S-6 ("No wasm feature guard") but then immediately says "Already implemented correctly — confirming this is fine." This should not have been listed as a suggestion at all. Minor formatting issue in the review.

---

## 3. Missing Findings

### M-1: Withdraw and Repay Blocked When Market Disabled (Extends C-4) — 🔴 Critical

The original C-4 focuses on liquidation. But the actual impact is **much broader**: ALL execute operations are blocked when `enabled = false`, including `withdraw`, `withdraw_collateral`, and `repay`.

**Code evidence:**
- `contracts/market/src/execute/withdraw.rs:17-19`: `if !params.enabled { return Err(ContractError::MarketDisabled); }`
- `contracts/market/src/execute/collateral.rs:68-70` (withdraw_collateral): Same check
- `contracts/market/src/execute/repay.rs:14-16`: Same check

**Impact:** A curator disabling a market **freezes all user funds**. Suppliers cannot withdraw. Collateral depositors cannot reclaim collateral. Borrowers cannot repay debt (and thus can't free their collateral). This is effectively a rug-pull vector through the curator.

**Fix:** The `enabled` check should only block `supply`, `supply_collateral`, and `borrow`. All other operations (withdraw, withdraw_collateral, repay, liquidate, accrue_interest) should always be permitted.

---

### M-2: Borrow Recipient Address Not Validated — 🟡 Important

**Location:** `contracts/market/src/execute/borrow.rs:72-75`

```rust
let recipient_addr = match recipient {
    Some(addr) => addr,  // Not validated!
    None => info.sender.to_string(),
};
```

The reviewer noted S-8 for `withdraw` recipient validation but **missed the identical issue in `borrow`** and `withdraw_collateral`. All three handlers use unvalidated string recipients when a custom recipient is specified.

| Handler | Recipient validated? |
|---|---|
| `supply` | ✅ `deps.api.addr_validate(&addr)?` |
| `supply_collateral` | ✅ `deps.api.addr_validate(&addr)?` |
| `withdraw` | ❌ Raw string used |
| `withdraw_collateral` | ❌ Raw string used |
| `borrow` | ❌ Raw string used |
| `repay` (`on_behalf_of`) | ✅ `deps.api.addr_validate(addr)?` |

On CosmWasm, `BankMsg::Send` with an invalid address would fail at the SDK level. So this wouldn't cause fund loss — the entire transaction would revert. But it's inconsistent and could cause confusing error messages. The `supply` and `supply_collateral` handlers correctly validate, while `withdraw`, `withdraw_collateral`, and `borrow` don't.

---

### M-3: Market Freeze at 100% Utilization Due to Fee Sends (Extends C-2) — 🔴 Critical

This is a specific and severe manifestation of C-2 that the reviewer didn't fully articulate.

**Scenario:**
1. Market reaches 100% utilization (all supply lent out). Contract balance = 0.
2. Time passes (even one block).
3. Any execute call → `apply_accumulated_interest()` → `interest_earned > 0` → `protocol_fee_amount > 0` → `BankMsg::Send` with amount > 0 from contract with balance 0 → **TX REVERTS**.
4. Since **every execute handler** calls `apply_accumulated_interest()` as its first action, **the market is permanently bricked**. No one can supply (to add balance), repay, withdraw, or liquidate.

This isn't just an insolvency risk — it's a **complete market DoS**. The only recovery would be sending tokens directly to the contract address (via bank send), which would give the contract enough balance for the BankMsg::Send to succeed. But this requires knowing the exact fee amount and coordinating the timing.

**Note:** Even at 99% utilization, if enough time passes without operations, the accumulated fees can exceed the small remaining balance, causing the same freeze.

---

### M-4: Potential Decimal Overflow in Health Calculations — 🟡 Important

**Location:** `contracts/market/src/health.rs:35-38`

```rust
let collateral_value = Decimal::from_ratio(collateral_amount, 1u128).checked_mul(collateral_price)?;
```

`cosmwasm_std::Decimal` has 18 decimal places and uses a 128-bit backing integer. `Decimal::from_ratio(amount, 1)` creates a Decimal with the amount as its integer part. For tokens with 18 decimals (like many ERC-20 bridged tokens), a balance of 1 billion tokens would be `1_000_000_000_000_000_000_000_000_000` (10^27) in base units. `Decimal::from_ratio(10^27, 1)` then is a Decimal with integer part 10^27 and 18 decimal places, requiring 10^45 total — exceeding the 128-bit limit (~3.4 × 10^38).

**Impact:** Markets with high-decimal, high-value tokens could panic on health factor calculations, bricking those specific positions.

**Fix:** Use `Decimal256` for intermediate calculations, or check for overflow and handle gracefully.

---

### M-5: No Invariant Checks After State Mutations — 🟢 Suggestion

No execute handler verifies protocol-level invariants after modifying state, such as:
- `total_supply_scaled` should equal sum of all user SUPPLIES entries
- `total_debt_scaled` should equal sum of all user DEBTS entries
- `total_collateral` should equal sum of all user COLLATERAL entries
- Indices should only increase (never decrease)

**This is standard in production DeFi protocols** (e.g., Compound's `doTransferOut` checks, Aave's `validateBorrow`). Without invariant checks, a bug in one operation could corrupt state silently and propagate through subsequent operations.

**Fix:** Add `#[cfg(debug_assertions)]` invariant checks after each state mutation during testing, and consider on-chain assertions for critical invariants (indices monotonically increasing, contract balance ≥ available_liquidity).

---

### M-6: `AccrueInterest` Should Work When Market Is Disabled — 🟡 Important

Currently `execute_accrue_interest` doesn't check the `enabled` flag directly, but many other operations that call `apply_accumulated_interest` are blocked when disabled. Interest should continue accruing even on disabled markets to keep debt accounting accurate.

**Verified:** `execute_accrue_interest` in `admin.rs:149-161` does NOT check `enabled`. It calls `apply_accumulated_interest` directly. So this specific entry point works. But since `apply_accumulated_interest` generates BankMsg::Send for fees, it could still fail if the contract balance is insufficient (see M-3).

---

### M-7: Utilization Can Exceed 1.0 Due to Interest Accrual — 🟢 Suggestion

After interest accrues, `total_debt()` grows faster than `total_supply()` (because some interest goes to fees, not suppliers). This means `utilization() = debt / supply` can exceed 1.0 over time.

**Code evidence (`packages/types/src/market.rs:95-101`):**
```rust
pub fn utilization(&self) -> Decimal {
    let total_supply = self.total_supply();
    let total_debt = self.total_debt();
    if total_supply.is_zero() { Decimal::zero() }
    else { Decimal::from_ratio(total_debt, total_supply) }
}
```

This doesn't cap at 1.0. When utilization > 1.0, the interest rate model still works (returns very high rates), but it could confuse frontends or indexers that expect utilization ∈ [0, 1].

**Impact:** Low — the math handles it gracefully. But worth documenting as a known behavior.

---

### M-8: No Market Code ID Verification During Reply — 🟢 Suggestion

In `handle_instantiate_reply`, the factory queries the newly-created market's config but doesn't verify that the contract was actually instantiated from the expected `market_code_id`. A malicious or buggy code_id could impersonate a market contract by implementing the same query interface.

Since `SubMsg` execution is controlled by the factory, and the `WasmMsg::Instantiate` uses `config.market_code_id`, this requires the code_id to be malicious at the time of `create_market` (not just at reply time). The risk is low but could be eliminated by querying `ContractInfo` in the reply to verify the code_id.

---

## 4. Roadmap Feedback

### Phase 0: Critical Security Fixes — Mostly Sound

**Phasing is correct.** All items are true blockers that must be fixed before deployment.

**Specific feedback:**

| Task | Estimate | My Assessment |
|---|---|---|
| 0.1: Fix rounding (C-1) | 2 days | **3 days** — Reviewer missed that `get_user_debt` also needs ceil rounding for reads. This affects health.rs, query.rs, and all liquidation/repay paths. More pervasive than just borrow.rs. |
| 0.2: Fix fee distribution (C-2) | 3 days | **3-4 days** — Must also address the market-freeze scenario (M-3). The `claim_fees()` approach requires designing the claiming interface, access control (who can claim?), and handling the case where claimed fees exceed available liquidity. |
| 0.3: Oracle staleness (C-3) | 2 days | **2 days** — Accurate. The error types already exist. |
| 0.4: Liquidation when disabled (C-4) | 0.5 days | **1 day** — Scope is larger than described: must fix ALL six execute handlers, not just liquidation. See M-1. Need to verify behavior and add tests for each. |
| 0.5: div_decimal panic (C-5) | 0.5 days | **0.5 days** — I'd suggest doing this alongside 0.1 since both touch math.rs. |
| 0.6: Factory salt mismatch (I-3) | 1 day | **1.5 days** — Needs transient state pattern (`PENDING_MARKET: Item`), serialization of the pending info, and integration tests with salted markets. |

**Revised subtotal:** ~11-12 days (vs original 9 days)

**Missing from Phase 0:** The fee distribution fix (0.2) must explicitly address the market-freeze scenario from M-3, not just the insolvency risk. The current description focuses on "fees stored as claimable amounts" which is correct, but must also handle the case where no claimable balance exists yet (zero outstanding fees → no BankMsg emitted).

### Phase 1: Important Fixes — Sound

Estimates are reasonable. One addition:

**1.8 should include borrow and withdraw_collateral recipient validation too** (not just withdraw). See M-2. This doesn't change the estimate (still 0.5 days) since it's the same pattern.

### Phase 2: Testing — Underestimated

**My assessment: 2-3 weeks, not 1-2 weeks.**

The testing gaps are significant. Specifically:
- **2.4 (Edge case tests)** at 2 days is too tight. Testing extreme values across all operations (supply, borrow, repay, withdraw, liquidate) with edge cases (Uint128::MAX, 1 wei, 0 price, price at 10^18, etc.) is easily 4-5 days.
- **2.5 (Property/fuzz tests)** at 2 days is realistic only for basic round-trip properties. Full property testing of the interest model (monotonicity, conservation of value) would take 3-4 days.
- Missing test: **Interest accrual under fee-send failure scenario** (validate the fix from 0.2).
- Missing test: **Salted market creation end-to-end** through factory (validate 0.6).
- Missing test: **Concurrent operations** (supply + borrow + liquidate in same block with different users).

### Phase 3: Production Readiness — Sound

No major issues. The emergency pause mechanism (3.5) could arguably be in Phase 1 given the curator freeze risk identified in M-1.

### Phase 4: Audit Preparation — Sound

One addition: **4.5 (Final overflow review)** should specifically include the Decimal overflow scenario from M-4 — health calculations with large token amounts.

### Overall Timeline

Original estimate: **5-8 weeks** to audit-ready.  
My revised estimate: **7-10 weeks** to audit-ready.

The delta comes from:
- Phase 0 scope is larger (C-4 affects more handlers, C-2 fix is more complex)
- Phase 2 testing is underestimated by ~1 week
- Phase 1 and Phase 0 have more overlap dependencies than implied (e.g., rounding fix must be complete before interest model tests make sense)

### Dependency Graph (Phases 0-2)

```
0.1 (Rounding) ─────┐
0.2 (Fee distribution)─┤
0.5 (div_decimal) ───┘─→ 2.4 (Edge case tests)
                         2.5 (Property tests)
                         2.6 (Invariant tests)

0.3 (Oracle staleness) ──→ 2.2 (Liquidation integration test)

0.4 (Disabled market) ──→ 2.7 (Disabled market test)

0.6 (Salt mismatch) ────→ 2.3 (Multiple markets integration test)

1.1-1.9 ─────────────→ 2.1 (Full lifecycle integration test)
```

Phase 2 cannot meaningfully start until Phase 0 is complete, since tests would be testing incorrect behavior. Some Phase 1 work can overlap with Phase 0. The roadmap correctly identifies this dependency but the timeline should account for serial execution of Phase 0 → Phase 2.

---

## Summary

| Category | Count | Details |
|---|---|---|
| **Confirmed findings** | 13/13 | All findings are real and present in code |
| **Severity adjustments** | 2 | C-5 downgrade to Important; I-3 upgrade to Critical |
| **Disputed findings** | 1 | I-5 analysis error (donation doesn't inflate available_liquidity) |
| **Missing findings** | 8 | M-1 through M-8, including 2 Critical |
| **Roadmap adjustments** | Timeline extended ~2 weeks | Phase 0 scope larger, Phase 2 underestimated |

**Bottom line:** The original review is **thorough and high-quality**. All critical findings are real and correctly prioritized. The main gaps are: (1) the market-freeze scenario from fee sends is more severe than described, (2) the `enabled` check blocks ALL operations (not just liquidation), making it a more comprehensive issue, and (3) several recipient validation gaps were missed. The roadmap is sensible in phasing but should add ~2 weeks for the expanded scope and testing depth.

---

*Validation complete. This document should be reviewed alongside REVIEW_AND_PLAN.md before creating GitHub issues.*
