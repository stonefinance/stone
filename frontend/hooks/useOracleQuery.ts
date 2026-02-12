'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { RPC_ENDPOINT } from '@/lib/constants';

// Oracle contract query messages
interface OracleConfigQuery {
  config: Record<string, never>;
}

interface OracleAllPriceFeedsQuery {
  all_price_feeds: Record<string, never>;
}

interface OraclePriceQuery {
  price: {
    denom: string;
  };
}

// Oracle contract response types
export interface OracleConfig {
  owner: string;
  pyth_contract_addr: string;
  max_confidence_ratio: string;
}

export interface OraclePriceFeed {
  denom: string;
  feed_id: string;
}

export interface OraclePrice {
  denom: string;
  price: string;
  updated_at: number;
}

// Error types for oracle queries
export interface OraclePriceError {
  denom: string;
  error: string;
}

// Combined oracle state for a single oracle contract
export interface OracleState {
  address: string;
  config: OracleConfig | null;
  configError: string | null;
  priceFeeds: OraclePriceFeed[];
  priceFeedsError: string | null;
  prices: Map<string, OraclePrice>;
  priceErrors: Map<string, string>;
  isLoading: boolean;
  lastUpdated: Date | null;
}

// Staleness thresholds in seconds
export const STALENESS_FRESH_THRESHOLD = 60; // 60s - definitely fresh
export const STALENESS_WARNING_THRESHOLD = 180; // 3 min - warning
export const STALENESS_STALE_THRESHOLD = 300; // 5 min - stale

export type PriceStatus = 'fresh' | 'warning' | 'stale' | 'error' | 'loading';

export function getPriceStatus(updatedAt: number | null, hasError: boolean): PriceStatus {
  if (hasError) return 'error';
  if (updatedAt === null) return 'loading';
  
  const now = Math.floor(Date.now() / 1000);
  const age = now - updatedAt;
  
  if (age <= STALENESS_FRESH_THRESHOLD) return 'fresh';
  if (age <= STALENESS_WARNING_THRESHOLD) return 'warning';
  return 'stale';
}

export function getStatusEmoji(status: PriceStatus): string {
  switch (status) {
    case 'fresh': return '🟢';
    case 'warning': return '🟡';
    case 'stale': return '🔴';
    case 'error': return '❌';
    case 'loading': return '⏳';
  }
}

// Parse contract error messages
function parseContractError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message;
    
    // Extract the contract error from the full message
    // Common patterns: "ConfidenceTooHigh", "PriceFeedNotConfigured", etc.
    const contractErrorMatch = msg.match(/error executing.*?:(.*?)(?:$|query wasm)/i);
    if (contractErrorMatch) {
      return contractErrorMatch[1].trim();
    }
    
    // Look for specific error types
    if (msg.includes('ConfidenceTooHigh')) return 'ConfidenceTooHigh';
    if (msg.includes('PriceFeedNotConfigured')) return 'PriceFeedNotConfigured';
    if (msg.includes('PriceStale')) return 'PriceStale';
    if (msg.includes('not found')) return 'PriceFeedNotConfigured';
    
    // Return the full message if we can't extract a specific error
    return msg.length > 100 ? msg.substring(0, 100) + '...' : msg;
  }
  return 'Unknown error';
}

// Async function to query a single oracle (not a hook)
async function queryOracleContract(
  client: CosmWasmClient,
  oracleAddress: string,
  denoms: string[]
): Promise<OracleState> {
  const oracleState: OracleState = {
    address: oracleAddress,
    config: null,
    configError: null,
    priceFeeds: [],
    priceFeedsError: null,
    prices: new Map(),
    priceErrors: new Map(),
    isLoading: false,
    lastUpdated: new Date(),
  };

  // Query config
  try {
    const configQuery: OracleConfigQuery = { config: {} };
    oracleState.config = await client.queryContractSmart(oracleAddress, configQuery);
  } catch (e) {
    oracleState.configError = parseContractError(e);
  }

  // Query all price feeds
  try {
    const feedsQuery: OracleAllPriceFeedsQuery = { all_price_feeds: {} };
    oracleState.priceFeeds = await client.queryContractSmart(oracleAddress, feedsQuery);
  } catch (e) {
    oracleState.priceFeedsError = parseContractError(e);
  }

  // Query prices for each denom
  const uniqueDenoms = [...new Set(denoms)];
  await Promise.all(
    uniqueDenoms.map(async (denom) => {
      try {
        const priceQuery: OraclePriceQuery = { price: { denom } };
        const price: OraclePrice = await client.queryContractSmart(oracleAddress, priceQuery);
        oracleState.prices.set(denom, price);
      } catch (e) {
        oracleState.priceErrors.set(denom, parseContractError(e));
      }
    })
  );

  return oracleState;
}

