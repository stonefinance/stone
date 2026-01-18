# Architecture Diagrams - Isolated Markets

Visual representations of the Isolated Markets factory pattern architecture.

## System Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                          FACTORY CONTRACT                             │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ State:                                                          │ │
│  │  - owner: Addr                                                  │ │
│  │  - market_code_id: u64  ◄──── Stored WASM code for markets     │ │
│  │  - market_creation_fee: Coin                                    │ │
│  │  - protocol_fee_collector: Addr                                 │ │
│  │  - markets: Vec<Addr>  ◄──── Tracks all deployed markets       │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  Operations:                                                           │
│    ▼ CreateMarket(params) + fee → instantiate new Market contract     │
│    ▼ UpdateMarketCodeId(new_id) → upgrade market template             │
│    ▼ UpdateConfig → change fees/collector                             │
│    ▼ Queries: ListMarkets, MarketsByCurator, MarketsByPair            │
└───────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ instantiates
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│  MARKET A         │     │  MARKET B         │     │  MARKET C         │
│  CONTRACT         │     │  CONTRACT         │     │  CONTRACT         │
│                   │     │                   │     │                   │
│  Address:         │     │  Address:         │     │  Address:         │
│  osmo1abc...      │     │  osmo1def...      │     │  osmo1ghi...      │
│                   │     │                   │     │                   │
│  Pair:            │     │  Pair:            │     │  Pair:            │
│  ATOM/USDC        │     │  OSMO/USDC        │     │  stATOM/ATOM      │
│                   │     │                   │     │                   │
│  LTV: 75%         │     │  LTV: 70%         │     │  LTV: 65%         │
│  Liq: 80%         │     │  Liq: 75%         │     │  Liq: 70%         │
│                   │     │                   │     │                   │
│  Token Balances:  │     │  Token Balances:  │     │  Token Balances:  │
│    ATOM:  100,000 │     │    OSMO:  500,000 │     │    stATOM: 50,000 │
│    USDC:   80,000 │     │    USDC:  300,000 │     │    ATOM:   40,000 │
│                   │     │                   │     │                   │
│  Users:           │     │  Users:           │     │  Users:           │
│    Lenders:  50   │     │    Lenders:  120  │     │    Lenders:  30   │
│    Borrowers: 20  │     │    Borrowers: 60  │     │    Borrowers: 15  │
└───────────────────┘     └───────────────────┘     └───────────────────┘
        │                           │                           │
        └───────────────────────────┴───────────────────────────┘
                                    │
                         Each market completely
                         isolated with own balances
```

## Market Creation Flow

```
┌─────────┐
│ Curator │
└────┬────┘
     │
     │ 1. CreateMarket(params) + market_creation_fee
     ▼
┌─────────────────────────────────────────────────────────────┐
│              FACTORY CONTRACT                                │
│                                                              │
│  2. Validate parameters:                                     │
│     ✓ collateral_denom != debt_denom                        │
│     ✓ LTV < liquidation_threshold < 1.0                     │
│     ✓ Fees within bounds                                    │
│     ✓ Creation fee paid                                     │
│                                                              │
│  3. Test oracle:                                             │
│     ✓ Query collateral price (must succeed)                 │
│     ✓ Query debt price (must succeed)                       │
│                                                              │
│  4. Increment market counter                                │
│     market_id = 1                                            │
│                                                              │
│  5. Create instantiate message:                              │
│     WasmMsg::Instantiate {                                   │
│       code_id: market_code_id,                              │
│       msg: MarketInstantiateMsg { ... },                    │
│       label: "Isolated Market #1",                          │
│     }                                                        │
│                                                              │
│  6. Submit as SubMsg with reply                             │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ instantiate
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              NEW MARKET CONTRACT                             │
│                                                              │
│  Contract Address: osmo1abc123...                           │
│                                                              │
│  Instantiate:                                                │
│    - Store all parameters                                    │
│    - Initialize indices = 1.0                                │
│    - Set total_supply_scaled = 0                            │
│    - Set total_debt_scaled = 0                              │
│    - Set total_collateral = 0                               │
│    - Record creation_time                                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ reply with contract address
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              FACTORY CONTRACT                                │
│                                                              │
│  Reply Handler:                                              │
│    7. Parse contract address from reply                      │
│    8. Store in MARKETS map                                   │
│       MARKETS[market_id] = osmo1abc123...                   │
│    9. Update indices:                                        │
│       MARKETS_BY_CURATOR[curator].push(address)             │
│       MARKETS_BY_PAIR[(coll, debt)].push(address)           │
│    10. Transfer creation fee to protocol_fee_collector      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ return Response
                           ▼
                      ┌─────────┐
                      │ Curator │
                      └─────────┘
                    Receives market
                    contract address
