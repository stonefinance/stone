'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Info, Copy, ExternalLink, AlertTriangle } from 'lucide-react';
import { formatDisplayAmount, formatRelativeTime, shortenAddress } from '@/lib/utils/format';
import { getChainDenom } from '@/lib/utils/denom';
import { PythPrice } from '@/lib/pyth/client';
import { PYTH_STALENESS_THRESHOLD_SECONDS } from '@/lib/pyth/config';

export interface OracleAttributesProps {
  oracleAddress: string;
  collateralDenom: string;
  debtDenom: string;
  valueSecured?: number;
  /** Pyth USD prices keyed by chain denom — passed from page level (review #3) */
  pythPrices?: Record<string, number>;
  /** Full PythPrice objects for confidence / publishTime display */
  pythRawPrices?: Record<string, PythPrice>;
  pythLoading?: boolean;
  pythError?: Error | null;
  pythLastUpdated?: Date | null;
  pythIsStale?: boolean;
}

export function OracleAttributes({
  oracleAddress,
  collateralDenom,
  debtDenom,
  valueSecured: valueSecuredProp,
  pythPrices = {},
  pythRawPrices = {},
  pythLoading = false,
  pythError = null,
  pythLastUpdated = null,
  pythIsStale = false,
}: OracleAttributesProps) {
  const handleCopyAddress = () => {
    navigator.clipboard.writeText(oracleAddress);
  };

  const collateralPrice = pythPrices[getChainDenom(collateralDenom)];
  const debtPrice = pythPrices[getChainDenom(debtDenom)];

  // Oracle price = collateral / debt
  const oraclePrice =
    collateralPrice && debtPrice ? collateralPrice / debtPrice : undefined;

  const valueSecured = valueSecuredProp;

  // Confidence as a percentage of the collateral price
  const collateralRaw = pythRawPrices[getChainDenom(collateralDenom)];
  const confidencePercent =
    collateralRaw?.confidence && collateralRaw?.price
      ? (collateralRaw.confidence / collateralRaw.price) * 100
      : null;

  // Check if individual price is stale (for display)
  // Linter requires Date.now() to be in useState, not during render
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  const collateralStale = useMemo(() => {
    if (!collateralRaw) return false;
    return now - collateralRaw.publishTime > PYTH_STALENESS_THRESHOLD_SECONDS;
  }, [collateralRaw, now]);

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
        {/* Staleness warning (review #2) */}
        {pythIsStale && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-2 text-yellow-700 dark:text-yellow-400">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <p className="text-xs font-medium">
              Oracle prices may be stale. Displayed values could be inaccurate.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          {/* Left Column */}
          <div className="space-y-4">
            {/* Oracle Address */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Oracle address</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">
                  {shortenAddress(oracleAddress, 4)}
                </span>
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
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                Pyth
              </span>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            {/* Oracle Price */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Oracle price</span>
              <div className="text-right">
                {pythLoading && oraclePrice === undefined ? (
                  <span className="text-sm text-muted-foreground animate-pulse">
                    Loading...
                  </span>
                ) : oraclePrice !== undefined ? (
                  <span className={`text-sm font-medium ${collateralStale ? 'text-yellow-600' : ''}`}>
                    {collateralDenom} / {debtDenom} ={' '}
                    {formatDisplayAmount(oraclePrice, 4)}
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
              <span className={`text-sm font-medium ${collateralStale ? 'text-yellow-600' : ''}`}>
                {pythLastUpdated
                  ? formatRelativeTime(Math.floor(pythLastUpdated.getTime() / 1000))
                  : pythLoading
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
        {pythError && (
          <div className="mt-4 p-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
            Failed to fetch Pyth prices. Using cached data if available.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
