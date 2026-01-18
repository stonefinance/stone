# Isolated Markets - Factory Pattern Implementation

A Morpho-inspired isolated lending markets protocol for CosmWasm, using a factory pattern where each market is a separate contract instance.

## Project Overview

This project implements a permissionless isolated lending protocol where:
- Each market is a **separate contract instance** with its own token balances
- A **factory contract** deploys and tracks all market instances
- **Curators** create markets with custom parameters and earn fees
- **True isolation** prevents bad debt contagion between markets
- Based on Mars Protocol's Red Bank architecture with factory pattern

## Why Factory Pattern?

**Problem with single contract:**
```
Single Contract with multiple markets:
  - Market A: ATOM/USDC (100K USDC)
  - Market B: OSMO/USDC (300K USDC)
  - Total USDC in contract: 400K

If Market A suffers bad debt of 150K:
  → Contract only has 400K - 150K = 250K USDC
  → Market B thinks it has 300K but only 250K exists
  → First withdrawers drain liquidity
  → Losses are socialized between markets
```

**Solution with factory:**
```
Market A Contract: owns 100K USDC at address osmo1...
Market B Contract: owns 300K USDC at address osmo2...

If Market A suffers bad debt of 150K:
  → Only Market A depositors lose funds
  → Market B's 300K USDC completely unaffected
  → True isolation ✅
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Factory Contract                          │
│  - Stores market_code_id                                    │
│  - Deploys new market instances                             │
│  - Tracks all markets                                       │
│  - Collects creation fees                                   │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Market A    │    │  Market B    │    │  Market C    │
│  Contract    │    │  Contract    │    │  Contract    │
│              │    │              │    │              │
│ ATOM/USDC    │    │ OSMO/USDC    │    │ stATOM/ATOM  │
│ addr: osmo1..│    │ addr: osmo2..│    │ addr: osmo3..│
└──────────────┘    └──────────────┘    └──────────────┘
```

## Project Structure

```
isolated-markets-project/
├── README.md                          # This file
├── INDEX.md                           # Complete document index
├── CONTRACTS_NEEDED.md                # What contracts to implement/use
├── QUICK_REFERENCE.md                 # Developer cheat sheet
├── GETTING_STARTED.md                 # Step-by-step implementation
├── ARCHITECTURE_DIAGRAMS.md           # Visual diagrams
├── IMPLEMENTATION_CHECKLIST.md        # Task tracking
├── PROJECT_SUMMARY.md                 # Executive overview
├── docs/                              # All specification documents
│   ├── ISOLATED_MARKETS_SPEC.md      # Main design specification
│   ├── FACTORY_PATTERN_CHANGES.md    # Factory architecture summary
│   ├── ISOLATED_MARKETS_TECHNICAL_ARCHITECTURE.md  # Detailed pseudocode
│   └── ISOLATED_MARKETS_IMPLEMENTATION_GUIDE.md    # Step-by-step guide
├── contracts-reference/               # Reference implementations
│   ├── red-bank/                     # Mars Red Bank contract files
│   │   ├── state.rs                  # Storage structures
│   │   ├── interest_rates.rs         # Interest rate model
│   │   ├── borrow.rs                 # Borrow logic
│   │   ├── repay.rs                  # Repay logic
│   │   ├── liquidate.rs              # Liquidation logic
│   │   ├── deposit.rs                # Deposit logic
│   │   ├── withdraw.rs               # Withdraw logic
│   │   ├── health.rs                 # Health factor calculations
│   │   ├── collateral.rs             # Collateral management
│   │   ├── helpers.rs                # Utility functions
│   │   └── error.rs                  # Error types
│   ├── types/                        # Type definitions
│   │   ├── red_bank/                 # Red Bank types
│   │   └── oracle/                   # Oracle interface types
│   ├── oracle-base/                  # Mars oracle reference
│   │   ├── contract.rs               # Oracle contract patterns
│   │   ├── traits.rs                 # Oracle traits
│   │   └── error.rs                  # Oracle errors
│   └── mock-oracle/                  # Simple oracle for testing
│       ├── contract.rs               # Mock oracle implementation
│       ├── state.rs                  # Price storage
│       ├── msg.rs                    # Oracle messages
│       └── lib.rs
└── schemas/                          # JSON schemas (to be generated)
```

