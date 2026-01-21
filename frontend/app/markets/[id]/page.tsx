'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { HealthFactor } from '@/components/markets/HealthFactor';
import { DepositModal } from '@/components/modals/DepositModal';
import { BorrowModal } from '@/components/modals/BorrowModal';
import { RepayModal } from '@/components/modals/RepayModal';
import { useMarket } from '@/hooks/useMarkets';
import { useUserPosition } from '@/hooks/useUserPosition';
import { useWallet } from '@/lib/cosmjs/wallet';
import {
  formatDisplayAmount,
  formatPercentage,
  formatUSD,
  microToBase,
} from '@/lib/utils/format';

export default function MarketDetailPage() {
  const params = useParams();
  const marketId = params.id as string;
  const { isConnected } = useWallet();

  const { data: market, isLoading: marketLoading } = useMarket(marketId);
  const { data: position } = useUserPosition(market?.address);

  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [depositType, setDepositType] = useState<'supply' | 'collateral'>('supply');
  const [borrowModalOpen, setBorrowModalOpen] = useState(false);
  const [repayModalOpen, setRepayModalOpen] = useState(false);

  if (marketLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="animate-pulse space-y-8">
            <div className="h-12 bg-muted rounded w-1/3" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="h-64 bg-muted rounded" />
              <div className="h-64 bg-muted rounded" />
              <div className="h-64 bg-muted rounded" />
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

  const handleOpenDeposit = (type: 'supply' | 'collateral') => {
    setDepositType(type);
    setDepositModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">
            {market.collateralDenom} / {market.debtDenom}
          </h1>
          <p className="text-muted-foreground">Market {marketId}</p>
        </div>

        {/* Market Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <p className="text-sm text-muted-foreground">Supply APY</p>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">
                {formatPercentage(market.supplyApy)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <p className="text-sm text-muted-foreground">Borrow APY</p>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-blue-600">
                {formatPercentage(market.borrowApy)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <p className="text-sm text-muted-foreground">Total Supplied</p>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold">
                {formatDisplayAmount(microToBase(market.totalSupplied), 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <p className="text-sm text-muted-foreground">Utilization</p>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold">{formatPercentage(market.utilization)}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Supply Section */}
          <Card>
            <CardHeader>
              <CardTitle>Supply</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Your Supply</p>
                <p className="text-2xl font-bold">
                  {position?.supplyAmount
                    ? formatDisplayAmount(microToBase(position.supplyAmount))
                    : '0.00'}{' '}
                  {market.debtDenom}
                </p>
                {position?.supplyValue !== undefined && (
                  <p className="text-sm text-muted-foreground">
                    {formatUSD(position.supplyValue)}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">APY</p>
                <p className="text-lg font-semibold text-green-600">
                  {formatPercentage(market.supplyApy)}
                </p>
              </div>

              <Button
                onClick={() => handleOpenDeposit('supply')}
                className="w-full"
                disabled={!isConnected}
              >
                Supply
              </Button>
            </CardContent>
          </Card>

          {/* Collateral & Borrow Section */}
          <Card>
            <CardHeader>
              <CardTitle>Borrow</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Your Collateral</p>
                <p className="text-2xl font-bold">
                  {position?.collateralAmount
                    ? formatDisplayAmount(microToBase(position.collateralAmount))
                    : '0.00'}{' '}
                  {market.collateralDenom}
                </p>
                {position?.collateralValue !== undefined && (
                  <p className="text-sm text-muted-foreground">
                    {formatUSD(position.collateralValue)}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Your Debt</p>
                <p className="text-2xl font-bold">
                  {position?.debtAmount
                    ? formatDisplayAmount(microToBase(position.debtAmount))
                    : '0.00'}{' '}
                  {market.debtDenom}
                </p>
                {position?.debtValue !== undefined && (
                  <p className="text-sm text-muted-foreground">{formatUSD(position.debtValue)}</p>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => handleOpenDeposit('collateral')}
                  variant="outline"
                  className="flex-1"
                  disabled={!isConnected}
                >
                  Deposit
                </Button>
                <Button
                  onClick={() => setBorrowModalOpen(true)}
                  className="flex-1"
                  disabled={!isConnected}
                >
                  Borrow
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Health Factor Section */}
          <Card>
            <CardHeader>
              <CardTitle>Position Health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Health Factor</p>
                <HealthFactor healthFactor={position?.healthFactor} size="md" />
              </div>

              {position?.maxBorrowValue !== undefined && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Available to Borrow</p>
                  <p className="text-lg font-semibold">{formatUSD(position.maxBorrowValue)}</p>
                </div>
              )}

              {position?.liquidationPrice !== undefined && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Liquidation Price</p>
                  <p className="text-lg font-semibold">{formatUSD(position.liquidationPrice)}</p>
                </div>
              )}

              {position?.debtAmount && parseFloat(position.debtAmount) > 0 && (
                <Button
                  onClick={() => setRepayModalOpen(true)}
                  variant="outline"
                  className="w-full"
                  disabled={!isConnected}
                >
                  Repay
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Modals */}
      <DepositModal
        open={depositModalOpen}
        onOpenChange={setDepositModalOpen}
        marketAddress={market.address}
        denom={depositType === 'supply' ? market.debtDenom : market.collateralDenom}
        type={depositType}
      />

      <BorrowModal
        open={borrowModalOpen}
        onOpenChange={setBorrowModalOpen}
        marketAddress={market.address}
        denom={market.debtDenom}
        maxBorrowValue={position?.maxBorrowValue}
      />

      <RepayModal
        open={repayModalOpen}
        onOpenChange={setRepayModalOpen}
        marketAddress={market.address}
        denom={market.debtDenom}
        currentDebt={position?.debtAmount}
      />
    </div>
  );
}
