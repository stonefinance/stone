'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { PYTH_FEED_IDS } from '@/lib/pyth/config';
import { fetchPythPrices, PythPrice } from '@/lib/pyth/client';

interface PythPricesState {
  prices: Record<string, number>;  // denom -> USD price
  isLoading: boolean;
  error: Error | null;
  lastUpdated: Date | null;
  rawPrices: Record<string, PythPrice>; // denom -> full PythPrice
}

/**
 * React hook for fetching and auto-refreshing Pyth prices
 * @param denoms Array of token denoms to fetch prices for (e.g., ['uatom', 'uusdc'])
 * @param refreshInterval Interval in milliseconds between refreshes (default: 15000 = 15s)
 * @returns Object with prices, loading state, error, and last updated timestamp
 */
export function usePythPrices(
  denoms: string[],
  refreshInterval: number = 15000
): PythPricesState {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [rawPrices, setRawPrices] = useState<Record<string, PythPrice>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  // Use ref to track interval ID for cleanup
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  // Track if component is mounted to avoid state updates after unmount
  const isMountedRef = useRef(true);

  const fetchPrices = useCallback(async () => {
    // Filter to only denoms we have feed IDs for
    const validDenoms = denoms.filter((denom) => PYTH_FEED_IDS[denom]);
    
    if (validDenoms.length === 0) {
      setPrices({});
      setRawPrices({});
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const feedIds = validDenoms.map((denom) => PYTH_FEED_IDS[denom]);
      const pricesByFeedId = await fetchPythPrices(feedIds);

      if (!isMountedRef.current) return;

      // Convert feed IDs back to denoms
      const pricesByDenom: Record<string, number> = {};
      const rawPricesByDenom: Record<string, PythPrice> = {};

      for (const denom of validDenoms) {
        const feedId = PYTH_FEED_IDS[denom];
        const priceData = pricesByFeedId.get(feedId);
        
        if (priceData) {
          pricesByDenom[denom] = priceData.price;
          rawPricesByDenom[denom] = priceData;
        }
      }

      setPrices(pricesByDenom);
      setRawPrices(rawPricesByDenom);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      if (!isMountedRef.current) return;
      
      // Don't break the UI - keep previous prices if available
      setError(err instanceof Error ? err : new Error('Failed to fetch prices'));
      console.error('Pyth price fetch error:', err);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [denoms]);

  useEffect(() => {
    // Reset mounted ref when dependencies change
    isMountedRef.current = true;

    // Fetch immediately on mount or when denoms change
    fetchPrices();

    // Set up interval for auto-refresh
    if (refreshInterval > 0) {
      intervalRef.current = setInterval(fetchPrices, refreshInterval);
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchPrices, refreshInterval]);

  return {
    prices,
    isLoading,
    error,
    lastUpdated,
    rawPrices,
  };
}

/**
 * React hook for fetching a single Pyth price
 * @param denom Token denom to fetch price for (e.g., 'uatom')
 * @param refreshInterval Interval in milliseconds between refreshes
 * @returns Object with price, loading state, error, and last updated timestamp
 */
export function usePythPrice(
  denom: string | undefined,
  refreshInterval: number = 15000
): Omit<PythPricesState, 'prices' | 'rawPrices'> & { 
  price: number | null; 
  rawPrice: PythPrice | null;
} {
  const denoms = denom ? [denom] : [];
  const { prices, rawPrices, isLoading, error, lastUpdated } = usePythPrices(
    denoms,
    refreshInterval
  );

  return {
    price: denom ? prices[denom] ?? null : null,
    rawPrice: denom ? rawPrices[denom] ?? null : null,
    isLoading,
    error,
    lastUpdated,
  };
}
