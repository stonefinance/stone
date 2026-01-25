'use client';

import { useMemo } from 'react';
import {
  useGetMarketSnapshotsQuery,
  GetMarketSnapshotsQuery,
} from '@/lib/graphql/generated/hooks';
import { microToBase } from '@/lib/utils/format';

export type TimeRange = '1w' | '1m' | '3m';

export interface ChartDataPoint {
  date: string;
  timestamp: number;
  totalSupply: number;
  totalDebt: number;
  totalCollateral: number;
  utilization: number;
  borrowRate: number;
  liquidityRate: number;
}

function getFromTime(range: TimeRange): Date {
  const now = new Date();
  switch (range) {
    case '1w':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '1m':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '3m':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  }
}

function transformSnapshots(
  snapshots: GetMarketSnapshotsQuery['marketSnapshots']
): ChartDataPoint[] {
  // Sort by timestamp ascending for chart display
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return sorted.map((snapshot) => {
    const timestamp = new Date(snapshot.timestamp).getTime();
    return {
      date: new Date(snapshot.timestamp).toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
      }),
      timestamp,
      totalSupply: parseFloat(microToBase(snapshot.totalSupply)),
      totalDebt: parseFloat(microToBase(snapshot.totalDebt)),
      totalCollateral: parseFloat(microToBase(snapshot.totalCollateral)),
      utilization: parseFloat(snapshot.utilization) * 100,
      borrowRate: parseFloat(snapshot.borrowRate) * 100,
      liquidityRate: parseFloat(snapshot.liquidityRate) * 100,
    };
  });
}

export function useMarketSnapshots(
  marketId: string | undefined,
  timeRange: TimeRange = '3m'
) {
  const fromTime = useMemo(() => getFromTime(timeRange), [timeRange]);

  const { data, loading, error, refetch } = useGetMarketSnapshotsQuery({
    variables: {
      marketId: marketId!,
      fromTime: fromTime.toISOString(),
      limit: 500, // Get enough data points for smooth chart
    },
    skip: !marketId,
  });

  const chartData = useMemo(() => {
    if (!data?.marketSnapshots) return [];
    return transformSnapshots(data.marketSnapshots);
  }, [data?.marketSnapshots]);

  // Check if we have enough data for a meaningful chart
  const hasData = chartData.length > 0;
  const hasEnoughData = chartData.length >= 2;

  return {
    data: chartData,
    hasData,
    hasEnoughData,
    isLoading: loading,
    error: error ? new Error(error.message) : undefined,
    refetch,
  };
}

export type ChartMetric = 'borrow' | 'supply' | 'liquidity';

export function getChartDataKey(metric: ChartMetric): keyof ChartDataPoint {
  switch (metric) {
    case 'borrow':
      return 'totalDebt';
    case 'supply':
      return 'totalSupply';
    case 'liquidity':
      return 'totalCollateral';
    default:
      return 'totalDebt';
  }
}

export function getChartLabel(metric: ChartMetric): string {
  switch (metric) {
    case 'borrow':
      return 'Total Borrow';
    case 'supply':
      return 'Total Supply';
    case 'liquidity':
      return 'Total Collateral';
    default:
      return 'Value';
  }
}