```

## User Operations Flow

### Supply (Lender) Flow

```
┌────────┐
│ Lender │ Has 1000 USDC
└───┬────┘
    │
    │ 1. Supply() + send 1000 USDC
    ▼
┌────────────────────────────────────────────────────────────────┐
│  MARKET CONTRACT (ATOM/USDC)                                   │
│                                                                 │
│  2. Update interest indices:                                    │
│     time_elapsed = now - last_update = 86400 seconds (1 day)   │
│     borrow_rate = 0.10 (10% APR)                               │
│     interest = 0.10 * 86400 / 31536000 = 0.0002737            │
│     new_borrow_index = 1.0 * (1 + 0.0002737) = 1.0002737      │
│     liquidity_rate = 0.08 (8% APR after fees)                  │
│     new_liquidity_index = 1.0 * (1 + 0.0002191) = 1.0002191   │
│                                                                 │
│  3. Calculate scaled amount:                                    │
│     scaled_amount = 1000 / 1.0002191 = 999.7809                │
│                                                                 │
│  4. Update storage:                                             │
│     SUPPLIES[lender] += 999.7809                               │
│     total_supply_scaled += 999.7809                            │
│                                                                 │
│  5. Current value (for queries):                                │
│     current_supply = 999.7809 * 1.0002191 = 1000.0000         │
└─────────────────────────────────────────────────────────────────┘

Later (after 1 year):

┌────────────────────────────────────────────────────────────────┐
│  MARKET CONTRACT                                                │
│                                                                 │
│  Query: UserPosition { user: lender }                          │
│                                                                 │
│  1. Update indices (8% APR for 1 year):                        │
│     new_liquidity_index = 1.0 * 1.08 = 1.08                   │
│                                                                 │
│  2. Calculate current supply:                                   │
│     stored: scaled_amount = 999.7809                           │
│     current: 999.7809 * 1.08 = 1079.7634                      │
│                                                                 │
│  Result: Lender earned 79.76 USDC in interest!                │
└─────────────────────────────────────────────────────────────────┘
```

### Borrow Flow

```
┌──────────┐
│ Borrower │ Has 1 ATOM (worth $10)
└────┬─────┘
     │
     │ 1. SupplyCollateral() + send 1 ATOM
     ▼
┌────────────────────────────────────────────────────────────────┐
│  MARKET CONTRACT (ATOM/USDC)                                   │
│  Parameters:                                                    │
│    LTV = 0.80 (80%)                                            │
│    Liquidation Threshold = 0.85 (85%)                          │
│                                                                 │
│  2. Store collateral:                                           │
│     COLLATERAL[borrower] = 1 ATOM                              │
│     total_collateral = 1 ATOM                                  │
└────────────────────────────────────────────────────────────────┘
     │
     │ 3. Borrow(amount: 8 USDC)
     ▼
┌────────────────────────────────────────────────────────────────┐
│  MARKET CONTRACT                                                │
│                                                                 │
│  4. Update interest indices:                                    │
│     borrow_index = 1.05 (5% interest accrued so far)          │
│                                                                 │
│  5. Get oracle prices:                                          │
│     ATOM price = $10                                           │
│     USDC price = $1                                            │
│                                                                 │
│  6. Calculate max borrow:                                       │
│     collateral_value = 1 ATOM * $10 = $10                     │
│     max_borrow = $10 * 0.80 (LTV) = $8                        │
│                                                                 │
│  7. Check borrow amount:                                        │
│     requested = $8                                             │
│     ✓ $8 <= $8 (max_borrow) → APPROVED                        │
│                                                                 │
│  8. Calculate scaled debt:                                      │
│     scaled_debt = 8 / 1.05 = 7.619                            │
│                                                                 │
│  9. Update storage:                                             │
│     DEBTS[borrower] = 7.619                                    │
│     total_debt_scaled += 7.619                                 │
│                                                                 │
│  10. Transfer 8 USDC to borrower                               │
└────────────────────────────────────────────────────────────────┘
     │
     └──► Borrower receives 8 USDC
