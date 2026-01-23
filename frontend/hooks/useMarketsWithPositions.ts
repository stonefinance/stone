'use client';

import { useMemo } from 'react';
import { useMarkets } from './useMarkets';
import { useUserPositions } from './useUserPosition';
import { useWallet } from '@/lib/cosmjs/wallet';
import { Market, UserPosition } from '@/types';

export interface UseMarketsWithPositionsResult {
  markets: Market[];
  positionsMap: Map<string, UserPosition>;
  isLoading: boolean;
  isLoadingPositions: boolean;
  error: Error | undefined;
}

/**
 * Combined hook that fetches all markets and user positions together.
 * Returns a Map for O(1) position lookups by marketId.
 */
export function useMarketsWithPositions(): UseMarketsWithPositionsResult {
  const { isConnected } = useWallet();
  const { data: markets, isLoading: marketsLoading, error: marketsError } = useMarkets();
  const { data: positions, isLoading: positionsLoading } = useUserPositions();

  const positionsMap = useMemo(() => {
    const map = new Map<string, UserPosition>();
    if (positions) {
      positions.forEach((p) => map.set(p.marketId, p));
    }
    return map;
  }, [positions]);

  return {
    markets: markets ?? [],
    positionsMap,
    isLoading: marketsLoading,
    isLoadingPositions: isConnected && positionsLoading,
    error: marketsError,
  };
}
