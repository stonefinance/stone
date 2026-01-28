# Supply/Borrow State Refactor Plan

## Stone Finance — Market Detail Page Position UX

---

## 1. Current State Analysis

### Data Flow

```
GraphQL (PositionFields fragment)
  → useUserPosition hook (transforms to UserPosition)
    → MarketDetailPage (consumes position data)
      → "Your Position" tab (displays collateral/debt/LTV/health)
      → Action Panel (Lend/Borrow tabs with inputs)
      → Modals (RepayModal, WithdrawModal, WithdrawCollateralModal)
```

### What's Broken

The **market detail page** (`app/markets/[id]/page.tsx`) has a simple `Lend | Borrow` tab toggle (`actionTab` state: `'lend' | 'borrow'`), but:

1. **No position-type awareness.** The Lend and Borrow tabs are always both available regardless of user state. A user with outstanding debt can freely switch to the Lend tab and supply liquidity — there's nothing preventing this.

2. **"Your Position" tab is borrow-only.** It always shows Collateral, Debt, LTV, Health Factor — even if the user is a pure supplier with zero collateral/debt. A supplier sees `0.00` for collateral and debt, which is meaningless.

3. **No supply position display.** The position tab has no cards for "Your Supply" or "Supply APY earned." Supply info only appears in the Lend tab's action panel summary (`Your Supply`, `Supply APY`) — not in the dedicated position view.

4. **Action panel doesn't adapt.** A borrower sees the Lend tab with a full Supply form. A supplier sees the Borrow tab with collateral/borrow forms. Neither is contextually filtered.

### Key Variables in `page.tsx`

| Variable | Source | Purpose |
|---|---|---|
| `actionTab` | `useState<'lend' \| 'borrow'>('borrow')` | Controls which action panel is shown |
| `userCollateral` | `position?.collateralAmount` → `microToBase` | Collateral deposited (parsed float) |
| `userDebt` | `position?.debtAmount` → `microToBase` | Debt owed (parsed float) |
| `userSupply` | `position?.supplyAmount` → `microToBase` | Supply deposited (parsed float) |
| `currentLtv` | `userDebt / userCollateral * 100` | Current loan-to-value |

### UserPosition Type (`types/index.ts`)

```typescript
export interface UserPosition {
  marketId: string;
  collateralAmount: string;    // micro amount string
  collateralValue: number;     // USD (placeholder 0)
  supplyAmount: string;        // micro amount string
  supplyValue: number;         // USD (placeholder 0)
  debtAmount: string;          // micro amount string
  debtValue: number;           // USD (placeholder 0)
  healthFactor?: number;
  maxBorrowValue: number;
  liquidationPrice?: number;
}
```

All three amounts (collateral, supply, debt) exist on the same position object. The GraphQL `PositionFields` fragment returns `collateral`, `supplyAmount`, `debtAmount`, and `healthFactor`.

### Modals

| Modal | File | Triggered By |
|---|---|---|
| `RepayModal` | `components/modals/RepayModal.tsx` | "Repay" button (shown when `userDebt > 0`) |
| `WithdrawModal` | `components/modals/WithdrawModal.tsx` | "Withdraw Supply" button (shown when `userSupply > 0` on Lend tab) |
| `WithdrawCollateralModal` | `components/modals/WithdrawCollateralModal.tsx` | "Withdraw Collateral" button (shown when `userCollateral > 0` on Borrow tab) |
| `BorrowModal` | `components/modals/BorrowModal.tsx` | **Not currently used in page** — borrow is inline |

---

## 2. Position Type Detection

### Definitions

```typescript
type PositionType = 'none' | 'supply' | 'borrow' | 'both';
```

### Detection Logic

```typescript
function getPositionType(position: UserPosition | null): PositionType {
  if (!position) return 'none';

  const hasCollateral = parseFloat(position.collateralAmount) > 0;
  const hasDebt = parseFloat(position.debtAmount) > 0;
  const hasSupply = parseFloat(position.supplyAmount) > 0;

  // Borrow position = has collateral AND/OR debt
  const isBorrower = hasCollateral || hasDebt;
  // Supply position = has supplied tokens
  const isSupplier = hasSupply;

  if (isBorrower && isSupplier) return 'both';
  if (isBorrower) return 'borrow';
  if (isSupplier) return 'supply';
  return 'none';
}
```

