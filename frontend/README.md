# Stone Finance Frontend

A modern, minimal frontend for the Stone Finance lending protocol built with Next.js 14.

## Features

### Core Pages
- **Markets** - Browse all available lending markets with real-time APY and utilization data
- **Market Detail** - Interact with individual markets (supply, borrow, repay, manage collateral)
- **Dashboard** - Portfolio overview with health factor, P&L tracking, and active positions

### Key Functionality
- ✅ Keplr wallet integration
- ✅ Supply assets to earn interest
- ✅ Supply collateral and borrow against it
- ✅ Repay borrowed assets
- ✅ Real-time health factor monitoring
- ✅ Portfolio tracking with P&L (estimated)
- ✅ Modern, clean UI with Tailwind CSS

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **State Management**: TanStack Query (React Query)
- **Blockchain**: CosmJS + Keplr Wallet
- **Math**: Decimal.js

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Keplr browser extension

### Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:

Edit `.env.local`:
```env
NEXT_PUBLIC_CHAIN_ID=osmo-test-5
NEXT_PUBLIC_RPC_ENDPOINT=https://rpc.testnet.osmosis.zone
NEXT_PUBLIC_REST_ENDPOINT=https://lcd.testnet.osmosis.zone
NEXT_PUBLIC_FACTORY_ADDRESS=<your_factory_contract_address>
```

3. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
frontend/
├── app/                      # Next.js app directory
│   ├── dashboard/           # Portfolio dashboard page
│   ├── markets/             # Markets list and detail pages
│   │   └── [id]/           # Dynamic market detail page
│   ├── layout.tsx          # Root layout with providers
│   └── page.tsx            # Home page (redirects to markets)
│
├── components/              # React components
│   ├── layout/             # Layout components
│   │   └── Header.tsx      # Navigation header with wallet connection
│   ├── markets/            # Market-specific components
│   │   ├── MarketCard.tsx  # Market overview card
│   │   └── HealthFactor.tsx # Health factor display
│   ├── modals/             # Modal dialogs
│   │   ├── DepositModal.tsx
│   │   ├── BorrowModal.tsx
│   │   └── RepayModal.tsx
│   └── ui/                 # shadcn/ui components
│
├── hooks/                   # Custom React hooks
│   ├── useMarkets.ts       # Market data queries
│   └── useUserPosition.ts  # User position queries
│
├── lib/                     # Library code
│   ├── cosmjs/             # CosmJS integration
│   │   ├── client.ts       # Contract query/execute client
│   │   └── wallet.tsx      # Wallet provider & hooks
│   ├── constants/          # Constants and config
│   │   └── contracts.ts    # Contract addresses & chain config
│   └── utils/              # Utility functions
│       └── format.ts       # Formatting helpers
│
└── types/                   # TypeScript types
    ├── contracts.ts        # Contract message types
    └── index.ts            # UI-specific types
```

## Key Components

### Wallet Connection
The app uses Keplr for wallet management. Users must connect their wallet to interact with the protocol.

```tsx
import { useWallet } from '@/lib/cosmjs/wallet';

const { address, isConnected, connect, disconnect } = useWallet();
```

### Contract Queries
Market data is fetched using TanStack Query hooks:

```tsx
import { useMarkets, useMarket } from '@/hooks/useMarkets';
import { useUserPosition } from '@/hooks/useUserPosition';

// Get all markets
const { data: markets } = useMarkets();

// Get specific market
const { data: market } = useMarket(marketId);

// Get user position
const { data: position } = useUserPosition(marketAddress);
```

### Contract Execution
Transactions are executed through the signing client:

```tsx
import { useWallet } from '@/lib/cosmjs/wallet';

const { signingClient } = useWallet();

// Supply
await signingClient.supply(marketAddress, { denom: 'uusdc', amount: '1000000' });

// Borrow
await signingClient.borrow(marketAddress, '500000');

// Repay
await signingClient.repay(marketAddress, { denom: 'uusdc', amount: '500000' });
```

## Health Factor

The health factor indicates the safety of a borrowing position:

- **≥ 2.0** - Safe (Green)
- **1.5 - 2.0** - Moderate (Yellow)
- **1.2 - 1.5** - Risky (Orange)
- **< 1.2** - Danger (Red)
- **< 1.0** - Liquidatable

## P&L Calculation

Currently uses placeholder data. The calculation shown is:
```
Total P&L = (Total Supplied × Supply APY) - (Total Borrowed × Borrow APY)
```

For production, this should be replaced with historical data tracking actual interest earned and paid.

## Placeholder Data

The following features use placeholder/estimated data:
- **Net APY** - Simple weighted average calculation
- **P&L** - Estimated based on current APYs, not actual historical data
- **Historical charts** - Not implemented (future feature)

## Development

### Adding New Components

Use shadcn/ui CLI to add components:
```bash
npx shadcn@latest add <component-name>
```

### Type Safety

All contract types are defined in `types/contracts.ts` based on the Rust contract definitions.

## Building for Production

```bash
npm run build
npm start
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_CHAIN_ID` | Cosmos chain ID | `osmo-test-5` |
| `NEXT_PUBLIC_RPC_ENDPOINT` | RPC endpoint URL | `https://rpc.testnet.osmosis.zone` |
| `NEXT_PUBLIC_REST_ENDPOINT` | REST endpoint URL | `https://lcd.testnet.osmosis.zone` |
| `NEXT_PUBLIC_FACTORY_ADDRESS` | Factory contract address | `osmo1abc...` |

## Future Enhancements

- [ ] Indexer integration for historical data
- [ ] Real P&L tracking with historical interest calculations
- [ ] APY charts and historical rate data
- [ ] Transaction history
- [ ] Liquidation monitoring and alerts
- [ ] Mobile responsive improvements
- [ ] Dark mode toggle
- [ ] Multi-chain support
- [ ] Governance features
