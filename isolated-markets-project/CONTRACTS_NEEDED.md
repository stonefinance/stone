# Contracts Needed for Isolated Markets

This document explains what contracts you need to implement or deploy for the Isolated Markets system.

## Overview

The Isolated Markets system requires:
1. **Your contracts** (Factory + Market) - **YOU MUST IMPLEMENT THESE**
2. **Oracle contract** - Use existing or implement simple one
3. **Optional: Mock contracts for testing** - Useful for local testing

---

## 1. Contracts YOU Must Implement

### ✅ Factory Contract (REQUIRED)
**You must implement this**

**Purpose:** Deploy and track market instances

**Files to create:**
```
contracts/factory/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── contract.rs       # Instantiate, execute, query, reply
    ├── execute.rs        # CreateMarket, UpdateConfig, UpdateMarketCodeId
    ├── query.rs          # Config, markets queries
    ├── state.rs          # CONFIG, MARKETS, MARKET_COUNTER
    └── error.rs
```

**Key functionality:**
- Store `market_code_id` (WASM code for market contract)
- Instantiate new market contracts via `WasmMsg::Instantiate`
- Track all created markets
- Handle market creation fees
- Provide queries (ListMarkets, MarketsByCurator, MarketsByPair)

**Reference:** See [GETTING_STARTED.md](GETTING_STARTED.md) Phase 8

### ✅ Market Contract (REQUIRED)
**You must implement this**

**Purpose:** Individual lending market instance

**Files to create:**
```
contracts/market/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── contract.rs       # Entry points
    ├── state.rs          # STATE, SUPPLIES, DEBTS, COLLATERAL
    ├── error.rs
    ├── interest.rs       # Interest rate calculations
    ├── health.rs         # Health factor calculations
    ├── execute/
    │   ├── mod.rs
    │   ├── supply.rs
    │   ├── withdraw.rs
    │   ├── collateral.rs
    │   ├── borrow.rs
    │   ├── repay.rs
    │   ├── liquidate.rs
    │   └── update_params.rs
    └── query.rs
```

**Key functionality:**
- Supply/Withdraw (lenders)
- SupplyCollateral/WithdrawCollateral (borrowers)
- Borrow/Repay (borrowers)
- Liquidate (liquidators)
- Interest accrual via indices
- Health factor calculations
- Parameter updates (curator)

**Reference implementations:**
- Study `contracts-reference/red-bank/` files
- See [GETTING_STARTED.md](GETTING_STARTED.md) Phases 3-12

---

## 2. Oracle Contract (EXTERNAL DEPENDENCY)

### Option A: Use Existing Mars Oracle (RECOMMENDED)
**You DON'T need to implement this**

If deploying on Osmosis or a chain where Mars Protocol oracle exists:

**Pros:**
- ✅ Already deployed and battle-tested
- ✅ Supports multiple price sources (TWAP, Pyth, etc.)
- ✅ No additional work needed
- ✅ Curators just reference the deployed address

**Cons:**
- ❌ Dependency on external contract
- ❌ Limited to chains where Mars is deployed

**How to use:**
```rust
// In market creation
let oracle = "osmo1..."; // Existing Mars oracle address

// Market contract queries prices like this:
let price: PriceResponse = deps.querier.query_wasm_smart(
    oracle,
    &OracleQuery::Price { denom: "uatom".to_string() }
)?;
```

**Oracle addresses (examples):**
- Osmosis Mainnet: `osmo1...` (find current address from Mars docs)
- Neutron Mainnet: `neutron1...` (find current address)

### Option B: Implement Simple Oracle
**You need to implement this if no oracle exists on your chain**

**When to use:**
- Deploying on chain without Mars oracle
- Want full control over price feeds
- Testing on local chain

**Simple implementation:**
```rust
// Minimal oracle contract for testing/simple use cases
pub struct OracleState {
    pub owner: Addr,
    pub prices: Map<String, Decimal>, // denom -> price
}

pub enum ExecuteMsg {
    SetPrice { denom: String, price: Decimal }, // Owner only
}

pub enum QueryMsg {
    Price { denom: String },
}
```