```

### Liquidation Flow

```
Scenario: ATOM price drops from $10 to $8

┌────────────────────────────────────────────────────────────────┐
│  MARKET CONTRACT                                                │
│                                                                 │
│  Borrower Position:                                             │
│    Collateral: 1 ATOM (now worth $8)                           │
│    Debt: 8 USDC (worth $8)                                     │
│    Liquidation Threshold: 85%                                   │
│                                                                 │
│  Health Factor Calculation:                                     │
│    health_factor = (collateral_value * liq_threshold) / debt   │
│    health_factor = ($8 * 0.85) / $8                           │
│    health_factor = $6.8 / $8 = 0.85                           │
│                                                                 │
│  Status: health_factor < 1.0 → LIQUIDATABLE ❌                 │
└────────────────────────────────────────────────────────────────┘

┌────────────┐
│ Liquidator │
└──────┬─────┘
       │
       │ Liquidate(borrower, max_debt_to_repay: 8 USDC) + send 8 USDC
       ▼
┌────────────────────────────────────────────────────────────────┐
│  MARKET CONTRACT                                                │
│  Parameters:                                                    │
│    close_factor = 0.50 (can liquidate 50% at once)            │
│    liquidation_bonus = 0.05 (5% discount)                      │
│    liquidation_protocol_fee = 0.02 (2% to protocol)           │
│                                                                 │
│  1. Verify health_factor < 1.0: ✓ (0.85 < 1.0)                │
│                                                                 │
│  2. Calculate max liquidatable:                                 │
│     max_liquidatable = 8 USDC * 0.50 = 4 USDC                 │
│     actual_liquidate = min(8, 4) = 4 USDC                     │
│                                                                 │
│  3. Calculate collateral to seize:                             │
│     ATOM price = $8                                            │
│     USDC price = $1                                            │
│                                                                 │
│     base_collateral = 4 USDC / $8 per ATOM = 0.5 ATOM         │
│     liquidator_bonus = 0.5 * 0.05 = 0.025 ATOM                │
│     protocol_fee = 0.5 * 0.02 = 0.010 ATOM                    │
│     total_seized = 0.5 + 0.025 + 0.010 = 0.535 ATOM           │
│                                                                 │
│  4. Update borrower position:                                   │
│     DEBTS[borrower]: 7.619 → 7.619 - (4 / borrow_index)       │
│                    = 7.619 - 3.81 = 3.809                      │
│     COLLATERAL[borrower]: 1.0 → 1.0 - 0.535 = 0.465 ATOM      │
│                                                                 │
│  5. Transfer collateral:                                        │
│     → Liquidator: 0.525 ATOM (base + bonus)                   │
│     → Protocol: 0.010 ATOM (fee)                               │
│                                                                 │
│  6. New health factor:                                          │
│     collateral = 0.465 ATOM * $8 = $3.72                      │
│     debt = 3.809 * borrow_index = ~4 USDC                     │
│     health = ($3.72 * 0.85) / $4 = 0.791                      │
│     Still underwater but improved!                              │
└────────────────────────────────────────────────────────────────┘
       │
       ├──► Liquidator receives 0.525 ATOM
       │    (paid 4 USDC, got 0.525 ATOM worth $4.20)
       │    Profit: $0.20
       │
       └──► Protocol receives 0.010 ATOM ($0.08)
```

## Bad Debt Contagion - Single Contract vs Factory

### Single Contract Problem

```
┌────────────────────────────────────────────────────────────────┐
│              SINGLE ISOLATED MARKETS CONTRACT                   │
│                                                                 │
│  Contract Balance:                                              │
│    USDC: 400,000                                               │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Market A: BTC/USDC (Aggressive - 95% LTV)               │ │
│  │   Accounting:                                             │ │
│  │     Total Supply: 100,000 USDC                           │ │
│  │     Total Debt: 90,000 USDC                              │ │
│  │     Net Liquidity: 10,000 USDC                           │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Market B: ETH/USDC (Conservative - 70% LTV)             │ │
│  │   Accounting:                                             │ │
│  │     Total Supply: 300,000 USDC                           │ │
│  │     Total Debt: 200,000 USDC                             │ │
│  │     Net Liquidity: 100,000 USDC                          │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Expected Net Liquidity: 10k + 100k = 110,000 USDC            │
│  Actual Contract Balance: 400,000 USDC ✓                      │
└────────────────────────────────────────────────────────────────┘

