# Stone Finance — Review Validation (Claude Review)

**Reviewer:** 🔍 GPT‑5.2‑codex Reviewer  
**Date:** 2026‑02‑02  
**Scope:** Validate `docs/REVIEW_AND_PLAN.md` against code in `contracts/` + `packages/`  

---

## Confirmed Findings (with corrections/nuances)

### **C‑1: Rounding favors borrowers**
**Status:** ✅ Real  
**Severity:** 🔴 Critical (correct)  
**Code:** `packages/types/src/math.rs`, `contracts/market/src/execute/borrow.rs`, `contracts/market/src/interest.rs`, `contracts/market/src/execute/liquidate.rs`

**Why it’s real:** `amount_to_scaled` floors. Used in `borrow` and `liquidate`, causing under‑recorded debt. This also makes risk checks (health factor, LTV) too lenient because `get_user_debt` uses floor rounding.

**Fix suggestion:** Sound. Use **ceil** when converting to scaled debt (borrow, liquidate reductions) and when converting to amount for debt display/health checks.

**Nuance:** The worst case is **zero scaled debt** when index is large and the borrow amount is small. That can allow free debt. Also impacts borrow caps and liquidation checks.

---

### **C‑2: Fee distribution sends real tokens for virtual interest**
**Status:** ✅ Real  
**Severity:** 🔴 Critical (correct)  
**Code:** `contracts/market/src/interest.rs`

**Why it’s real:** Interest accrual is virtual; fees are sent immediately via `BankMsg`, which can drain actual liquidity before borrowers repay.

**Fix suggestion:** Sound. Accrue fees as claimable balances and allow withdrawals only from available liquidity (or integrate fee shares as supply positions).

---

### **C‑3: No oracle staleness enforcement at runtime**
**Status:** ✅ Real  
**Severity:** 🔴 Critical (correct)  
**Code:** `contracts/market/src/health.rs`, `contracts/market/src/query.rs`

**Why it’s real:** `query_price()` ignores `updated_at`; staleness is only validated at market creation in the factory.

**Fix suggestion:** Sound. Add staleness checks in `query_price` and thread `env` into health/borrow/withdraw/liquidate paths.

**Nuance:** This should be paired with runtime **zero‑price** and **denom‑match** checks (see Missing Findings).

---

### **C‑4: Liquidation/repay blocked when market disabled**
**Status:** ✅ Real  
**Severity:** 🔴 Critical (reasonable)  
**Code:** `execute_liquidate`, `execute_repay`, `execute_withdraw`, `execute_withdraw_collateral`

**Why it’s real:** All executes gate on `params.enabled`.

**Fix suggestion:** Sound. Allow **liquidate** and **repay** regardless of `enabled`.

**Nuance:** Also allow **withdraw** and **withdraw_collateral** while disabled; otherwise curator can effectively lock user funds.

---

### **I‑1: Market instantiate lacks param validation**
**Status:** ✅ Real  
**Severity:** 🟡 Important  
**Code:** `contracts/market/src/contract.rs`

Market can be instantiated directly without factory checks. Should reuse factory validation.

---

### **I‑3: Factory reply handler salt mismatch**
**Status:** ✅ Real  
**Severity:** 🟡 Important  
**Code:** `contracts/factory/src/execute.rs`

Reply computes market_id with `None` salt even when creation used a salt. Leads to registry mismatch and potential duplicates.

---

### **I‑4: Fee sum not validated on curator fee update**
**Status:** ✅ Real  
**Severity:** 🟡 Important  
**Code:** `contracts/market/src/execute/admin.rs`

If `protocol_fee + curator_fee >= 1`, interest accrual will fail at runtime.

---

### **I‑8: Query functions swallow oracle errors**
**Status:** ✅ Real  
**Severity:** 🟡 Important → **downgrade to Suggestion**  
**Code:** `contracts/market/src/query.rs`

This is UI safety (returns 0 if oracle errors). Not fund‑critical, but should return error or explicit availability flag.

---

## Disputed / Downgraded Findings

### **C‑5: `div_decimal` panics on zero**
**Status:** ⚠️ Real but overstated  
**Severity:** **Downgrade to Important / Suggestion**  
**Code:** `packages/types/src/math.rs`