## Key Design Decisions

| Decision Area | Choice | Rationale |
|--------------|--------|-----------|
| **Architecture** | Factory pattern (separate contract per market) | True isolation - prevents bad debt contagion |
| **Market Deployment** | Factory instantiates from stored code_id | Each market is independent contract |
| **LTV Mutability** | Optional: ±5% per week if mutable | Curator adaptation while preventing rapid changes |
| **Fee Distribution** | Direct transfer to protocol/curator | Simple, no intermediary storage |
| **Oracle** | Curator-specified per market, immutable | Curator responsibility, maximum flexibility |
| **Creation Cost** | Configurable by factory owner | Spam prevention, can be zero for testnets |
| **Liquidation** | Fixed bonus + protocol fee | Simple and predictable |
| **Mars Integration** | None - standalone system | Simpler, deployable anywhere |

## Core Features

### Two Contracts Required

#### 1. Market Contract
**Purpose:** Individual lending market instance

**State:**
- Market identity: collateral_denom, debt_denom, curator, oracle, factory
- Risk parameters: LTV, liquidation threshold, liquidation bonus
- Interest rate model
- Scaled balances: total_supply_scaled, total_debt_scaled, total_collateral
- User positions: supplies, collateral, debts (keyed by user address only)
- Fees: protocol_fee, curator_fee
- Status: enabled, is_mutable

**Operations:**
- Supply / Withdraw (debt asset, scaled)
- SupplyCollateral / WithdrawCollateral (collateral asset, unscaled)
- Borrow / Repay (debt asset, scaled)
- Liquidate
- UpdateParams (curator only, within bounds)

#### 2. Factory Contract
**Purpose:** Deploy and track market instances

**State:**
- owner: Contract owner
- market_code_id: Stored WASM code ID for market contract
- market_creation_fee: Cost to create new market
- protocol_fee_collector: Receives protocol fees
- markets: Vec of all created market addresses

**Operations:**
- CreateMarket → instantiates new Market contract
- UpdateMarketCodeId → upgrade market template (owner only)
- UpdateConfig → update fees, collector (owner only)
- Queries: ListMarkets, MarketsByCurator, MarketsByPair

### User Operations

**Lenders:**
1. Supply debt_asset → earn interest (scaled shares)
2. Withdraw debt_asset → redeem shares + interest

**Borrowers:**
1. SupplyCollateral collateral_asset
2. Borrow debt_asset (LTV check)
3. Repay debt_asset + interest
4. WithdrawCollateral (health check)

**Liquidators:**
- Liquidate underwater positions
- Receive collateral at discount (liquidation_bonus)
- Protocol receives additional fee from collateral

## Quick Start

### 1. Read the Documentation

Start with these documents in order:

1. **[FACTORY_PATTERN_CHANGES.md](docs/FACTORY_PATTERN_CHANGES.md)** - Quick overview of factory architecture
2. **[ISOLATED_MARKETS_SPEC.md](docs/ISOLATED_MARKETS_SPEC.md)** - Complete design specification
3. **[ISOLATED_MARKETS_TECHNICAL_ARCHITECTURE.md](docs/ISOLATED_MARKETS_TECHNICAL_ARCHITECTURE.md)** - Detailed pseudocode
4. **[ISOLATED_MARKETS_IMPLEMENTATION_GUIDE.md](docs/ISOLATED_MARKETS_IMPLEMENTATION_GUIDE.md)** - Step-by-step implementation

### 2. Review Reference Implementations

Check the Red Bank contracts in `contracts-reference/red-bank/`:

- **interest_rates.rs** - How to implement interest accrual with indices
- **borrow.rs / repay.rs** - Scaled debt management
- **liquidate.rs** - Liquidation logic
- **health.rs** - Health factor calculations
- **state.rs** - Storage structure patterns

### 3. Understand Key Concepts

#### Scaled Amounts
```rust
// Storage: scaled amounts (don't grow over time)
user_debt_scaled: Uint128

// Current debt calculation
user_debt_current = user_debt_scaled * borrow_index

// Borrow index grows over time from interest
borrow_index = 1.0 + accumulated_interest_rate
```

#### Health Factor
```rust
health_factor = (collateral_value * liquidation_threshold) / debt_value

// Healthy: health_factor > 1.0
// Liquidatable: health_factor < 1.0
```