DISASTER SCENARIO:

1. BTC price crashes 20%
2. Market A liquidations fail to execute in time
3. Market A now has 50,000 USDC bad debt

┌────────────────────────────────────────────────────────────────┐
│  Contract Balance: 400,000 USDC (unchanged)                    │
│                                                                 │
│  Market A:                                                      │
│    Total Supply: 100,000 USDC                                  │
│    Total Debt: 90,000 USDC                                     │
│    Bad Debt: 50,000 USDC (uncollateralized)                   │
│    Net: -50,000 USDC (insolvent!)                             │
│                                                                 │
│  Market B:                                                      │
│    Total Supply: 300,000 USDC                                  │
│    Total Debt: 200,000 USDC                                    │
│    Net: 100,000 USDC                                           │
│                                                                 │
│  Problem:                                                       │
│    Total claims: 400,000 USDC (supplies - debts + bad debt)   │
│    Actual balance: 400,000 USDC                                │
│    But 50k is owed to Market A with no collateral!            │
└────────────────────────────────────────────────────────────────┘

CONTAGION EFFECT:

┌─────────────┐
│ Market A    │ All suppliers withdraw (bank run)
│ Suppliers   │ → Withdraw 100,000 USDC
└──────┬──────┘
       │
       ▼
Contract Balance: 400,000 → 300,000 USDC

┌─────────────┐
│ Market B    │ Now wants to withdraw
│ Suppliers   │ → Expects 300,000 USDC
└──────┬──────┘       Only 300,000 available!
       │              But Market B also has 200k debt to collect
       ▼
Contract Balance: 300,000 USDC
Market B Net Liquidity: Should be 100,000
But borrowers owe 200,000

First 300,000 to withdraw get funds
Last depositors suffer losses even though Market B was conservative!

❌ Market B lenders lose money due to Market A's bad debt
❌ Contagion spreads across all USDC markets
```

### Factory Pattern Solution

```
┌───────────────────────────────────────────────────────────────┐
│  MARKET A CONTRACT                                             │
│  Address: osmo1abc...                                          │
│  Pair: BTC/USDC (95% LTV - aggressive)                        │
│                                                                 │
│  Contract Balance:                                              │
│    USDC: 100,000                                               │
│                                                                 │
│  Accounting:                                                    │
│    Total Supply: 100,000 USDC                                  │
│    Total Debt: 90,000 USDC                                     │
│    Net: 10,000 USDC                                            │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│  MARKET B CONTRACT                                             │
│  Address: osmo2def...                                          │
│  Pair: ETH/USDC (70% LTV - conservative)                      │
│                                                                 │
│  Contract Balance:                                              │
│    USDC: 300,000                                               │
│                                                                 │
│  Accounting:                                                    │
│    Total Supply: 300,000 USDC                                  │
│    Total Debt: 200,000 USDC                                    │
│    Net: 100,000 USDC                                           │
└───────────────────────────────────────────────────────────────┘

DISASTER SCENARIO (same as before):

1. BTC crashes
2. Market A liquidations fail
3. Market A has 50,000 USDC bad debt

┌───────────────────────────────────────────────────────────────┐
│  MARKET A CONTRACT - INSOLVENT                                 │
│  Contract Balance: 100,000 USDC                                │
│  Claims: 150,000 USDC (100k supply + 50k bad debt)            │
│  Shortfall: 50,000 USDC                                        │
│                                                                 │
│  ❌ Market A suppliers lose 50%                                │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│  MARKET B CONTRACT - UNAFFECTED                                │
│  Contract Balance: 300,000 USDC                                │
│  Claims: 300,000 USDC                                          │
│  Shortfall: 0 USDC                                             │
│                                                                 │
│  ✅ Market B suppliers fully protected                         │
│  ✅ All 300,000 USDC withdrawable                             │
│  ✅ No contagion                                               │
└───────────────────────────────────────────────────────────────┘

KEY INSIGHT:
Each market owns its tokens at its own contract address.
Bad debt in Market A cannot drain Market B's liquidity.
True isolation achieved! 🎉
```

## Interest Accrual Mechanism

```
Time: T=0 (Market Creation)
┌────────────────────────────────────────────────────────────────┐
│  MARKET STATE                                                   │
│                                                                 │
│  borrow_index = 1.0                                            │
│  liquidity_index = 1.0                                         │
│  total_supply_scaled = 0                                        │
│  total_debt_scaled = 0                                         │
│  last_update = T0                                              │
└────────────────────────────────────────────────────────────────┘

