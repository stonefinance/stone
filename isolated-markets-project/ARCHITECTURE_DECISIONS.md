# Architecture Decisions - No Address Provider or Params Contract

## Question: Do we need Address Provider and Params contracts?

**Short answer: NO** - The factory pattern with self-contained market contracts eliminates the need for these centralized coordination contracts.

---

## Mars Protocol Architecture (What You're Based On)

Mars Protocol uses a **shared services architecture**:

```
┌─────────────────────────────────────────────────────────────┐
│                   Address Provider                           │
│  Central registry of all contract addresses                  │
│  - Red Bank address                                          │
│  - Oracle address                                            │
│  - Params address                                            │
│  - Incentives address                                        │
│  - Credit Manager address                                    │
└─────────────────────────────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┬─────────────┐
        ▼               ▼               ▼             ▼
    ┌────────┐    ┌─────────┐    ┌──────────┐   ┌─────────┐
    │Red Bank│    │ Oracle  │    │  Params  │   │Incentive│
    │        │    │         │    │          │   │         │
    │Queries │───→│Queries  │    │Stores    │   │Rewards  │
    │params  │    │prices   │    │all asset │   │         │
    │contract│    │         │    │params    │   │         │
    └────────┘    └─────────┘    └──────────┘   └─────────┘
         │                             │
         └─────────────┬───────────────┘
                       ▼
              Each asset has params stored
              in centralized Params contract
```

**Why Mars uses this:**
- Single Red Bank contract manages ALL assets
- Centralized parameter management via Params contract
- Governance can update parameters in one place
- All contracts find each other via Address Provider

---

## Isolated Markets Architecture (Your Design)

we're using a **self-contained market architecture**:

```
┌───────────────────────────────────────────────────────────┐
│                    Factory Contract                        │
│  - owner: Addr                                            │
│  - market_code_id: u64                                    │
│  - protocol_fee_collector: Addr                           │
│  - market_creation_fee: Coin                              │
└───────────────────────────────────────────────────────────┘
                        │
                        │ deploys
        ┌───────────────┼───────────────────┐
        ▼               ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   Market A      │ │   Market B      │ │   Market C      │
│   Contract      │ │   Contract      │ │   Contract      │
│                 │ │                 │ │                 │
│ SELF-CONTAINED: │ │ SELF-CONTAINED: │ │ SELF-CONTAINED: │
│                 │ │                 │ │                 │
│ ✅ Own params   │ │ ✅ Own params   │ │ ✅ Own params   │
│ ✅ Own oracle   │ │ ✅ Own oracle   │ │ ✅ Own oracle   │
│ ✅ Own curator  │ │ ✅ Own curator  │ │ ✅ Own curator  │
│ ✅ Own fees     │ │ ✅ Own fees     │ │ ✅ Own fees     │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

---

## Do You Need Address Provider? **NO**

### Mars Uses Address Provider Because:
1. **Shared services** - Red Bank, Oracle, Params all need to find each other
2. **Single Red Bank** - Manages all assets, needs to query Params for each asset
3. **Upgradability** - Can update contract addresses without redeploying everything
4. **Governance integration** - All contracts coordinate via central registry

### Your Design Doesn't Need It Because:
1. **No shared services** - Each market is independent
2. **Self-contained markets** - Each market contract stores its own params
3. **Direct references** - Each market knows its oracle address (set at creation)
4. **Simple upgrades** - Factory can update `market_code_id` for new markets

### What You Use Instead:

**In Market Contract:**
```rust
pub struct MarketState {
    pub oracle: Addr,                // Direct reference, no lookup needed
    pub factory: Addr,               // Direct reference to factory
    pub curator: Addr,               // Direct reference to curator
    pub protocol_fee_collector: Option<Addr>, // Direct reference