**Reference implementation:**
- See `contracts-reference/mock-oracle/` for testing oracle
- See `contracts-reference/oracle-base/` for Mars oracle patterns

**Production oracle should:**
- ✅ Use TWAP (time-weighted average price) to prevent manipulation
- ✅ Support multiple price sources (fallbacks)
- ✅ Have price staleness checks
- ✅ Integrate with Pyth, Chainlink, or similar
- ✅ Have admin controls for updating sources

### Option C: Use Pyth or Chainlink (ADVANCED)
**You need to implement adapter**

For production systems, integrate professional oracle:

**Pyth Network:**
- Real-time price feeds
- Low latency
- Pull-based oracle (you fetch and submit prices)
- See: https://pyth.network/

**Chainlink:**
- Decentralized oracle network
- Push-based (prices automatically updated)
- Wide coverage
- See: https://chain.link/

**Implementation:**
Create adapter contract that wraps Pyth/Chainlink and provides standard interface:
```rust
pub enum QueryMsg {
    Price { denom: String }, // Maps denom to Pyth price feed ID
}
```

---

## 3. Contracts Included as Reference

These are **already included** in `contracts-reference/`:

### ✅ Red Bank (Reference Implementation)
**Location:** `contracts-reference/red-bank/`

**Purpose:** Learn how to implement lending market logic

**Key files:**
- `interest_rates.rs` - Copy this almost directly
- `borrow.rs` - Adapt by removing market_id
- `repay.rs` - Adapt by removing market_id
- `liquidate.rs` - Adapt to add protocol fee
- `deposit.rs` - Adapt by removing market_id
- `withdraw.rs` - Adapt by removing market_id
- `health.rs` - Copy almost directly
- `collateral.rs` - Adapt by removing market_id
- `state.rs` - Use as pattern for storage
- `error.rs` - Use as pattern for errors
- `helpers.rs` - Utility functions

### ✅ Mock Oracle (Testing)
**Location:** `contracts-reference/mock-oracle/`

**Purpose:** Simple oracle for testing

**Files:**
- `contract.rs` - Entry points
- `state.rs` - Simple price storage
- `msg.rs` - SetPrice and QueryPrice messages

**Use this for:**
- Local testing
- Integration tests
- Testnet deployment (before using real oracle)

**Example usage in tests:**
```rust
// Deploy mock oracle
let mock_oracle = deploy_mock_oracle(&mut app, admin);

// Set prices
mock_oracle.set_price(&mut app, "uatom", Decimal::from_str("10.0").unwrap());
mock_oracle.set_price(&mut app, "uusdc", Decimal::one());

// Create market using mock oracle
factory.create_market(
    &mut app,
    curator,
    "uatom",
    "uusdc",
    mock_oracle.address.to_string(),
    params,
);
```

### ✅ Oracle Base (Reference)
**Location:** `contracts-reference/oracle-base/`

**Purpose:** Understand Mars oracle architecture

**Files:**
- `contract.rs` - Oracle contract patterns
- `traits.rs` - Oracle trait definitions
- `error.rs` - Oracle errors

---

## 4. Contracts You DON'T Need

### ❌ Address Provider - NOT NEEDED
**Why Mars uses it:** Central registry to find all contracts (Oracle, Params, Red Bank, etc.)

**Why you DON'T need it:**
- No shared services to coordinate
- Each market stores direct references (oracle, factory, curator)
- No lookup needed

**What you use instead:**
```rust
pub struct MarketState {
    pub oracle: Addr,   // Direct reference, not looked up
    pub factory: Addr,  // Direct reference, not looked up
    pub curator: Addr,  // Direct reference, not looked up
}
```

See [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md) for full explanation.

### ❌ Params Contract - NOT NEEDED
**Why Mars uses it:** Centralized parameter management for all assets