Time: T=1 day (User supplies 1000 USDC)
┌────────────────────────────────────────────────────────────────┐
│  MARKET STATE                                                   │
│                                                                 │
│  scaled_supply = 1000 / 1.0 = 1000                            │
│  total_supply_scaled = 1000                                    │
│  SUPPLIES[user] = 1000                                         │
└────────────────────────────────────────────────────────────────┘

Time: T=2 days (User borrows 500 USDC)
┌────────────────────────────────────────────────────────────────┐
│  Interest Update (1 day elapsed):                              │
│    utilization = 0 (no debt yet)                               │
│    borrow_rate = 0                                             │
│    No change to indices                                         │
│                                                                 │
│  Borrow:                                                        │
│    scaled_debt = 500 / 1.0 = 500                              │
│    total_debt_scaled = 500                                     │
│    DEBTS[user] = 500                                           │
│                                                                 │
│  New utilization = 500 / (1000 + 500) = 33.3%                 │
│  New borrow_rate = calculate_rate(33.3%) = 10% APR            │
│  New liquidity_rate = 10% * 33.3% * 90% = 3% APR             │
│    (90% to lenders, 10% to protocol/curator)                   │
└────────────────────────────────────────────────────────────────┘

Time: T=1 year (Query user positions)
┌────────────────────────────────────────────────────────────────┐
│  Interest Update (363 days elapsed):                           │
│                                                                 │
│  Borrow side:                                                   │
│    interest_factor = 1 + (0.10 * 363/365) = 1.0995            │
│    new_borrow_index = 1.0 * 1.0995 = 1.0995                  │
│                                                                 │
│  Supply side:                                                   │
│    interest_factor = 1 + (0.03 * 363/365) = 1.0298            │
│    new_liquidity_index = 1.0 * 1.0298 = 1.0298               │
│                                                                 │
│  User Positions:                                                │
│    Supply (stored: 1000 scaled):                               │
│      current = 1000 * 1.0298 = 1029.8 USDC                   │
│      Earned: 29.8 USDC                                         │
│                                                                 │
│    Debt (stored: 500 scaled):                                  │
│      current = 500 * 1.0995 = 549.75 USDC                    │
│      Owes: 49.75 USDC more                                     │
│                                                                 │
│  Protocol/Curator fees:                                         │
│    Total interest = 49.75                                       │
│    To suppliers = 29.8                                          │
│    To protocol/curator = 19.95 (10% of total)                 │
└────────────────────────────────────────────────────────────────┘
```

## Storage Key Simplification

```
OLD PATTERN (Single Contract, Multiple Markets):
─────────────────────────────────────────────────

Market Storage:
  MARKETS: Map<&str, Market>
    "market_1" → Market { collateral: ATOM, debt: USDC, ... }
    "market_2" → Market { collateral: OSMO, debt: USDC, ... }

User Positions (need market_id):
  SUPPLIES: Map<(&str, &Addr), Uint128>
    ("market_1", "user1") → 1000
    ("market_1", "user2") → 2000
    ("market_2", "user1") → 500

  DEBTS: Map<(&str, &Addr), Uint128>
    ("market_1", "user1") → 800
    ("market_2", "user1") → 300

Problem: Must always pass market_id
  SUPPLIES.load(storage, ("market_1", &user))?;


NEW PATTERN (Factory, One Market Per Contract):
───────────────────────────────────────────────

Each Market Contract:
  STATE: Item<MarketState>  ← Single market state

  User Positions (no market_id needed!):
    SUPPLIES: Map<&Addr, Uint128>
      "user1" → 1000
      "user2" → 2000

    DEBTS: Map<&Addr, Uint128>
      "user1" → 800

Solution: Simpler keys!
  SUPPLIES.load(storage, &user)?;  ← No market_id!

Factory Contract tracks all markets:
  MARKETS: Map<u64, Addr>
    1 → "osmo1abc..." (Market A contract)
    2 → "osmo2def..." (Market B contract)
```

---

**Architecture Diagrams Version:** 1.0
**Last Updated:** 2026-01-17
**Purpose:** Visual reference for understanding isolated markets factory pattern