// Single oracle query hook
export function useOracleQuery(
  oracleAddress: string | undefined,
  denoms: string[],
  refreshInterval: number = 10000
): OracleState {
  const [state, setState] = useState<OracleState>({
    address: oracleAddress || '',
    config: null,
    configError: null,
    priceFeeds: [],
    priceFeedsError: null,
    prices: new Map(),
    priceErrors: new Map(),
    isLoading: true,
    lastUpdated: null,
  });

  // Use ref to track if we're mounted to avoid state updates on unmounted component
  const isMountedRef = useRef(true);

  const queryOracle = useCallback(async () => {
    if (!oracleAddress) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        configError: 'No oracle address provided',
      }));
      return;
    }

    try {
      const client = await CosmWasmClient.connect(RPC_ENDPOINT);
      const result = await queryOracleContract(client, oracleAddress, denoms);
      
      if (isMountedRef.current) {
        setState(result);
      }
    } catch (e) {
      if (isMountedRef.current) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          configError: parseContractError(e),
        }));
      }
    }
  }, [oracleAddress, denoms]);

  // Initial query and refresh interval
  useEffect(() => {
    isMountedRef.current = true;
    
    // Initial query
    queryOracle();

    // Set up refresh interval
    let interval: NodeJS.Timeout | undefined;
    if (refreshInterval > 0) {
      interval = setInterval(queryOracle, refreshInterval);
    }

    return () => {
      isMountedRef.current = false;
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [queryOracle, refreshInterval]);

  return state;
}

// Hook for querying multiple oracles
export interface MultiOracleState {
  oracles: Map<string, OracleState>;
  isLoading: boolean;
  lastUpdated: Date | null;
}

export function useMultipleOracleQueries(
  oracleConfigs: Array<{ address: string; denoms: string[] }>,
  refreshInterval: number = 10000
): MultiOracleState {
  const [state, setState] = useState<MultiOracleState>({
    oracles: new Map(),
    isLoading: true,
    lastUpdated: null,
  });

  // Use ref to track if we're mounted
  const isMountedRef = useRef(true);
  
  // Serialize oracleConfigs to use as dependency
  const configsKey = JSON.stringify(
    oracleConfigs.map(c => ({ address: c.address, denoms: c.denoms.sort() }))
  );

  useEffect(() => {
    isMountedRef.current = true;
    
    const queryAllOracles = async () => {
      if (oracleConfigs.length === 0) {
        if (isMountedRef.current) {
          setState({
            oracles: new Map(),
            isLoading: false,
            lastUpdated: new Date(),
          });
        }
        return;
      }

      try {
        const client = await CosmWasmClient.connect(RPC_ENDPOINT);
        const oracles = new Map<string, OracleState>();

        // Deduplicate by oracle address
        const uniqueOracles = new Map<string, string[]>();
        for (const config of oracleConfigs) {
          const existing = uniqueOracles.get(config.address) || [];
          uniqueOracles.set(config.address, [...new Set([...existing, ...config.denoms])]);
        }

        await Promise.all(
          Array.from(uniqueOracles.entries()).map(async ([address, denoms]) => {
            const oracleState = await queryOracleContract(client, address, denoms);
            oracles.set(address, oracleState);
          })
        );

        if (isMountedRef.current) {
          setState({
            oracles,
            isLoading: false,
            lastUpdated: new Date(),
          });
        }
      } catch (e) {
        console.error('Failed to query oracles:', e);
        if (isMountedRef.current) {
          setState(prev => ({
            ...prev,
            isLoading: false,
          }));
        }
      }
    };

    // Initial query
    queryAllOracles();

    // Set up refresh interval
    let interval: NodeJS.Timeout | undefined;
    if (refreshInterval > 0) {
      interval = setInterval(queryAllOracles, refreshInterval);
    }

    return () => {
      isMountedRef.current = false;
      if (interval) {
        clearInterval(interval);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configsKey, refreshInterval]);

  return state;
}
