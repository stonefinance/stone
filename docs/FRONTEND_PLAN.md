# Stone Finance Frontend Development Plan

## Overview

This document outlines the architecture and implementation plan for the Stone Finance web application. The frontend provides users with a clean, intuitive interface to interact with isolated lending markets.

## Technology Stack

### Core Framework
- **Next.js 14+** (App Router) - React framework with SSR/SSG
- **TypeScript** - Type safety
- **React 18+** - UI library

### Styling & UI
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - High-quality React components
- **Radix UI** - Unstyled, accessible components
- **Lucide React** - Icon library

### Blockchain Integration
- **CosmJS** (@cosmjs/cosmwasm-stargate) - Cosmos blockchain client
- **Keplr Wallet** - Wallet integration
- **@cosmjs/proto-signing** - Transaction signing

### State Management
- **TanStack Query** (React Query) - Server state management
- **Zustand** - Client state management
- **Jotai** (optional) - Atomic state management

### Data Visualization
- **Recharts** - Chart library for APY/utilization graphs
- **Chart.js** (alternative) - More customizable charts

### Forms & Validation
- **React Hook Form** - Form handling
- **Zod** - Schema validation

### Testing
- **Vitest** - Unit testing
- **Playwright** - E2E testing
- **Testing Library** - Component testing

## Application Architecture

```
app/
├── (marketing)/
│   ├── page.tsx                    # Landing page
│   └── about/
│       └── page.tsx                # About page
│
├── (app)/
│   ├── layout.tsx                  # App layout with wallet provider
│   ├── markets/
│   │   ├── page.tsx                # Markets list
│   │   └── [marketId]/
│   │       ├── page.tsx            # Market detail
│   │       └── admin/
│   │           └── page.tsx        # Curator admin (protected)
│   │
│   ├── portfolio/
│   │   └── page.tsx                # User portfolio
│   │
│   ├── liquidations/
│   │   └── page.tsx                # Liquidation opportunities
│   │
│   └── create-market/
│       └── page.tsx                # Create market (curator)
│
├── api/
│   └── graphql/
│       └── route.ts                # GraphQL proxy endpoint
│
components/
├── ui/                             # shadcn/ui components
│   ├── button.tsx
│   ├── card.tsx
│   ├── dialog.tsx
│   └── ...
│
├── wallet/
│   ├── WalletButton.tsx            # Connect wallet
│   ├── WalletProvider.tsx          # Wallet context
│   └── ChainSelector.tsx           # Network selector
│
├── market/
│   ├── MarketCard.tsx              # Market preview card
│   ├── MarketStats.tsx             # Market statistics
│   ├── SupplyForm.tsx              # Supply UI
│   ├── BorrowForm.tsx              # Borrow UI
│   ├── RepayForm.tsx               # Repay UI
│   ├── WithdrawForm.tsx            # Withdraw UI
│   ├── MarketParamsDisplay.tsx     # Display all params
│   └── InterestRateChart.tsx       # APY/APR chart
│
├── position/
│   ├── PositionCard.tsx            # User position card
│   ├── HealthFactorIndicator.tsx   # Health factor gauge
│   ├── LiquidationWarning.tsx      # Warning banner
│   └── PositionSummary.tsx         # Position overview
│
├── liquidation/
│   ├── LiquidationOpportunity.tsx  # Liquidation card
│   └── LiquidationForm.tsx         # Liquidate UI
│
├── admin/
│   ├── CreateMarketForm.tsx        # Market creation
│   ├── UpdateParamsForm.tsx        # Update params
│   └── MarketAdminDashboard.tsx    # Curator dashboard
│
└── shared/
    ├── TransactionHistory.tsx      # Transaction list
    ├── AmountInput.tsx             # Token amount input
    ├── TokenDisplay.tsx            # Token formatting
    ├── LoadingSpinner.tsx          # Loading states
    └── ErrorBoundary.tsx           # Error handling

lib/
├── cosmwasm/
│   ├── client.ts                   # CosmWasm client setup
│   ├── contracts/
│   │   ├── factory.ts              # Factory contract interface
│   │   └── market.ts               # Market contract interface
│   └── queries.ts                  # Contract queries
│
├── graphql/
│   ├── client.ts                   # Apollo client setup
│   ├── queries/
│   │   ├── markets.ts              # Market queries
│   │   ├── positions.ts            # Position queries
│   │   └── transactions.ts         # Transaction queries
│   └── generated.ts                # Generated types
│
├── hooks/
│   ├── useWallet.ts                # Wallet connection
│   ├── useMarket.ts                # Market data
│   ├── useUserPosition.ts          # User position
│   ├── useHealthFactor.ts          # Health factor calc
│   ├── useOraclePrice.ts           # Oracle price
│   └── useTransaction.ts           # Transaction execution
│
├── utils/
│   ├── format.ts                   # Number formatting
│   ├── calculations.ts             # Financial calculations
│   ├── validation.ts               # Input validation
│   └── constants.ts                # App constants
│
└── types/
    ├── market.ts                   # Market types
    ├── position.ts                 # Position types
    └── transaction.ts              # Transaction types
```

