# Advanced Tab Data Analysis

This document analyzes each UI element in the Advanced tab design and maps them to available data sources.

## Screenshots Reference
- [advanced_tab_1.png](advanced_tab_1.png) - Instantaneous Rates, Oracle Attributes, IRM Breakdown
- [adavanced_tab_2.png](adavanced_tab_2.png) - Liquidations, Collateral at Risk, Liquidation History

---

## Section 1: Instantaneous Rates

| UI Element | Data Available? | Source | Calculation Needed? |
|------------|-----------------|--------|---------------------|
| **Instantaneous Rate (4.85%)** | ✅ Yes | `market.borrowRate` or `market.liquidityRate` | Convert from decimal (e.g., 0.0485 → 4.85%) |
| **Borrow/Supply/Rate at target toggle** | ✅ Partial | `borrowRate`, `liquidityRate` available | "Rate at target" needs calculation from IRM |
| **Historical rate chart** | ✅ Yes | `GET_MARKET_SNAPSHOTS` query | Use `borrowRate`/`liquidityRate` from snapshots over time |

### Calculation: Rate at Target

Use the IRM parameters (`interestRateModel` JSON) to calculate rate at `optimal_utilization`:

```typescript
const rateAtTarget = baseRate + (optimalUtilization * slope1);
```

---

## Section 2: Oracle Attributes

| UI Element | Data Available? | Source | Calculation Needed? |
|------------|-----------------|--------|---------------------|
| **Oracle address** | ✅ Yes | `market.oracle` | No - display as-is |
| **Trusted by (protocol icons)** | ❌ No | Not in schema | Would need external metadata about oracle sources |
| **Oracle price (cbBTC/USDC = 89,539.3)** | ⚠️ Partial | Need oracle query | Requires on-chain query to oracle contract |
| **Reference price** | ❌ No | Not in schema | Would need external price feed (CoinGecko, etc.) |
| **Value secured ($3.36B)** | ✅ Yes (calculable) | `totalCollateral` + oracle price | `totalCollateral * oraclePrice` |

---

## Section 3: IRM Breakdown

| UI Element | Data Available? | Source | Calculation Needed? |
|------------|-----------------|--------|---------------------|
| **Target utilization (90.00%)** | ✅ Yes | `market.interestRateModel.optimal_utilization` | Convert from decimal |
| **Current utilization (79.95%)** | ✅ Yes | `market.utilization` | Convert from decimal |
| **Borrow amount to target utilization ($141.25M)** | ✅ Yes (calculable) | Derived | `(targetUtil - currentUtil) * totalSupply * price` |
| **Interest rate model address** | ⚠️ Partial | `market.interestRateModel` is JSON params | May need separate IRM contract address field |
| **IRM curve chart** | ✅ Yes | `market.interestRateModel` params | Plot curve using `base_rate`, `slope_1`, `slope_2`, `optimal_utilization` |

### Calculation: IRM Curve

```typescript
function calculateRate(utilization: number, irm: IRM): number {
  const { base_rate, slope_1, slope_2, optimal_utilization } = irm;

  if (utilization <= optimal_utilization) {
    return base_rate + (utilization / optimal_utilization) * slope_1;
  } else {
    return base_rate + slope_1 +
      ((utilization - optimal_utilization) / (1 - optimal_utilization)) * slope_2;
  }
}
```

### Calculation: Borrow Amount to Target

```typescript
const borrowToTarget = (targetUtilization - currentUtilization) * totalSupply * oraclePrice;
```

---

## Section 4: Liquidations

| UI Element | Data Available? | Source | Calculation Needed? |
|------------|-----------------|--------|---------------------|
| **Liquidation Loan-To-Value (LLTV) 86%** | ✅ Yes | `market.liquidationThreshold` | Convert from decimal |
| **Liquidation Penalty (4.38%)** | ✅ Yes | `market.liquidationBonus` | Convert from decimal |
| **Realized Bad Debt (< 0.01 USDC)** | ❌ No | Not in schema | Would need to track bad debt events |
| **Unrealized Bad Debt (0.00 USDC)** | ❌ No | Not in schema | Would need to calculate from underwater positions |

---

## Section 5: Collateral at Risk Chart

| UI Element | Data Available? | Source | Calculation Needed? |
|------------|-----------------|--------|---------------------|
| **Chart data (collateral vs price drop %)** | ⚠️ Partial | `liquidatablePositions` query | Need to aggregate positions by price drop threshold |
| **USD/cbBTC toggle** | ✅ Yes | Oracle price for conversion | Multiply collateral by price |

### Calculation: Collateral at Risk by Price Drop

```typescript
function calculateCollateralAtRisk(
  positions: Position[],
  currentPrice: number,
  liquidationThreshold: number,
  priceDropPercentages: number[] // e.g., [-90, -80, -70, ..., 0]
): Map<number, number> {
  const result = new Map<number, number>();

  for (const priceDrop of priceDropPercentages) {
    let totalAtRisk = 0;
    const adjustedPrice = currentPrice * (1 + priceDrop / 100);

    for (const position of positions) {
      const adjustedCollateralValue = position.collateral * adjustedPrice;
      const adjustedLtv = position.debt / adjustedCollateralValue;

      if (adjustedLtv > liquidationThreshold) {
        totalAtRisk += position.collateral;
      }
    }

    result.set(priceDrop, totalAtRisk);
  }

  return result;
}
```