**Why you DON'T need it:**
- Each market stores its own parameters
- Curator updates their market directly
- No shared parameters between markets

**What you use instead:**
```rust
pub struct MarketState {
    // All params stored directly in market
    pub loan_to_value: Decimal,
    pub liquidation_threshold: Decimal,
    pub liquidation_bonus: Decimal,
    pub interest_rate_model: InterestRateModel,
    // etc...
}
```

See [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md) for full explanation.

### ❌ Governance Contract - NOT NEEDED
**Why Mars uses it:** DAO votes on parameter changes

**Why you DON'T need it:**
- Curator controls their markets (permissionless)
- Factory owner controls factory config
- No DAO voting required

### ❌ Incentives Contract - NOT NEEDED (for MVP)
**Why Mars uses it:** Reward suppliers/borrowers

**Why skip for MVP:**
- Not in initial scope
- Can add later as enhancement
- Focus on core lending functionality first

---

## 5. Optional: Testing Utilities

### Mock Contracts for Testing

You may want to create simple mocks for testing:

#### Mock Oracle (INCLUDED)
Already in `contracts-reference/mock-oracle/`

#### Mock Price Feeds (Optional)
Simulate Pyth/Chainlink for testing

---

## Summary: What You Need to Build

### ✅ Contracts YOU MUST Implement (2 contracts)

1. **Factory Contract** - YOU IMPLEMENT ✍️
   - Deploys market instances
   - Stores market_code_id
   - Tracks all markets
   - Manages creation fees

2. **Market Contract** - YOU IMPLEMENT ✍️
   - Individual lending market
   - Self-contained (stores own params)
   - Supply/Borrow/Liquidate logic
   - Interest accrual

### ⚠️ External Dependency (1 contract)

3. **Oracle** - USE EXISTING or implement simple one
   - **Option A:** Use Mars oracle (if available) ✅ RECOMMENDED
   - **Option B:** Use mock oracle for testing ✅ PROVIDED
   - **Option C:** Implement simple oracle ✍️ OPTIONAL

### ❌ Contracts You DON'T Need (0 contracts)

- ❌ Address Provider - Not needed (direct references)
- ❌ Params Contract - Not needed (params in each market)
- ❌ Governance - Not needed (curator-controlled)
- ❌ Incentives - Not needed (MVP, can add later)

**See [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md) for detailed explanation of why these aren't needed.**

### For Testing

4. **Mock Oracle** - ALREADY PROVIDED ✅
   - Use `contracts-reference/mock-oracle/`

### For Production

5. **Production Oracle** - DEPENDS ON CHAIN
   - **Osmosis/Neutron:** Use Mars oracle ✅
   - **Other chains:** Implement or use Pyth/Chainlink ✍️

---

## Deployment Scenarios

### Scenario 1: Osmosis Mainnet (EASIEST)
```bash
# 1. Upload and instantiate Factory
# 2. Upload Market contract (get code_id)
# 3. Instantiate Factory with market_code_id
# 4. Create markets using existing Mars oracle address
```

**Oracle:** Use existing Mars Osmosis Oracle
**Contracts needed:** Factory + Market only

### Scenario 2: New Chain (MODERATE)
```bash
# 1. Deploy oracle contract (or use Pyth/Chainlink)
# 2. Upload and instantiate Factory
# 3. Upload Market contract (get code_id)
# 4. Instantiate Factory with market_code_id
# 5. Create markets using your oracle address
```

**Oracle:** Implement simple oracle or integrate Pyth
**Contracts needed:** Factory + Market + Oracle

### Scenario 3: Local Testing (SIMPLE)
```bash
# 1. Deploy mock oracle
# 2. Upload and instantiate Factory
# 3. Upload Market contract (get code_id)
# 4. Instantiate Factory with market_code_id
# 5. Create markets using mock oracle address
```

**Oracle:** Use mock oracle (provided)
**Contracts needed:** Factory + Market (mock oracle provided)

---