## Key Features & Pages

### 1. Landing Page
**Route:** `/`

**Features:**
- Hero section with value proposition
- Key metrics (total TVL, markets, transactions)
- Featured markets carousel
- How it works section
- CTA to browse markets

**Components:**
- `<Hero />`
- `<ProtocolStats />`
- `<FeaturedMarkets />`
- `<HowItWorks />`

---

### 2. Markets List
**Route:** `/markets`

**Features:**
- Grid/list view of all markets
- Filter by collateral/debt asset
- Sort by APY, TVL, utilization
- Search by market ID or denoms
- Market cards showing:
  - Collateral/Debt pair
  - Supply APY
  - Borrow APR
  - Utilization
  - Total supply/debt
  - Enabled status

**Components:**
```tsx
<MarketsPage>
  <MarketFilters
    onFilterChange={handleFilter}
    onSortChange={handleSort}
  />
  <MarketGrid>
    {markets.map(market => (
      <MarketCard
        key={market.id}
        market={market}
        onClick={() => navigate(`/markets/${market.id}`)}
      />
    ))}
  </MarketGrid>
</MarketsPage>
```

**Data Fetching:**
```tsx
const { data: markets } = useQuery({
  queryKey: ['markets', filters],
  queryFn: () => graphql.getMarkets(filters),
});
```

---

### 3. Market Detail Page
**Route:** `/markets/[marketId]`

**Features:**
- Market overview (params, stats)
- Supply section
  - Input: amount to supply
  - Display: projected APY, pool share
  - Action: execute supply
- Borrow section
  - Input: collateral amount, borrow amount
  - Display: health factor, LTV, liquidation price
  - Validation: LTV constraint
  - Action: supply collateral + borrow
- User position card (if connected)
  - Current collateral
  - Current supply
  - Current debt
  - Health factor
  - Actions: withdraw, repay, borrow more
- Charts
  - Supply/Borrow APY over time
  - Utilization over time
  - Total supply/debt over time
- Market parameters display
- Recent transactions

**Layout:**
```tsx
<MarketDetailPage>
  <MarketHeader market={market} />

  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    {/* Left Column */}
    <div>
      <MarketStats market={market} />

      {wallet.connected && (
        <PositionCard
          position={userPosition}
          market={market}
          onAction={handleAction}
        />
      )}

      <InterestRateChart
        marketId={marketId}
        data={historicalRates}
      />
    </div>

    {/* Right Column */}
    <div>
      <Tabs defaultValue="supply">
        <TabsList>
          <TabsTrigger value="supply">Supply</TabsTrigger>
          <TabsTrigger value="borrow">Borrow</TabsTrigger>
          <TabsTrigger value="repay">Repay</TabsTrigger>
        </TabsList>

        <TabsContent value="supply">
          <SupplyForm market={market} />
        </TabsContent>

        <TabsContent value="borrow">
          <BorrowForm
            market={market}
            position={userPosition}
          />
        </TabsContent>

        <TabsContent value="repay">
          <RepayForm
            market={market}
            position={userPosition}
          />
        </TabsContent>
      </Tabs>
    </div>
  </div>

  <MarketParamsDisplay params={market} />

  <TransactionHistory
    marketId={marketId}
    limit={10}
  />
</MarketDetailPage>
```

