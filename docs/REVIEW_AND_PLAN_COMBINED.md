# Stone Finance — Combined Review (Validated)

**Sources:** `docs/REVIEW_AND_PLAN.md`, `docs/REVIEW_VALIDATION.md`, `docs/REVIEW_AND_PLAN_VALIDATION.md`  
**Compiled:** 2026-02-03  
**Scope:** All Rust source in `contracts/`, `packages/`

---

## Executive Summary

This document merges the original review and both validation reports into a single, vetted list of issues. It keeps only **valid findings**, incorporates corrections and missing findings, and consolidates severity where there was disagreement. Items are grouped by **Critical**, **Important**, and **Suggestions**. Disputed or removed items are listed separately for transparency.

---

## Validated Findings

### Critical

1. **C-1: Rounding Favors Borrowers in Debt Operations**
   - **Where:** `packages/types/src/math.rs`, `contracts/market/src/execute/borrow.rs`, `contracts/market/src/interest.rs`, `contracts/market/src/execute/liquidate.rs`
   - **Issue:** `amount_to_scaled` floors, under-recording debt when borrowing and in some liquidation paths. `scaled_to_amount` floors in debt reads, understating debt for health checks and liquidations.
   - **Impact:** Systematically undercollateralized positions and potential “free debt” on small borrows.
   - **Fix:** Add ceil conversion for debt (`amount_to_scaled_ceil`, `scaled_to_amount_ceil`) and use it for debt recording and debt reads.

2. **C-2: Fee Distribution Sends Real Tokens for Virtual Interest (Market Freeze Risk)**
   - **Where:** `contracts/market/src/interest.rs`
   - **Issue:** Accrued interest is virtual (borrow index only), but fees are sent immediately via `BankMsg::Send`. At high utilization or zero balance, fee sends revert, bricking the market because `apply_accumulated_interest()` runs in every execute path.
   - **Impact:** Market-wide DoS (no supply/borrow/repay/withdraw/liquidate can execute).
   - **Fix:** Accrue fees as claimable balances and only send fees when liquidity exists. Ensure no `BankMsg` is emitted when fees are not actually payable.

3. **C-3: Oracle Staleness Not Enforced at Runtime (Also Missing Zero-Price + Denom Checks)**
   - **Where:** `contracts/market/src/health.rs`, `contracts/market/src/query.rs`
   - **Issue:** Market `query_price` ignores `updated_at`; only factory checks staleness at creation. Runtime operations accept stale or zero prices and do not validate denom matches.
   - **Impact:** Stale or zero prices allow incorrect health calculations, over-borrowing, and failed liquidations.
   - **Fix:** Validate `updated_at` against `max_staleness_secs`, reject zero prices, and verify denom match in `query_price`. Thread `env` into runtime checks.

4. **C-4: Market Disabled Blocks Exits (Liquidation/Repay/Withdraw/Withdraw-Collateral)**
   - **Where:** `contracts/market/src/execute/*`
   - **Issue:** All execute handlers gate on `params.enabled`, trapping funds when disabled.
   - **Impact:** Curator can freeze all user funds and prevent liquidation, leading to bad debt.
   - **Fix:** Only block new supply/supply_collateral/borrow. Always allow withdraw, withdraw_collateral, repay, liquidate, and accrue interest.

5. **C-5: Factory Reply Handler Salt Mismatch (Severity Upgrade)**
   - **Where:** `contracts/factory/src/execute.rs`
   - **Issue:** Reply handler recomputes market ID with `None` salt, diverging from `create_market` for salted markets.
   - **Impact:** Registry corruption and potential duplicate market creation.
   - **Fix:** Store pending market info (including salt and computed ID) before submessage; read it in reply handler.

---

### Important

1. **I-1: Market Instantiate Lacks Param Validation**
   - **Where:** `contracts/market/src/contract.rs`
   - **Issue:** Market can be instantiated directly without factory validations.
   - **Fix:** Reuse factory `validate_market_params()` in market `instantiate`.

2. **I-2: `div_decimal` Panics on Zero (Severity Downgrade)**
   - **Where:** `packages/types/src/math.rs`
   - **Issue:** `multiply_ratio` panics if decimal is zero. While zero is unreachable under normal flows, it is a hard panic if state is corrupted.
   - **Fix:** Return `Result` or use `checked_multiply_ratio` and propagate error.

