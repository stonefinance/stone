# Isolated Markets Project - Document Index

Complete reference guide to all documentation in this project.

## Start Here 🚀

If you're new to this project, read these files in order:

1. **[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)** (5 min) - What this project is and why
2. **[README.md](README.md)** (10 min) - Project overview and architecture
3. **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** (15 min) - State structures and operations
4. **[GETTING_STARTED.md](GETTING_STARTED.md)** (30 min) - Step-by-step implementation guide

## Quick Reference Documents

### PROJECT_SUMMARY.md
**Purpose:** High-level project overview
**When to use:** First document to read, quick reference for what this project is
**Contents:**
- What this project is (factory pattern isolated markets)
- Key innovation (preventing bad debt contagion)
- Two contracts required (Factory + Market)
- Critical architectural difference (no market_id in keys)
- Implementation estimate (60-80 hours)
- File organization

### README.md
**Purpose:** Main project documentation
**When to use:** Comprehensive overview of architecture and features
**Contents:**
- Why factory pattern (bad debt isolation problem)
- System architecture diagrams
- Project structure
- Key design decisions
- Core features (Factory + Market contracts)
- User operations flows
- Quick start guide
- Deployment process
- Security considerations
- Testing strategy

### QUICK_REFERENCE.md
**Purpose:** Cheat sheet for developers
**When to use:** During implementation, keep this open while coding
**Contents:**
- Factory contract state and messages
- Market contract state and messages
- Key operations (market creation, supply, borrow, liquidation)
- Critical calculations (scaled amounts, health factor, liquidation amounts)
- Parameter bounds
- Storage key patterns (old vs new)
- Common errors
- Testing checklist
- Deployment checklist
- Reference implementation mapping
- Quick command reference

### GETTING_STARTED.md
**Purpose:** Step-by-step implementation guide
**When to use:** When ready to start coding
**Contents:**
- Prerequisites
- Documentation reading order
- Key concepts to understand
- Reference implementations to study
- Project structure setup
- Implementation phases (1-9)
  - Types package
  - Market contract state
  - Interest rate logic
  - Supply/withdraw
  - Borrow/repay
  - Collateral
  - Liquidation
  - Factory contract
  - Testing
- Common pitfalls to avoid
- Timeline estimate
- Next steps checklist

### ARCHITECTURE_DIAGRAMS.md
**Purpose:** Visual architecture reference
**When to use:** To understand system flows and interactions
**Contents:**
- System architecture diagram
- Market creation flow
- User operations flow (supply, borrow, liquidation)
- Bad debt contagion comparison (single vs factory)
- Interest accrual mechanism
- Storage key simplification

### IMPLEMENTATION_CHECKLIST.md
**Purpose:** Detailed task tracking for implementation
**When to use:** Track progress throughout implementation
**Contents:**
- 30 phases of implementation
- Each phase broken into tasks
- Checkboxes for tracking
- Time estimates per phase
- Total timeline: ~120 hours to testnet
- Progress tracking section

## Detailed Specifications

Located in `docs/` directory:

### docs/FACTORY_PATTERN_CHANGES.md
**Purpose:** Summary of architectural changes from single contract to factory
**When to use:** To understand the key architectural shift
**Contents:**
- Before/after comparison
- Architecture change explanation
- Two contracts required (detailed)
- Market creation flow (old vs new)
- Storage key differences
- Execute message definitions
- Deployment process
- Migration path
- Benefits and trade-offs

### docs/ISOLATED_MARKETS_SPEC.md
**Purpose:** Complete design specification
**When to use:** Authoritative reference for all design decisions
**Contents:**
- Executive summary
- Core concepts (isolated markets, roles)
- Architecture overview (factory pattern)
- Market creation & configuration
- User operations (detailed)
- Interest rate mechanism
- Liquidation system
- Risk management
- Data structures
- Entry points (instantiate, execute, query)
- Events
- Error handling
- Design decisions (finalized)
- Next steps

### docs/ISOLATED_MARKETS_TECHNICAL_ARCHITECTURE.md
**Purpose:** Detailed pseudocode for all operations
**When to use:** When implementing specific functions
**Contents:**
- Project structure
- Data structures (detailed)
- Core operations (pseudocode):
  - Market creation
  - Supply/withdraw
  - Borrow/repay
  - Liquidation
  - Interest accrual
  - Parameter updates
- Entry points
- Query handlers
- Error handling
- Events
- Testing strategy
- Deployment guide

### docs/ISOLATED_MARKETS_IMPLEMENTATION_GUIDE.md
**Purpose:** Comprehensive implementation roadmap
**When to use:** Planning implementation phases
**Contents:**
- Implementation phases (13 phases)
- Each phase with:
  - Objectives
  - Tasks
  - Files to create/modify
  - Time estimates
  - Dependencies
- Testing strategy
- Deployment instructions
- Timeline estimates
- Success criteria

## Reference Implementations

Located in `contracts-reference/` directory:

### contracts-reference/red-bank/
**Mars Red Bank contract implementations to use as reference**

Key files to study:

