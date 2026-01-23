'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MarketFilter } from '@/types';

interface FilterCounts {
  all: number;
  supplied: number;
  borrowed: number;
  collateral: number;
}

interface MarketsFilterProps {
  activeFilter: MarketFilter;
  onFilterChange: (filter: MarketFilter) => void;
  counts: FilterCounts;
  isConnected: boolean;
}

export function MarketsFilter({
  activeFilter,
  onFilterChange,
  counts,
  isConnected,
}: MarketsFilterProps) {
  return (
    <Tabs value={activeFilter} onValueChange={(v) => onFilterChange(v as MarketFilter)}>
      <TabsList>
        <TabsTrigger value="all">
          All
          <span className="ml-1.5 text-xs text-muted-foreground">({counts.all})</span>
        </TabsTrigger>
        {isConnected && (
          <>
            <TabsTrigger value="supplied">
              Supplied
              {counts.supplied > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">({counts.supplied})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="borrowed">
              Borrowed
              {counts.borrowed > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">({counts.borrowed})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="collateral">
              Collateral
              {counts.collateral > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">({counts.collateral})</span>
              )}
            </TabsTrigger>
          </>
        )}
      </TabsList>
    </Tabs>
  );
}
