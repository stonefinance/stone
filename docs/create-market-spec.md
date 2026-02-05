# Stone Protocol — "Create Market" Feature Spec

> **Version:** 1.0  
> **Date:** 2026-02-05  
> **Status:** Ready for implementation  
> **Audience:** Frontend developers

---

## 1. Executive Summary

This spec describes a new **Create Market** page/flow in the Stone Protocol frontend that allows any user to deploy an isolated lending market via the `FactoryExecuteMsg::CreateMarket` message. Market creation is **permissionless** — anyone who pays the creation fee can create one. The creator becomes the market's **curator** and retains limited governance rights (adjusting certain parameters post-creation).

---

## 2. Architecture Overview

### How market creation works on-chain

1. **User sends `CreateMarket`** to the **Factory contract** (with creation fee attached as funds).
2. Factory **validates all parameters** (LTV < liquidation threshold, bonus range, fee caps, IRM validity).
3. Factory **validates the oracle** — queries it for both collateral and debt denom prices, checks code ID, staleness, and non-zero price.
4. Factory **instantiates a new Market contract** via `WasmMsg::Instantiate` (submessage with reply).
5. On successful reply, Factory **indexes the market** by ID, address, curator, collateral denom, and debt denom.

The oracle adapter contract (Pyth) must **already have price feeds registered** for both the collateral and debt denoms before market creation. The adapter's `SetPriceFeed` is owner-only, so users **cannot** register arbitrary new feeds themselves.

### Key contracts

| Contract | Role |
|----------|------|
| **Factory** (`stone_factory`) | Creates and indexes markets, holds config |
| **Market** (`stone_market`) | Individual isolated lending pool |
| **Pyth Oracle Adapter** (`pyth_oracle_adapter`) | Wraps Pyth Network; maps denoms → feed IDs |
| **Pyth Contract** (external) | On-chain Pyth price feeds |

---

## 3. Complete Parameter Reference

### 3.1 `FactoryExecuteMsg::CreateMarket` Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `collateral_denom` | `String` | ✅ | Token denom for collateral (e.g., `uatom`) |
| `debt_denom` | `String` | ✅ | Token denom for borrowable asset (e.g., `uusdc`) |
| `oracle_config` | `OracleConfigUnchecked` | ✅ | Oracle address + type config (see §3.2) |
| `params` | `CreateMarketParams` | ✅ | All risk/fee/IRM parameters (see §3.3) |
| `salt` | `Option<u64>` | ❌ | Optional salt for creating multiple markets with same pair+curator |

**Funds required:** The factory's `market_creation_fee` (queryable from factory config). Currently `1000000 stake` in local dev.

### 3.2 `OracleConfigUnchecked`

| Field | Type | Description |
|-------|------|-------------|
| `address` | `String` | Address of the oracle adapter contract |
| `oracle_type` | `OracleType` | Enum — one of `Generic`, `Pyth`, or `Chainlink` |

**`OracleType::Pyth` variant:**

| Field | Type | Description |
|-------|------|-------------|
| `expected_code_id` | `u64` | Code ID the Pyth adapter was uploaded with (validated on-chain) |
| `max_staleness_secs` | `u64` | Max acceptable price age in seconds |
| `max_confidence_ratio` | `Decimal` | Max Pyth confidence/price ratio (e.g., `0.01` = 1%) |

**`OracleType::Generic` variant:**

| Field | Type | Description |
|-------|------|-------------|
| `expected_code_id` | `Option<u64>` | Optional code ID check |
| `max_staleness_secs` | `u64` | Max acceptable price age |

### 3.3 `CreateMarketParams` — All Fields

