'use client';

import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HealthFactor } from '@/components/markets/HealthFactor';
import { useMarkets } from '@/hooks/useMarkets';
import { useUserPositions } from '@/hooks/useUserPosition';
import { useWallet } from '@/lib/cosmjs/wallet';
import { formatUSD, formatPercentage, formatDisplayAmount, microToBase } from '@/lib/utils/format';
import Link from 'next/link';

export default function DashboardPage() {
  const { isConnected } = useWallet();
  const { data: markets } = useMarkets();
  const { data: positions } = useUserPositions();

  // Calculate portfolio summary
  const totalSupplied = positions?.reduce((sum, p) => sum + p.supplyValue, 0) || 0;
  const totalBorrowed = positions?.reduce((sum, p) => sum + p.debtValue, 0) || 0;
  const totalCollateral = positions?.reduce((sum, p) => sum + p.collateralValue, 0) || 0;

  // Find minimum health factor (most risky position)
  const minHealthFactor = positions?.reduce((min, p) => {
    if (!p.healthFactor) return min;
    return min === undefined || p.healthFactor < min ? p.healthFactor : min;
  }, undefined as number | undefined);

  // Calculate weighted average APY (placeholder - needs actual implementation)
  // For now, we'll use a simple placeholder
  const netApy = 3.5; // Placeholder

  // P&L Calculation (placeholder)
  // In a real app, this would come from historical data
  const totalPnL = totalSupplied * 0.035 - totalBorrowed * 0.05; // Placeholder calculation

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <h1 className="text-3xl font-bold mb-4">Connect Your Wallet</h1>
            <p className="text-muted-foreground">
              Please connect your wallet to view your portfolio
            </p>
          </div>
        </main>
      </div>
    );
  }

  const hasPositions = positions && positions.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Dashboard</h1>
          <p className="text-muted-foreground">Your portfolio overview</p>
        </div>

        {/* Portfolio Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Supplied
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-600">{formatUSD(totalSupplied)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Borrowed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-blue-600">{formatUSD(totalBorrowed)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Net APY
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{formatPercentage(netApy)}</p>
              <p className="text-xs text-muted-foreground mt-1">Estimated</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total P&L
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className={`text-3xl font-bold ${
                  totalPnL >= 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {formatUSD(totalPnL)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Estimated</p>
            </CardContent>
          </Card>
        </div>

        {/* Health Factor Card */}
        {minHealthFactor !== undefined && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Portfolio Health</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Lowest Health Factor
                  </p>
                  <HealthFactor healthFactor={minHealthFactor} size="lg" />
                </div>
                <div className="text-right space-y-2">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Collateral</p>
                    <p className="text-2xl font-bold">{formatUSD(totalCollateral)}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active Positions */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Your Positions</h2>

          {!hasPositions && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground mb-4">You don't have any active positions</p>
                <Link
                  href="/markets"
                  className="text-primary hover:underline font-medium"
                >
                  Explore Markets
                </Link>
              </CardContent>
            </Card>
          )}

          {hasPositions && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {positions.map((position) => {
                const market = markets?.find((m) => m.id === position.marketId);
                if (!market) return null;

                const hasSupply = parseFloat(position.supplyAmount) > 0;
                const hasCollateral = parseFloat(position.collateralAmount) > 0;
                const hasDebt = parseFloat(position.debtAmount) > 0;

                if (!hasSupply && !hasCollateral && !hasDebt) return null;

                return (
                  <Link href={`/markets/${market.id}`} key={position.marketId}>
                    <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                      <CardHeader>
                        <CardTitle className="text-lg">
                          {market.collateralDenom} / {market.debtDenom}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {hasSupply && (
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">Supplied</span>
                            <span className="text-sm font-medium">
                              {formatDisplayAmount(microToBase(position.supplyAmount))}{' '}
                              {market.debtDenom}
                            </span>
                          </div>
                        )}

                        {hasCollateral && (
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">Collateral</span>
                            <span className="text-sm font-medium">
                              {formatDisplayAmount(microToBase(position.collateralAmount))}{' '}
                              {market.collateralDenom}
                            </span>
                          </div>
                        )}

                        {hasDebt && (
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">Debt</span>
                            <span className="text-sm font-medium text-blue-600">
                              {formatDisplayAmount(microToBase(position.debtAmount))}{' '}
                              {market.debtDenom}
                            </span>
                          </div>
                        )}

                        {position.healthFactor !== undefined && (
                          <div className="pt-2 border-t border-border">
                            <p className="text-xs text-muted-foreground mb-1">Health Factor</p>
                            <HealthFactor healthFactor={position.healthFactor} size="sm" />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