---

### 4. Portfolio Page
**Route:** `/portfolio`

**Features:**
- User's positions across all markets
- Aggregate health overview
- Total supplied, borrowed, collateral
- Net APY calculation
- Positions table with:
  - Market (collateral/debt pair)
  - Supplied amount & value
  - Borrowed amount & value
  - Collateral amount & value
  - Health factor
  - Net APY
  - Actions (manage position link)
- Transaction history for user
- Liquidation risk warnings

**Components:**
```tsx
<PortfolioPage>
  {!wallet.connected ? (
    <ConnectWalletPrompt />
  ) : (
    <>
      <PortfolioSummary
        totalSupplied={totalSupplied}
        totalBorrowed={totalBorrowed}
        totalCollateral={totalCollateral}
        netAPY={netAPY}
        lowestHealthFactor={lowestHF}
      />

      {positions.some(p => p.healthFactor < 1.2) && (
        <LiquidationWarning positions={atRiskPositions} />
      )}

      <PositionsTable
        positions={positions}
        onManage={(marketId) => navigate(`/markets/${marketId}`)}
      />

      <TransactionHistory
        userAddress={wallet.address}
        limit={20}
      />
    </>
  )}
</PortfolioPage>
```

---

### 5. Liquidations Page
**Route:** `/liquidations`

**Features:**
- List of liquidatable positions
- Filter by market
- Sort by profit opportunity
- Liquidation cards showing:
  - Borrower address
  - Market
  - Debt to repay
  - Collateral to seize
  - Liquidation bonus
  - Expected profit
- One-click liquidate action

**Components:**
```tsx
<LiquidationsPage>
  <LiquidationFilters
    markets={markets}
    onFilterChange={handleFilter}
  />

  <LiquidationOpportunities>
    {liquidatablePositions.map(position => (
      <LiquidationOpportunity
        key={position.id}
        position={position}
        onLiquidate={handleLiquidate}
      />
    ))}
  </LiquidationOpportunities>
</LiquidationsPage>
```

**Data:**
```tsx
const { data: liquidatablePositions } = useQuery({
  queryKey: ['liquidatable-positions'],
  queryFn: graphql.getLiquidatablePositions,
  refetchInterval: 10000, // Refresh every 10s
});
```

---

### 6. Create Market Page (Curator)
**Route:** `/create-market`

**Features:**
- Form to create new market
- Inputs:
  - Collateral denom
  - Debt denom
  - Oracle address
  - All market parameters (LTV, liquidation threshold, etc.)
  - Interest rate model params
  - Fees
  - Caps
- Validation with visual feedback
- Parameter explanations
- Preview of market configuration
- Market creation fee display
- Submit transaction

**Components:**
```tsx
<CreateMarketForm>
  <FormSection title="Assets">
    <TokenSelect
      label="Collateral Asset"
      value={collateralDenom}
      onChange={setCollateralDenom}
    />
    <TokenSelect
      label="Debt Asset"
      value={debtDenom}
      onChange={setDebtDenom}
    />
    <AddressInput
      label="Oracle Address"
      value={oracle}
      onChange={setOracle}
    />
  </FormSection>

  <FormSection title="Risk Parameters">
    <PercentageInput
      label="Loan-to-Value (LTV)"
      value={ltv}
      onChange={setLtv}
      min={1}
      max={95}
      info="Maximum borrowing power as % of collateral value"
    />
    <PercentageInput
      label="Liquidation Threshold"
      value={liquidationThreshold}
      onChange={setLiquidationThreshold}
      min={ltv + 1}
      max={99}
      info="Collateral value % where position becomes liquidatable"
    />
    {/* ... more params */}
  </FormSection>

  <FormSection title="Interest Rate Model">
    <InterestRateModelInput
      value={interestModel}
      onChange={setInterestModel}
    />
  </FormSection>

  <MarketPreview params={formData} />

  <Button onClick={handleSubmit}>
    Create Market (Fee: {creationFee})
  </Button>
</CreateMarketForm>
```

