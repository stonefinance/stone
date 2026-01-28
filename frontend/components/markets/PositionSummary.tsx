'use client';

import { TokenIcon } from '@/components/ui/token-icon';
import { formatDisplayAmount, getHealthFactorColor } from '@/lib/utils/format';
import { Info } from 'lucide-react';

interface PositionSummaryProps {
  collateralAmount: string | number;
  collateralDenom: string;
  debtAmount: string | number;
  debtDenom: string;
  currentLtv: number;           // 0 to 1
  liquidationLtv: number;       // 0 to 1
  healthFactor?: number;
  utilization?: number;         // 0 to 100
  liquidationPrice?: number;
  percentToLiquidation?: number;
}

function getLtvDotColor(currentLtv: number, liquidationLtv: number): string {
  if (liquidationLtv <= 0 || currentLtv <= 0) return 'bg-gray-500';
  const ratio = currentLtv / liquidationLtv;
  if (ratio <= 0.4) return 'bg-green-500';
  if (ratio <= 0.65) return 'bg-yellow-500';
  if (ratio <= 0.85) return 'bg-orange-500';
  return 'bg-red-500';
}

export function PositionSummary({
  collateralAmount,
  collateralDenom,
  debtAmount,
  debtDenom,
  currentLtv,
  liquidationLtv,
  healthFactor,
  utilization,
  liquidationPrice,
  percentToLiquidation,
}: PositionSummaryProps) {
  const collateralNum = typeof collateralAmount === 'string' ? parseFloat(collateralAmount) : collateralAmount;
  const debtNum = typeof debtAmount === 'string' ? parseFloat(debtAmount) : debtAmount;
  const ltvDotColor = getLtvDotColor(currentLtv, liquidationLtv);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
      {/* Left column */}
      <div>
        {/* Collateral */}
        <div className="flex items-center justify-between py-3 border-b border-border">
          <span className="text-sm text-muted-foreground">Collateral</span>
          <div className="flex items-center gap-2">
            <TokenIcon symbol={collateralDenom} size="sm" />
            <span className="text-sm font-medium">
              {formatDisplayAmount(collateralNum)} {collateralDenom}
            </span>
          </div>
        </div>

        {/* Loan */}
        <div className="flex items-center justify-between py-3 border-b border-border">
          <span className="text-sm text-muted-foreground">Loan</span>
          <div className="flex items-center gap-2">
            <TokenIcon symbol={debtDenom} size="sm" />
            <span className="text-sm font-medium">
              {formatDisplayAmount(debtNum)} {debtDenom}
            </span>
          </div>
        </div>

        {/* LTV / Liquidation LTV */}
        <div className="flex items-center justify-between py-3 border-b border-border md:border-b-0">
          <span className="text-sm text-muted-foreground">LTV / Liquidation LTV</span>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${ltvDotColor}`} />
            <span className="text-sm font-medium">
              {currentLtv > 0 ? (currentLtv * 100).toFixed(1) : '0.0'}%
              {' / '}
              {(liquidationLtv * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {/* Right column */}
      <div>
        {/* Liquidation price */}
        <div className="flex items-center justify-between py-3 border-b border-border">
          <span className="text-sm text-muted-foreground">Liquidation price</span>
          <span className="text-sm font-medium">
            {liquidationPrice != null ? `$${formatDisplayAmount(liquidationPrice)}` : '-'}
          </span>
        </div>

        {/* % drop to liquidation */}
        <div className="flex items-center justify-between py-3 border-b border-border">
          <span className="text-sm text-muted-foreground">% drop to liquidation</span>
          <span className="text-sm font-medium">
            {percentToLiquidation != null ? `${percentToLiquidation.toFixed(1)}%` : '-'}
          </span>
        </div>

        {/* Health factor */}
        <div className="flex items-center justify-between py-3 border-b border-border">
          <span className="text-sm text-muted-foreground">Health factor</span>
          <span className={`text-sm font-medium ${getHealthFactorColor(healthFactor)}`}>
            {healthFactor != null ? healthFactor.toFixed(2) : '-'}
          </span>
        </div>

        {/* Utilization */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">Utilization</span>
            <span title="Percentage of supplied assets currently being borrowed">
              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </span>
          </div>
          <span className="text-sm font-medium">
            {utilization != null ? `${utilization.toFixed(1)}%` : '-'}
          </span>
        </div>
      </div>
    </div>
  );
}