| Field | Type | Contract Validation | Recommended Default | Description |
|-------|------|---------------------|---------------------|-------------|
| `loan_to_value` | `Decimal` | Must be < `liquidation_threshold` | `0.75` (75%) | Max borrow power vs collateral value |
| `liquidation_threshold` | `Decimal` | Must be < `1.0` | `0.80` (80%) | HF threshold for liquidation |
| `liquidation_bonus` | `Decimal` | Must be ≥ 3% and ≤ 15% | `0.05` (5%) | Bonus collateral given to liquidators |
| `liquidation_protocol_fee` | `Decimal` | (no explicit range check beyond fee sum) | `0.10` (10%) | Protocol's cut of liquidation bonus |
| `close_factor` | `Decimal` | (no explicit range check) | `0.50` (50%) | Max portion of debt liquidatable at once |
| `dust_debt_threshold` | `Uint128` | Must be ≤ `10_000_000` | `1000000` | Below this, full liquidation allowed (micro-units) |
| `interest_rate_model` | `InterestRateModel::Linear` | `optimal_utilization` ≤ 1.0; all rates ≥ 0 | See §3.4 | Kinked linear rate model |
| `protocol_fee` | `Decimal` | `protocol_fee + curator_fee < 1.0` | `0.10` (10%) | Protocol's share of interest |
| `curator_fee` | `Decimal` | Must be ≤ 25% | `0.05` (5%) | Curator's share of interest |
| `supply_cap` | `Option<Uint128>` | — | `null` (unlimited) | Max total supply (micro-units) |
| `borrow_cap` | `Option<Uint128>` | — | `null` (unlimited) | Max total borrows (micro-units) |
| `is_mutable` | `bool` | — | `true` | Whether curator can update LTV later |

### 3.4 Interest Rate Model Defaults

```
InterestRateModel::Linear {
    optimal_utilization: "0.80",  // 80%
    base_rate: "0.02",            // 2%  (at 0% utilization)
    slope_1: "0.04",              // 4%  (rate increase up to optimal)
    slope_2: "0.75",              // 75% (steep rate increase above optimal)
}
```

This matches the deploy script defaults and produces:
- At 0% util → 2% borrow rate
- At 80% util → 6% borrow rate  
- At 100% util → 81% borrow rate

---

## 4. Transaction Flow

### 4.1 Prerequisites

1. **Oracle adapter** must already have price feeds registered for both denoms. This is owner-controlled — users can't register new feeds. The UI should query the adapter's `AllPriceFeeds` to show which denoms are available, or attempt a price query and surface the error.

2. **Pyth price data** must be fresh on-chain. Since the factory validates prices during `CreateMarket`, the transaction should **bundle Pyth Hermes VAA updates** (same pattern as existing borrow/supply operations).

3. **User has sufficient creation fee** in their wallet.

### 4.2 Message Sequence (Single Atomic Transaction)

```
[Msg 1]  update_price_feeds on Pyth contract     (optional, Hermes VAA data)
[Msg 2]  create_market on Factory contract        (with creation fee as funds)
```

This is a **multi-msg transaction** via `client.executeMultiple()`, following the existing `withPriceUpdate` pattern. The price update ensures oracle staleness validation passes.

### 4.3 Implementation Pattern

Use the existing `executeWithPriceUpdate` helper from `lib/pyth/withPriceUpdate.ts`:

```typescript
// Build the create_market instruction
const createMarketInstruction = {
  contractAddress: FACTORY_ADDRESS,
  msg: {
    create_market: {
      collateral_denom: "uatom",
      debt_denom: "uusdc",
      oracle_config: { ... },
      params: { ... },
      salt: null,
    }
  },
  funds: [creationFee],
};

// Bundle with price updates
const result = await executeWithPriceUpdate(
  client,
  senderAddress,
  [createMarketInstruction],
  [collateralDenom, debtDenom],  // denoms needing fresh prices
  pythConfig
);
```

### 4.4 Post-Creation

After successful tx, the new market address is available in the transaction events (`wasm.market_address` attribute). The UI should:
1. Show success with the new market address
2. Navigate to the market's detail page
3. Invalidate/refresh the markets list cache

---

## 5. UI/UX Design

### 5.1 Page Location

**Route:** `/markets/create`  
**Access:** Button on the markets list page ("Create Market" / "+ New Market")

### 5.2 Two-Mode Design: Simple vs Advanced

#### Simple Mode (default)

Shows only the essential fields that require user judgment:

