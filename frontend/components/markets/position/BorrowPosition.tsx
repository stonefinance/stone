import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDisplayAmount, microToBase } from '@/lib/utils/format';
import { Market, UserPosition } from '@/types';

interface BorrowPositionProps {
  position: UserPosition;
  market: Market;
}

export function BorrowPosition({ position, market }: BorrowPositionProps) {
  const collateral = parseFloat(microToBase(position.collateralAmount));
  const debt = parseFloat(microToBase(position.debtAmount));
  const currentLtv = collateral > 0 && debt > 0 ? (debt / collateral) * 100 : 0;
  const health = position.healthFactor;

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
