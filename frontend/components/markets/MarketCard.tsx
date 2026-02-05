import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Market } from '@/types';
import { formatDisplayAmount, formatPercentage, formatUSD, microToBase } from '@/lib/utils/format';

interface MarketCardProps {
  market: Market;
  /** USD price of the debt token (from Pyth) */
  debtUsdPrice?: number;
}

export function MarketCard({ market, debtUsdPrice }: MarketCardProps) {
  const totalSuppliedFormatted = formatDisplayAmount(microToBase(market.totalSupplied), 0);
  const totalBorrowedFormatted = formatDisplayAmount(microToBase(market.totalBorrowed), 0);

  return (
    <Link href={`/markets/${market.id}`}>
      <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold">
                {market.collateralDenom} / {market.debtDenom}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Market #{market.id.slice(0, 8)}...
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* APY Section */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Supply APY</p>
              <p className="text-2xl font-bold text-green-600">
                {formatPercentage(market.supplyApy)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Borrow APY</p>
              <p className="text-2xl font-bold text-blue-600">
                {formatPercentage(market.borrowApy)}
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Market Stats */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total Supplied</span>
              <div className="text-right">
                <span className="text-sm font-medium">
                  {totalSuppliedFormatted} {market.debtDenom}
                </span>
                {debtUsdPrice != null && (
                  <div className="text-xs text-muted-foreground">
                    {formatUSD(parseFloat(microToBase(market.totalSupplied)) * debtUsdPrice)}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total Borrowed</span>
              <div className="text-right">
                <span className="text-sm font-medium">
                  {totalBorrowedFormatted} {market.debtDenom}
                </span>
                {debtUsdPrice != null && (
                  <div className="text-xs text-muted-foreground">
                    {formatUSD(parseFloat(microToBase(market.totalBorrowed)) * debtUsdPrice)}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Utilization</span>
              <span className="text-sm font-medium">{formatPercentage(market.utilization)}</span>
            </div>
          </div>

          {/* Utilization Bar */}
          <div className="space-y-1">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all"
                style={{ width: `${Math.min(market.utilization, 100)}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
