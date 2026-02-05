// Pyth price feed configuration
// Maps token denoms to Pyth price feed IDs
// Feed IDs are the SHA-256 hashes of the price feed symbols (with 0x prefix)

// ── Pyth contract address & mode (canonical declarations) ────────────────────
export const PYTH_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_PYTH_CONTRACT_ADDRESS || '';
export const PYTH_MODE: 'mock' | 'live' = (process.env.NEXT_PUBLIC_PYTH_MODE as 'mock' | 'live') || 'mock';

// ── Fee configuration for Pyth price update messages ─────────────────────────
// The fee denom must match the chain's native fee denom.
// Local dev chain uses 'stake'; Neutron mainnet/testnet uses 'untrn'.
const isLocal = process.env.NEXT_PUBLIC_CHAIN_ID === 'stone-local-1' ||
                process.env.NEXT_PUBLIC_RPC_ENDPOINT?.includes('localhost');

export const PYTH_UPDATE_FEE_DENOM = process.env.NEXT_PUBLIC_PYTH_FEE_DENOM || (isLocal ? 'stake' : 'untrn');

// TODO: In production, query `get_update_fee` from the Pyth contract to get
// the real required fee amount. This constant is a safe default for development.
export const PYTH_UPDATE_FEE_AMOUNT = process.env.NEXT_PUBLIC_PYTH_FEE_AMOUNT || '1';

// ── Staleness threshold for Pyth prices ──────────────────────────────────────
// Prices older than this threshold are considered stale.
// For a lending protocol, stale oracle prices can lead to incorrect valuations.
export const PYTH_STALENESS_THRESHOLD_SECONDS = 300; // 5 minutes

export interface PythFeedConfig {
  feedId: string;
  symbol: string;
}

// Default Pyth feed mappings for common tokens
// These are the official Pyth mainnet feed IDs
export const DEFAULT_PYTH_FEEDS: Record<string, PythFeedConfig> = {
  // Major cryptocurrencies
  uatom: {
    feedId: '0xb00b60f88b03a6a625a8d1c048c3f66653edf217439983d037e7222c4e612819',
    symbol: 'ATOM/USD',
  },
  uosmo: {
    feedId: '0x586fcf70c50932d555abec091e531b9a6eb32fae96c1f5f3c8085e3a11c50d54',
    symbol: 'OSMO/USD',
  },
  ubtc: {
    feedId: '0xe62df6c8b4a85fe1f67ebb44feb416bcaed98b9c1f842210219059bd1e8adcbe',
    symbol: 'BTC/USD',
  },
  ueth: {
    feedId: '0xc96458d393fe9deb7a7d63a0ac41e2898a67a7750dbd1666734e73ca62885c10',
    symbol: 'ETH/USD',
  },
  usol: {
    feedId: '0xef0d8b6da4fd10e5626b7a6cc5b568ea55500dc6f006a7d515b6a6228e38e6d4',
    symbol: 'SOL/USD',
  },
  // NOTE: STONE does not yet have its own Pyth price feed.
  // We use the AKT/USD feed as a proxy — the prices are NOT identical.
  // Replace this with a real STONE feed when one becomes available.
  ustone: {
    feedId: '0x4ea5bb4d2f5900cc2e97ba534240950740b4d3b89fe712a94a7304fd2fd92702',
    symbol: 'STONE/USD',
  },
  untrn: {
    feedId: '0x3112c03a79fdbbdb9f39fb70d275a33a3801a1b3bc4b32a8fc76567df0a6dde7',
    symbol: 'NTRN/USD',
  },
  uusdc: {
    feedId: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
    symbol: 'USDC/USD',
  },
};

// Legacy exports for backward compatibility
export const PYTH_HERMES_URL = process.env.NEXT_PUBLIC_PYTH_HERMES_URL || 'https://hermes.pyth.network';

export const PYTH_FEED_IDS: Record<string, string> = Object.entries(DEFAULT_PYTH_FEEDS).reduce(
  (acc, [denom, config]) => {
    // Remove 0x prefix for legacy format
    acc[denom] = config.feedId.replace(/^0x/, '');
    return acc;
  },
  {} as Record<string, string>,
);

// Reverse mapping for looking up denom by feed ID
export const PYTH_FEED_ID_TO_DENOM: Record<string, string> = Object.entries(DEFAULT_PYTH_FEEDS).reduce(
  (acc, [denom, config]) => {
    acc[config.feedId.replace(/^0x/, '')] = denom;
    return acc;
  },
  {} as Record<string, string>,
);

// Pyth Hermes API endpoints
export const PYTH_HERMES_URLS = {
  mainnet: 'https://hermes.pyth.network',
  testnet: 'https://hermes-beta.pyth.network',
  // Local development can use a mock or the testnet endpoint
  local: process.env.NEXT_PUBLIC_PYTH_HERMES_URL || 'https://hermes-beta.pyth.network',
};

/**
 * Get the appropriate Hermes URL based on the chain environment
 */
export function getHermesUrl(): string {
  const chainId = process.env.NEXT_PUBLIC_CHAIN_ID || '';

  if (chainId.includes('local') || chainId.includes('dev')) {
    return PYTH_HERMES_URLS.local;
  }

  if (chainId.includes('testnet') || chainId.includes('osmo-test')) {
    return PYTH_HERMES_URLS.testnet;
  }

  return PYTH_HERMES_URLS.mainnet;
}

/**
 * Get Pyth feed ID for a denom
 * Returns undefined if no feed is configured for the denom
 */
export function getFeedIdForDenom(denom: string): string | undefined {
  const feed = DEFAULT_PYTH_FEEDS[denom];
  return feed?.feedId || undefined;
}

/**
 * Get all unique feed IDs for a list of denoms
 * Filters out denoms that don't have feed IDs configured
 */
export function getFeedIdsForDenoms(denoms: string[]): string[] {
  const feedIds = denoms
    .map(getFeedIdForDenom)
    .filter((id): id is string => id !== undefined && id.length > 0);

  // Remove duplicates
  return [...new Set(feedIds)];
}
