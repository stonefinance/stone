'use client';

import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TokenIcon } from '@/components/ui/token-icon';
import { Market, UserPosition, SortConfig } from '@/types';
import {
  formatDisplayAmount,
  formatPercentage,
  formatUSD,
  microToBase,
} from '@/lib/utils/format';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface MarketsTableProps {
  markets: Market[];
  positionsMap: Map<string, UserPosition>;
  isConnected: boolean;
  sortConfig: SortConfig;
  onSort: (column: string) => void;
  /** Pyth USD prices keyed by chain denom (e.g. 'uatom') */
  pythPrices?: Record<string, number>;
}

function SortIcon({ column, sortConfig }: { column: string; sortConfig: SortConfig }) {
  if (sortConfig.column !== column) {
    return <ChevronUp className="ml-1 h-3 w-3 opacity-30" />;
  }
  return sortConfig.direction === 'asc' ? (
    <ChevronUp className="ml-1 h-3 w-3" />
  ) : (
    <ChevronDown className="ml-1 h-3 w-3" />
  );
}

function SortableHeader({
  column,
  label,
  sortConfig,
  onSort,
  className = '',
}: {
  column: string;
  label: string;
  sortConfig: SortConfig;
  onSort: (column: string) => void;
  className?: string;
}) {
  return (
    <TableHead
      className={`cursor-pointer select-none hover:bg-muted/50 ${className}`}
      onClick={() => onSort(column)}
    >
      <div className="flex items-center justify-end">
        {label}
        <SortIcon column={column} sortConfig={sortConfig} />
      </div>
    </TableHead>
  );
}

function UtilizationBar({ utilization }: { utilization: number }) {
  const getBarColor = (util: number) => {
    if (util >= 90) return 'bg-red-500';
    if (util >= 70) return 'bg-yellow-500';
    return 'bg-blue-600';
  };

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full transition-all ${getBarColor(utilization)}`}
          style={{ width: `${Math.min(utilization, 100)}%` }}
        />
      </div>
      <span className="text-xs">{formatPercentage(utilization)}</span>
    </div>
  );
}

function TokenCell({ symbol }: { symbol: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <TokenIcon symbol={symbol} size="sm" />
      <span className="text-xs font-medium">{symbol}</span>
    </div>
  );
}

/** Map a display denom (e.g. "ATOM") back to the chain denom (e.g. "uatom"). */
function toChainDenom(displayDenom: string): string {
  const lower = displayDenom.toLowerCase();
  return lower.startsWith('u') ? lower : `u${lower}`;
}

export function MarketsTable({
  markets,
  positionsMap,
  isConnected,
  sortConfig,
  onSort,
  pythPrices = {},
}: MarketsTableProps) {
  const router = useRouter();

  const handleRowClick = (marketId: string) => {
    router.push(`/markets/${marketId}`);
  };

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="text-left">Collateral</TableHead>
          <TableHead className="text-left">Loan</TableHead>
          <TableHead className="text-right">Oracle Price</TableHead>
          <SortableHeader
            column="totalSupplied"
            label="Market Size"
            sortConfig={sortConfig}
            onSort={onSort}
          />
          <SortableHeader
            column="supplyApy"
            label="Supply APY"
            sortConfig={sortConfig}
            onSort={onSort}
          />
          <SortableHeader
            column="borrowApy"
            label="Borrow APY"
            sortConfig={sortConfig}
            onSort={onSort}
          />
          <SortableHeader
            column="utilization"
            label="Utilization"
            sortConfig={sortConfig}
            onSort={onSort}
          />
          <TableHead className="text-right">LTV</TableHead>
          {isConnected && (
            <>
              <TableHead className="text-right">Your Supplied</TableHead>
              <TableHead className="text-right">Your Borrowed</TableHead>
              <TableHead className="text-right">Your Collateral</TableHead>
            </>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {markets.map((market) => {
          const position = positionsMap.get(market.id);
          const hasSupply = position && parseFloat(position.supplyAmount) > 0;
          const hasDebt = position && parseFloat(position.debtAmount) > 0;
          const hasCollateral = position && parseFloat(position.collateralAmount) > 0;

          return (
            <TableRow
              key={market.id}
              className="cursor-pointer"
              onClick={() => handleRowClick(market.id)}
            >
              <TableCell>
                <TokenCell symbol={market.collateralDenom} />
              </TableCell>
              <TableCell>
                <TokenCell symbol={market.debtDenom} />
              </TableCell>
              <TableCell className="text-right">
                {(() => {
                  const colPrice = pythPrices[toChainDenom(market.collateralDenom)];
                  const debtPrice = pythPrices[toChainDenom(market.debtDenom)];
                  if (colPrice && debtPrice) {
                    return (
                      <span className="font-medium">
                        {formatDisplayAmount(colPrice / debtPrice, 4)}
                      </span>
                    );
                  }
                  return <span className="text-muted-foreground">--</span>;
                })()}
              </TableCell>
              <TableCell className="text-right">
                <div>
                  <span>{formatDisplayAmount(microToBase(market.totalSupplied), 0)} {market.debtDenom}</span>
                  {(() => {
                    const debtPrice = pythPrices[toChainDenom(market.debtDenom)];
                    if (debtPrice) {
                      const usdValue = parseFloat(microToBase(market.totalSupplied)) * debtPrice;
                      return (
                        <div className="text-xs text-muted-foreground">
                          {formatUSD(usdValue)}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              </TableCell>
              <TableCell className="text-right text-green-600 font-medium">
                {formatPercentage(market.supplyApy)}
              </TableCell>
              <TableCell className="text-right text-blue-600 font-medium">
                {formatPercentage(market.borrowApy)}
              </TableCell>
              <TableCell className="text-right">
                <UtilizationBar utilization={market.utilization} />
              </TableCell>
              <TableCell className="text-right">
                {formatPercentage(market.loanToValue)}
              </TableCell>
              {isConnected && (
                <>
                  <TableCell className="text-right">
                    {hasSupply ? (
                      <span>
                        {formatDisplayAmount(microToBase(position.supplyAmount))}{' '}
                        {market.debtDenom}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {hasDebt ? (
                      <span>
                        {formatDisplayAmount(microToBase(position.debtAmount))}{' '}
                        {market.debtDenom}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {hasCollateral ? (
                      <span>
                        {formatDisplayAmount(microToBase(position.collateralAmount))}{' '}
                        {market.collateralDenom}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </TableCell>
                </>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function MarketsTableSkeleton({ isConnected }: { isConnected: boolean }) {
  const columnCount = isConnected ? 11 : 8;

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Collateral</TableHead>
          <TableHead>Loan</TableHead>
          <TableHead className="text-right">Oracle Price</TableHead>
          <TableHead className="text-right">Market Size</TableHead>
          <TableHead className="text-right">Supply APY</TableHead>
          <TableHead className="text-right">Borrow APY</TableHead>
          <TableHead className="text-right">Utilization</TableHead>
          <TableHead className="text-right">LTV</TableHead>
          {isConnected && (
            <>
              <TableHead className="text-right">Your Supplied</TableHead>
              <TableHead className="text-right">Your Borrowed</TableHead>
              <TableHead className="text-right">Your Collateral</TableHead>
            </>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...Array(5)].map((_, i) => (
          <TableRow key={i}>
            {[...Array(columnCount)].map((_, j) => (
              <TableCell key={j}>
                <div className="h-4 bg-muted animate-pulse rounded w-20" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