---

### 7. Market Admin Page (Curator)
**Route:** `/markets/[marketId]/admin`

**Features:**
- Only accessible by market curator
- Update parameters form
- View current params
- Parameter change history
- Enable/disable market
- Update caps
- Update fees
- Update LTV (with cooldown & constraints)
- Change interest rate model

**Components:**
```tsx
<MarketAdminDashboard>
  {!isCurator ? (
    <Unauthorized />
  ) : (
    <>
      <CurrentParamsDisplay params={market} />

      <UpdateParamsForm
        market={market}
        onSubmit={handleUpdate}
      >
        {market.is_mutable && (
          <LTVUpdate
            current={market.loan_to_value}
            lastUpdate={market.ltv_last_update}
            onChange={setNewLtv}
          />
        )}

        <FeeUpdate
          curatorFee={market.curator_fee}
          onChange={setNewFee}
        />

        <CapsUpdate
          supplyCap={market.supply_cap}
          borrowCap={market.borrow_cap}
          onChange={setNewCaps}
        />

        <MarketToggle
          enabled={market.enabled}
          onChange={setEnabled}
        />
      </UpdateParamsForm>

      <ParamChangeHistory marketId={marketId} />
    </>
  )}
</MarketAdminDashboard>
```

---

## Core Components Detail

