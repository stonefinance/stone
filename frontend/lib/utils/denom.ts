/**
 * Convert a display denom (e.g. "ATOM", "USDC") to its on-chain
 * minimal denom (e.g. "uatom", "uusdc").
 *
 * If the denom already starts with 'u' (lowercase), it's returned as-is.
 */
export function getChainDenom(displayDenom: string): string {
  const lower = displayDenom.toLowerCase();
  return lower.startsWith('u') ? lower : `u${lower}`;
}