3. **I-3: Fee Sum Not Validated on Curator Fee Update**
   - **Where:** `contracts/market/src/execute/admin.rs`
   - **Issue:** Missing `protocol_fee + curator_fee < 1.0` guard.
   - **Fix:** Add total fee cap check.

4. **I-4: Close Factor Prevents Dust Liquidation**
   - **Where:** `contracts/market/src/execute/liquidate.rs`
   - **Issue:** No path to fully liquidate dust positions under close factor rules.
   - **Fix:** Add a “full liquidation below dust threshold” rule.

5. **I-5: Decimal Overflow Risk in Health Calculations**
   - **Where:** `contracts/market/src/health.rs`
   - **Issue:** `Decimal::from_ratio(amount, 1)` can overflow for large balances with high-decimal tokens.
   - **Fix:** Use `Decimal256` for intermediate calculations or check for overflow.

6. **I-6: Recipient Address Validation Missing in Borrow/Withdraw Paths**
   - **Where:** `contracts/market/src/execute/borrow.rs`, `contracts/market/src/execute/withdraw.rs`, `contracts/market/src/execute/collateral.rs`
   - **Issue:** Custom recipients are not `addr_validate`’d, unlike supply paths.
   - **Fix:** Validate recipients in `borrow`, `withdraw`, and `withdraw_collateral`.

---

### Suggestions / Hardening

1. **S-1: Query Functions Swallow Oracle Errors**
   - **Where:** `contracts/market/src/query.rs`
   - **Fix:** Return an error or an explicit `oracle_available` flag instead of zeroing.

2. **S-2: `supply_collateral` Doesn’t Accrue Interest**
   - **Where:** `contracts/market/src/execute/collateral.rs`
   - **Fix:** Call `apply_accumulated_interest()` for consistency.

3. **S-3: Liquidation Proportioning Rounding**
   - **Where:** `contracts/market/src/execute/liquidate.rs`
   - **Fix:** Derive liquidator amount as residual to avoid rounding bias.

4. **S-4: No Migration Entry Points**
   - **Where:** `contracts/market/src/contract.rs`, `contracts/factory/src/contract.rs`
   - **Fix:** Add `migrate` entry points with cw2 version checks.

5. **S-5: Market ID Hashing Uses Non-Crypto Hash**
   - **Where:** `packages/types/src/factory.rs`
   - **Fix:** Use SHA-256 for market IDs.

6. **S-6: Hardcoded LTV Cooldown / Max Change**
   - **Where:** `contracts/market/src/execute/admin.rs`
   - **Fix:** Move to configurable parameters.

7. **S-7: No Invariant Checks After State Mutations**
   - **Where:** Across execute paths
   - **Fix:** Add debug-only invariants; consider critical on-chain asserts.

8. **S-8: Utilization Can Exceed 1.0**
   - **Where:** `packages/types/src/market.rs`
   - **Fix:** Document behavior or clamp for UI display.

9. **S-9: Market Code ID Verification at Reply (Optional)**
   - **Where:** `contracts/factory/src/execute.rs`
   - **Fix:** Query `ContractInfo` and verify code_id in reply.

---

## Disputed / Removed Items (Not Valid Findings)

1. **Donation attack / first depositor share inflation**
   - **Status:** Not applicable. Accounting is index-based, not balance-based. Direct transfers are orphaned funds but do not inflate share accounting.

2. **“No wasm feature guard”**
   - **Status:** Already correct in codebase; no action needed.

---

## Roadmap Adjustments (Merged)

1. **Phase 0 scope expansion**
   - C-2 fix must handle the **market freeze** scenario explicitly.
   - C-4 fix should allow **withdraw**, **withdraw_collateral**, **repay**, and **liquidate** while disabled.
   - C-3 fix should include **zero-price** and **denom-match** checks.

2. **Timeline adjustments**
   - Phase 0 likely **11–12 days** (vs 9) due to broadened scope.
   - Phase 2 testing likely **2–3 weeks**, not 1–2.

---

## Summary Table

| Category | Count |
|---|---|
| **Critical** | 5 |
| **Important** | 6 |
| **Suggestions** | 9 |
| **Removed / Disputed** | 2 |

---

*End of combined review. This document supersedes individual review/validation docs for issue tracking.*