    // Everything else is stored directly
    pub loan_to_value: Decimal,
    pub liquidation_threshold: Decimal,
    // ... all params stored in the market itself
}
```

**No address provider needed!** Each market is self-contained.

---

## Do You Need Params Contract? **NO**

### Mars Uses Params Contract Because:
1. **Centralized management** - All asset parameters in one place
2. **Governance controlled** - Mars governance can update any asset's params
3. **Shared across contracts** - Red Bank, Credit Manager both query same params
4. **Emergency powers** - Can disable borrowing/lending across all contracts

**Example from Mars:**
```rust
// Red Bank queries Params contract for asset config
let asset_params = query_asset_params(
    deps.querier,
    address_provider.params_address(),
    "uatom"
)?;

// Returns: max_ltv, liquidation_threshold, deposit_cap, etc.
```

### Your Design Doesn't Need It Because:
1. **Per-market params** - Each market stores its own parameters
2. **Curator controlled** - Curator updates their market (not governance)
3. **No sharing needed** - Each market is independent
4. **Market-level control** - Curator can disable their market

**Example in your design:**
```rust
// Market contract stores params directly
pub struct MarketState {
    // Params are fields in the market state
    pub loan_to_value: Decimal,              // Stored in market
    pub liquidation_threshold: Decimal,      // Stored in market
    pub liquidation_bonus: Decimal,          // Stored in market
    pub close_factor: Decimal,               // Stored in market
    pub interest_rate_model: InterestRateModel, // Stored in market
    pub protocol_fee: Decimal,               // Stored in market
    pub curator_fee: Decimal,                // Stored in market
    pub supply_cap: Option<Uint128>,         // Stored in market
    pub borrow_cap: Option<Uint128>,         // Stored in market

    // No need to query external Params contract!
}
```

**Curator updates via direct call to their market:**
```rust
// Curator calls their market contract directly
execute(
    &market_contract_address,  // Direct call to market
    ExecuteMsg::UpdateParams {
        updates: MarketParamsUpdate {
            curator_fee: Some(Decimal::percent(5)),
            supply_cap: Some(Uint128::new(1_000_000)),
            // ... other updates
        }
    }
)

// No Params contract needed!
```

---

## Comparison Table

| Feature | Mars Protocol | Isolated Markets (Your Design) |
|---------|--------------|-------------------------------|
| **Architecture** | Centralized (shared services) | Distributed (independent markets) |
| **Params Storage** | Params contract (one place) | Each market contract |
| **Address Lookup** | Address Provider | Direct references in state |
| **Parameter Updates** | Governance → Params contract | Curator → Market contract |
| **Oracle Reference** | Address Provider → Oracle | Market.oracle (immutable) |
| **Governance** | Required (Mars governance) | Not needed (curator-controlled) |
| **Emergency Powers** | Params contract (disable all) | Per-market (curator disables) |
| **Shared State** | Yes (cross-contract coordination) | No (complete isolation) |

---

## What Contracts DO You Need?

### 1. Factory Contract ✅ (YOU IMPLEMENT)
**Purpose:** Deploy and track markets

**State:**
```rust
pub struct FactoryConfig {
    pub owner: Addr,                    // Can update factory settings
    pub market_code_id: u64,           // WASM code for markets
    pub market_creation_fee: Coin,     // Fee to create market
    pub protocol_fee_collector: Addr,  // Receives protocol fees
}
```

**Why needed:**
- Deploys market contract instances
- Stores market_code_id (for instantiation)
- Tracks all created markets
- Manages creation fees

**NOT replaced by Address Provider because:**
- Factory is operational (creates markets)
- Address Provider is just lookup (finds addresses)
- Factory has unique responsibility

### 2. Market Contract ✅ (YOU IMPLEMENT)
**Purpose:** Individual lending market

**State:**
```rust
pub struct MarketState {
    // Identity
    pub collateral_denom: String,
    pub debt_denom: String,
    pub curator: Addr,
    pub oracle: Addr,          // ← Direct reference (no Address Provider)
    pub factory: Addr,         // ← Direct reference (no Address Provider)