Indices start at 1 and only increase; zero is not reachable via normal flows. Still worth hardening, but not critical.

---

### **I‑2: Close factor not enforced for small positions**
**Status:** ⚠️ Partial  
**Severity:** **Downgrade**  

This is a liquidation efficiency/dust issue, not a security bug. Optional full‑liquidation threshold is good UX.

---

### **I‑5: Donation attack / first depositor inflation**
**Status:** ❌ Not applicable  

Supply accounting is virtual; donations don’t inflate shares. The only issue is **orphaned funds**, which is operational, not exploitable.

---

### **I‑6: `supply_collateral` doesn’t accrue interest**
**Status:** ⚠️ Low impact  
**Severity:** **Downgrade to Suggestion**  

Collateral doesn’t earn interest; accrual here is consistency only.

---

### **I‑7: Liquidation proportioning rounding**
**Status:** ⚠️ Low impact  
**Severity:** **Downgrade to Suggestion**  

Potential rounding imbalance is small and not protocol‑breaking.

---

## Missing Findings (not in the review)

### **M‑1: No runtime check for zero oracle price**
**Severity:** 🔴 Critical / 🟡 Important  
**Where:** `contracts/market/src/health.rs` + callers  

If oracle returns 0, borrow checks treat debt value as 0 and allow unlimited borrow. Add a zero‑price guard alongside staleness checks.

---

### **M‑2: No runtime denom‑match validation**
**Severity:** 🟡 Important  
**Where:** `contracts/market/src/health.rs` + callers  

Factory validates denom once; market never verifies ongoing oracle responses match requested denom. Add validation in `query_price`.

---

### **M‑3: Disabled market blocks withdrawals**
**Severity:** 🟡 Important  
**Where:** `execute_withdraw`, `execute_withdraw_collateral`  

Disabling a market currently prevents users from exiting. Allow withdrawals even when disabled (subject to liquidity/LTV rules).

---

### **M‑4: Borrow recipient not validated**
**Severity:** 🟢 Low  
**Where:** `execute_borrow`  

Recipient is not `addr_validate`d. Not fund‑critical, but should be consistent with `supply`/`supply_collateral`.

---

## Roadmap Feedback

### Phase 0 (Critical Fixes)
Add missing runtime oracle checks:
- **M‑1:** Zero‑price guard in `query_price`
- **M‑2:** Denom‑match guard in `query_price`

Expand C‑4 to allow **withdraw** and **withdraw_collateral** when disabled.

Move **C‑5** (zero index panic) down to Phase 1.

**Effort adjustment:** C‑2 (fee accrual redesign) is likely **4–6 days**, not 3, due to state model changes + tests.

### Phase 1 (Important Hardening)
Downgrade or remove:
- I‑5 (donation attack) → remove or reframe as sweep/orphaned funds
- I‑6, I‑7 → suggestion tier

### Phase 2+ (Testing/Production)
All good. Consider explicit tests for:
- Oracle zero price and denom mismatch
- Disabled market allowing liquidation/repay/withdraw

---

## Summary Table

| Finding | Valid? | Severity Adjustment | Notes |
|---|---|---|---|
| C‑1 | ✅ | Critical stays | Use ceil for debt ops + risk checks |
| C‑2 | ✅ | Critical stays | Virtual interest shouldn’t be paid out |
| C‑3 | ✅ | Critical stays | Add staleness + zero‑price + denom checks |
| C‑4 | ✅ | Critical stays | Also allow withdrawals when disabled |
| C‑5 | ⚠️ | Downgrade | Zero index is unlikely |
| I‑1 | ✅ | Important | Add instantiate validation |
| I‑2 | ⚠️ | Downgrade | Dust liquidation is UX |
| I‑3 | ✅ | Important | Salt mismatch bug |
| I‑4 | ✅ | Important | Fee sum validation missing |
| I‑5 | ❌ | Remove | Not a real inflation attack |
| I‑6 | ⚠️ | Downgrade | Consistency only |
| I‑7 | ⚠️ | Downgrade | Rounding imbalance only |
| I‑8 | ✅ | Downgrade | Query UX only |

---

*End of validation review.*
