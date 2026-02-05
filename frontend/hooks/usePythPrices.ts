'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PYTH_FEED_IDS, PYTH_STALENESS_THRESHOLD_SECONDS } from '@/lib/pyth/config';
import { fetchPythPrices, PythPrice } from '@/lib/pyth/client';

interface PythPricesState {
  /** denom → USD price */
  prices: Record<string, number>;
  isLoading: boolean;
  error: Error | null;
  lastUpdated: Date | null;
  /** denom → full PythPrice (includes confidence, publishTime, etc.) */
  rawPrices: Record<string, PythPrice>;
  /** True when any returned price has a publishTime older than PYTH_STALENESS_THRESHOLD_SECONDS */
  isStale: boolean;
}

/**
 * Check whether a Pyth price is stale (older than the configured threshold).
 */
function isPriceStale(publishTime: number): boolean {
  const ageSeconds = Math.floor(Date.now() / 1000) - publishTime;
  return ageSeconds > PYTH_STALENESS_THRESHOLD_SECONDS;
}

/**
 * React hook that fetches and auto-refreshes Pyth prices.
 *
 * @param denoms  Array of chain denoms (e.g. ['uatom', 'uusdc'])
 * @param refreshInterval  Milliseconds between refreshes (default 15 000)
 */
export function usePythPrices(
  denoms: string[],
  refreshInterval: number = 15000,
): PythPricesState {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [rawPrices, setRawPrices] = useState<Record<string, PythPrice>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState(false);

  // Use ref to track interval ID for cleanup
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  // Track if component is mounted to avoid state updates after unmount
  const isMountedRef = useRef(true);

  // Stabilise the denoms array so a new reference with identical contents
  // doesn't trigger a re-fetch cascade. Sort + join to create a stable key.
  const denomsKey = useMemo(() => [...denoms].sort().join(','), [denoms]);

  const stableDenoms = useMemo(
    () => denoms,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [denomsKey],
  );

  const fetchPrices = useCallback(async () => {
    // Filter to only denoms we have feed IDs for
    const validDenoms = stableDenoms.filter((denom) => PYTH_FEED_IDS[denom]);

    if (validDenoms.length === 0) {
      setPrices({});
      setRawPrices({});
      setIsStale(false);
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
      let anyStale = false;

      for (const denom of validDenoms) {
        const feedId = PYTH_FEED_IDS[denom];
        const priceData = pricesByFeedId.get(feedId);

        if (priceData) {
          pricesByDenom[denom] = priceData.price;
          rawPricesByDenom[denom] = priceData;
          if (isPriceStale(priceData.publishTime)) {
            anyStale = true;
          }
        }
      }

      setPrices(pricesByDenom);
      setRawPrices(rawPricesByDenom);
      setLastUpdated(new Date());
      setIsStale(anyStale);
      setError(null);
    } catch (err) {
      if (!isMountedRef.current) return;

      // Don't break the UI - keep previous prices if available
      setError(err instanceof Error ? err : new Error('Failed to fetch prices'));
      console.error('[usePythPrices] fetch error:', err);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [stableDenoms]);

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
    isStale,
  };
}

/**
 * React hook for fetching a single Pyth price.
 *
 * @param denom  Token denom to fetch price for (e.g. 'uatom')
 * @param refreshInterval  Interval in milliseconds between refreshes
 */
export function usePythPrice(
  denom: string | undefined,
  refreshInterval: number = 15000,
): Omit<PythPricesState, 'prices' | 'rawPrices'> & {
  price: number | null;
  rawPrice: PythPrice | null;
} {
  const denoms = useMemo(() => (denom ? [denom] : []), [denom]);
  const { prices, rawPrices, isLoading, error, lastUpdated, isStale } = usePythPrices(
    denoms,
    refreshInterval,
  );

  return {
    price: denom ? prices[denom] ?? null : null,
    rawPrice: denom ? rawPrices[denom] ?? null : null,
    isLoading,
    error,
    lastUpdated,
    isStale,
  };
}
