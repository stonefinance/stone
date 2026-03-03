# Stone Finance Oracle Handling Audit

**Date:** 2025-02-08
**Author:** Research Agent
**Status:** Complete

## Executive Summary

This audit investigates Stone Finance's oracle handling and Pyth price update integration. The investigation was triggered by observations that:
1. Withdrawing collateral may not be sending Pyth price updates
2. Transactions aren't failing with staleness errors when they should

**Key Finding:** The mock oracle contract **always returns the current block timestamp** as `updated_at`, completely bypassing staleness validation in development and testing. This masks real issues that would occur in production.

---

## 1. Frontend Pyth Integration Audit

### 1.1 Pyth Library Structure (`frontend/lib/pyth/`)

| File | Purpose |
|------|---------|
| `config.ts` | Pyth contract address, feed IDs, staleness threshold (5 min) |
| `client.ts` | Hermes API client for fetching prices |
| `messages.ts` | Builds Pyth price update messages for transactions |
| `withPriceUpdate.ts` | Wraps transactions with price update messages |

### 1.2 Transaction Methods Analysis

The `SigningClient` class in `frontend/lib/cosmjs/client.ts` provides both plain and `*WithPriceUpdate` variants:

| Operation | Plain Method | WithPriceUpdate Variant | Needs Oracle? |
|-----------|--------------|-------------------------|---------------|
| supply | ✅ | ✅ `supplyWithPriceUpdate` | Only if user has debt |
| withdraw | ✅ | ✅ `withdrawWithPriceUpdate` | Only if user has debt |
| supply_collateral | ✅ | ✅ `supplyCollateralWithPriceUpdate` | No |
| withdraw_collateral | ✅ | ✅ `withdrawCollateralWithPriceUpdate` | **Yes** (LTV check) |
| borrow | ✅ | ✅ `borrowWithPriceUpdate` | **Yes** (LTV check) |
| repay | ✅ | ✅ `repayWithPriceUpdate` | Only if partial repay |
| liquidate | ✅ | ✅ `liquidateWithPriceUpdate` | **Yes** |

### 1.3 UI Usage Matrix

| Component/Page | Operation | Uses WithPriceUpdate? | Denoms Passed? |
|----------------|-----------|----------------------|----------------|
| `page.tsx` | handleSupply | ✅ Yes | ✅ Both denoms |
| `page.tsx` | handleSupplyCollateral | ✅ Yes | ✅ Both denoms |
| `page.tsx` | handleBorrow | ✅ Yes | ✅ Both denoms |
| `WithdrawModal` | handleWithdraw | ✅ Conditional | ✅ If props provided |
| `WithdrawCollateralModal` | handleWithdraw | ✅ Conditional | ✅ If props provided |
| `RepayModal` | handleRepay | ✅ Conditional | ✅ If props provided |

**Analysis:** All modals correctly use `*WithPriceUpdate` methods when `collateralDenom` and `debtDenom` props are passed. The market detail page correctly passes these props.

### 1.4 Denoms Included in Price Updates

The `getRelevantDenoms()` function in `withPriceUpdate.ts` returns **both collateral and debt denoms** for all operations:

```typescript
export function getRelevantDenoms(
  operation: string,
  collateralDenom: string,
  debtDenom: string
): string[] {
  // All operations need both prices for health factor calculations
  const denoms = new Set<string>([collateralDenom, debtDenom]);
  return Array.from(denoms).filter(Boolean);
}
```

This is correct - health factor requires both prices.

---

## 2. Contract Oracle Handling

### 2.1 Price Query Function (`contracts/market/src/health.rs`)