    // ALL PARAMS STORED HERE (no Params contract)
    pub loan_to_value: Decimal,
    pub liquidation_threshold: Decimal,
    pub liquidation_bonus: Decimal,
    // ... etc

    // Protocol config
    pub protocol_fee_collector: Option<Addr>, // ← Direct reference
}
```

**Why self-contained:**
- No shared state with other markets
- Curator controls this market only
- Oracle set at creation (immutable)
- All params stored in market itself

### 3. Oracle Contract ⚠️ (USE EXISTING OR IMPLEMENT SIMPLE ONE)
**Purpose:** Provide price feeds

**Options:**
- Use Mars oracle (if on Osmosis/Neutron)
- Use mock oracle for testing (provided)
- Implement simple oracle
- Integrate Pyth/Chainlink

**Why needed:**
- Markets need prices for health factor calculations
- Must be external (can't let curator manipulate prices)

**NOT an Address Provider responsibility:**
- Each market stores oracle address directly
- No lookup needed

---

## What You DON'T Need

### ❌ Address Provider
**Reason:** No shared services to coordinate

**What replaces it:**
- Factory address stored in each market (at creation)
- Oracle address stored in each market (at creation)
- Protocol fee collector stored in each market (optional) OR factory config

**Example:**
```rust
// Old way (Mars with Address Provider):
let oracle_addr = address_provider.oracle();
let params_addr = address_provider.params();

// Your way (direct references):
let oracle_addr = STATE.load(storage)?.oracle;
// No params contract - params stored in STATE directly
```

### ❌ Params Contract
**Reason:** Each market stores its own parameters

**What replaces it:**
- All parameters stored directly in `MarketState`
- Curator updates via `UpdateParams` message to market contract
- No centralized parameter management needed

**Example:**
```rust
// Old way (Mars with Params contract):
let asset_config = deps.querier.query_wasm_smart(
    params_contract,
    &ParamsQuery::AssetParams { denom: "uatom" }
)?;

// Your way (params in market state):
let state = STATE.load(deps.storage)?;
let ltv = state.loan_to_value;  // Stored directly!
let liq_threshold = state.liquidation_threshold;  // Stored directly!
```

### ❌ Incentives Contract (for MVP)
**Reason:** Not in scope for initial implementation

**Could add later:**
- Reward suppliers/borrowers
- Governed by protocol or curator
- Optional enhancement

### ❌ Governance Contract
**Reason:** Curator-controlled, not governance-controlled

**What replaces it:**
- Curator controls their markets directly
- Factory owner controls factory config
- No DAO voting needed (permissionless creation)

---

## Parameter Management Comparison

### Mars Protocol (Centralized Params)
```
┌──────────────┐
│  Governance  │ Mars governance votes
└──────┬───────┘
       │ vote passes
       ▼
┌──────────────────────────────────────────┐
│        Params Contract                   │
│                                          │
│  ASSET_PARAMS.save("uatom", AssetParams {│
│    max_ltv: 0.75,                        │
│    liquidation_threshold: 0.80,          │
│    ...                                   │
│  })                                      │
└──────────────────────────────────────────┘
       │ queried by
       ▼
┌──────────────────────────────────────────┐
│        Red Bank Contract                 │
│                                          │
│  let params = query_params(              │
│    deps.querier,                         │
│    params_addr,                          │
│    "uatom"                               │
│  )?;                                     │
│                                          │
│  // Uses params.max_ltv, etc.           │
└──────────────────────────────────────────┘
```

**Problem for your use case:**
- Requires governance (you want permissionless)
- Centralized control (you want curator control)
- Shared params (you want per-market isolation)

### Your Design (Self-Contained Markets)
```
┌──────────────┐
│   Curator    │ Market creator/manager
└──────┬───────┘
       │ calls UpdateParams
       ▼