| Field | Input Type | Notes |
|-------|-----------|-------|
| **Collateral Asset** | Searchable dropdown | Filter by denoms with oracle feeds |
| **Debt Asset** | Searchable dropdown | Filter by denoms with oracle feeds; must differ from collateral |
| **Loan-to-Value (LTV)** | Slider + number input | 50–90% range, step 1% |
| **Liquidation Threshold** | Slider + number input | Auto-set to LTV+5%, editable |
| **Curator Fee** | Number input | 0–25%, default 5% |
| **Mutable** | Toggle | Default: on |

All other parameters use sensible defaults (§3.3 and §3.4).

#### Advanced Mode (expandable section / toggle)

Reveals all remaining parameters:

**Liquidation Settings:**
- Liquidation Bonus (3–15%, default 5%)
- Liquidation Protocol Fee (default 10%)
- Close Factor (default 50%)
- Dust Debt Threshold (default 1,000,000 micro-units)

**Interest Rate Model:**
- Optimal Utilization (0–100%)
- Base Rate
- Slope 1 (below optimal)
- Slope 2 (above optimal)
- **Live preview chart** showing rate curve based on inputs

**Caps & Fees:**
- Supply Cap (optional)
- Borrow Cap (optional)
- Protocol Fee on Interest (default 10%)

**Oracle Config (read-only or advanced):**
- Oracle Address (pre-filled from known adapter)
- Oracle Type (Pyth / Generic)
- Max Staleness (seconds)
- Max Confidence Ratio (for Pyth)
- Expected Code ID

**Other:**
- Salt (optional, for duplicate pair markets)

### 5.3 Asset Selection UX

**Recommended approach: Searchable dropdown of denoms with registered oracle feeds.**

Steps:
1. On page load, query the Pyth oracle adapter's `AllPriceFeeds` endpoint to get all registered `{denom, feed_id}` pairs.
2. Cross-reference with the frontend's known denom metadata (`lib/pyth/config.ts` — `DEFAULT_PYTH_FEEDS`) to get display names and symbols.
3. Show a dropdown with: Token icon, Symbol, Denom, and Pyth feed symbol (e.g., "ATOM/USD").
4. If a user needs a denom that isn't registered, show a clear message: "This asset doesn't have an oracle feed registered. Contact the protocol team."

**Why not paste-a-feed-ID?** Because the Pyth oracle adapter's `SetPriceFeed` is owner-only. Users can't register new feed→denom mappings. They can only use denoms already registered in the adapter. Pasting raw feed IDs would be misleading.

### 5.4 Validation Rules (Client-Side)

Enforce these **before** submitting the transaction:

| Rule | Error Message |
|------|---------------|
| Collateral ≠ Debt denom | "Collateral and debt must be different assets" |
| LTV < Liquidation Threshold | "LTV must be lower than liquidation threshold" |
| Liquidation Threshold < 100% | "Liquidation threshold must be less than 100%" |
| 3% ≤ Liquidation Bonus ≤ 15% | "Liquidation bonus must be between 3% and 15%" |
| Curator Fee ≤ 25% | "Curator fee cannot exceed 25%" |
| Protocol Fee + Curator Fee < 100% | "Total fees must be less than 100%" |
| Dust Debt Threshold ≤ 10,000,000 | "Dust threshold exceeds maximum" |
| Optimal Utilization ≤ 100% | "Optimal utilization must be ≤ 100%" |
| Base Rate ≥ 0, Slope1 ≥ 0, Slope2 ≥ 0 | "Interest rate parameters must be non-negative" |
| User has enough funds for creation fee | "Insufficient balance for market creation fee" |
| Oracle can provide prices for both denoms | "No oracle feed for [denom]" |

### 5.5 Summary Panel

Before submission, show a **review summary** (similar to a swap confirmation):

```
┌─────────────────────────────────────────┐
│           Create Market Review           │
├─────────────────────────────────────────┤
│ Collateral:  ATOM (uatom)               │
│ Debt:        USDC (uusdc)               │
│ Oracle:      Pyth Network               │
│                                          │
│ LTV:                   75%               │
│ Liquidation Threshold: 80%               │
│ Liquidation Bonus:     5%                │
│ Curator Fee:           5%                │
│ Protocol Fee:          10%               │
│                                          │
│ IRM: Linear (80% optimal, 2% base,      │
│      4% slope1, 75% slope2)             │
│                                          │
│ Creation Fee: 1.0 STAKE                  │
│ You are: Curator (can adjust params)     │
├─────────────────────────────────────────┤
│      [Cancel]         [Create Market]    │
└─────────────────────────────────────────┘
```