### Derived Flags (useful for UI)

```typescript
const hasDebt = parseFloat(position?.debtAmount ?? '0') > 0;
const canSupply = !hasDebt;  // Cannot supply while owing debt
```

---

## 3. UI State Machine

### State → UI Mapping

| Position Type | "Your Position" Tab | Action Panel Default | Lend Tab | Borrow Tab |
|---|---|---|---|---|
| **none** | "No active position" prompt | Show both tabs, default to `borrow` | Full supply form | Full collateral + borrow form |
| **supply** | Supply amount, APY, yield earned | Default to `lend` tab | Full supply form + withdraw button | Full collateral + borrow form |
| **borrow** | Collateral, Debt, LTV, Health Factor | Default to `borrow` tab | **Blocked** — show "Repay debt first" banner + Repay button | Full collateral + borrow + repay/withdraw buttons |
| **both** | Both supply AND borrow sections | Default to `borrow` tab | **Blocked** — show "Repay debt first" banner + Repay button | Full collateral + borrow + repay/withdraw buttons |

### Action Blocking Detail

When `hasDebt === true` and user clicks the **Lend** tab:

```
┌─────────────────────────────────────┐
│  ⚠️ Active Debt                     │
│                                     │
│  You have outstanding debt of       │
│  125.50 USDC in this market.        │
│                                     │
│  You must repay your debt before    │
│  supplying liquidity.               │
│                                     │
│  [Repay Debt]  (primary button)     │
│                                     │
│  Current Debt: 125.50 USDC         │
│  Borrow APY: 5.2%                  │
└─────────────────────────────────────┘
```

### "Your Position" Tab Variants

**No Position:**
```
┌─────────────────────────────────────┐
│  You don't have a position in this  │
│  market yet.                        │
│                                     │
│  → Supply liquidity to earn yield   │
│  → Deposit collateral and borrow    │
└─────────────────────────────────────┘
```

**Supply Position:**
```
┌─────────────┬───────────────────────┐
│ Your Supply │ Supply APY            │
│ 1,000 USDC  │ 3.2%                 │
├─────────────┴───────────────────────┤
│ Estimated Yield (annual): 32.00     │
└─────────────────────────────────────┘
```

**Borrow Position:**
```
┌─────────────┬───────────────────────┐
│ Collateral  │ Debt                  │
│ 500 ATOM    │ 125.50 USDC          │
├─────────────┼───────────────────────┤
│ Current LTV │ Health Factor         │
│ 45%         │ 1.92                  │
└─────────────┴───────────────────────┘
```

**Both (edge case):**
Shows both cards (separate collateral card + borrow card) with a warning banner:
```
⚠️ You have both a supply and borrow position. Consider repaying your debt first.
```

> **Design Decision (2026-01-27):** Use separate cards for collateral vs borrow/supply — not a single combined card.

---

## 4. Files to Change

### Core Changes

| File | Change |
|---|---|
| `types/index.ts` | Add `PositionType` type and export it |
| `hooks/useUserPosition.ts` | Add `positionType` to return value, add `getPositionType()` helper |
| `app/markets/[id]/page.tsx` | Major refactor — position-aware tabs, blocked states, adaptive position display |

### New Files

| File | Purpose |
|---|---|
| `components/markets/position/PositionDisplay.tsx` | Adaptive position display component (replaces inline cards) |
| `components/markets/position/NoPosition.tsx` | Empty state for no position |
| `components/markets/position/SupplyPosition.tsx` | Supply position card |
| `components/markets/position/BorrowPosition.tsx` | Borrow position card (collateral + debt + LTV + health) |
| `components/markets/position/index.ts` | Barrel export |
| `components/markets/actions/DebtBlocker.tsx` | "Repay debt first" blocker for the Lend tab |

### Minor Changes

| File | Change |
|---|---|
| `components/modals/RepayModal.tsx` | Add optional `onFullRepay` callback for position type transitions |
| `app/dashboard/page.tsx` | Use `PositionType` to show position type labels on cards (nice-to-have) |

---

## 5. Component Changes

### New: `PositionDisplay.tsx`