1. **state.rs** - Storage structures and patterns
   - Use this for: Understanding cw-storage-plus Map usage
   - Adapt: Remove market_id from keys

2. **interest_rates.rs** - Interest rate calculations
   - Use this: Directly (logic is identical)
   - Study: Index update mechanisms, rate calculations

3. **borrow.rs** - Borrow logic
   - Adapt: Remove market_id from storage keys
   - Study: Health checks, scaled debt storage

4. **repay.rs** - Repay logic
   - Adapt: Remove market_id from storage keys
   - Study: Debt reduction, full vs partial repay

5. **liquidate.rs** - Liquidation logic
   - Adapt: Add protocol fee to liquidation bonus
   - Study: Collateral seizure calculations

6. **deposit.rs** - Supply logic
   - Adapt: Remove market_id from storage keys
   - Study: Scaled amount storage

7. **withdraw.rs** - Withdraw logic
   - Adapt: Remove market_id from storage keys
   - Study: Liquidity checks

8. **health.rs** - Health factor calculations
   - Use this: Directly (logic is identical)
   - Study: Oracle price queries, collateral value calculations

9. **collateral.rs** - Collateral management
   - Adapt: Remove market_id from storage keys
   - Study: Health checks on withdrawal

10. **helpers.rs** - Utility functions
    - Use this: Helper patterns
    - Study: Common validation functions

11. **error.rs** - Error types
    - Use this: Error handling patterns
    - Study: Error variants and conversions

### contracts-reference/types/
**Type definitions from Mars Protocol**

