# Factory Pattern - Key Changes from Single Contract Design

**Date:** 2026-01-17
**Reason:** Prevent bad debt contagion between markets sharing the same debt asset

---

## Architecture Change

### Before (Single Contract)
```
One Isolated Markets Contract
├─ Market A: ATOM/USDC (state in MARKETS map)
├─ Market B: OSMO/USDC (state in MARKETS map)
└─ Market C: stATOM/ATOM (state in MARKETS map)

Problem: All markets share contract's token balance
→ Bad debt in Market A can drain Market B's liquidity
```

### After (Factory Pattern)
```
Factory Contract (stores code_id, tracks markets)
├─ Market A Contract (addr: osmo1abc...)
├─ Market B Contract (addr: osmo2def...)
└─ Market C Contract (addr: osmo3ghi...)

Solution: Each market has own contract address and token balances
→ Bad debt in Market A only affects Market A depositors
```

---

## Two Contracts Required

### 1. Market Contract (the lending market logic)

**Purpose:** Individual lending market instance

**State:**
```rust
pub struct MarketState {
    // Market identity
    pub collateral_denom: String,
    pub debt_denom: String,
    pub curator: Addr,
    pub oracle: Addr,
    pub factory: Addr,  // NEW: reference to factory

    // Risk parameters
    pub loan_to_value: Decimal,
    pub liquidation_threshold: Decimal,
    pub liquidation_bonus: Decimal,
    pub liquidation_protocol_fee: Decimal,
    pub close_factor: Decimal,

    // Interest
    pub interest_rate_model: InterestRateModel,
    pub borrow_index: Decimal,
    pub liquidity_index: Decimal,
    pub borrow_rate: Decimal,
    pub liquidity_rate: Decimal,

    // Totals
    pub total_supply_scaled: Uint128,
    pub total_debt_scaled: Uint128,
    pub total_collateral: Uint128,

    // User positions
    // SUPPLIES: Map<&Addr, Uint128>  - NO MARKET_ID needed
    // COLLATERAL: Map<&Addr, Uint128>
    // DEBTS: Map<&Addr, Uint128>

    // Fees
    pub protocol_fee: Decimal,
    pub curator_fee: Decimal,
    pub protocol_fee_collector: Option<Addr>,

    // Mutability
    pub is_mutable: bool,
    pub ltv_last_update: u64,

    // Status
    pub enabled: bool,
    pub last_update: u64,
    pub created_at: u64,
}
```

**Operations:**
- Supply / Withdraw
- SupplyCollateral / WithdrawCollateral
- Borrow / Repay
- Liquidate
- UpdateParams (curator only)

### 2. Factory Contract (deploys and tracks markets)

**Purpose:** Deploy new market instances and track them

**State:**
```rust
pub struct FactoryState {
    pub owner: Addr,
    pub market_code_id: u64,  // Stored WASM code ID for market contract
    pub market_creation_fee: Coin,
    pub protocol_fee_collector: Addr,
    pub markets: Vec<Addr>,  // All created market addresses
}

// Index for queries
pub const MARKETS_BY_CURATOR: Map<&Addr, Vec<Addr>> = Map::new("markets_by_curator");
pub const MARKETS_BY_PAIR: Map<(&str, &str), Vec<Addr>> = Map::new("markets_by_pair");
```

**Operations:**
- CreateMarket → instantiates new Market contract
- UpdateMarketCodeId → upgrade market template (owner only)
- UpdateConfig → update fees, collector (owner only)
- Queries: ListMarkets, MarketsByCurator, MarketsByPair

---

## Market Creation Flow

### Old Flow (Single Contract)
```
1. User calls IsolatedMarkets.CreateMarket(params)
2. Contract validates params
3. Contract generates market_id
4. Contract stores market in MARKETS map
5. Returns market_id
```

### New Flow (Factory Pattern)
```
1. User calls Factory.CreateMarket(params) + sends creation_fee
2. Factory validates params
3. Factory calls instantiate(market_code_id, init_msg)
4. New Market contract deployed at unique address
5. Factory stores market address in MARKETS vec
6. Returns market contract address
7. Users interact with Market contract directly
```

---

## Key Implementation Differences

### Storage Keys

**Before:**
```rust
// Multi-market contract
SUPPLIES: Map<(&str, &Addr), Uint128>  // (market_id, user) → amount
COLLATERAL: Map<(&str, &Addr), Uint128>
DEBTS: Map<(&str, &Addr), Uint128>
```

