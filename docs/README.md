# Stone Finance Documentation

Welcome to the Stone Finance documentation! This directory contains comprehensive guides for building the indexer and frontend for the Stone Finance isolated lending protocol.

## 📚 Documentation Index

### [Events Reference](./EVENTS_REFERENCE.md)
Complete reference for all blockchain events emitted by Stone Finance contracts.

**Contents:**
- Event formats and attributes
- Factory contract events
- Market contract events
- Event indexing patterns
- Data types and examples
- **v0.1.0 improvements**: Enhanced events with market state snapshots, interest accrual data, and full parameter snapshots

**Who should read:** Indexer developers, backend engineers, anyone integrating with Stone Finance

---

### [Indexer Development Plan](./INDEXER_PLAN.md)
Architecture and implementation guide for the Stone Finance blockchain indexer.

**Contents:**
- Technology stack options (SubQuery vs Custom)
- Complete database schema (PostgreSQL)
- Event handler implementations
- GraphQL API schema
- Computed fields & calculations
- Implementation phases (4 weeks)
- Performance optimization strategies

**Who should read:** Backend developers, DevOps engineers

---

### [Frontend Development Plan](./FRONTEND_PLAN.md)
Architecture and implementation guide for the Stone Finance web application.

**Contents:**
- Technology stack (Next.js 14, TypeScript, CosmJS, TanStack Query)
- Application architecture & routing
- Key pages & features (markets, portfolio, liquidations, admin)
- Component library & UI patterns
- Wallet integration (Keplr)
- State management patterns
- Implementation phases (4-5 weeks)

**Who should read:** Frontend developers, UI/UX engineers

---

## 🚀 Quick Start

### For Indexer Development

1. Read [Events Reference](./EVENTS_REFERENCE.md) to understand event structure
2. Review [Indexer Plan](./INDEXER_PLAN.md) database schema
3. Choose technology stack (SubQuery or Custom)
4. Set up PostgreSQL database
5. Implement event handlers
6. Build GraphQL API

**Estimated Timeline:** 4 weeks

---

### For Frontend Development

1. Read [Events Reference](./EVENTS_REFERENCE.md) to understand data flow
2. Review [Frontend Plan](./FRONTEND_PLAN.md) application architecture
3. Set up Next.js project with TypeScript
4. Integrate Keplr wallet
5. Connect to indexer GraphQL API
6. Build core pages (markets, portfolio)

**Estimated Timeline:** 4-5 weeks

---

## 🎯 Development Workflow

### Phase 1: Events & Contracts ✅
- [x] Review contract functionality
- [x] Add missing events for indexing
- [x] Test event emissions
- [x] Document event reference

### Phase 2: Indexer (In Progress)
- [ ] Set up database & infrastructure
- [ ] Implement event handlers
- [ ] Build GraphQL API
- [ ] Add real-time subscriptions
- [ ] Deploy indexer

### Phase 3: Frontend (Upcoming)
- [ ] Initialize Next.js project
- [ ] Implement wallet connection
- [ ] Build markets pages
- [ ] Build user portfolio
- [ ] Add liquidation features
- [ ] Deploy frontend

---

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Blockchain                             │
│  ┌──────────────┐              ┌──────────────┐            │
│  │   Factory    │              │   Markets    │            │
│  │  Contract    │──────────────│  Contracts   │            │
│  └──────────────┘              └──────────────┘            │
│         │                               │                   │
│         │  Events                       │  Events           │
│         ▼                               ▼                   │
└─────────────────────────────────────────────────────────────┘
          │                               │
          │                               │
          ▼                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      Indexer                                │