#### Market Creation Flow
```
1. Curator calls Factory.CreateMarket(params) + sends creation_fee
2. Factory validates params
3. Factory calls instantiate(market_code_id, init_msg)
4. New Market contract deployed at unique address
5. Factory stores market address
6. Users interact with Market contract directly
```

## Implementation Phases

### Phase 1: MVP (Core Functionality)
- Factory contract with market creation
- Market contract with all basic operations
- Interest rate accrual using indices
- Liquidation system
- Basic queries

### Phase 2: Safety & Testing
- Comprehensive test suite
- Invariant testing
- Gas optimization
- Security review preparation

### Phase 3: Advanced Features
- Emergency pause mechanism
- Parameter migration utilities
- Advanced queries
- Events and indexing support

## Development Guidelines

### Storage Key Simplification

**Old (single contract):**
```rust
SUPPLIES: Map<(&str, &Addr), Uint128>  // (market_id, user) → amount
```

**New (factory pattern):**
```rust
SUPPLIES: Map<&Addr, Uint128>  // user → amount
// No market_id needed since each market is its own contract!
```

### Key Implementation Points

1. **No market_id in storage keys** - Each market contract handles one market
2. **Factory stores code_id** - Reuse same WASM code for all markets
3. **Immutable core params** - collateral_denom, debt_denom, oracle cannot change
4. **Test oracle on creation** - Query both collateral and debt prices during CreateMarket
5. **Scaled amounts everywhere** - Use indices for supplies and debts
6. **Direct fee transfers** - Send protocol/curator fees immediately during interest accrual

### Error Handling

Key errors to implement:
- Unauthorized (not curator/owner)
- InsufficientLiquidity
- HealthFactorAboveOne / BelowOne
- InvalidLTV / InvalidLiquidationThreshold
- OracleError
- InsufficientCollateral
- MarketDisabled

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

### 3. Create Markets
```bash
# Curators call factory to create markets
wasmd tx wasm execute $FACTORY_ADDR \
  '{"create_market":{"collateral_denom":"uatom","debt_denom":"ibc/...USDC","oracle":"osmo1...","params":{...}}}' \
  --from curator \
  --amount 1000000uosmo
```

## Security Considerations

### Critical Invariants to Test

1. **Total debt scaled * borrow_index >= sum of all user debts**
2. **Total supply scaled * liquidity_index >= sum of all user supplies**
3. **Contract token balance >= total_supply - total_debt**
4. **Health factor < 1.0 → liquidatable**
5. **Health factor >= 1.0 → cannot liquidate**
6. **Collateral seized <= borrower's collateral**
7. **Protocol + curator fees < 100% of interest**

### Known Limitations

- Oracle price manipulation can affect liquidations
- First depositor can manipulate indices (mitigate with minimum deposit)
- Curator can set malicious parameters (user responsibility to verify)
- No cross-market queries without indexer

## Testing Strategy

### Unit Tests
- Interest rate calculations
- Index updates
- Scaled amount conversions
- Health factor computation
- Liquidation amount calculations

### Integration Tests
- Full user flows (supply → borrow → repay → withdraw)
- Liquidation scenarios
- Market creation via factory
- Parameter updates
- Multiple markets interaction (ensure isolation)

### Property Tests
- Invariants hold after any operation
- Interest never decreases indices
- Liquidations improve health factor
- Total debt/supply consistency

### Gas Benchmarks
- Market creation cost
- Supply/withdraw costs
- Borrow/repay costs
- Liquidation costs
- Query costs

## Next Steps

1. Set up new CosmWasm project structure
2. Implement Factory contract
3. Implement Market contract
4. Write comprehensive tests
5. Security review
6. Testnet deployment
7. Audit
8. Mainnet deployment

## Resources

- **Morpho Blue:** https://docs.morpho.org/
- **Mars Red Bank:** Reference implementation in `contracts-reference/`
- **CosmWasm Docs:** https://docs.cosmwasm.com/
- **cw-storage-plus:** https://github.com/CosmWasm/cw-storage-plus

## License

TBD

## Contributing

TBD

---

**Status:** Ready for Implementation
**Created:** 2026-01-17
**Architecture:** Factory Pattern with Separate Contract per Market
