'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TokenIcon } from '@/components/ui/token-icon';
import { RepayModal } from '@/components/modals/RepayModal';
import { WithdrawModal } from '@/components/modals/WithdrawModal';
import { WithdrawCollateralModal } from '@/components/modals/WithdrawCollateralModal';
import { AdvancedTab } from '@/components/markets/advanced';
import { useMarket } from '@/hooks/useMarkets';
import { useUserPosition } from '@/hooks/useUserPosition';
import { useWallet } from '@/lib/cosmjs/wallet';
import { useBalance } from '@/hooks/useBalance';
import {
  formatDisplayAmount,
  formatPercentage,
  microToBase,
  baseToMicro,
} from '@/lib/utils/format';
import { Info, ExternalLink } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// TODO: Remove mock chart data once real historical market data is available from the API
// Seeded random number generator for consistent chart data
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Generate deterministic chart data to avoid hydration mismatch
function generateChartData() {
  const data = [];
  const startDate = new Date('2024-10-27');
  let value = 900000000;

  for (let i = 0; i < 90; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    value = value + (seededRandom(i + 1) - 0.3) * 20000000;
    value = Math.max(value, 800000000);

    data.push({
      date: date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
      value: value,
    });
  }
  return data;
}

// Pre-generate chart data at module level for consistency
const CHART_DATA = generateChartData();

