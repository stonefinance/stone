import { getChainDenomFromRegistry } from './denom-registry';

/**
 * Convert a display denom (e.g. "ATOM", "USDC") to its on-chain
 * minimal denom (e.g. "uatom", "uusdc").
 *
 * Also handles IBC denoms by looking them up in the registry.
 * If the denom already starts with 'u' (lowercase), it's returned as-is.
 */
export function getChainDenom(displayDenom: string): string {
  // Use registry lookup which handles IBC denoms, display names, and native denoms
  return getChainDenomFromRegistry(displayDenom);
}
