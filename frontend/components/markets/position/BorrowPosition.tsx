'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDisplayAmount, formatUSD, microToBase } from '@/lib/utils/format';
import { Market, UserPosition } from '@/types';
import { usePythPrices } from '@/hooks/usePythPrices';
import { getChainDenom } from '@/lib/utils/denom';

interface BorrowPositionProps {
  position: UserPosition;
  market: Market;
}

export function BorrowPosition({ position, market }: BorrowPositionProps) {
  const collateral = parseFloat(microToBase(position.collateralAmount));
  const debt = parseFloat(microToBase(position.debtAmount));
  const currentLtv = collateral > 0 && debt > 0 ? (debt / collateral) * 100 : 0;
  const health = position.healthFactor;

  // Fetch Pyth prices
  const { prices } = usePythPrices(
    [getChainDenom(market.collateralDenom), getChainDenom(market.debtDenom)],
    30000
  );

  const collateralPrice = prices[getChainDenom(market.collateralDenom)];
  const debtPrice = prices[getChainDenom(market.debtDenom)];

  const collateralUSD = collateralPrice ? collateral * collateralPrice : null;
  const debtUSD = debtPrice ? debt * debtPrice : null;

  return (
    <div className="grid grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Your Collateral</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">
            {formatDisplayAmount(collateral)} {market.collateralDenom}
          </p>
          {collateralUSD !== null && (
            <p className="text-sm text-muted-foreground">{formatUSD(collateralUSD)}</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Your Debt</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">
            {formatDisplayAmount(debt)} {market.debtDenom}
          </p>
          {debtUSD !== null && (
            <p className="text-sm text-muted-foreground">{formatUSD(debtUSD)}</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Current LTV</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{currentLtv.toFixed(1)}%</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Health Factor</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-green-600">
            {health !== undefined ? health.toFixed(2) : '∞'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
