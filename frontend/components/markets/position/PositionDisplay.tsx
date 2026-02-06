import { Card, CardContent } from '@/components/ui/card';
import { Market, MarketDetail, PositionType, UserPosition } from '@/types';
import { NoPosition } from './NoPosition';
import { SupplyPosition } from './SupplyPosition';
import { BorrowPosition } from './BorrowPosition';
import { AlertTriangle } from 'lucide-react';

interface PositionDisplayProps {
  position: UserPosition | null;
  positionType: PositionType;
  market: Market | MarketDetail;
  isConnected: boolean;
  /** Pyth USD prices keyed by chain denom — passed from page level */
  pythPrices?: Record<string, number>;
}

export function PositionDisplay({ position, positionType, market, isConnected, pythPrices }: PositionDisplayProps) {
  if (!isConnected) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Connect your wallet to view your position</p>
        </CardContent>
      </Card>
    );
  }

  switch (positionType) {
    case 'none':
      return <NoPosition />;
    case 'supply':
      return <SupplyPosition position={position!} market={market} pythPrices={pythPrices} />;
    case 'borrow':
      return <BorrowPosition position={position!} market={market} pythPrices={pythPrices} />;
    case 'both':
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-yellow-700 dark:text-yellow-400">
            <AlertTriangle className="h-4 w-4" />
            <p className="text-sm font-medium">You have both a supply and borrow position. Consider repaying your debt first.</p>
          </div>
          <SupplyPosition position={position!} market={market} pythPrices={pythPrices} />
          <BorrowPosition position={position!} market={market} pythPrices={pythPrices} />
        </div>
      );
    default:
      return null;
  }
}
