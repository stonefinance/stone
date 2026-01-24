'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatPercentage, formatDisplayAmount } from '@/lib/utils/format';

export interface LiquidationsProps {
  liquidationThreshold: number; // LLTV as decimal (e.g., 0.86 for 86%)
  liquidationBonus: number; // Penalty as decimal (e.g., 0.0438 for 4.38%)
  debtDenom: string;
  // TODO: Bad debt tracking not yet implemented in schema
  // See advanced-tab-data-analysis.md - Section 4: Liquidations
  realizedBadDebt?: number;
  unrealizedBadDebt?: number;
}

export function Liquidations({
  liquidationThreshold,
  liquidationBonus,
  debtDenom,
  realizedBadDebt,
  unrealizedBadDebt,
}: LiquidationsProps) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-medium">Liquidations</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          {/* Left Column */}
          <div className="space-y-4">
            {/* LLTV */}
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm text-muted-foreground">
                Liquidation Loan-To-Value (LLTV)
              </span>
              <span className="text-sm font-medium">
                {formatPercentage(liquidationThreshold * 100, 0)}
              </span>
            </div>

            {/* Realized Bad Debt */}
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm text-muted-foreground">Realized Bad Debt</span>
              <span className="text-sm font-medium">
                {realizedBadDebt !== undefined
                  ? realizedBadDebt < 0.01
                    ? `< 0.01 ${debtDenom}`
                    : `${formatDisplayAmount(realizedBadDebt, 2)} ${debtDenom}`
                  : 'N/A'}
              </span>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            {/* Liquidation Penalty */}
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm text-muted-foreground">Liquidation Penalty</span>
              <span className="text-sm font-medium">
                {formatPercentage(liquidationBonus * 100)}
              </span>
            </div>

            {/* Unrealized Bad Debt */}
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-sm text-muted-foreground">Unrealized Bad Debt</span>
              <span className="text-sm font-medium">
                {unrealizedBadDebt !== undefined
                  ? `${formatDisplayAmount(unrealizedBadDebt, 2)} ${debtDenom}`
                  : 'N/A'}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