### 5.6 Loading / Success / Error States

**Loading:** "Creating market... This may take 10-15 seconds." Show spinner. Disable form.

**Success:**  
- "Market created successfully!"  
- Show market address (truncated, copyable)  
- "View Market" button → navigates to `/markets/[id]`  
- Confetti optional 🎉

**Error:** Parse contract error messages and display human-readable versions:
- `InsufficientCreationFee` → "Insufficient balance. You need X STAKE."
- `SameDenom` → "Collateral and debt must be different assets."
- `InvalidOracle { denom }` → "Oracle cannot provide price for {denom}. The price feed may not be registered."
- `OraclePriceStale` → "Oracle price is stale. Please try again."
- `MarketAlreadyExists` → "A market with these exact parameters already exists. Use a different salt value."

---

## 6. Technical Implementation Plan

### 6.1 New Files to Create

```
frontend/
├── app/markets/create/
│   └── page.tsx                    # Create Market page
├── components/markets/create/
│   ├── CreateMarketForm.tsx        # Main form component
│   ├── AssetSelector.tsx           # Denom selection with oracle feed awareness
│   ├── RiskParameters.tsx          # LTV / liquidation / close factor inputs
│   ├── InterestRateModelForm.tsx   # IRM parameters with live curve preview
│   ├── FeeParameters.tsx           # Protocol/curator fee inputs
│   ├── OracleConfigDisplay.tsx     # Oracle config (read-only for simple mode)
│   ├── IRMPreviewChart.tsx         # Interactive rate curve visualization
│   └── CreateMarketReview.tsx      # Pre-submission review modal
├── hooks/
│   ├── useOracleFeeds.ts           # Query oracle adapter for registered feeds
│   ├── useFactoryConfig.ts         # Query factory for creation fee, code ID, etc.
│   └── useCreateMarket.ts          # Execute create_market transaction
├── lib/constants/
│   └── market-defaults.ts          # Default parameter values
└── types/
    └── create-market.ts            # TypeScript types for create market form
```

### 6.2 New Types

```typescript
// types/create-market.ts

export interface CreateMarketFormValues {
  collateralDenom: string;
  debtDenom: string;
  loanToValue: string;          // Decimal string, e.g., "0.75"
  liquidationThreshold: string;
  liquidationBonus: string;
  liquidationProtocolFee: string;
  closeFactor: string;
  dustDebtThreshold: string;    // Uint128 string
  interestRateModel: {
    optimalUtilization: string;
    baseRate: string;
    slope1: string;
    slope2: string;
  };
  protocolFee: string;
  curatorFee: string;
  supplyCap: string | null;     // null = unlimited
  borrowCap: string | null;
  isMutable: boolean;
  salt: number | null;
}

export interface OracleConfig {
  address: string;
  oracleType: 'pyth' | 'generic';
  expectedCodeId: number;
  maxStalenessSecs: number;
  maxConfidenceRatio?: string;  // Pyth only
}

export interface RegisteredFeed {
  denom: string;
  feedId: string;
  symbol?: string;  // From frontend config
}
```

### 6.3 Key Hook: `useCreateMarket`

