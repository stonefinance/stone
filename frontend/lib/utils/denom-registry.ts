/**
 * IBC Denom Registry
 * 
 * Maps IBC denom hashes to their underlying asset information.
 * This is needed because IBC denoms are opaque hashes that don't reveal
 * what asset they represent without a lookup table.
 */

export interface DenomInfo {
  /** Display symbol (e.g., "ATOM", "USDC") */
  symbol: string;
  /** Chain denom for Pyth lookup (e.g., "uatom", "uusdc") */
  chainDenom: string;
  /** Full name */
  name: string;
  /** Decimals (usually 6 for Cosmos assets) */
  decimals: number;
}

/**
 * Registry of known IBC denoms.
 * 
 * These are the IBC paths for tokens on Neutron.
 * Add new entries as markets are deployed with different assets.
 */
export const IBC_DENOM_REGISTRY: Record<string, DenomInfo> = {
  // ATOM on Neutron (from Cosmos Hub via IBC)
  'ibc/C4CFF46FD6DE35CA4CF4CE031E643C8FDC9BA4B99AE598E9B0ED98FE3A2319F9': {
    symbol: 'ATOM',
    chainDenom: 'uatom',
    name: 'Cosmos Hub ATOM',
    decimals: 6,
  },
  // USDC on Neutron (Noble USDC via IBC)
  'ibc/B559A80D62249C8AA07A380E2A2BEA6E5CA9A6F079C912C3A9E9B494105E4F81': {
    symbol: 'USDC',
    chainDenom: 'uusdc',
    name: 'Noble USDC',
    decimals: 6,
  },
  // NTRN (native Neutron token - not IBC but included for completeness)
  'untrn': {
    symbol: 'NTRN',
    chainDenom: 'untrn',
    name: 'Neutron',
    decimals: 6,
  },
  // OSMO on Neutron (from Osmosis via IBC)
  'ibc/376222D6D9DAE23092E29740E56B758580935A6D77C24C2ABD57A6A78A1F3955': {
    symbol: 'OSMO',
    chainDenom: 'uosmo',
    name: 'Osmosis',
    decimals: 6,
  },
  // Add more IBC denoms as needed...
};

/**
 * Native denom registry for non-IBC denoms.
 */
export const NATIVE_DENOM_REGISTRY: Record<string, DenomInfo> = {
  'uatom': {
    symbol: 'ATOM',
    chainDenom: 'uatom',
    name: 'Cosmos Hub ATOM',
    decimals: 6,
  },
  'uusdc': {
    symbol: 'USDC',
    chainDenom: 'uusdc',
    name: 'USD Coin',
    decimals: 6,
  },
  'uosmo': {
    symbol: 'OSMO',
    chainDenom: 'uosmo',
    name: 'Osmosis',
    decimals: 6,
  },
  'untrn': {
    symbol: 'NTRN',
    chainDenom: 'untrn',
    name: 'Neutron',
    decimals: 6,
  },
  'ustone': {
    symbol: 'STONE',
    chainDenom: 'ustone',
    name: 'Stone Token',
    decimals: 6,
  },
  // Local testnet denoms
  'stake': {
    symbol: 'STAKE',
    chainDenom: 'stake',
    name: 'Stake Token',
    decimals: 6,
  },
};

/**
 * Look up denom information from any denom string.
 * Handles IBC denoms, native denoms, and micro-prefixed denoms.
 */
export function getDenomInfo(denom: string): DenomInfo | undefined {
  // Check IBC registry first
  if (denom.startsWith('ibc/')) {
    return IBC_DENOM_REGISTRY[denom];
  }

  // Check native registry
  if (NATIVE_DENOM_REGISTRY[denom]) {
    return NATIVE_DENOM_REGISTRY[denom];
  }

  // Handle lowercase/uppercase variants
  const lower = denom.toLowerCase();
  if (NATIVE_DENOM_REGISTRY[lower]) {
    return NATIVE_DENOM_REGISTRY[lower];
  }

  // Try adding 'u' prefix for display names (e.g., "ATOM" -> "uatom")
  const withU = `u${lower}`;
  if (NATIVE_DENOM_REGISTRY[withU]) {
    return NATIVE_DENOM_REGISTRY[withU];
  }

  return undefined;
}

/**
 * Get the Pyth-compatible chain denom from any denom string.
 * Returns the chain denom that matches PYTH_FEED_IDS keys.
 */
export function getChainDenomFromRegistry(denom: string): string {
  const info = getDenomInfo(denom);
  if (info) {
    return info.chainDenom;
  }

  // Fallback: assume it's already a valid chain denom or convert from display
  const lower = denom.toLowerCase();
  return lower.startsWith('u') ? lower : `u${lower}`;
}

/**
 * Get the display symbol from any denom string.
 */
export function getDisplaySymbol(denom: string): string {
  const info = getDenomInfo(denom);
  if (info) {
    return info.symbol;
  }

  // Fallback: strip 'u' prefix and uppercase
  if (denom.startsWith('ibc/')) {
    return 'IBC'; // Unknown IBC denom
  }

  const lower = denom.toLowerCase();
  if (lower.startsWith('u')) {
    return lower.slice(1).toUpperCase();
  }
  return denom.toUpperCase();
}
