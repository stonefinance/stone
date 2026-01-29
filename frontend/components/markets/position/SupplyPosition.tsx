'use client';

import { CardContent } from '@/components/ui/card';
import { TokenIcon } from '@/components/ui/token-icon';
import { UserPosition } from '@/types';
import { formatDisplayAmount, formatPercentage, microToBase } from '@/lib/utils/format';

interface SupplyPositionProps {
  position: UserPosition;
  market: { debtDenom: string; supplyApy: number };
}

export function SupplyPosition({ position, market }: SupplyPositionProps) {
  const supplyDenom = market.debtDenom; // Supply is in the debt token
  const supplyApy = market.supplyApy;
  const supplyAmount = parseFloat(microToBase(position.supplyAmount));
  const estimatedYield = supplyAmount * (supplyApy / 100);

  return (
    <CardContent className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Your Supply */}
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Your Supply</p>
          <div className="flex items-center gap-2">
            <TokenIcon symbol={supplyDenom} size="sm" />
            <p className="text-lg font-semibold">
              {formatDisplayAmount(supplyAmount)} {supplyDenom}
            </p>
          </div>
        </div>

        {/* Supply APY */}
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Supply APY</p>
          <p className="text-lg font-semibold text-green-600">
            {formatPercentage(supplyApy)}
          </p>
        </div>
      </div>

      {/* Estimated Annual Yield */}
      <div className="pt-4 border-t">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Estimated Yield (annual)</p>
          <p className="text-sm font-medium">
            {formatDisplayAmount(estimatedYield)} {supplyDenom}
          </p>
        </div>
      </div>
    </CardContent>
  );
}
