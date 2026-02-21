# Issue: Bundle Pyth Price Updates with Frontend Transactions

## Summary

Stone Finance transactions that require fresh oracle prices should bundle Pyth `UpdatePriceFeeds` messages in the same transaction as the user action. This ensures on-chain prices are fresh when the contract validates health factors and LTV constraints.

## Current State

### ✅ What's Already Implemented

The infrastructure is **largely in place** but not consistently used:

| Component | Status | Location |
|-----------|--------|----------|
| Pyth config & feed mappings | ✅ Done | `lib/pyth/config.ts` |
| Hermes API client | ✅ Done | `lib/pyth/client.ts` |
| Message building | ✅ Done | `lib/pyth/messages.ts` |
| Transaction bundling | ✅ Done | `lib/pyth/withPriceUpdate.ts` |
| SigningClient methods | ✅ Done | `lib/cosmjs/client.ts` |

### ⚠️ Issues

1. **Environment variables not documented**
   - `NEXT_PUBLIC_PYTH_CONTRACT_ADDRESS` must be set
   - `NEXT_PUBLIC_PYTH_MODE` must be `live` for production
   - `.env.example` only has `NEXT_PUBLIC_PYTH_HERMES_URL`

2. **`getRelevantDenoms()` is overly aggressive**
   - Currently returns BOTH denoms for ALL operations
   - Some operations don't need prices at all (wastes gas)

3. **Modal usage inconsistent**
   - Some modals use `*WithPriceUpdate` only when `collateralDenom` && `debtDenom` props exist
   - Easy to forget to pass these props from parent components

---

## Contract Analysis: Which Actions Need Prices?

Based on contract code review:

| Action | Needs Oracle Prices | Which Prices | Why |
|--------|---------------------|--------------|-----|
| **Borrow** | ✅ Yes | Both | `check_borrow_allowed` → LTV validation |
| **Withdraw Collateral** | 🔶 Conditional | Both (if has debt) | `check_withdrawal_allowed` only queries oracle if user has debt |
| **Liquidate** | ✅ Yes | Both | `calculate_health_factor` + collateral/debt value calculations |
| Supply (lend) | ❌ No | - | No oracle queries |
| Withdraw (supply) | ❌ No | - | No oracle queries |
| Supply Collateral | ❌ No | - | No oracle queries |
| Repay | ❌ No | - | No oracle queries |

### Contract References

- `borrow.rs:44-45`: `check_borrow_allowed(deps.as_ref(), &env, user, amount)?`
- `collateral.rs:79-80`: `check_withdrawal_allowed(deps.as_ref(), &env, user, withdraw_amount)?`
- `liquidate.rs:47-57`: `calculate_health_factor(...)` and `query_price(...)` calls
- `health.rs:165-170`: `check_withdrawal_allowed` skips oracle if `debt_amount.is_zero()`

---

## Implementation Plan

### Phase 1: Fix Environment Configuration

**File: `frontend/.env.example`**
```bash
# Pyth Network Configuration
NEXT_PUBLIC_PYTH_HERMES_URL=https://hermes.pyth.network
NEXT_PUBLIC_PYTH_CONTRACT_ADDRESS=  # Required for live mode
NEXT_PUBLIC_PYTH_MODE=mock          # 'mock' or 'live'
NEXT_PUBLIC_PYTH_FEE_DENOM=untrn    # Fee denom for Pyth updates
NEXT_PUBLIC_PYTH_FEE_AMOUNT=1       # Fee amount per update
```

### Phase 2: Optimize `getRelevantDenoms()`

**File: `lib/pyth/withPriceUpdate.ts`**

```typescript
/**
 * Get relevant denoms for a market operation
 * Returns empty array for operations that don't need oracle prices
 */
export function getRelevantDenoms(
  operation: string,
  collateralDenom: string,
  debtDenom: string,
  hasDebt?: boolean  // NEW: Pass user's debt status
): string[] {
  switch (operation) {
    // These operations ALWAYS need both prices
    case 'borrow':
    case 'liquidate':
      return [collateralDenom, debtDenom].filter(Boolean);
    
    // Withdraw collateral only needs prices if user has debt
    case 'withdraw_collateral':
      return hasDebt ? [collateralDenom, debtDenom].filter(Boolean) : [];
    
    // These operations NEVER need prices
    case 'supply':
    case 'withdraw':
    case 'supply_collateral':
    case 'repay':
      return [];
    
    default:
      console.warn(`[Pyth] Unknown operation: ${operation}, defaulting to both prices`);
      return [collateralDenom, debtDenom].filter(Boolean);
  }
}
```

