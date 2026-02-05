'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDisplayAmount, formatUSD, microToBase } from '@/lib/utils/format';
import { Market, UserPosition } from '@/types';
import { getChainDenom } from '@/lib/utils/denom';
import { computeHealthFactor, computeLtv } from '@/lib/utils/position';

interface BorrowPositionProps {
  position: UserPosition;
  market: Market;
  /** Pyth USD prices keyed by chain denom — passed from page level (review #3) */
  pythPrices?: Record<string, number>;
}

export function BorrowPosition({ position, market, pythPrices = {} }: BorrowPositionProps) {
  const collateral = parseFloat(microToBase(position.collateralAmount));
  const debt = parseFloat(microToBase(position.debtAmount));

  const collateralPrice = pythPrices[getChainDenom(market.collateralDenom)];
  const debtPrice = pythPrices[getChainDenom(market.debtDenom)];

  const collateralUSD = collateralPrice ? collateral * collateralPrice : null;
  const debtUSD = debtPrice ? debt * debtPrice : null;

  const currentLtv = computeLtv(debt, collateral, debtPrice, collateralPrice);

  const liquidationThreshold =
    'params' in market && market.params?.liquidation_threshold
      ? parseFloat(market.params.liquidation_threshold)
      : undefined;

  const computedHealth =
    liquidationThreshold !== undefined ? computeHealthFactor(currentLtv, liquidationThreshold) : null;

  const health = currentLtv === null ? null : position.healthFactor ?? computedHealth;

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
          <p className="text-2xl font-bold">
            {currentLtv === null ? '--' : `${currentLtv.toFixed(1)}%`}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Health Factor</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-green-600">
            {health === null ? '--' : health.toFixed(2)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