```typescript
// hooks/useCreateMarket.ts

export function useCreateMarket() {
  const { signingClient, address } = useWallet();
  const { addPendingTransaction, markCompleted, markFailed } = usePendingTransactions();

  async function createMarket(
    values: CreateMarketFormValues,
    oracleConfig: OracleConfig,
    creationFee: Coin
  ) {
    if (!signingClient || !address) throw new Error('Wallet not connected');

    const client = await signingClient.connect();
    const pythConfig = signingClient.getPythConfig();

    // Build the create_market message
    const msg = {
      create_market: {
        collateral_denom: values.collateralDenom,
        debt_denom: values.debtDenom,
        oracle_config: {
          address: oracleConfig.address,
          oracle_type: oracleConfig.oracleType === 'pyth'
            ? {
                pyth: {
                  expected_code_id: oracleConfig.expectedCodeId,
                  max_staleness_secs: oracleConfig.maxStalenessSecs,
                  max_confidence_ratio: oracleConfig.maxConfidenceRatio || "0.01",
                }
              }
            : {
                generic: {
                  expected_code_id: oracleConfig.expectedCodeId || null,
                  max_staleness_secs: oracleConfig.maxStalenessSecs,
                }
              },
        },
        params: {
          loan_to_value: values.loanToValue,
          liquidation_threshold: values.liquidationThreshold,
          liquidation_bonus: values.liquidationBonus,
          liquidation_protocol_fee: values.liquidationProtocolFee,
          close_factor: values.closeFactor,
          dust_debt_threshold: values.dustDebtThreshold,
          interest_rate_model: {
            linear: {
              optimal_utilization: values.interestRateModel.optimalUtilization,
              base_rate: values.interestRateModel.baseRate,
              slope_1: values.interestRateModel.slope1,
              slope_2: values.interestRateModel.slope2,
            },
          },
          protocol_fee: values.protocolFee,
          curator_fee: values.curatorFee,
          supply_cap: values.supplyCap,
          borrow_cap: values.borrowCap,
          is_mutable: values.isMutable,
        },
        salt: values.salt,
      },
    };

    const instruction = {
      contractAddress: FACTORY_ADDRESS,
      msg,
      funds: [creationFee],
    };

    // Bundle with Pyth price updates
    const relevantDenoms = [values.collateralDenom, values.debtDenom];
    return executeWithPriceUpdate(
      client, address, [instruction],
      relevantDenoms, pythConfig
    );
  }

  return { createMarket };
}
```

### 6.4 Key Hook: `useOracleFeeds`

```typescript
// hooks/useOracleFeeds.ts

export function useOracleFeeds(oracleAdapterAddress: string) {
  // Query AllPriceFeeds from the Pyth oracle adapter
  // Returns array of { denom, feedId }
  // Merge with DEFAULT_PYTH_FEEDS for display names/symbols
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['oracle-feeds', oracleAdapterAddress],
    queryFn: async () => {
      const client = await queryClient.connect();
      const feeds: PriceFeedInfo[] = await client.queryContractSmart(
        oracleAdapterAddress,
        { all_price_feeds: { limit: 30 } }
      );
      return feeds.map(feed => ({
        denom: feed.denom,
        feedId: feed.feed_id,
        symbol: DEFAULT_PYTH_FEEDS[feed.denom]?.symbol || feed.denom,
      }));
    },
  });

  return { feeds: data || [], isLoading, error };
}
```

### 6.5 Oracle Address Discovery

The frontend needs to know the oracle adapter address. Options:
1. **Environment variable:** `NEXT_PUBLIC_ORACLE_ADDRESS` (already written by deploy script)
2. **Query from existing markets:** Fetch any market's config → read its `oracle` field
3. **Hardcode per environment** in `lib/constants/contracts.ts`

**Recommendation:** Use the environment variable (option 1), with fallback to querying an existing market (option 2). Add `ORACLE_ADDRESS` to the contracts constants file.

### 6.6 Factory Config Query

Query the factory at page load to get:
- `market_creation_fee` → display to user, validate wallet balance
- `market_code_id` → not needed in the message (factory uses its stored value)

```typescript
const factoryConfig = await queryClient.getFactoryConfig();
// factoryConfig.market_creation_fee = { denom: "stake", amount: "1000000" }
```

---

## 7. Security Considerations

### 7.1 Permissionless by Design

Market creation is **intentionally permissionless**. Anyone can create a market by paying the creation fee. This follows the Morpho Blue / Euler v2 pattern of curator-managed isolated markets.

**Implications:**
- Users must evaluate markets before depositing (the UI already shows curator address, parameters, etc.)
- The creation fee acts as a spam deterrent
- Markets with bad parameters still get created — they just won't attract liquidity

### 7.2 Parameter Safety Ranges

