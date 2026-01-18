# Isolated Markets Project - Summary

## What This Project Is

A **factory pattern** implementation of isolated lending markets for CosmWasm, inspired by Morpho Blue. Each market is deployed as a separate contract instance to achieve true isolation and prevent bad debt contagion.

## Key Innovation

**Problem:** In a single contract holding multiple markets, bad debt in one market can drain liquidity from other markets sharing the same debt asset.

**Solution:** Factory pattern where each market is a separate contract with its own token balances. Bad debt in Market A cannot affect Market B's liquidity.

## Project Contents

### Documentation (Read in this order)

1. **[README.md](README.md)** - Project overview and architecture
2. **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** - State structures, operations, calculations
3. **[GETTING_STARTED.md](GETTING_STARTED.md)** - Step-by-step implementation guide
4. **[ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md)** - Visual architecture diagrams

### Detailed Specifications

Located in `docs/`:

1. **[FACTORY_PATTERN_CHANGES.md](docs/FACTORY_PATTERN_CHANGES.md)** - Summary of factory architecture changes
2. **[ISOLATED_MARKETS_SPEC.md](docs/ISOLATED_MARKETS_SPEC.md)** - Complete design specification
3. **[ISOLATED_MARKETS_TECHNICAL_ARCHITECTURE.md](docs/ISOLATED_MARKETS_TECHNICAL_ARCHITECTURE.md)** - Detailed pseudocode
4. **[ISOLATED_MARKETS_IMPLEMENTATION_GUIDE.md](docs/ISOLATED_MARKETS_IMPLEMENTATION_GUIDE.md)** - Implementation phases

### Reference Implementations

Located in `contracts-reference/`:

**Red Bank Contracts** (`contracts-reference/red-bank/`):
- `state.rs` - Storage structures and patterns
- `interest_rates.rs` - Interest rate calculations (use directly)
- `borrow.rs` - Borrow logic (adapt by removing market_id)
- `repay.rs` - Repay logic (adapt by removing market_id)
- `liquidate.rs` - Liquidation logic (adapt to add protocol fee)
- `deposit.rs` - Supply logic (adapt by removing market_id)
- `withdraw.rs` - Withdraw logic (adapt by removing market_id)
- `health.rs` - Health factor calculations (use directly)
- `collateral.rs` - Collateral management (adapt by removing market_id)
- `helpers.rs` - Utility functions
- `error.rs` - Error types

**Type Definitions** (`contracts-reference/types/`):
- `red_bank/` - Red Bank message and state types
- `oracle/` - Oracle interface types

## Two Contracts Required

### 1. Factory Contract

**Purpose:** Deploy and track market instances

**Key State:**
```rust
pub struct FactoryState {
    pub owner: Addr,
    pub market_code_id: u64,           // Stored WASM code for markets
    pub market_creation_fee: Coin,
    pub protocol_fee_collector: Addr,
    pub markets: Vec<Addr>,             // All created markets
}
```

**Operations:**
- `CreateMarket` - Instantiates new market contract
- `UpdateMarketCodeId` - Upgrade market template
- `UpdateConfig` - Change fees/collector
- Queries: List markets, markets by curator, markets by pair

### 2. Market Contract

**Purpose:** Individual lending market

**Key State:**
```rust
pub struct MarketState {
    // Identity
    pub collateral_denom: String,
    pub debt_denom: String,
    pub curator: Addr,
    pub oracle: Addr,
    pub factory: Addr,

    // Risk parameters (LTV, liquidation threshold, etc.)
    // Interest (borrow_index, liquidity_index, rates)
    // Totals (total_supply_scaled, total_debt_scaled)
    // Fees (protocol_fee, curator_fee)
    // Status (enabled, is_mutable)
}

// Storage (NO market_id needed!)
SUPPLIES: Map<&Addr, Uint128>     // User → scaled amount
COLLATERAL: Map<&Addr, Uint128>   // User → amount
DEBTS: Map<&Addr, Uint128>        // User → scaled amount
```