## Oracle Interface Standard

Your market contract expects oracle to implement:

```rust
#[cw_serde]
pub enum OracleQueryMsg {
    Price { denom: String },
}

#[cw_serde]
pub struct PriceResponse {
    pub price: Decimal,
    pub denom: String,
}
```

**Any oracle that implements this interface will work!**

This is compatible with:
- Mars Protocol oracle
- Your custom oracle
- Mock oracle (provided)

---

## Testing Strategy

### Phase 1: Unit Tests
Use mock oracle (provided in references)

### Phase 2: Integration Tests
Use mock oracle or deploy simple oracle

### Phase 3: Testnet
**Option A:** Use Mars testnet oracle (if available)
**Option B:** Deploy your simple oracle

### Phase 4: Mainnet
**Must use production oracle:**
- Mars Protocol oracle (recommended)
- Pyth integration
- Chainlink integration
- Your audited oracle

---

## Oracle Security Considerations

### ⚠️ Critical for Production

1. **Price Manipulation**
   - Use TWAP (time-weighted average)
   - Multiple price sources
   - Sanity checks on price changes

2. **Staleness**
   - Check price freshness
   - Reject old prices
   - Heartbeat monitoring

3. **Fallbacks**
   - Multiple oracle sources
   - Graceful degradation
   - Circuit breakers

4. **Admin Controls**
   - Who can update prices?
   - How are sources managed?
   - Emergency pause mechanism

### ✅ For Testing/Development

Mock oracle is fine:
- Simple price setting
- No staleness checks
- Admin can set any price
- **DO NOT USE IN PRODUCTION**

---

## Recommended Approach

### For Development (Now)

1. ✅ Use mock oracle (provided in `contracts-reference/mock-oracle/`)
2. ✅ Focus on implementing Factory + Market contracts
3. ✅ Write tests using mock oracle
4. ✅ Deploy to local chain with mock oracle

### For Testnet (Later)

1. If Mars oracle available → use it
2. Otherwise → deploy simple oracle with manual price updates
3. Test all flows with real users
4. Verify oracle integration works

### For Production (Final)

1. **If on Osmosis/Neutron:** Use Mars Protocol oracle ✅
2. **If on other chain:**
   - Integrate Pyth Network (recommended)
   - Or integrate Chainlink
   - Or implement TWAP oracle with multiple sources
3. Get oracle audited if custom
4. Monitor oracle health continuously

---

## Additional Contracts (Future)

You might want these later (NOT needed for MVP):

### Incentives Contract
Reward users for supplying/borrowing
- Study `contracts/incentives/` in Mars repo

### Governance Contract
Manage protocol parameters via voting
- Study Mars governance patterns

### Liquidation Bot
Off-chain bot that monitors and liquidates
- Not a contract, just a script
- Queries markets for underwater positions
- Executes liquidations

### Position Manager
Helper contract for complex operations
- Zap-in (swap + supply in one tx)
- Flash loans
- Position migration

---

## Quick Reference

| Contract | Status | Action |
|----------|--------|--------|
| Factory | ❌ Not built | YOU MUST IMPLEMENT |
| Market | ❌ Not built | YOU MUST IMPLEMENT |
| Oracle (testing) | ✅ Provided | Use `contracts-reference/mock-oracle/` |
| Oracle (mainnet) | ⚠️ Depends | Use Mars oracle OR implement your own |
| Red Bank | ✅ Reference | Study `contracts-reference/red-bank/` |

---

## Next Steps

1. ✅ Start implementing Factory contract (Phase 8 in GETTING_STARTED.md)
2. ✅ Start implementing Market contract (Phases 3-12)
3. ✅ Use mock oracle for all testing
4. ⏸️ Decide on production oracle later (before mainnet)

**Bottom line:** You only need to implement **Factory + Market** contracts. Use the provided mock oracle for testing, and decide on production oracle when you're ready for mainnet.

---

**Document Version:** 1.0
**Last Updated:** 2026-01-17