This requires fetching all positions for the market.

---

## Section 6: Liquidation History Table

| UI Element | Data Available? | Source | Calculation Needed? |
|------------|-----------------|--------|---------------------|
| **Date & Time** | ✅ Yes | `transaction.timestamp` | Format date |
| **Liquidated Wallet** | ✅ Yes | `transaction.borrower` | Display truncated address |
| **Collateral Seized (cbBTC)** | ✅ Yes | `transaction.collateralSeized` | Format with decimals |
| **Loan Repaid (USDC)** | ✅ Yes | `transaction.debtRepaid` | Format with decimals |
| **Realized Bad Debt** | ❌ No | Not tracked | Would need: `debtRepaid < (collateralSeized * price - bonus)` |

### Query

Use `GET_TRANSACTIONS` with `action: LIQUIDATE` filter:

```typescript
const { data } = useGetTransactionsQuery({
  variables: {
    marketId: market.id,
    action: 'LIQUIDATE',
    limit: 50
  }
});
```

---

## Summary: Data Availability

| Feature | Data Ready | Backend Changes Needed | Frontend Calculation |
|---------|------------|------------------------|---------------------|
| Instantaneous Rates | ✅ | None | Decimal to % conversion |
| Rate Historical Chart | ✅ | None | Use snapshots query |
| Rate at Target | ✅ | None | Calculate from IRM params |
| Oracle Address | ✅ | None | Display as-is |
| Oracle Trusted By | ❌ | Need oracle metadata | N/A |
| Oracle Price | ⚠️ | Need oracle query integration | On-chain query |
| Reference Price | ❌ | Need external price API | API integration |
| Value Secured | ⚠️ | Need oracle price | totalCollateral × price |
| IRM Parameters | ✅ | None | Parse JSON |
| IRM Curve Chart | ✅ | None | Calculate curve points |
| Borrow to Target | ✅ | None | Math calculation |
| LLTV | ✅ | None | Decimal to % |
| Liquidation Penalty | ✅ | None | Decimal to % |
| Bad Debt (Realized) | ❌ | Need bad debt tracking | Sum from events |
| Bad Debt (Unrealized) | ❌ | Need position analysis | Sum underwater positions |
| Collateral at Risk | ⚠️ | Need all positions query | Aggregate calculation |
| Liquidation History | ✅ | None | Query LIQUIDATE txns |

---

## Open Questions

### 1. Oracle Integration

How should we handle oracle price queries?

**Options:**
- **A) Direct on-chain query via CosmJS** - Query oracle contract directly
- **B) Add oracle price to indexer/GraphQL** - Index prices for faster access
- **C) Use external price API as fallback** - CoinGecko, etc.

### 2. Bad Debt Tracking

Do we want to implement bad debt tracking?

**Options:**
- **A) Add bad debt tracking to the indexer** - More accurate, requires backend work
- **B) Calculate on frontend from liquidation events** - Approximate, no backend changes
- **C) Skip this feature for now** - Show "N/A" or hide the fields

### 3. Collateral at Risk

This requires fetching all positions for the market.

**Options:**
- **A) Add dedicated GraphQL query** - Return pre-aggregated risk buckets from indexer
- **B) Fetch all positions client-side** - Calculate in browser (may be slow for large markets)
- **C) Add a new indexed field** - Store pre-computed risk data

### 4. Reference Price

Where should external price data come from?

**Options:**
- **A) CoinGecko API** - Popular, free tier available
- **B) Another price aggregator** - DefiLlama, etc.
- **C) Skip this feature** - Only show oracle price

---

## Implementation Priority

### Phase 1: Available Data (No Backend Changes) - IMPLEMENTED
1. ✅ Instantaneous Rates with historical chart
2. ✅ IRM Breakdown with curve visualization
3. ✅ Liquidation parameters (LLTV, penalty)
4. ✅ Liquidation History table (using mock data)
5. ✅ Oracle address display

### Phase 2: Oracle Integration - TODO
1. TODO: Oracle price querying (currently using mock data in `lib/mock/advanced-tab-data.ts`)
2. TODO: Value secured calculation (requires oracle price)
3. TODO: Borrow amount to target in USD (requires oracle price)

### Phase 3: Advanced Features - TODO
1. TODO: Collateral at risk chart data (currently using mock positions in `lib/mock/advanced-tab-data.ts`)
2. TODO: Bad debt tracking (if decided)
3. TODO: Reference price integration (CoinGecko/DefiLlama)
4. TODO: "Trusted by" oracle metadata

---

## Implementation Notes

The Advanced tab has been implemented with mock data for features requiring backend/oracle integration.

**Files with TODO items:**
- `lib/mock/advanced-tab-data.ts` - Mock data file with TODO comments for each data source
- `components/markets/advanced/AdvancedTab.tsx` - Main component with TODO comments
- `components/markets/advanced/OracleAttributes.tsx` - Oracle data component
- `components/markets/advanced/CollateralAtRisk.tsx` - Collateral risk chart
- `components/markets/advanced/LiquidationHistory.tsx` - Liquidation history table

**Calculation utilities (well-tested):**
- `lib/utils/irm.ts` - Interest Rate Model calculations (22 tests)
- `lib/utils/collateral-risk.ts` - Collateral at risk calculations (21 tests)