**After:**
```rust
// Single market per contract - NO market_id needed
SUPPLIES: Map<&Addr, Uint128>  // user → amount
COLLATERAL: Map<&Addr, Uint128>
DEBTS: Map<&Addr, Uint128>
```

### Execute Messages

**Market Contract:**
```rust
pub enum MarketExecuteMsg {
    Supply { recipient: Option<String> },
    Withdraw { amount: Option<Uint128>, recipient: Option<String> },
    SupplyCollateral { recipient: Option<String> },
    WithdrawCollateral { amount: Option<Uint128>, recipient: Option<String> },
    Borrow { amount: Uint128, recipient: Option<String> },
    Repay { amount: Option<Uint128>, on_behalf_of: Option<String> },
    Liquidate { borrower: String, max_debt_to_repay: Option<Uint128> },
    UpdateParams { updates: MarketParamsUpdate },  // curator only
}
```

**Factory Contract:**
```rust
pub enum FactoryExecuteMsg {
    CreateMarket {
        collateral_denom: String,
        debt_denom: String,
        oracle: String,
        params: CreateMarketParams,
    },
    UpdateMarketCodeId { new_code_id: u64 },  // owner only
    UpdateConfig {
        market_creation_fee: Option<Coin>,
        protocol_fee_collector: Option<String>,
    },
}
```

---

## Deployment Process

### 1. Upload Contracts
```bash
# Upload market contract WASM
TX1=$(wasmd tx wasm store market.wasm --from deployer)
MARKET_CODE_ID=$(extract_code_id $TX1)

# Upload factory contract WASM
TX2=$(wasmd tx wasm store factory.wasm --from deployer)
FACTORY_CODE_ID=$(extract_code_id $TX2)
```

### 2. Instantiate Factory
```bash
wasmd tx wasm instantiate $FACTORY_CODE_ID \
  '{"owner":"osmo1...","market_code_id":'$MARKET_CODE_ID',"market_creation_fee":{"denom":"uosmo","amount":"1000000"},"protocol_fee_collector":"osmo1..."}' \
  --from deployer \
  --label "Isolated Markets Factory"
```

### 3. Create Markets (via Factory)
```bash
# Users call factory to create markets
wasmd tx wasm execute $FACTORY_ADDR \
  '{"create_market":{"collateral_denom":"uatom","debt_denom":"ibc/...USDC","oracle":"osmo1...","params":{...}}}' \
  --from curator \
  --amount 1000000uosmo
```

---

## Migration Path

If you've already started with single contract:

1. **Extract market logic** into separate contract
2. **Create factory contract** that instantiates markets
3. **Deploy both contracts**
4. **Migrate existing markets:**
   - For each market in old contract:
     - Create new market via factory
     - Pause old market
     - Users migrate positions manually
   - OR use migration contract to batch transfer

---

## Benefits Recap

✅ **True Isolation**
- Each market owns its tokens
- Bad debt cannot spread

✅ **Independent Upgrades**
- Upgrade individual markets
- Test on low-value markets first

✅ **Blast Radius Containment**
- Bug in one market doesn't affect others
- Exploits limited to single market

✅ **Granular Control**
- Sunset individual markets
- Disable specific markets

---

## Trade-offs

❌ **Higher Deployment Costs**
- Each market requires contract instantiation
- More gas per market creation

❌ **Harder Cross-Market Queries**
- Must query N contracts for N markets
- Need indexer for efficient lookups

❌ **More Complex UX**
- Users interact with different addresses
- Frontend must track market addresses

❌ **Code Duplication on Chain**
- Same contract logic stored multiple times (mitigated by code_id reuse)

---

## Recommendation

**Use factory pattern.** The isolation benefits outweigh the complexity cost, especially given your valid concern about bad debt contagion.

The trade-offs are manageable:
- Higher gas costs are one-time (per market creation)
- Indexers solve the query problem
- UX complexity is hidden by frontend
- Code reuse via code_id keeps storage efficient

---

## Next Steps

1. ✅ Understand factory architecture (this document)
2. [ ] Update full technical specification
3. [ ] Implement Market contract
4. [ ] Implement Factory contract
5. [ ] Write comprehensive tests
6. [ ] Deploy and test on testnet