```rust
pub fn query_price(
    deps: Deps,
    env: &Env,
    oracle_config: &OracleConfig,
    denom: &str,
) -> Result<Decimal, ContractError> {
    let response: PriceResponse = deps.querier.query_wasm_smart(
        oracle_config.address.as_str(),
        &OracleQueryMsg::Price { denom: denom.to_string() },
    )?;

    // Validate timestamp is not in the future (clock skew check)
    if response.updated_at > current_time {
        return Err(ContractError::OraclePriceFuture { ... });
    }

    // Validate staleness
    let max_staleness = oracle_config.oracle_type.max_staleness_secs();
    let age_seconds = current_time.saturating_sub(response.updated_at);

    if age_seconds > max_staleness {
        return Err(ContractError::OraclePriceStale { ... });
    }

    // Validate non-zero price
    if response.price.is_zero() {
        return Err(ContractError::OracleZeroPrice { ... });
    }

    Ok(response.price)
}
```

### 2.2 Staleness Thresholds by Oracle Type

| Oracle Type | Default Max Staleness | Notes |
|-------------|----------------------|-------|
| Generic | 300 seconds (5 min) | Used for mock oracle |
| Pyth | 60 seconds (1 min) | Configurable per market |
| Chainlink | 3600 seconds (1 hr) | Future support |

### 2.3 Operations That Query Oracle

| Operation | Calls `query_price`? | Via Function |
|-----------|---------------------|--------------|
| withdraw_collateral | ✅ Yes | `check_withdrawal_allowed()` → `query_price()` |
| borrow | ✅ Yes | `check_borrow_allowed()` → `query_price()` |
| liquidate | ✅ Yes | `is_liquidatable()` → `calculate_health_factor()` → `query_price()` |
| supply | ❌ No | N/A |
| supply_collateral | ❌ No | N/A |
| withdraw (supply) | ❌ No | N/A |
| repay | ❌ No | N/A |

---

## 3. Mock Oracle Investigation

### 3.1 The Critical Bug 🔴

**File:** `contracts/mock-oracle/src/lib.rs`

```rust
#[entry_point]
pub fn query(deps: Deps, env: Env, msg: OracleQueryMsg) -> StdResult<Binary> {
    match msg {
        OracleQueryMsg::Price { denom } => {
            let price = PRICES.load(deps.storage, &denom)?;
            to_json_binary(&PriceResponse {
                denom,
                price,
                updated_at: env.block.time.seconds(), // ⚠️ ALWAYS CURRENT TIME!
            })
        }
    }
}
```

**Problem:** The mock oracle **always returns the current block time** as `updated_at`. This means:
- Prices are **never stale** in mock mode
- Staleness validation is **completely bypassed**
- Bugs related to stale prices **cannot be caught** in development or e2e tests

### 3.2 Mock Pyth Contract

**File:** `contracts/mock-pyth/src/lib.rs`