The contract enforces hard limits. The frontend should enforce **tighter advisory limits** with warnings:

| Parameter | Contract Limit | Recommended UI Range | Warning Outside Range |
|-----------|---------------|---------------------|----------------------|
| LTV | 0 < LTV < liq_threshold | 50–85% | "Unusually low/high LTV" |
| Liq Threshold | 0 < threshold < 1.0 | 55–95% | "Extremely tight/loose liquidation threshold" |
| Liq Bonus | 3–15% | 4–10% | "Very low bonus may not incentivize liquidators" |
| Close Factor | (unchecked) | 25–100% | "Low close factor can make liquidations inefficient" |
| Curator Fee | 0–25% | 0–10% | "High curator fee may deter depositors" |
| Protocol Fee | (checked only as sum) | 5–20% | Informational only |
| Slope 2 | ≥ 0 | 50–500% | "Low slope2 won't discourage over-utilization" |
| Optimal Util | 0–100% | 70–90% | "Outside typical range" |

### 7.3 Griefing Vectors

| Vector | Mitigation |
|--------|------------|
| **Spam market creation** | Creation fee (currently 1M micro-units). Could be raised by governance. |
| **Misleading markets** (e.g., fake denom names) | Oracle validation ensures prices exist; UI shows full denom strings. |
| **Duplicate markets** (collision) | Contract rejects via `MarketAlreadyExists`. Salt parameter allows intentional duplicates. |
| **Extreme parameters** (e.g., 99% LTV) | Contract validation + UI warnings. Users choose whether to deposit. |
| **Oracle manipulation** | Oracle code ID validation ensures only approved oracle contracts are used. Confidence ratio check rejects uncertain prices. |

### 7.4 Oracle Trust Assumptions

The oracle adapter (`pyth-oracle-adapter`) has an owner who controls which feeds are registered. This means:
- Users can only create markets using denoms the adapter owner has registered
- This implicitly limits which assets can have markets (a feature, not a bug)
- The `expected_code_id` check ensures the oracle address is actually the correct adapter contract, not a malicious one

---

## 8. Presets & Templates

For a smoother UX, offer parameter presets:

### Conservative (Stablecoin Collateral)
```
LTV: 80%, Liq Threshold: 85%, Liq Bonus: 3%
IRM: 80% optimal, 2% base, 2% slope1, 50% slope2
```

### Standard (Major Crypto)
```
LTV: 75%, Liq Threshold: 80%, Liq Bonus: 5%
IRM: 80% optimal, 2% base, 4% slope1, 75% slope2
```

### Aggressive (Volatile Assets)
```
LTV: 65%, Liq Threshold: 72%, Liq Bonus: 10%
IRM: 75% optimal, 3% base, 6% slope1, 200% slope2
```

These presets fill the form but remain fully editable.

---

## 9. Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| Oracle adapter has no feeds registered | Show empty asset list with "No oracle feeds available" message |
| Only one denom has a feed | Allow selecting it, but second dropdown shows "No other assets available" |
| Price is stale at tx time | Pyth update message (bundled) should fix this; if it still fails, show "Oracle price is stale, try again" |
| Wallet disconnected mid-flow | Preserve form state; re-enable after reconnect |
| Tx fails after partial execution | Atomic — either all messages succeed or none do |
| Market already exists (no salt) | Suggest adding a salt value |
| Creation fee denom not in wallet | Query balance, disable submit, show "You need X STAKE" |
| Very long tx time | 15-second timeout warning; suggest retry |

---

## 10. Future Enhancements (Out of Scope)

- **Oracle feed registration UI** — Would require adapter ownership or a permissionless registration pattern
- **Market templates gallery** — Community-curated preset configurations
- **Market simulation** — "What would happen with these parameters" backtesting
- **Curator dashboard** — Manage markets you've created (update params, view fees)
- **Chainlink oracle support** — `OracleType::Chainlink` variant exists but isn't deployed
- **Multi-oracle markets** — Each market currently uses a single oracle contract

---

## 11. Implementation Checklist