```typescript
// components/markets/position/PositionDisplay.tsx

interface PositionDisplayProps {
  position: UserPosition | null;
  positionType: PositionType;
  market: MarketDetail;
  isConnected: boolean;
}

export function PositionDisplay({ position, positionType, market, isConnected }: PositionDisplayProps) {
  if (!isConnected) return <ConnectWalletPrompt />;

  switch (positionType) {
    case 'none':
      return <NoPosition />;
    case 'supply':
      return <SupplyPosition position={position!} market={market} />;
    case 'borrow':
      return <BorrowPosition position={position!} market={market} />;
    case 'both':
      return (
        <>
          <DebtWarningBanner />
          <SupplyPosition position={position!} market={market} />
          <BorrowPosition position={position!} market={market} />
        </>
      );
  }
}
```

### New: `SupplyPosition.tsx`

Shows:
- Supply amount and denom (e.g., "1,000.00 USDC")
- Supply APY from market data
- Estimated annual yield: `supplyAmount * supplyApy / 100`

### New: `BorrowPosition.tsx`

Shows (same 2x2 grid as current):
- Collateral amount + denom
- Debt amount + denom
- Current LTV
- Health Factor

### New: `DebtBlocker.tsx`

```typescript
// components/markets/actions/DebtBlocker.tsx

interface DebtBlockerProps {
  debtAmount: number;
  debtDenom: string;
  borrowApy: number;
  onRepayClick: () => void;
}

export function DebtBlocker({ debtAmount, debtDenom, borrowApy, onRepayClick }: DebtBlockerProps) {
  return (
    <div className="space-y-4">
      <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg space-y-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-500" />
          <h3 className="font-semibold text-yellow-600 dark:text-yellow-500">Active Debt</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          You have outstanding debt of <strong>{formatDisplayAmount(debtAmount)} {debtDenom}</strong>.
          You must repay your debt before supplying liquidity.
        </p>
      </div>

      <div className="space-y-3 pt-2 border-t">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Current Debt</span>
          <span>{formatDisplayAmount(debtAmount)} {debtDenom}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Borrow APY</span>
          <span className="text-red-600">{formatPercentage(borrowApy)}</span>
        </div>
      </div>

      <Button className="w-full h-12 text-base" onClick={onRepayClick}>
        Repay Debt
      </Button>
    </div>
  );
}
```

### Modified: `page.tsx` Action Panel

The core change in the page is replacing the hardcoded Lend tab content:

```typescript
// Before (current):
{actionTab === 'lend' ? (
  <>
    {/* Supply input, summary, button — always shown */}
  </>
) : (
  <>
    {/* Collateral + Borrow inputs — always shown */}
  </>
)}

// After:
{actionTab === 'lend' ? (
  hasDebt ? (
    <DebtBlocker
      debtAmount={userDebt}
      debtDenom={market.debtDenom}
      borrowApy={rate}
      onRepayClick={() => setRepayModalOpen(true)}
    />
  ) : (
    <>
      {/* Existing supply form — unchanged */}
    </>
  )
) : (
  <>
    {/* Existing collateral + borrow form — unchanged */}
  </>
)}
```

### Modified: `actionTab` default

```typescript
// Before:
const [actionTab, setActionTab] = useState<'lend' | 'borrow'>('borrow');

// After — derive default from position type:
const positionType = getPositionType(position);
const defaultTab = positionType === 'supply' ? 'lend' : 'borrow';
const [actionTab, setActionTab] = useState<'lend' | 'borrow'>(defaultTab);
```

**Problem:** `position` may load after initial render (async). Need to sync:

```typescript
const [actionTab, setActionTab] = useState<'lend' | 'borrow'>('borrow');
const [hasInitializedTab, setHasInitializedTab] = useState(false);

useEffect(() => {
  if (position && !hasInitializedTab) {
    const type = getPositionType(position);
    if (type === 'supply') setActionTab('lend');
    setHasInitializedTab(true);
  }
}, [position, hasInitializedTab]);
```

---

## 6. Action Flow Changes

### Per-Action Behavior Matrix