┌──────────────────────────────────────────┐
│       Market Contract                    │
│                                          │
│  pub struct MarketState {                │
│    pub loan_to_value: Decimal,          │ ← Stored directly
│    pub liquidation_threshold: Decimal,  │ ← Stored directly
│    pub curator_fee: Decimal,            │ ← Stored directly
│    // ... all params                    │
│  }                                       │
│                                          │
│  execute_update_params() {               │
│    // Curator can update (within bounds)│
│    STATE.update(|mut s| {                │
│      s.curator_fee = new_fee;           │
│      Ok(s)                               │
│    })?;                                  │
│  }                                       │
└──────────────────────────────────────────┘
```

**Benefits:**
- ✅ No centralized Params contract needed
- ✅ Curator controls their market
- ✅ Each market can have different params
- ✅ True isolation (no shared state)
- ✅ Simpler architecture

---

## Factory Config vs Address Provider

### What Factory DOES store:
```rust
pub struct FactoryConfig {
    pub owner: Addr,                    // Factory owner
    pub market_code_id: u64,           // WASM code to instantiate
    pub market_creation_fee: Coin,     // Fee for creating market
    pub protocol_fee_collector: Addr,  // Where protocol fees go
}
```

This is **NOT** an Address Provider because:
- It's operational config for factory operation
- Not a lookup service for other contracts
- Markets don't query it (they have direct references)

### What Address Provider WOULD store (if you had one):
```rust
pub struct AddressProvider {
    pub oracle: Addr,        // Global oracle
    pub params: Addr,        // Global params
    pub red_bank: Addr,      // Global red bank
    pub incentives: Addr,    // Global incentives
    // ... etc
}
```

**You don't need this** because there are no global shared contracts!

---

## Summary

### Contracts You MUST Implement:
1. **Factory Contract** - Deploys markets, stores market_code_id
2. **Market Contract** - Self-contained lending market with all params

### Contracts You DON'T Need:
1. ❌ **Address Provider** - No shared services to coordinate
2. ❌ **Params Contract** - Params stored in each market
3. ❌ **Governance** - Curator-controlled markets
4. ❌ **Incentives** (for MVP) - Optional future enhancement

### External Dependencies:
1. **Oracle** - Use existing (Mars) or implement simple one

---

## Design Principle

**Mars Protocol:** Centralized, governance-controlled, shared services
```
One Red Bank → Many Assets → One Params Contract
```

**Isolated Markets:** Distributed, curator-controlled, independent markets
```
One Factory → Many Markets → Each Self-Contained
```

This is a **fundamentally different architecture** that eliminates the need for centralized coordination contracts.

---

## Validation: Check the Factory Pattern Document

From [FACTORY_PATTERN_CHANGES.md](docs/FACTORY_PATTERN_CHANGES.md):

**Market Contract State (lines 41-87):**
```rust
pub struct MarketState {
    pub collateral_denom: String,
    pub debt_denom: String,
    pub curator: Addr,
    pub oracle: Addr,          // ← Direct reference
    pub factory: Addr,         // ← Direct reference

    // ALL PARAMS HERE:
    pub loan_to_value: Decimal,
    pub liquidation_threshold: Decimal,
    // ... etc
}
```

**No Address Provider or Params contract mentioned!**

**Factory Contract State (lines 103-114):**
```rust
pub struct FactoryState {
    pub owner: Addr,
    pub market_code_id: u64,
    pub market_creation_fee: Coin,
    pub protocol_fee_collector: Addr,
    pub markets: Vec<Addr>,
}
```

**No Address Provider or Params contract needed!**

---

**Conclusion:** You are correct - **each deployed market holds its own params**. You do NOT need Address Provider or Params contracts. The factory pattern with self-contained markets eliminates this complexity.

---

**Document Version:** 1.0
**Last Updated:** 2026-01-17
**Status:** ✅ Confirmed - No Address Provider or Params contract needed
