'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Info, Copy, ExternalLink } from 'lucide-react';
import { formatDisplayAmount, shortenAddress } from '@/lib/utils/format';
import { usePythPrices } from '@/hooks/usePythPrices';
import { formatRelativeTime } from '@/lib/pyth/client';

export interface OracleAttributesProps {
  oracleAddress: string;
  collateralDenom: string;
  debtDenom: string;
  // Legacy props - now fetched from Pyth
  oraclePrice?: number;
  referencePrice?: number;
  valueSecured?: number;
}

export function OracleAttributes({
  oracleAddress,
  collateralDenom,
  debtDenom,
  valueSecured: valueSecuredProp,
}: OracleAttributesProps) {
  const handleCopyAddress = () => {
    navigator.clipboard.writeText(oracleAddress);
  };

  // Get Pyth prices for both collateral and debt denoms
  const { prices, isLoading, error, lastUpdated, rawPrices } = usePythPrices(
    [collateralDenom, debtDenom],
    15000 // 15 second refresh
  );

  // Calculate oracle price (collateral / debt)
  const collateralPrice = prices[collateralDenom];
  const debtPrice = prices[debtDenom];
  
  let oraclePrice: number | undefined;
  if (collateralPrice && debtPrice) {
    oraclePrice = collateralPrice / debtPrice;
  }

  // Calculate reference price (from Pyth - same as oracle for now, could be from different source)
  const referencePrice = oraclePrice;

  // Calculate value secured if we have the price
  const valueSecured = valueSecuredProp;

  // Get confidence interval for display
  const collateralRawPrice = rawPrices[collateralDenom];
  const confidencePercent = collateralRawPrice?.confidence && collateralRawPrice?.price
    ? (collateralRawPrice.confidence / collateralRawPrice.price) * 100
    : null;

  const formatLargeUSD = (value: number) => {
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-medium">Oracle Attributes</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          {/* Left Column */}
          <div className="space-y-4">
            {/* Oracle Address */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Oracle address</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{shortenAddress(oracleAddress, 4)}</span>
                <button
                  onClick={handleCopyAddress}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Copy address"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <a
                  href={`https://www.mintscan.io/osmosis/address/${oracleAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="View on explorer"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            {/* Trusted By */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Trusted by</span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  Pyth
                </span>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            {/* Oracle Price */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Oracle price</span>
              <div className="text-right">
                {isLoading && oraclePrice === undefined ? (
                  <span className="text-sm text-muted-foreground animate-pulse">Loading...</span>
                ) : oraclePrice !== undefined ? (
                  <span className="text-sm font-medium">
                    {collateralDenom} / {debtDenom} = {formatDisplayAmount(oraclePrice, 4)}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">N/A</span>
                )}
              </div>
            </div>

            {/* Reference Price */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">Reference price</span>
                <span title="Price from Pyth Network">
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
              </div>
              <div className="text-right">
                {isLoading && referencePrice === undefined ? (
                  <span className="text-sm text-muted-foreground animate-pulse">Loading...</span>
                ) : referencePrice !== undefined ? (
                  <span className="text-sm font-medium">
                    {formatDisplayAmount(referencePrice, 4)}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">N/A</span>
                )}
              </div>
            </div>

            {/* Confidence Interval */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">Confidence</span>
                <span title="Pyth price confidence interval">
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
              </div>
              <span className="text-sm font-medium">
                {confidencePercent !== null
                  ? `±${confidencePercent.toFixed(2)}%`
                  : 'N/A'}
              </span>
            </div>

            {/* Last Updated */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Last updated</span>
              <span className="text-sm font-medium">
                {lastUpdated
                  ? formatRelativeTime(Math.floor(lastUpdated.getTime() / 1000))
                  : isLoading
                  ? 'Loading...'
                  : 'N/A'}
              </span>
            </div>

            {/* Value Secured */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">Value secured</span>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <span className="text-sm font-medium">
                {valueSecured !== undefined ? formatLargeUSD(valueSecured) : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="mt-4 p-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
            Failed to fetch Pyth prices. Using cached data if available.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
