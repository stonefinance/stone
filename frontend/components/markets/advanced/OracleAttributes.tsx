'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Info, Copy, ExternalLink } from 'lucide-react';
import { formatDisplayAmount, shortenAddress } from '@/lib/utils/format';

export interface OracleAttributesProps {
  oracleAddress: string;
  collateralDenom: string;
  debtDenom: string;
  // TODO: Oracle price requires on-chain query to oracle contract
  // See advanced-tab-data-analysis.md - Section 2: Oracle Attributes
  oraclePrice?: number;
  // TODO: Reference price requires external price API integration (CoinGecko, DefiLlama)
  referencePrice?: number;
  // TODO: Value secured = totalCollateral * oraclePrice
  valueSecured?: number;
  // TODO: "Trusted by" requires external oracle metadata - not available in schema
  // trustedBy?: string[];
}

export function OracleAttributes({
  oracleAddress,
  collateralDenom,
  debtDenom,
  oraclePrice,
  referencePrice,
  valueSecured,
}: OracleAttributesProps) {
  const handleCopyAddress = () => {
    navigator.clipboard.writeText(oracleAddress);
  };

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

            {/* Trusted By - TODO: Not yet implemented */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Trusted by</span>
              <div className="flex items-center gap-1">
                {/* TODO: Replace with actual oracle provider icons */}
                <span className="text-sm text-muted-foreground">N/A</span>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            {/* Oracle Price */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Oracle price</span>
              <span className="text-sm font-medium">
                {oraclePrice !== undefined
                  ? `${collateralDenom} / ${debtDenom} = ${formatDisplayAmount(oraclePrice, 1)}`
                  : 'N/A'}
              </span>
            </div>

            {/* Reference Price */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">Reference price</span>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <span className="text-sm font-medium">
                {referencePrice !== undefined
                  ? `${collateralDenom} / ${debtDenom} = ${formatDisplayAmount(referencePrice, 2)}`
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
      </CardContent>
    </Card>
  );
}