**Operations:**
- `Supply` / `Withdraw` (lenders)
- `SupplyCollateral` / `WithdrawCollateral` (borrowers)
- `Borrow` / `Repay` (borrowers)
- `Liquidate` (liquidators)
- `UpdateParams` (curator, within bounds)

## Critical Architectural Difference

### Single Contract (OLD)
```rust
// Had to include market_id everywhere
SUPPLIES: Map<(&str, &Addr), Uint128>  // (market_id, user) → amount
DEBTS: Map<(&str, &Addr), Uint128>     // (market_id, user) → amount

// Problem: All markets share contract's token balance
// → Bad debt in one market can drain others
```

### Factory Pattern (NEW)
```rust
// Each market is own contract, no market_id needed
SUPPLIES: Map<&Addr, Uint128>          // user → amount
DEBTS: Map<&Addr, Uint128>             // user → amount

// Solution: Each market has own contract address and token balances
// → Bad debt in one market CANNOT affect others
```

## Key Concepts

### Scaled Amounts
Interest accrues via indices rather than updating every user's balance:
```rust
// Store scaled amount
scaled_amount = amount / index

// Query current amount
current_amount = scaled_amount * index

// As index grows, so does current_amount (without storage updates!)
```

### Health Factor
```rust
health_factor = (collateral_value * liquidation_threshold) / debt_value

// > 1.0 = healthy
// < 1.0 = liquidatable
```

### LTV vs Liquidation Threshold
- **LTV:** Maximum initial borrow (e.g., 80% of collateral value)
- **Liquidation Threshold:** When position becomes liquidatable (e.g., 85%)
- **Gap:** Safety buffer (85% - 80% = 5%)

## Implementation Estimate

For experienced CosmWasm developer:
- **Types package:** 2-3 hours
- **Market contract:** 25-35 hours
- **Factory contract:** 4-5 hours
- **Unit tests:** 10-12 hours
- **Integration tests:** 15-20 hours
- **Optimization & docs:** 8-12 hours

**Total:** 60-80 hours for complete MVP

Team of 2-3 developers: **2-3 weeks**

## Quick Start

1. **Read Documentation**
   - Start with [README.md](README.md)
   - Review [QUICK_REFERENCE.md](QUICK_REFERENCE.md)
   - Study [GETTING_STARTED.md](GETTING_STARTED.md)

2. **Study Reference Implementations**
   - Focus on `contracts-reference/red-bank/interest_rates.rs`
   - Understand `borrow.rs`, `repay.rs`, `liquidate.rs`
   - Note what needs adapting (remove market_id from keys)

3. **Set Up Project**
   ```bash
   cargo new isolated-markets --lib
   # See GETTING_STARTED.md for structure
   ```

4. **Implement**
   - Start with types package
   - Implement market contract modules
   - Implement factory contract
   - Write comprehensive tests

5. **Deploy**
   - Local testing
   - Testnet deployment
   - Security review
   - Audit
   - Mainnet

## What Makes This Different

### From Morpho Blue
- CosmWasm (not EVM)
- Based on Mars Red Bank architecture
- Curator fee model
- No position manager (direct interaction)

### From Mars Red Bank
- Factory pattern (not single contract)
- One market per contract (true isolation)
- Permissionless market creation
- Curator incentives
- No governance (curator-controlled parameters)

### From Compound/AAVE
- Isolated markets (not pooled)
- No cross-collateralization
- Curator creates markets with custom params
- Factory deployment model

## Critical Invariants

Must test and maintain:
1. `total_supply_scaled * liquidity_index >= sum(user_supplies)`
2. `total_debt_scaled * borrow_index >= sum(user_debts)`
3. `contract_balance >= required_balance`
4. `health_factor < 1.0 ⟺ liquidatable`
5. Indices only increase (never decrease)
6. Liquidations improve health factor
7. Bad debt in Market A cannot affect Market B