- **red_bank/** - Red Bank message and state types
- **oracle/** - Oracle interface types

## Document Map

```
isolated-markets-project/
│
├── INDEX.md (this file)                    ← You are here
│
├── Quick Start Documents
│   ├── PROJECT_SUMMARY.md                  ← Read first (5 min)
│   ├── README.md                           ← Read second (10 min)
│   ├── QUICK_REFERENCE.md                  ← Keep open while coding
│   └── GETTING_STARTED.md                  ← Implementation guide
│
├── Implementation Tools
│   ├── IMPLEMENTATION_CHECKLIST.md         ← Track your progress
│   └── ARCHITECTURE_DIAGRAMS.md            ← Visual reference
│
├── Detailed Specifications (docs/)
│   ├── FACTORY_PATTERN_CHANGES.md          ← Key architectural changes
│   ├── ISOLATED_MARKETS_SPEC.md            ← Complete design spec
│   ├── ISOLATED_MARKETS_TECHNICAL_ARCHITECTURE.md  ← Detailed pseudocode
│   └── ISOLATED_MARKETS_IMPLEMENTATION_GUIDE.md    ← Phase-by-phase guide
│
└── Reference Code (contracts-reference/)
    ├── red-bank/                           ← Mars Red Bank contracts
    │   ├── state.rs                        ← Storage patterns
    │   ├── interest_rates.rs               ← Interest logic
    │   ├── borrow.rs                       ← Borrow logic
    │   ├── repay.rs                        ← Repay logic
    │   ├── liquidate.rs                    ← Liquidation logic
    │   ├── deposit.rs                      ← Supply logic
    │   ├── withdraw.rs                     ← Withdraw logic
    │   ├── health.rs                       ← Health calculations
    │   ├── collateral.rs                   ← Collateral management
    │   ├── helpers.rs                      ← Utilities
    │   └── error.rs                        ← Error types
    └── types/                              ← Type definitions
        ├── red_bank/                       ← Red Bank types
        └── oracle/                         ← Oracle types
```

## Reading Paths by Role

### I'm a Developer Ready to Implement

1. [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) - Understand the project
2. [README.md](README.md) - Learn the architecture
3. [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - Learn state structures
4. [GETTING_STARTED.md](GETTING_STARTED.md) - Implementation steps
5. [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md) - Track progress
6. Study `contracts-reference/red-bank/` files
7. Refer to `docs/ISOLATED_MARKETS_TECHNICAL_ARCHITECTURE.md` for pseudocode
8. Keep [QUICK_REFERENCE.md](QUICK_REFERENCE.md) and [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md) open while coding

### I'm an Architect/Designer

1. [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) - Project overview
2. [README.md](README.md) - Architecture overview
3. [docs/FACTORY_PATTERN_CHANGES.md](docs/FACTORY_PATTERN_CHANGES.md) - Key architectural decision
4. [docs/ISOLATED_MARKETS_SPEC.md](docs/ISOLATED_MARKETS_SPEC.md) - Complete design
5. [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md) - Visual diagrams
6. [docs/ISOLATED_MARKETS_TECHNICAL_ARCHITECTURE.md](docs/ISOLATED_MARKETS_TECHNICAL_ARCHITECTURE.md) - Technical details

### I'm an Auditor/Security Researcher

1. [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) - Project context
2. [README.md](README.md) - System overview
3. [docs/ISOLATED_MARKETS_SPEC.md](docs/ISOLATED_MARKETS_SPEC.md) - Design decisions
4. [docs/ISOLATED_MARKETS_TECHNICAL_ARCHITECTURE.md](docs/ISOLATED_MARKETS_TECHNICAL_ARCHITECTURE.md) - Pseudocode
5. [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - Critical invariants and calculations
6. Study `contracts-reference/red-bank/` for implementation patterns
7. Review [README.md](README.md) Security Considerations section

### I'm a Frontend Developer/Integrator

1. [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) - What this is
2. [README.md](README.md) - System overview
3. [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - Messages and queries
4. [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md) - User flows
5. Generated schemas (in `schemas/` after implementation)
6. [docs/ISOLATED_MARKETS_SPEC.md](docs/ISOLATED_MARKETS_SPEC.md) Entry Points section

### I'm a Project Manager

1. [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) - Executive overview
2. [README.md](README.md) - Project scope
3. [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md) - Task breakdown and estimates
4. [docs/ISOLATED_MARKETS_IMPLEMENTATION_GUIDE.md](docs/ISOLATED_MARKETS_IMPLEMENTATION_GUIDE.md) - Phase planning

## Search by Topic

### Factory Pattern
- [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) - "Key Innovation" section
- [README.md](README.md) - "Why Factory Pattern?" section
- [docs/FACTORY_PATTERN_CHANGES.md](docs/FACTORY_PATTERN_CHANGES.md) - Complete explanation
- [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md) - Visual comparison

### Interest Accrual
- [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - "Critical Calculations" section
- [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md) - "Interest Accrual Mechanism"
- `contracts-reference/red-bank/interest_rates.rs` - Implementation
- [docs/ISOLATED_MARKETS_TECHNICAL_ARCHITECTURE.md](docs/ISOLATED_MARKETS_TECHNICAL_ARCHITECTURE.md) - "Interest Rate Updates" section

### Liquidations
- [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - "Liquidation Amounts" section
- [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md) - "Liquidation Flow"
- `contracts-reference/red-bank/liquidate.rs` - Implementation
- [docs/ISOLATED_MARKETS_SPEC.md](docs/ISOLATED_MARKETS_SPEC.md) - "Liquidation System" section

### Health Factor
- [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - "Health Factor" section
- `contracts-reference/red-bank/health.rs` - Implementation
- [GETTING_STARTED.md](GETTING_STARTED.md) - "Key Concepts" section

### Storage Keys
- [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - "Storage Key Patterns" section
- [docs/FACTORY_PATTERN_CHANGES.md](docs/FACTORY_PATTERN_CHANGES.md) - "Key Implementation Differences"
- [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md) - "Storage Key Simplification"

### Testing
- [README.md](README.md) - "Testing Strategy" section
- [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - "Testing Checklist"
- [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md) - Phases 17-20
- [docs/ISOLATED_MARKETS_TECHNICAL_ARCHITECTURE.md](docs/ISOLATED_MARKETS_TECHNICAL_ARCHITECTURE.md) - "Testing" section

### Deployment
- [README.md](README.md) - "Deployment Process" section
- [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - "Deployment Checklist"
- [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md) - Phases 25-29
- [docs/FACTORY_PATTERN_CHANGES.md](docs/FACTORY_PATTERN_CHANGES.md) - "Deployment Process"

## File Sizes & Read Times

| File | Size | Read Time | Purpose |
|------|------|-----------|---------|
| INDEX.md | 17 KB | 5 min | This document index |
| PROJECT_SUMMARY.md | 11 KB | 5 min | Executive overview |
| README.md | 13 KB | 10 min | Project overview |
| QUICK_REFERENCE.md | 15 KB | 15 min | Developer cheat sheet |
| GETTING_STARTED.md | 24 KB | 30 min | Implementation guide |
| ARCHITECTURE_DIAGRAMS.md | 37 KB | 20 min | Visual diagrams |
| IMPLEMENTATION_CHECKLIST.md | 17 KB | 10 min | Task tracking |
| docs/FACTORY_PATTERN_CHANGES.md | ~10 KB | 20 min | Architecture changes |
| docs/ISOLATED_MARKETS_SPEC.md | ~60 KB | 45 min | Complete design spec |
| docs/ISOLATED_MARKETS_TECHNICAL_ARCHITECTURE.md | ~80 KB | 60 min | Detailed pseudocode |
| docs/ISOLATED_MARKETS_IMPLEMENTATION_GUIDE.md | ~40 KB | 30 min | Phase-by-phase plan |

**Total reading time (all docs):** ~4-5 hours
**Minimum to start coding:** ~1 hour (PROJECT_SUMMARY + README + QUICK_REFERENCE + GETTING_STARTED)

## Version Information

- **Project Created:** 2026-01-17
- **Architecture:** Factory Pattern (Separate Contract per Market)
- **Based On:** Mars Red Bank + Morpho Blue concepts
- **Status:** Ready for Implementation

## Need Help?

1. Start with [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)
2. Consult [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for specific questions
3. Check [GETTING_STARTED.md](GETTING_STARTED.md) for implementation guidance
4. Refer to detailed specs in `docs/` for comprehensive information
5. Study reference code in `contracts-reference/` for implementation patterns

---

Happy coding! 🚀
