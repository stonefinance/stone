'use client';

import { useState, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { MarketCard } from '@/components/markets/MarketCard';
import { MarketsTable, MarketsTableSkeleton } from '@/components/markets/MarketsTable';
import { MarketsFilter } from '@/components/markets/MarketsFilter';
import { Card, CardContent } from '@/components/ui/card';
import { useMarketsWithPositions } from '@/hooks/useMarketsWithPositions';
import { useWallet } from '@/lib/cosmjs/wallet';
import { MarketFilter, SortConfig } from '@/types';

export default function MarketsPage() {
  const { isConnected } = useWallet();
  const { markets, positionsMap, isLoading, error } = useMarketsWithPositions();

  const [filter, setFilter] = useState<MarketFilter>('all');
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    column: 'totalSupplied',
    direction: 'desc',
  });

  // Calculate filter counts
  const filterCounts = useMemo(() => {
    let supplied = 0;
    let borrowed = 0;
    let collateral = 0;

    markets.forEach((market) => {
      const position = positionsMap.get(market.id);
      if (position) {
        if (parseFloat(position.supplyAmount) > 0) supplied++;
        if (parseFloat(position.debtAmount) > 0) borrowed++;
        if (parseFloat(position.collateralAmount) > 0) collateral++;
      }
    });

    return {
      all: markets.length,
      supplied,
      borrowed,
      collateral,
    };
  }, [markets, positionsMap]);

  // Filter markets based on active filter
  const filteredMarkets = useMemo(() => {
    if (!isConnected || filter === 'all') return markets;

    return markets.filter((market) => {
      const position = positionsMap.get(market.id);
      if (!position) return false;

      switch (filter) {
        case 'supplied':
          return parseFloat(position.supplyAmount) > 0;
        case 'borrowed':
          return parseFloat(position.debtAmount) > 0;
        case 'collateral':
          return parseFloat(position.collateralAmount) > 0;
        default:
          return true;
      }
    });
  }, [markets, positionsMap, filter, isConnected]);

  // Sort markets
  const sortedMarkets = useMemo(() => {
    const sorted = [...filteredMarkets];
    sorted.sort((a, b) => {
      let aVal: number;
      let bVal: number;

      switch (sortConfig.column) {
        case 'totalSupplied':
          aVal = parseFloat(a.totalSupplied);
          bVal = parseFloat(b.totalSupplied);
          break;
        case 'supplyApy':
          aVal = a.supplyApy;
          bVal = b.supplyApy;
          break;
        case 'borrowApy':
          aVal = a.borrowApy;
          bVal = b.borrowApy;
          break;
        case 'utilization':
          aVal = a.utilization;
          bVal = b.utilization;
          break;
        default:
          return 0;
      }

      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }, [filteredMarkets, sortConfig]);

  const handleSort = (column: string) => {
    setSortConfig((prev) => ({
      column,
      direction: prev.column === column && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  // Reset filter to 'all' when disconnecting
  const handleFilterChange = (newFilter: MarketFilter) => {
    if (!isConnected && newFilter !== 'all') return;
    setFilter(newFilter);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Markets</h1>
          <p className="text-muted-foreground">
            Supply assets to earn interest or borrow against your collateral
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="mb-6">
          <MarketsFilter
            activeFilter={filter}
            onFilterChange={handleFilterChange}
            counts={filterCounts}
            isConnected={isConnected}
          />
        </div>

        {/* Error State */}
        {error && (
          <div className="text-center py-12">
            <p className="text-destructive">Failed to load markets. Please try again.</p>
          </div>
        )}

        {/* Loading State - only show skeleton if we don't have cached data */}
        {isLoading && markets.length === 0 && (
          <>
            {/* Desktop Table Skeleton */}
            <div className="hidden lg:block">
              <Card>
                <CardContent className="p-0">
                  <MarketsTableSkeleton isConnected={isConnected} />
                </CardContent>
              </Card>
            </div>
            {/* Mobile Card Skeleton */}
            <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-64 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          </>
        )}

        {/* Empty State */}
        {!isLoading && !error && sortedMarkets.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {filter === 'all' ? 'No markets available yet.' : 'No markets match this filter.'}
            </p>
          </div>
        )}

        {/* Markets Display - show if we have data, even if still loading (background refresh) */}
        {!error && sortedMarkets.length > 0 && (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block">
              <Card>
                <CardContent className="p-0">
                  <MarketsTable
                    markets={sortedMarkets}
                    positionsMap={positionsMap}
                    isConnected={isConnected}
                    sortConfig={sortConfig}
                    onSort={handleSort}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Mobile/Tablet Cards */}
            <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-6">
              {sortedMarkets.map((market) => (
                <MarketCard key={market.id} market={market} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