## Security Considerations

### Known Risks
- Oracle price manipulation
- First depositor index manipulation (mitigate with minimum deposit)
- Curator can set malicious parameters (user due diligence required)
- No cross-market queries without indexer

### Mitigations
- Test oracle on market creation
- Comprehensive bounds checking on parameters
- Health factor checks before all operations
- Liquidation incentives properly structured
- Extensive testing of edge cases

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

## Trade-offs

❌ **Higher Deployment Costs**
- Each market requires contract instantiation

❌ **Harder Cross-Market Queries**
- Must query N contracts for N markets
- Need indexer for efficient lookups

❌ **More Complex UX**
- Users interact with different addresses
- Frontend must track market addresses

**Decision:** Benefits outweigh costs. The isolation guarantee is worth the additional complexity.

## File Organization

```
isolated-markets-project/
├── README.md                          # Project overview
├── QUICK_REFERENCE.md                 # Quick reference card
├── GETTING_STARTED.md                 # Implementation guide
├── ARCHITECTURE_DIAGRAMS.md           # Visual diagrams
├── PROJECT_SUMMARY.md                 # This file
│
├── docs/                              # Detailed specifications
│   ├── FACTORY_PATTERN_CHANGES.md    # Factory architecture
│   ├── ISOLATED_MARKETS_SPEC.md      # Design spec
│   ├── ISOLATED_MARKETS_TECHNICAL_ARCHITECTURE.md
│   └── ISOLATED_MARKETS_IMPLEMENTATION_GUIDE.md
│
├── contracts-reference/               # Reference implementations
│   ├── red-bank/                     # Mars Red Bank contracts
│   │   ├── state.rs
│   │   ├── interest_rates.rs
│   │   ├── borrow.rs
│   │   ├── repay.rs
│   │   ├── liquidate.rs
│   │   ├── deposit.rs
│   │   ├── withdraw.rs
│   │   ├── health.rs
│   │   ├── collateral.rs
│   │   ├── helpers.rs
│   │   └── error.rs
│   └── types/                        # Type definitions
│       ├── red_bank/
│       └── oracle/
│
└── schemas/                          # JSON schemas (to generate)
```

## Next Steps

1. Read all documentation (start with README.md)
2. Study reference implementations
3. Set up new CosmWasm project
4. Implement Market contract
5. Implement Factory contract
6. Write comprehensive tests
7. Deploy to testnet
8. Security review
9. Audit
10. Deploy to mainnet

## Support & Resources

- **CosmWasm Docs:** https://docs.cosmwasm.com/
- **Morpho Blue:** https://docs.morpho.org/
- **Mars Protocol:** https://github.com/mars-protocol/
- **Reference Contracts:** See `contracts-reference/` directory

---

**Project Status:** Ready for Implementation
**Created:** 2026-01-17
**Architecture:** Factory Pattern (Separate Contract per Market)
**Based on:** Mars Red Bank + Morpho Blue concepts

---

## Quick Command Reference

### Read Documentation
```bash
# Start here
cat README.md
cat QUICK_REFERENCE.md
cat GETTING_STARTED.md

# Deep dive
cat docs/FACTORY_PATTERN_CHANGES.md
cat docs/ISOLATED_MARKETS_SPEC.md
cat docs/ISOLATED_MARKETS_TECHNICAL_ARCHITECTURE.md
```

### Study Reference Code
```bash
# Key files to understand
cat contracts-reference/red-bank/interest_rates.rs
cat contracts-reference/red-bank/borrow.rs
cat contracts-reference/red-bank/liquidate.rs
cat contracts-reference/red-bank/health.rs
```

### Set Up Project
```bash
# Create new project
cargo new isolated-markets --lib
cd isolated-markets

# Copy reference for easy access
cp -r /path/to/isolated-markets-project/contracts-reference .
```

Good luck building! 🚀