### Phase 3: Update SigningClient Methods

**File: `lib/cosmjs/client.ts`**

Remove unnecessary price updates from methods that don't need them:

```typescript
// REMOVE supplyWithPriceUpdate - supply doesn't need prices
// REMOVE supplyCollateralWithPriceUpdate - supply_collateral doesn't need prices
// REMOVE repayWithPriceUpdate - repay doesn't need prices

// UPDATE withdrawCollateralWithPriceUpdate to accept hasDebt parameter
async withdrawCollateralWithPriceUpdate(
  marketAddress: string,
  amount: string | undefined,
  collateralDenom: string,
  debtDenom: string,
  hasDebt: boolean,  // NEW
  recipient?: string
) {
  const client = await this.connect();
  const pythConfig = this.getPythConfig();

  // Skip price updates if no debt (no oracle check needed)
  if (!hasDebt || pythConfig.mode === 'mock' || !pythConfig.pythContractAddress) {
    return this.withdrawCollateral(marketAddress, amount, recipient);
  }

  const msg: MarketExecuteMsg = { withdraw_collateral: { amount, recipient } };
  const relevantDenoms = getRelevantDenoms('withdraw_collateral', collateralDenom, debtDenom, hasDebt);

  return executeSingleWithPriceUpdate(
    client,
    this.address,
    marketAddress,
    msg,
    undefined,
    relevantDenoms,
    pythConfig
  );
}
```

### Phase 4: Update Market Detail Page

**File: `app/markets/[id]/page.tsx`**

```typescript
// For withdraw collateral, pass hasDebt flag
<WithdrawCollateralModal
  // ... existing props
  hasDebt={userDebt > 0}  // Already passed, use for Pyth too
/>

// In handleSupplyCollateral - no price update needed!
const result = await signingClient.supplyCollateral(market.address, coin);

// In handleSupply - no price update needed!
const result = await signingClient.supply(market.address, coin);
```

---

## Pyth Message Format Reference

### UpdatePriceFeeds Message (CosmWasm)

```json
{
  "update_price_feeds": {
    "data": ["BASE64_ENCODED_VAA_1", "BASE64_ENCODED_VAA_2"]
  }
}
```

### Hermes API Endpoint

```
GET https://hermes.pyth.network/v2/updates/price/latest?ids[]=<feed_id>&ids[]=<feed_id>

Response:
{
  "binary": {
    "data": ["<base64_vaa>", ...],
    "encoding": "base64"
  },
  "parsed": [...]
}
```

### Multi-Msg Transaction Structure

```
MsgExecuteContract 1: Pyth UpdatePriceFeeds (with fee)
MsgExecuteContract 2: Stone Market action (borrow/withdraw_collateral/liquidate)
```

---

## Gas Considerations

| Scenario | Extra Gas | Notes |
|----------|-----------|-------|
| 1 price feed update | ~50,000-80,000 | Single asset |
| 2 price feed updates | ~100,000-150,000 | Collateral + Debt |
| No price update needed | 0 | Supply, repay, etc. |

The `executeMultiple` call with `'auto'` gas estimation handles this, but users should be aware that price-sensitive operations cost more gas.

---

## Testing Checklist

- [ ] Borrow with fresh prices works
- [ ] Withdraw collateral with debt + fresh prices works
- [ ] Withdraw collateral without debt (no price update) works
- [ ] Liquidate with fresh prices works
- [ ] Supply without price update works
- [ ] Repay without price update works
- [ ] Mock mode skips all price updates
- [ ] Hermes failure doesn't block transaction (graceful degradation)

---

## References

- [Pyth CosmWasm Integration](https://docs.pyth.network/price-feeds/use-real-time-data/cosmwasm)
- [Hermes API Documentation](https://hermes.pyth.network/docs/)
- Stone contract files:
  - `contracts/market/src/execute/borrow.rs`
  - `contracts/market/src/execute/collateral.rs`
  - `contracts/market/src/execute/liquidate.rs`
  - `contracts/market/src/health.rs`

---

## Labels

`enhancement`, `pyth-integration`, `frontend`