| Action | No Position | Supply Only | Borrow Only | Both |
|---|---|---|---|---|
| **Supply** | ✅ Enabled | ✅ Enabled | ❌ Blocked (DebtBlocker) | ❌ Blocked (DebtBlocker) |
| **Withdraw Supply** | Hidden | ✅ Button shown | Hidden | ✅ Button shown |
| **Add Collateral** | ✅ Enabled | ✅ Enabled | ✅ Enabled | ✅ Enabled |
| **Borrow** | ✅ Enabled (needs collateral first) | ✅ Enabled | ✅ Enabled | ✅ Enabled |
| **Repay** | Hidden | Hidden | ✅ Button shown | ✅ Button shown |
| **Withdraw Collateral** | Hidden | Hidden | ✅ Button shown | ✅ Button shown |

### Supply → Borrow Transition

1. User has supply position, clicks Borrow tab
2. Adds collateral → executes `supply_collateral`
3. Borrows → executes `borrow`
4. **Position type changes from `supply` to `both`**
5. After `refetchAll()`, Lend tab now shows DebtBlocker
6. UI naturally guides user to Borrow tab

### Borrow → Repay → Supply Transition

1. User has borrow position with debt
2. Clicks Repay → RepayModal opens → repays full debt
3. `onSuccess` fires → `refetchAll()`
4. If collateral remains but debt = 0, position type = `borrow` (has collateral)
5. User withdraws collateral → position type = `none`
6. Now Lend tab is fully unlocked

### RepayModal `onFullRepay` Enhancement

When debt is fully repaid (debt amount drops to 0), the RepayModal should signal this so the page can potentially auto-switch to the Lend tab or show a success state. The existing `onSuccess` callback already handles this — `refetchAll()` will update `position`, which updates `positionType`, which updates the UI reactively.

No new callback needed — the existing flow handles this naturally.

---

## 7. Edge Cases

### 7.1 Race Condition: Position loads after render
**Problem:** `actionTab` defaults to `'borrow'` before position data loads. If user is a supplier, they see the Borrow tab briefly.
**Solution:** Use the `useEffect` sync pattern above. Alternatively, show a loading skeleton for the action panel until position loads.

### 7.2 Position transitions mid-session
**Problem:** User repays all debt. Position type changes from `borrow` → `borrow` (still has collateral) or `none` (all withdrawn).
**Solution:** Position type is derived from live `position` data. After `refetchAll()`, everything re-evaluates automatically. No stale state.

### 7.3 "Both" position — what to do
**Problem:** A user somehow has both supply AND debt (maybe from a previous version or direct contract interaction).
**Solution:** Show both position displays with a warning banner. Block further supply. Show prominent "Repay Debt" CTA. Don't break — just guide.

### 7.4 Dust amounts
**Problem:** User repays debt but dust remains (e.g., `"1"` micro = 0.000001 base). This looks like zero but position type stays `borrow`.
**Solution:** Use a threshold for detection:
```typescript
const DUST_THRESHOLD = 100; // 100 micro units = 0.0001 base
const hasDebt = parseInt(position.debtAmount) > DUST_THRESHOLD;
```

### 7.5 Wallet disconnect during position
**Problem:** User disconnects wallet — position data clears, UI should reset gracefully.
**Solution:** Already handled — `useUserPosition` skips query when `!isConnected`. Position becomes `null`, positionType becomes `'none'`. Action panel shows "Connect Wallet" buttons (existing behavior).

### 7.6 Optimistic UI during transactions
**Problem:** After submitting a supply TX, the position hasn't updated yet but user immediately tries another action.
**Solution:** The existing `isSupplying` / `isBorrowing` loading states handle button disabling. The 10-second poll interval on `useUserPosition` will pick up changes. `refetchAll()` after each TX already forces immediate refresh.

### 7.7 The Lend tab shows stale supply form briefly after getting debt
**Problem:** User borrows (from Borrow tab), then clicks Lend tab. Between the TX completing and `refetchAll()` returning, the Lend tab might still show the supply form.
**Solution:** `refetchAll()` is awaited in `handleBorrow`. By the time the user can interact again, position is refreshed. The `isBorrowing` flag blocks interaction during the TX.

---

## 8. Implementation Order

### Phase 1: Position Type Logic (no UI changes yet)