The mock Pyth contract behaves differently:
- Stores `publish_time` set during instantiation or `UpdateFeed` execution
- Returns stored `publish_time` on query (doesn't use current time)
- **Can become stale** if not updated

However, the deployment script (`e2e/scripts/deploy-contracts.ts`) sets timestamps to `Date.now()` at deployment:
```typescript
const now = Math.floor(Date.now() / 1000);
const feeds = config.priceFeeds.map(feed => ({
  publish_time: now, // Set to deployment time
}));
```

After deployment, these timestamps are **fixed** until explicitly updated.

### 3.3 Message Building in Mock Mode

**File:** `frontend/lib/pyth/messages.ts`

```typescript
export async function buildPythUpdateMessages(...) {
  // Mock mode: no price updates needed
  if (config.mode === 'mock') {
    return [];
  }
  // ... build actual update messages
}
```

This is correct behavior - mock oracles don't need Pyth updates since they return static prices.

---

## 4. Gap Analysis: Operation Matrix

| Operation | Needs Oracle Query? | Has PriceUpdate variant? | UI uses it? | Denoms included | Notes |
|-----------|---------------------|-------------------------|-------------|-----------------|-------|
| supply | No (unless debt check) | ✅ Yes | ✅ Yes | Both | Overkill but harmless |
| withdraw | No (unless debt check) | ✅ Yes | ✅ Yes | Both | Overkill but harmless |
| supply_collateral | No | ✅ Yes | ✅ Yes | Both | Overkill but harmless |
| **withdraw_collateral** | **Yes** | ✅ Yes | ✅ Yes | Both | **Critical** |
| **borrow** | **Yes** | ✅ Yes | ✅ Yes | Both | **Critical** |
| repay | No (unless partial) | ✅ Yes | ✅ Yes | Both | Overkill but harmless |
| **liquidate** | **Yes** | ✅ Yes | ❓ N/A | Both | Not in main UI |

**Legend:**
- 🟢 Correct implementation
- 🔴 Issue found
- ❓ Not verified (liquidation bot/separate UI)

---

## 5. Issues Found

### Issue #1: Mock Oracle Always Returns Fresh Timestamps (HIGH)

**Severity:** High
**Impact:** Staleness validation is completely bypassed in development/testing
**Location:** `contracts/mock-oracle/src/lib.rs`

**Problem:**
```rust
updated_at: env.block.time.seconds(), // Always current time!
```

**Consequence:**
- Tests will never catch staleness bugs
- Developers get false confidence that oracle handling works
- Real staleness issues only manifest in production

**Fix Required:** Store and return a configurable timestamp that can go stale.

### Issue #2: No Staleness Integration Tests (MEDIUM)

**Severity:** Medium
**Impact:** No automated verification of staleness behavior
**Location:** `e2e/tests/`

**Problem:**
- No e2e tests verify that stale prices cause transaction failures
- Mock oracle behavior prevents such tests from working even if written

**Fix Required:**
1. Fix mock oracle to support stale timestamps
2. Add e2e tests that verify staleness errors

### Issue #3: Mock Pyth Timestamps Fixed at Deployment (LOW)

**Severity:** Low (masked by pyth-oracle-adapter not checking staleness)
**Location:** `contracts/mock-pyth/src/lib.rs`

**Problem:**
- Mock Pyth timestamps are set at deployment and never auto-updated
- After ~60 seconds, prices would be stale if adapter checked staleness

**Current Mitigation:** The pyth-oracle-adapter intentionally does NOT check staleness (delegated to market layer). The market layer then queries the adapter, which returns the Pyth timestamp, and the market validates staleness.

**Note:** This is actually working as designed, but could confuse developers.

---

## 6. Recommendations

### Priority 1: Fix Mock Oracle Staleness (HIGH)

**Change `contracts/mock-oracle/src/lib.rs`:**

```rust
// Add to state
pub const TIMESTAMPS: Map<&str, u64> = Map::new("timestamps");

// Update instantiate to store timestamp
#[entry_point]
pub fn instantiate(...) -> StdResult<Response> {
    let now = env.block.time.seconds();
    for price_init in msg.prices {
        PRICES.save(deps.storage, &price_init.denom, &price)?;
        TIMESTAMPS.save(deps.storage, &price_init.denom, &now)?;
    }
    Ok(Response::new())
}

// Update query to return stored timestamp
#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: OracleQueryMsg) -> StdResult<Binary> {
    match msg {
        OracleQueryMsg::Price { denom } => {
            let price = PRICES.load(deps.storage, &denom)?;
            let updated_at = TIMESTAMPS.load(deps.storage, &denom)?;
            to_json_binary(&PriceResponse {
                denom,
                price,
                updated_at, // Use stored timestamp, not current time
            })
        }
    }
}

// Add execute message to refresh timestamp
ExecuteMsg::RefreshTimestamp { denom } => {
    TIMESTAMPS.save(deps.storage, &denom, &env.block.time.seconds())?;
    Ok(Response::new())
}
```

### Priority 2: Add Staleness E2E Tests (MEDIUM)

Create `e2e/tests/oracle/staleness.spec.ts`:

```typescript
test('withdraw_collateral fails with stale oracle price', async () => {
  // 1. Setup: User has collateral and debt
  // 2. Wait for oracle staleness threshold (or explicitly set old timestamp)
  // 3. Attempt withdraw_collateral
  // 4. Assert: Transaction fails with OraclePriceStale error
});

test('borrow fails with stale oracle price', async () => {
  // Similar test for borrow
});
```

### Priority 3: Document Oracle Behavior (LOW)

Add to `DEVELOPMENT_SUMMARY.md` or create `docs/oracle-integration.md`:

1. Explain difference between mock mode and live mode
2. Document that mock oracle doesn't support staleness testing
3. Provide instructions for testing staleness manually
4. Clarify Pyth adapter's role (no staleness check - delegated to market)

### Priority 4: Consider Always Bundling Price Updates (LOW)

**Current:** Only bundle when `PYTH_MODE !== 'mock'`
**Alternative:** Always attempt to bundle (Pyth SDK handles failures gracefully)

**Pros:**
- Consistent behavior between dev and prod
- Earlier detection of Pyth integration issues

**Cons:**
- Slightly slower transactions in development
- Requires Hermes endpoint even in dev

---

## 7. Conclusion

The frontend Pyth integration is **correctly implemented**. All operations that require fresh oracle prices have `*WithPriceUpdate` variants, and the UI correctly uses them.

The root cause of "transactions not failing with staleness errors" is the **mock oracle always returning current time as `updated_at`**. This completely bypasses staleness validation in development and testing environments.

**Action Items:**
1. 🔴 **Immediately** fix mock oracle to support stale timestamps
2. 🟡 Add staleness integration tests
3. 🟢 Document oracle testing procedures

---

## Appendix A: Code References

| File | Description |
|------|-------------|
| `frontend/lib/pyth/config.ts` | Pyth configuration and feed IDs |
| `frontend/lib/pyth/messages.ts` | Builds price update messages |
| `frontend/lib/pyth/withPriceUpdate.ts` | Transaction wrapper |
| `frontend/lib/cosmjs/client.ts` | SigningClient with all transaction methods |
| `frontend/app/markets/[id]/page.tsx` | Market detail page using WithPriceUpdate methods |
| `frontend/components/modals/*.tsx` | Modal components for withdraw/repay |
| `contracts/market/src/health.rs` | Oracle query and staleness validation |
| `contracts/mock-oracle/src/lib.rs` | Mock oracle (problematic) |
| `contracts/mock-pyth/src/lib.rs` | Mock Pyth contract |
| `contracts/pyth-oracle-adapter/src/contract.rs` | Pyth adapter |
| `packages/types/src/oracle.rs` | Oracle types and staleness thresholds |

## Appendix B: Staleness Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Transaction Flow                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Frontend                    Pyth/Hermes              Blockchain    │
│  ─────────                   ───────────              ──────────    │
│                                                                      │
│  User clicks                                                         │
│  "Withdraw"                                                          │
│       │                                                              │
│       ▼                                                              │
│  buildPythUpdateMessages()                                           │
│       │                                                              │
│       │──[PYTH_MODE=mock?]──► Return []                             │
│       │                                                              │
│       │──[PYTH_MODE=live]──► Fetch VAA ──────► Hermes API           │
│       │                            │                                 │
│       │◄───────────────────────────┘                                │
│       │                                                              │
│       ▼                                                              │
│  Bundle: [UpdatePrices, WithdrawCollateral]                         │
│       │                                                              │
│       └──────────────────────────────────────► Execute on-chain     │
│                                                      │               │
│                                                      ▼               │
│                                             Pyth Contract           │
│                                             Updates prices          │
│                                                      │               │
│                                                      ▼               │
│                                             Market Contract          │
│                                             check_withdrawal_allowed │
│                                                      │               │
│                                                      ▼               │
│                                             query_price()           │
│                                             └─► Oracle Adapter      │
│                                                      │               │
│                                                      ▼               │
│                                             Validate staleness      │
│                                             ├─► Fresh: Continue     │
│                                             └─► Stale: Error        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```