│  ┌──────────────────────────────────────────────────┐      │
│  │  Event Processor                                 │      │
│  │  - Parse blockchain events                       │      │
│  │  - Process transactions                          │      │
│  │  - Update database                               │      │
│  └──────────────────────────────────────────────────┘      │
│                           │                                 │
│                           ▼                                 │
│  ┌──────────────────────────────────────────────────┐      │
│  │  PostgreSQL Database                             │      │
│  │  - Markets                                       │      │
│  │  - User Positions                                │      │
│  │  - Transactions                                  │      │
│  │  - Snapshots                                     │      │
│  └──────────────────────────────────────────────────┘      │
│                           │                                 │
│                           ▼                                 │
│  ┌──────────────────────────────────────────────────┐      │
│  │  GraphQL API                                     │      │
│  │  - Queries                                       │      │
│  │  - Subscriptions                                 │      │
│  │  - Caching                                       │      │
│  └──────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
                            │  GraphQL
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Frontend                               │
│  ┌──────────────────────────────────────────────────┐      │
│  │  Next.js Application                             │      │
│  │  - Markets Browser                               │      │
│  │  - Supply/Borrow UI                              │      │
│  │  - Portfolio Dashboard                           │      │
│  │  - Liquidation Interface                         │      │
│  │  - Market Creation (Curator)                     │      │
│  └──────────────────────────────────────────────────┘      │
│                           │                                 │
│                           │  CosmJS                         │
│                           ▼                                 │
│  ┌──────────────────────────────────────────────────┐      │
│  │  Wallet Integration (Keplr)                      │      │
│  │  - Sign transactions                             │      │
│  │  - Manage connections                            │      │
│  └──────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔑 Key Improvements (v0.1.0)

### Enhanced Event Emissions

We've added comprehensive event data to make indexing easier and more efficient:

#### 1. **AccrueInterest Event** (Critical)
Now includes:
- `borrow_index`, `liquidity_index` - Track interest accrual
- `borrow_rate`, `liquidity_rate` - Current APR/APY
- `last_update` - Timestamp of accrual

**Impact:** Enables historical APY/APR charts and complete interest tracking

#### 2. **UpdateParams Event**
Now includes full parameter snapshot with `final_*` attributes for all params

**Impact:** Easy parameter history reconstruction, no need for separate queries

#### 3. **Market Operations** (Supply, Borrow, Repay, Liquidate)
All now include:
- `total_supply`, `total_debt` - Current market totals
- `utilization` - Current utilization rate
- `total_collateral` (liquidate only)

**Impact:** Complete market state in each transaction, reduced query complexity

### Benefits

✅ **Complete Data in Events** - No need for additional contract queries
✅ **Historical Tracking** - Build APY charts, parameter history
✅ **Efficient Indexing** - All required data in transaction attributes
✅ **Real-time Updates** - Market state snapshot on every operation

---

## 📖 Additional Resources

### Contract Documentation
- **Factory Contract:** `contracts/factory/src/`
- **Market Contract:** `contracts/market/src/`
- **Types Package:** `packages/types/src/`

### Testing
- **Contract Tests:** `cargo test` in contract directories
- All tests passing ✅

### Smart Contract Operations

#### Core Operations
1. **Create Market** - Deploy isolated lending market (Factory)
2. **Supply** - Deposit debt asset to earn interest
3. **Borrow** - Borrow against collateral
4. **Repay** - Repay borrowed debt
5. **Liquidate** - Liquidate unhealthy positions
6. **Update Params** - Curator-only parameter updates
7. **Accrue Interest** - Manually trigger interest accrual

---

## 🛠️ Development Guidelines

### Indexer Development

**Must-Have Features:**
- Event processing with reorg handling
- PostgreSQL database with proper indexes
- GraphQL API with pagination
- Real-time subscriptions for updates
- Oracle price integration for health factors

**Nice-to-Have:**
- Caching layer (Redis)
- Rate limiting
- Monitoring & alerts
- Snapshot background jobs

### Frontend Development

**Must-Have Features:**
- Wallet connection (Keplr)
- Markets browser with filters
- Supply/Borrow/Repay forms
- User portfolio dashboard
- Health factor display
- Transaction history

**Nice-to-Have:**
- Liquidation interface
- Market creation UI (curator)
- APY/utilization charts
- Real-time price updates
- Mobile responsive design

---

## 🤝 Contributing

When contributing to the indexer or frontend:

1. Follow the architecture outlined in the respective plan documents
2. Ensure all events are properly handled (see Events Reference)
3. Add tests for new functionality
4. Update documentation as needed
5. Consider performance implications

---

## 📞 Support

For questions or issues:

1. Review the relevant documentation in this directory
2. Check the contract source code in `contracts/`
3. Review the events emitted in `EVENTS_REFERENCE.md`
4. Consult the implementation plans for architecture decisions

---

## 📝 Document Versions

| Document | Version | Last Updated |
|----------|---------|--------------|
| Events Reference | 1.0 | 2026-01-18 |
| Indexer Plan | 1.0 | 2026-01-18 |
| Frontend Plan | 1.0 | 2026-01-18 |
| README | 1.0 | 2026-01-18 |

---

**Happy Building! 🚀**