1. **Add `PositionType` to `types/index.ts`**
   ```typescript
   export type PositionType = 'none' | 'supply' | 'borrow' | 'both';
   ```

2. **Add `getPositionType()` utility**
   Create `lib/utils/position.ts`:
   ```typescript
   import { UserPosition, PositionType } from '@/types';
   
   const DUST_THRESHOLD = 100;
   
   export function getPositionType(position: UserPosition | null): PositionType {
     if (!position) return 'none';
     const hasCollateral = parseInt(position.collateralAmount) > DUST_THRESHOLD;
     const hasDebt = parseInt(position.debtAmount) > DUST_THRESHOLD;
     const hasSupply = parseInt(position.supplyAmount) > DUST_THRESHOLD;
     const isBorrower = hasCollateral || hasDebt;
     const isSupplier = hasSupply;
     if (isBorrower && isSupplier) return 'both';
     if (isBorrower) return 'borrow';
     if (isSupplier) return 'supply';
     return 'none';
   }
   ```

3. **Extend `useUserPosition` return value**
   Add `positionType` to the hook return:
   ```typescript
   const positionType = getPositionType(transformedPosition);
   return { data: transformedPosition, positionType, isLoading, error, refetch };
   ```

**Test:** Verify position type detection with mock data. Write unit tests for `getPositionType`.

### Phase 2: Position Display Components

4. **Create `components/markets/position/` directory**
   - `NoPosition.tsx`
   - `SupplyPosition.tsx`
   - `BorrowPosition.tsx`
   - `PositionDisplay.tsx` (router)
   - `index.ts` (barrel)

5. **Replace inline position cards in `page.tsx`**
   Swap the current `TabsContent value="position"` body with:
   ```tsx
   <PositionDisplay
     position={position}
     positionType={positionType}
     market={market}
     isConnected={isConnected}
   />
   ```

**Test:** Verify all four position states render correctly. Check that existing borrow position cards look identical.

### Phase 3: Debt Blocker

6. **Create `DebtBlocker.tsx`**
   As specified in Section 5.

7. **Wire into page.tsx Lend tab**
   Replace Lend tab content with conditional:
   ```tsx
   {actionTab === 'lend' ? (
     hasDebt ? (
       <DebtBlocker ... />
     ) : (
       <>{/* existing supply form */}</>
     )
   ) : ( ... )}
   ```

**Test:** Verify that:
- User with no debt sees normal supply form
- User with debt sees DebtBlocker with correct amounts
- "Repay Debt" button opens RepayModal
- After repaying all debt, supply form reappears

### Phase 4: Smart Tab Defaults

8. **Add `useEffect` for initial tab sync**
   As specified in Section 5. Suppliers land on Lend tab, borrowers on Borrow tab.

**Test:** Navigate to market page as supplier — should see Lend tab. As borrower — should see Borrow tab. As no-position — should see Borrow tab (default).

### Phase 5: Polish & Edge Cases

9. **Add dust threshold handling** in `getPositionType`
10. **Add "both" position warning banner**
11. **Update dashboard page** to show position type badges (nice-to-have)
12. **Test all transition flows:** none→supply, none→borrow, supply→both→repay→supply, borrow→repay→none

---

## Summary of All File Changes

| File | Action | LOC Estimate |
|---|---|---|
| `types/index.ts` | Add `PositionType` | +1 |
| `lib/utils/position.ts` | **New** — `getPositionType()` | ~25 |
| `lib/utils/position.test.ts` | **New** — unit tests | ~50 |
| `hooks/useUserPosition.ts` | Add `positionType` to return | +5 |
| `components/markets/position/NoPosition.tsx` | **New** | ~20 |
| `components/markets/position/SupplyPosition.tsx` | **New** | ~40 |
| `components/markets/position/BorrowPosition.tsx` | **New** — extract from page.tsx | ~50 |
| `components/markets/position/PositionDisplay.tsx` | **New** — router component | ~30 |
| `components/markets/position/index.ts` | **New** — barrel | ~5 |
| `components/markets/actions/DebtBlocker.tsx` | **New** | ~45 |
| `app/markets/[id]/page.tsx` | Refactor position tab + lend tab + tab default | ~-30, +40 (net +10) |
| **Total** | | ~280 |