### WalletButton Component
```tsx
export function WalletButton() {
  const { wallet, connect, disconnect } = useWallet();

  if (!wallet.connected) {
    return (
      <Button onClick={connect}>
        Connect Wallet
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <WalletIcon />
          {truncateAddress(wallet.address)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => navigate('/portfolio')}>
          Portfolio
        </DropdownMenuItem>
        <DropdownMenuItem onClick={disconnect}>
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### SupplyForm Component
```tsx
export function SupplyForm({ market }: { market: Market }) {
  const { wallet } = useWallet();
  const { mutate: supply, isPending } = useSupply();
  const [amount, setAmount] = useState('');

  const handleSubmit = () => {
    supply({
      marketId: market.id,
      amount: parseTokenAmount(amount, market.debt_denom),
    });
  };

  const projectedAPY = calculateProjectedAPY(market, amount);
  const poolShare = calculatePoolShare(market, amount);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Supply {market.debt_denom}</CardTitle>
      </CardHeader>
      <CardContent>
        <AmountInput
          value={amount}
          onChange={setAmount}
          denom={market.debt_denom}
          balance={wallet.balance}
          max={wallet.balance}
        />

        <div className="mt-4 space-y-2">
          <div className="flex justify-between">
            <span>Projected APY</span>
            <span className="font-semibold text-green-600">
              {formatPercent(projectedAPY)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Pool Share</span>
            <span>{formatPercent(poolShare)}</span>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button
          onClick={handleSubmit}
          disabled={!amount || isPending}
          className="w-full"
        >
          {isPending ? 'Supplying...' : 'Supply'}
        </Button>
      </CardFooter>
    </Card>
  );
}
```

### BorrowForm Component
```tsx
export function BorrowForm({
  market,
  position
}: {
  market: Market;
  position: UserPosition;
}) {
  const { mutate: borrow, isPending } = useBorrow();
  const [collateralAmount, setCollateralAmount] = useState('');
  const [borrowAmount, setBorrowAmount] = useState('');

  const { healthFactor, liquidationPrice } = useHealthFactor({
    market,
    position,
    additionalCollateral: collateralAmount,
    additionalDebt: borrowAmount,
  });

  const maxBorrow = calculateMaxBorrow(
    market,
    position,
    collateralAmount
  );

  const isValid = borrowAmount <= maxBorrow && healthFactor > 1;

  const handleSubmit = async () => {
    // Supply collateral first, then borrow
    await borrow({
      marketId: market.id,
      collateralAmount: parseTokenAmount(collateralAmount, market.collateral_denom),
      borrowAmount: parseTokenAmount(borrowAmount, market.debt_denom),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Borrow {market.debt_denom}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <AmountInput
          label="Collateral to Supply"
          value={collateralAmount}
          onChange={setCollateralAmount}
          denom={market.collateral_denom}
        />

        <AmountInput
          label="Amount to Borrow"
          value={borrowAmount}
          onChange={setBorrowAmount}
          denom={market.debt_denom}
          max={maxBorrow}
        />

        <Separator />

        <div className="space-y-2">
          <div className="flex justify-between">
            <span>Max Borrow</span>
            <span>{formatToken(maxBorrow, market.debt_denom)}</span>
          </div>
          <div className="flex justify-between">
            <span>LTV</span>
            <span>{formatPercent(market.loan_to_value)}</span>
          </div>
          <div className="flex justify-between">
            <span>Health Factor</span>
            <HealthFactorIndicator value={healthFactor} />
          </div>
          <div className="flex justify-between">
            <span>Liquidation Price</span>
            <span className="text-orange-600">
              {formatPrice(liquidationPrice)}
            </span>
          </div>
        </div>

        {!isValid && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Borrow amount exceeds maximum allowed by LTV
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter>
        <Button
          onClick={handleSubmit}
          disabled={!isValid || isPending}
          className="w-full"
        >
          {isPending ? 'Borrowing...' : 'Borrow'}
        </Button>
      </CardFooter>
    </Card>
  );
}
```

### HealthFactorIndicator Component
```tsx
export function HealthFactorIndicator({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">N/A</span>;

  const getColor = (hf: number) => {
    if (hf >= 1.5) return 'text-green-600';
    if (hf >= 1.2) return 'text-yellow-600';
    if (hf >= 1.0) return 'text-orange-600';
    return 'text-red-600';
  };

  const getLabel = (hf: number) => {
    if (hf >= 1.5) return 'Healthy';
    if (hf >= 1.2) return 'Moderate';
    if (hf >= 1.0) return 'At Risk';
    return 'Liquidatable';
  };

  return (
    <div className="flex items-center gap-2">
      <span className={cn('font-semibold', getColor(value))}>
        {value.toFixed(2)}
      </span>
      <Badge variant={value >= 1.2 ? 'default' : 'destructive'}>
        {getLabel(value)}
      </Badge>
    </div>
  );
}
```

---

## State Management

### Wallet State (Zustand)
```typescript
interface WalletState {
  connected: boolean;
  address: string | null;
  chainId: string | null;
  client: SigningCosmWasmClient | null;

  connect: () => Promise<void>;
  disconnect: () => void;
  switchChain: (chainId: string) => Promise<void>;
}

export const useWalletStore = create<WalletState>((set) => ({
  connected: false,
  address: null,
  chainId: null,
  client: null,

  connect: async () => {
    const keplr = await getKeplr();
    await keplr.enable(CHAIN_ID);
    const signer = await keplr.getOfflineSigner(CHAIN_ID);
    const accounts = await signer.getAccounts();
    const client = await SigningCosmWasmClient.connectWithSigner(
      RPC_URL,
      signer
    );

    set({
      connected: true,
      address: accounts[0].address,
      chainId: CHAIN_ID,
      client,
    });
  },

  disconnect: () => {
    set({
      connected: false,
      address: null,
      chainId: null,
      client: null,
    });
  },

  switchChain: async (chainId: string) => {
    // Implement chain switching
  },
}));
```

### Server State (React Query)
```typescript
// hooks/useMarket.ts
export function useMarket(marketId: string) {
  return useQuery({
    queryKey: ['market', marketId],
    queryFn: () => graphql.getMarket(marketId),
    staleTime: 30_000, // 30 seconds
  });
}

// hooks/useUserPosition.ts
export function useUserPosition(marketId: string, userAddress: string) {
  return useQuery({
    queryKey: ['position', marketId, userAddress],
    queryFn: () => graphql.getUserPosition(marketId, userAddress),
    enabled: !!userAddress,
    refetchInterval: 10_000, // Refresh every 10s
  });
}

// hooks/useTransaction.ts
export function useSupply() {
  const { client, address } = useWalletStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ marketId, amount }: SupplyParams) => {
      const market = await graphql.getMarket(marketId);

      const msg = {
        supply: {
          recipient: null,
        },
      };

      return client.execute(
        address,
        market.market_address,
        msg,
        'auto',
        undefined,
        [{ denom: market.debt_denom, amount: amount.toString() }]
      );
    },
    onSuccess: (_, { marketId }) => {
      queryClient.invalidateQueries({ queryKey: ['market', marketId] });
      queryClient.invalidateQueries({ queryKey: ['position', marketId, address] });
      toast.success('Supply successful!');
    },
    onError: (error) => {
      toast.error(`Supply failed: ${error.message}`);
    },
  });
}
```

---

## Real-Time Features

### Price Updates
```typescript
// Poll oracle prices every 10 seconds
export function useOraclePrices(oracle: string, denoms: string[]) {
  return useQueries({
    queries: denoms.map(denom => ({
      queryKey: ['oracle-price', oracle, denom],
      queryFn: () => queryOraclePrice(oracle, denom),
      refetchInterval: 10_000,
    })),
  });
}
```

### Interest Accrual Simulation
```typescript
// Client-side interest accrual for smooth UX
export function useAccruedInterest(market: Market) {
  const [accrued, setAccrued] = useState({
    borrowIndex: market.borrow_index,
    liquidityIndex: market.liquidity_index,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() / 1000 - market.last_update;
      const borrowDelta = market.borrow_index * market.borrow_rate * (elapsed / SECONDS_PER_YEAR);
      const liquidityDelta = market.liquidity_index * market.liquidity_rate * (elapsed / SECONDS_PER_YEAR);

      setAccrued({
        borrowIndex: market.borrow_index + borrowDelta,
        liquidityIndex: market.liquidity_index + liquidityDelta,
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [market]);

  return accrued;
}
```

### WebSocket Subscriptions
```typescript
// Real-time updates via GraphQL subscriptions
export function useMarketSubscription(marketId: string) {
  const queryClient = useQueryClient();

  useSubscription({
    query: MARKET_UPDATED_SUBSCRIPTION,
    variables: { marketId },
    onData: ({ data }) => {
      queryClient.setQueryData(['market', marketId], data.marketUpdated);
    },
  });
}
```

---

## Utility Functions

### Number Formatting
```typescript
export function formatToken(amount: bigint | string, denom: string): string {
  const decimals = getTokenDecimals(denom);
  const value = BigInt(amount) / BigInt(10 ** decimals);
  return `${value.toLocaleString()} ${denom}`;
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function formatPrice(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}
```

### Financial Calculations
```typescript
export function calculateHealthFactor(
  collateral: bigint,
  collateralPrice: number,
  debt: bigint,
  debtPrice: number,
  liquidationThreshold: number
): number | null {
  if (debt === 0n) return null;

  const collateralValue = Number(collateral) * collateralPrice;
  const debtValue = Number(debt) * debtPrice;

  return (collateralValue * liquidationThreshold) / debtValue;
}

export function calculateMaxBorrow(
  collateral: bigint,
  collateralPrice: number,
  debtPrice: number,
  ltv: number,
  currentDebt: bigint = 0n
): bigint {
  const collateralValue = Number(collateral) * collateralPrice;
  const maxBorrowValue = collateralValue * ltv;
  const currentDebtValue = Number(currentDebt) * debtPrice;

  const availableValue = maxBorrowValue - currentDebtValue;
  return BigInt(Math.floor(availableValue / debtPrice));
}

export function calculateLiquidationPrice(
  collateral: bigint,
  debt: bigint,
  debtPrice: number,
  liquidationThreshold: number
): number {
  const debtValue = Number(debt) * debtPrice;
  return debtValue / (Number(collateral) * liquidationThreshold);
}
```

---

## Implementation Phases

### Phase 1: Core Setup (Week 1)
- [ ] Initialize Next.js project with TypeScript
- [ ] Set up Tailwind CSS & shadcn/ui
- [ ] Configure CosmJS & Keplr wallet integration
- [ ] Set up Apollo Client for GraphQL
- [ ] Create wallet connection flow
- [ ] Build basic layout & navigation

### Phase 2: Markets & Data Display (Week 2)
- [ ] Markets list page
- [ ] Market detail page
- [ ] Market stats components
- [ ] Charts (APY, utilization)
- [ ] Transaction history component
- [ ] Integrate with indexer API

### Phase 3: User Actions (Week 2-3)
- [ ] Supply form & transaction
- [ ] Borrow form & transaction
- [ ] Repay form & transaction
- [ ] Withdraw forms & transactions
- [ ] Position display & management
- [ ] Health factor calculations
- [ ] Error handling & validation

### Phase 4: Advanced Features (Week 3-4)
- [ ] Portfolio page
- [ ] Liquidations page
- [ ] Create market form (curator)
- [ ] Market admin dashboard (curator)
- [ ] Update params functionality
- [ ] Real-time price updates
- [ ] WebSocket subscriptions

### Phase 5: Polish & Testing (Week 4)
- [ ] Responsive design
- [ ] Loading states & skeletons
- [ ] Error boundaries
- [ ] Toast notifications
- [ ] E2E tests
- [ ] Performance optimization
- [ ] SEO optimization

### Phase 6: Deployment (Week 4-5)
- [ ] Environment configuration
- [ ] Deploy to Vercel/similar
- [ ] Set up monitoring
- [ ] Analytics integration
- [ ] Documentation

---

## Performance Optimization

### Code Splitting
- Use Next.js dynamic imports for heavy components
- Lazy load charts only when visible
- Split vendor bundles

### Data Fetching
- Use React Query for caching & deduplication
- Implement pagination for large lists
- Prefetch on hover for smooth navigation

### Image Optimization
- Use Next.js Image component
- Serve WebP format
- Implement lazy loading

### Bundle Size
- Tree-shake unused dependencies
- Analyze bundle with `@next/bundle-analyzer`
- Use lightweight alternatives where possible

---

## Testing Strategy

### Unit Tests
- Utility functions
- Calculation functions
- Form validation
- Component logic

### Integration Tests
- Wallet connection flow
- Transaction execution
- Form submissions
- API integration

### E2E Tests
- Complete user flows (supply, borrow, repay)
- Market creation
- Liquidation
- Multi-step transactions

---

## Accessibility

- Semantic HTML
- ARIA labels for interactive elements
- Keyboard navigation support
- Focus management
- Screen reader compatibility
- Color contrast compliance (WCAG AA)

---

## Security Considerations

- Never store private keys
- Validate all user inputs
- Sanitize data from blockchain
- Use Content Security Policy
- Implement rate limiting on API calls
- Show clear transaction previews
- Display gas estimates before signing

---

## Next Steps

1. Initialize Next.js project
2. Set up development environment
3. Install dependencies
4. Configure wallet integration
5. Begin Phase 1 implementation

---

**Document Version:** 1.0
**Last Updated:** 2026-01-18
**Maintainer:** Development Team