- [ ] Add `NEXT_PUBLIC_ORACLE_ADDRESS` to environment config
- [ ] Create `useFactoryConfig` hook (query creation fee + config)
- [ ] Create `useOracleFeeds` hook (query available denoms from adapter)
- [ ] Create `useCreateMarket` hook (execute transaction)
- [ ] Build `AssetSelector` component (searchable dropdown with oracle feed data)
- [ ] Build `RiskParameters` component (LTV, liq threshold, liq bonus, close factor)
- [ ] Build `InterestRateModelForm` + `IRMPreviewChart` components
- [ ] Build `FeeParameters` component (protocol fee, curator fee)
- [ ] Build `CreateMarketForm` (orchestrates all sub-components)
- [ ] Build `CreateMarketReview` modal (summary before submission)
- [ ] Build `/markets/create` page
- [ ] Add "Create Market" button to markets list page
- [ ] Add `createMarketWithPriceUpdate` method to `SigningClient`
- [ ] Add form validation matching contract rules
- [ ] Add parameter preset templates
- [ ] Add error message parsing for contract errors
- [ ] Add client-side types for create market form values
- [ ] Write tests for validation logic
- [ ] Write tests for IRM curve preview calculation

---

## Appendix A: Contract Message Example (Complete)

```json
{
  "create_market": {
    "collateral_denom": "uatom",
    "debt_denom": "uusdc",
    "oracle_config": {
      "address": "neutron1oracle...",
      "oracle_type": {
        "pyth": {
          "expected_code_id": 3,
          "max_staleness_secs": 60,
          "max_confidence_ratio": "0.01"
        }
      }
    },
    "params": {
      "loan_to_value": "0.75",
      "liquidation_threshold": "0.80",
      "liquidation_bonus": "0.05",
      "liquidation_protocol_fee": "0.1",
      "close_factor": "0.5",
      "dust_debt_threshold": "1000000",
      "interest_rate_model": {
        "linear": {
          "optimal_utilization": "0.80",
          "base_rate": "0.02",
          "slope_1": "0.04",
          "slope_2": "0.75"
        }
      },
      "protocol_fee": "0.1",
      "curator_fee": "0.05",
      "supply_cap": null,
      "borrow_cap": null,
      "is_mutable": true
    },
    "salt": null
  }
}
```

**With funds:** `[{ "denom": "stake", "amount": "1000000" }]`

## Appendix B: Deploy Script Reference Values

From `e2e/scripts/deploy-contracts.ts`, the two test markets use:
- LTV: 75%, Liq Threshold: 80%, Liq Bonus: 5%
- Liq Protocol Fee: 10%, Close Factor: 50%
- Dust Debt Threshold: 1,000,000
- Protocol Fee: 10%, Curator Fee: 5%
- IRM: 80% optimal, 2% base, 4% slope1, 75% slope2
- Supply/Borrow Cap: null (unlimited)
- is_mutable: true

## Appendix C: Relevant Source Files

| File | What It Contains |
|------|-----------------|
| `packages/types/src/factory.rs` | `FactoryExecuteMsg::CreateMarket`, `CreateMarketParams` |
| `packages/types/src/market.rs` | `MarketConfig`, `MarketParams`, `CreateMarketParams` |
| `packages/types/src/oracle.rs` | `OracleType`, `OracleConfigUnchecked` |
| `packages/types/src/interest_rate_model.rs` | `InterestRateModel::Linear` + validation + defaults |
| `contracts/factory/src/execute.rs` | Parameter validation, oracle validation, market creation flow |
| `contracts/pyth-oracle-adapter/src/msg.rs` | `SetPriceFeed`, `AllPriceFeeds`, `PriceFeedConfig` |
| `frontend/lib/pyth/withPriceUpdate.ts` | `executeWithPriceUpdate` helper |
| `frontend/lib/pyth/config.ts` | `DEFAULT_PYTH_FEEDS`, feed ID mappings |
| `frontend/lib/cosmjs/client.ts` | `SigningClient`, `QueryClient` |
| `frontend/components/modals/BorrowModal.tsx` | Reference pattern for form + tx submission |
| `e2e/scripts/deploy-contracts.ts` | Reference for how markets are created programmatically |