export default function MarketDetailPage() {
  const params = useParams();
  const marketId = params.id as string;
  const { isConnected, signingClient } = useWallet();

  const { data: market, isLoading: marketLoading, refetch: refetchMarket } = useMarket(marketId);
  const { data: position, refetch: refetchPosition } = useUserPosition(marketId);

  // Refetch data after transactions
  const refetchAll = async () => {
    await Promise.all([refetchMarket(), refetchPosition()]);
  };
  const [repayModalOpen, setRepayModalOpen] = useState(false);
  const [isBorrowing, setIsBorrowing] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [withdrawCollateralModalOpen, setWithdrawCollateralModalOpen] = useState(false);

  const [actionTab, setActionTab] = useState<'lend' | 'borrow'>('borrow');
  const [supplyAmount, setSupplyAmount] = useState('');
  const [collateralAmount, setCollateralAmount] = useState('');
  const [borrowAmount, setBorrowAmount] = useState('');
  const [chartMetric, setChartMetric] = useState<'borrow' | 'supply' | 'liquidity'>('borrow');
  const [isSupplying, setIsSupplying] = useState(false);
  const [isSupplyingCollateral, setIsSupplyingCollateral] = useState(false);
  const [supplyError, setSupplyError] = useState<string | null>(null);

  // Fetch user balance for the collateral input
  const { balance: collateralBalance } = useBalance(
    isConnected && market ? market.config.collateral_denom : undefined
  );

  // Fetch user balance for the debt token (for lending/supply)
  const { balance: debtBalance } = useBalance(
    isConnected && market ? market.config.debt_denom : undefined
  );

  // Only show loading skeleton if we don't have cached data yet
  // This prevents flash when Apollo refetches in the background
  if (marketLoading && !market) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="animate-pulse space-y-8">
            <div className="h-12 bg-muted rounded w-1/3" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 h-96 bg-muted rounded" />
              <div className="h-96 bg-muted rounded" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!market) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <p className="text-center text-muted-foreground">Market not found</p>
        </main>
      </div>
    );
  }

  const handleSupplyCollateral = async () => {
    if (!signingClient || !isConnected) return;
    if (!collateralAmount || parseFloat(collateralAmount) <= 0) return;

    setIsSupplyingCollateral(true);
    setSupplyError(null);

    try {
      const microAmount = baseToMicro(collateralAmount);
      const coin = { denom: market.config.collateral_denom, amount: microAmount };
      await signingClient.supplyCollateral(market.address, coin);
      setCollateralAmount('');
      await refetchAll();
    } catch (err) {
      setSupplyError(err instanceof Error ? err.message : 'Transaction failed');
    } finally {
      setIsSupplyingCollateral(false);
    }
  };

  const handleSupply = async () => {
    if (!signingClient || !isConnected) return;
    if (!supplyAmount || parseFloat(supplyAmount) <= 0) return;

    setIsSupplying(true);
    setSupplyError(null);

    try {
      const microAmount = baseToMicro(supplyAmount);
      const coin = { denom: market.config.debt_denom, amount: microAmount };
      await signingClient.supply(market.address, coin);
      setSupplyAmount('');
      await refetchAll();
    } catch (err) {
      setSupplyError(err instanceof Error ? err.message : 'Transaction failed');
    } finally {
      setIsSupplying(false);
    }
  };

  const handleBorrow = async () => {
    if (!signingClient || !isConnected) return;
    if (!borrowAmount || parseFloat(borrowAmount) <= 0) return;

    setIsBorrowing(true);
    setSupplyError(null);

    try {
      const microAmount = baseToMicro(borrowAmount);
      await signingClient.borrow(market.address, microAmount);
      setBorrowAmount('');
      await refetchAll();
    } catch (err) {
      setSupplyError(err instanceof Error ? err.message : 'Transaction failed');
    } finally {
      setIsBorrowing(false);
    }
  };

  // Calculate display values
  const totalMarketSize = parseFloat(microToBase(market.totalSupplied));
  const totalLiquidity = parseFloat(microToBase(market.availableLiquidity));
  const rate = market.borrowApy;
  const liquidationLtv = market.params?.liquidation_threshold
    ? parseFloat(market.params.liquidation_threshold) * 100
    : 86;

  // User position values
  const userCollateral = position?.collateralAmount
    ? parseFloat(microToBase(position.collateralAmount))
    : 0;
  const userDebt = position?.debtAmount
    ? parseFloat(microToBase(position.debtAmount))
    : 0;
  const userSupply = position?.supplyAmount
    ? parseFloat(microToBase(position.supplyAmount))
    : 0;
  const currentLtv = userCollateral > 0 && userDebt > 0 ? (userDebt / userCollateral) * 100 : 0;

  // Format large numbers
  const formatLargeNumber = (num: number) => {
    if (num >= 1000000000) return `$${(num / 1000000000).toFixed(2)}B`;
    if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="flex items-center -space-x-2">
              <TokenIcon symbol={market.collateralDenom} size="lg" className="ring-2 ring-background" />
              <TokenIcon symbol={market.debtDenom} size="lg" className="ring-2 ring-background" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold">
                  {market.collateralDenom} / {market.debtDenom}
                </h1>
                <span className="px-2 py-0.5 bg-muted rounded text-sm font-medium">
                  {Math.round(liquidationLtv)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          <div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
              Total Market Size
              <Info className="h-3.5 w-3.5" />
            </div>
            <p className="text-2xl font-bold">{formatLargeNumber(totalMarketSize)}</p>
            <p className="text-sm text-muted-foreground">
              {formatDisplayAmount(totalMarketSize, 2)} {market.debtDenom}
            </p>
          </div>
          <div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
              Total Liquidity
              <Info className="h-3.5 w-3.5" />
            </div>
            <p className="text-2xl font-bold">{formatLargeNumber(totalLiquidity)}</p>
            <p className="text-sm text-muted-foreground">
              {formatDisplayAmount(totalLiquidity, 2)} {market.debtDenom}
            </p>
          </div>
          <div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
              Rate
              <Info className="h-3.5 w-3.5" />
            </div>
            <p className="text-2xl font-bold">{formatPercentage(rate)}</p>
          </div>
          <div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
              Curator
              <Info className="h-3.5 w-3.5" />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <div className="flex -space-x-1">
                <div className="h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs ring-2 ring-background">
                  S
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Tabs & Chart */}
          <div className="lg:col-span-2 space-y-6">
            {/* Tabs */}
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="bg-transparent border-b border-border rounded-none w-full justify-start h-auto p-0 gap-6">
                <TabsTrigger
                  value="position"
                  className="bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-3 px-0"
                >
                  Your Position
                </TabsTrigger>
                <TabsTrigger
                  value="overview"
                  className="bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-3 px-0"
                >
                  Overview
                </TabsTrigger>
                <TabsTrigger
                  value="advanced"
                  className="bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-3 px-0"
                >
                  Advanced
                </TabsTrigger>
                <TabsTrigger
                  value="activity"
                  className="bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-3 px-0"
                >
                  Activity
                </TabsTrigger>
              </TabsList>

              <TabsContent value="position" className="mt-6">
                {!isConnected ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <p className="text-muted-foreground">Connect your wallet to view your position</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                          Your Collateral
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold">
                          {formatDisplayAmount(userCollateral)} {market.collateralDenom}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                          Your Debt
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold">
                          {formatDisplayAmount(userDebt)} {market.debtDenom}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                          Current LTV
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold">{currentLtv.toFixed(1)}%</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                          Health Factor
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold text-green-600">
                          {position?.healthFactor?.toFixed(2) || '∞'}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="overview" className="mt-6 space-y-6">
                {/* Market Attributes */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Market Attributes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Collateral</span>
                        <div className="flex items-center gap-2">
                          <TokenIcon symbol={market.collateralDenom} size="sm" />
                          <span className="font-medium">{market.collateralDenom}</span>
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Oracle price</span>
                        <span className="font-medium">
                          {market.collateralDenom} / {market.debtDenom} = 1.00
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Loan</span>
                        <div className="flex items-center gap-2">
                          <TokenIcon symbol={market.debtDenom} size="sm" />
                          <span className="font-medium">{market.debtDenom}</span>
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Created on</span>
                        <span className="font-medium">{market.createdAt ? new Date(market.createdAt).toLocaleDateString() : '-'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Liquidation LTV</span>
                        <span className="font-medium">{liquidationLtv.toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Utilization</span>
                        <span className="font-medium">{formatPercentage(market.utilization)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Chart */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Borrow (USD)</p>
                        <p className="text-3xl font-bold">{formatLargeNumber(parseFloat(microToBase(market.totalBorrowed)))}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex bg-muted rounded-lg p-1">
                          <button
                            onClick={() => setChartMetric('borrow')}
                            className={`px-3 py-1 text-sm rounded-md transition-colors ${
                              chartMetric === 'borrow'
                                ? 'bg-background shadow text-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            Borrow
                          </button>
                          <button
                            onClick={() => setChartMetric('supply')}
                            className={`px-3 py-1 text-sm rounded-md transition-colors ${
                              chartMetric === 'supply'
                                ? 'bg-background shadow text-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            Supply
                          </button>
                          <button
                            onClick={() => setChartMetric('liquidity')}
                            className={`px-3 py-1 text-sm rounded-md transition-colors ${
                              chartMetric === 'liquidity'
                                ? 'bg-background shadow text-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            Liquidity
                          </button>
                        </div>
                        <div className="flex bg-muted rounded-lg p-1">
                          <button className="px-3 py-1 text-sm rounded-md text-muted-foreground hover:text-foreground">
                            {market.debtDenom}
                          </button>
                          <button className="px-3 py-1 text-sm rounded-md bg-background shadow text-foreground">
                            USD
                          </button>
                        </div>
                        <select className="bg-muted rounded-lg px-3 py-1.5 text-sm border-0 outline-none">
                          <option>3 months</option>
                          <option>1 month</option>
                          <option>1 week</option>
                        </select>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={CHART_DATA}>
                          <defs>
                            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis
                            dataKey="date"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#888', fontSize: 12 }}
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#888', fontSize: 12 }}
                            tickFormatter={(value) => `$${(value / 1000000).toFixed(0)}M`}
                            domain={['dataMin - 100000000', 'dataMax + 100000000']}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'var(--background)',
                              border: '1px solid var(--border)',
                              borderRadius: '8px',
                            }}
                            formatter={(value) => [`$${(Number(value) / 1000000).toFixed(2)}M`, 'Value']}
                          />
                          <Area
                            type="monotone"
                            dataKey="value"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorValue)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="advanced" className="mt-6">
                <AdvancedTab
                  market={{
                    oracle: market.config?.oracle,
                    collateralDenom: market.collateralDenom,
                    debtDenom: market.debtDenom,
                    borrowRate: market.borrowApy / 100, // Convert from percentage to decimal
                    liquidityRate: market.supplyApy / 100,
                    utilization: market.utilization / 100, // Convert from percentage to decimal
                    totalSupplied: market.totalSupplied,
                    totalCollateral: market.totalCollateral,
                    params: market.params
                      ? {
                          liquidation_threshold: market.params.liquidation_threshold,
                          liquidation_bonus: market.params.liquidation_bonus,
                          interest_rate_model: market.params.interest_rate_model as Record<string, unknown>,
                        }
                      : undefined,
                  }}
                />
              </TabsContent>

              <TabsContent value="activity" className="mt-6">
                <Card>
                  <CardContent className="py-12 text-center">
                    <p className="text-muted-foreground">Recent activity coming soon</p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Column - Action Panel */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex bg-muted rounded-lg p-1">
                  <button
                    className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                      actionTab === 'lend'
                        ? 'bg-background shadow'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setActionTab('lend')}
                  >
                    Lend
                  </button>
                  <button
                    className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                      actionTab === 'borrow'
                        ? 'bg-background shadow'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setActionTab('borrow')}
                  >
                    Borrow
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {actionTab === 'lend' ? (
                  <>
                    {/* Supply (Lend) Input */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Supply {market.debtDenom}</span>
                        <Info className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="relative">
                        <Input
                          type="text"
                          placeholder="0.00"
                          value={supplyAmount}
                          onChange={(e) => setSupplyAmount(e.target.value)}
                          className="pr-20 text-lg h-12"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            {debtBalance ? formatDisplayAmount(parseFloat(microToBase(debtBalance)), 2) : '0.00'} {market.debtDenom}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => {
                              if (debtBalance) {
                                setSupplyAmount(microToBase(debtBalance));
                              }
                            }}
                          >
                            MAX
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Lend Position Summary */}
                    <div className="space-y-3 pt-2 border-t">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-purple-500" />
                          <span className="text-muted-foreground">Your Supply ({market.debtDenom})</span>
                        </div>
                        <span>{formatDisplayAmount(userSupply)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Supply APY</span>
                        <span className="text-green-600">{formatPercentage(market.supplyApy)}</span>
                      </div>
                    </div>

                    {/* Error Display */}
                    {supplyError && (
                      <p className="text-sm text-destructive">{supplyError}</p>
                    )}

                    {/* Supply Action Button */}
                    <Button
                      className="w-full h-12 text-base"
                      disabled={!isConnected || !supplyAmount || parseFloat(supplyAmount) <= 0 || isSupplying}
                      onClick={handleSupply}
                    >
                      {!isConnected
                        ? 'Connect Wallet'
                        : isSupplying
                        ? 'Processing...'
                        : !supplyAmount || parseFloat(supplyAmount) <= 0
                        ? 'Enter an amount'
                        : 'Supply'}
                    </Button>

                    {/* Withdraw Supply */}
                    {isConnected && userSupply > 0 && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => setWithdrawModalOpen(true)}
                      >
                        Withdraw Supply
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    {/* Add Collateral Section */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Add Collateral</span>
                        <Info className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="relative">
                        <Input
                          type="text"
                          placeholder="0.00"
                          value={collateralAmount}
                          onChange={(e) => setCollateralAmount(e.target.value)}
                          className="pr-20 text-lg h-12"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            {collateralBalance ? formatDisplayAmount(parseFloat(microToBase(collateralBalance)), 2) : '0.00'} {market.collateralDenom}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => {
                              if (collateralBalance) {
                                setCollateralAmount(microToBase(collateralBalance));
                              }
                            }}
                          >
                            MAX
                          </Button>
                        </div>
                      </div>
                      <Button
                        className="w-full"
                        disabled={!isConnected || !collateralAmount || parseFloat(collateralAmount) <= 0 || isSupplyingCollateral}
                        onClick={handleSupplyCollateral}
                      >
                        {!isConnected
                          ? 'Connect Wallet'
                          : isSupplyingCollateral
                          ? 'Processing...'
                          : 'Add Collateral'}
                      </Button>
                    </div>

                    <div className="border-t" />

                    {/* Borrow Section */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Borrow {market.debtDenom}</span>
                        <Info className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="relative">
                        <Input
                          type="text"
                          placeholder="0.00"
                          value={borrowAmount}
                          onChange={(e) => setBorrowAmount(e.target.value)}
                          className="pr-20 text-lg h-12"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            {position?.maxBorrowValue ? formatDisplayAmount(position.maxBorrowValue, 2) : '0.00'} {market.debtDenom}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => {
                              if (position?.maxBorrowValue) {
                                setBorrowAmount(position.maxBorrowValue.toString());
                              }
                            }}
                          >
                            MAX
                          </Button>
                        </div>
                      </div>
                      <Button
                        className="w-full"
                        disabled={!isConnected || !borrowAmount || parseFloat(borrowAmount) <= 0 || isBorrowing}
                        onClick={handleBorrow}
                      >
                        {!isConnected
                          ? 'Connect Wallet'
                          : isBorrowing
                          ? 'Processing...'
                          : 'Borrow'}
                      </Button>
                    </div>

                    {/* Position Summary */}
                    <div className="space-y-3 pt-2 border-t">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-blue-500" />
                          <span className="text-muted-foreground">Collateral ({market.collateralDenom})</span>
                        </div>
                        <span>{formatDisplayAmount(userCollateral)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-red-500" />
                          <span className="text-muted-foreground">Debt ({market.debtDenom})</span>
                        </div>
                        <span>{formatDisplayAmount(userDebt)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">LTV</span>
                        <span>{currentLtv.toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">Liquidation LTV</span>
                          <div className="w-4 h-4 rounded-full bg-yellow-500 flex items-center justify-center">
                            <span className="text-[10px] text-black font-bold">!</span>
                          </div>
                        </div>
                        <span>{liquidationLtv.toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Borrow APY</span>
                        <span className="text-red-600">{formatPercentage(rate)}</span>
                      </div>
                    </div>

                    {/* Error Display */}
                    {supplyError && (
                      <p className="text-sm text-destructive">{supplyError}</p>
                    )}

                    {/* Quick Actions */}
                    {isConnected && (userCollateral > 0 || userDebt > 0) && (
                      <div className="flex gap-2 pt-2">
                        {userDebt > 0 && (
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => setRepayModalOpen(true)}
                          >
                            Repay
                          </Button>
                        )}
                        {userCollateral > 0 && (
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => setWithdrawCollateralModalOpen(true)}
                          >
                            Withdraw Collateral
                          </Button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Modals */}
      <RepayModal
        open={repayModalOpen}
        onOpenChange={setRepayModalOpen}
        marketAddress={market.address}
        denom={market.config.debt_denom}
        displayDenom={market.debtDenom}
        currentDebt={position?.debtAmount}
        onSuccess={refetchAll}
      />

      <WithdrawModal
        open={withdrawModalOpen}
        onOpenChange={setWithdrawModalOpen}
        marketAddress={market.address}
        displayDenom={market.debtDenom}
        currentSupply={position?.supplyAmount}
        onSuccess={refetchAll}
      />

      <WithdrawCollateralModal
        open={withdrawCollateralModalOpen}
        onOpenChange={setWithdrawCollateralModalOpen}
        marketAddress={market.address}
        displayDenom={market.collateralDenom}
        currentCollateral={position?.collateralAmount}
        hasDebt={userDebt > 0}
        onSuccess={refetchAll}
      />
    </div>
  );
}
