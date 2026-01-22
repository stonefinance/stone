import Decimal from 'decimal.js';

// Default decimals for token amounts (6 for most Cosmos tokens)
const DEFAULT_DECIMALS = 6;

/**
 * Format a number as USD currency
 */
export function formatUSD(value: number | string, decimals = 2): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(num)) {
    return '$0.00';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

/**
 * Format a number as a percentage
 */
export function formatPercentage(value: number | string, decimals = 2): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(num)) {
    return '0.00%';
  }

  return `${num.toFixed(decimals)}%`;
}

/**
 * Format a number for display with optional decimal places
 */
export function formatDisplayAmount(
  value: number | string,
  decimals = 2
): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(num)) {
    return '0.00';
  }

  // For large numbers, use compact notation
  if (Math.abs(num) >= 1_000_000) {
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num);
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

/**
 * Convert micro amount (smallest unit) to base amount
 * e.g., 1000000 uosmo -> 1 OSMO
 */
export function microToBase(
  microAmount: string | number,
  decimals = DEFAULT_DECIMALS
): string {
  try {
    const amount = new Decimal(microAmount.toString());
    const divisor = new Decimal(10).pow(decimals);
    return amount.div(divisor).toString();
  } catch {
    return '0';
  }
}

/**
 * Convert base amount to micro amount (smallest unit)
 * e.g., 1 OSMO -> 1000000 uosmo
 */
export function baseToMicro(
  baseAmount: string | number,
  decimals = DEFAULT_DECIMALS
): string {
  try {
    const amount = new Decimal(baseAmount.toString());
    const multiplier = new Decimal(10).pow(decimals);
    return amount.mul(multiplier).toFixed(0);
  } catch {
    return '0';
  }
}

/**
 * Parse a decimal string from the contract (Decimal type)
 * Contract decimals are typically 18 decimal places as strings like "0.123456789012345678"
 */
export function parseDecimal(decimalStr: string | undefined | null): number {
  if (!decimalStr) {
    return 0;
  }

  try {
    return parseFloat(decimalStr);
  } catch {
    return 0;
  }
}

/**
 * Format a denom string for display
 * e.g., "uosmo" -> "OSMO", "ibc/ABC123..." -> "IBC/ABC..."
 */
export function formatDenom(denom: string): string {
  if (!denom) {
    return '';
  }

  // Remove 'u' prefix for micro denominations
  if (denom.startsWith('u') && denom.length > 1) {
    return denom.slice(1).toUpperCase();
  }

  // Handle IBC denoms
  if (denom.startsWith('ibc/')) {
    const hash = denom.slice(4);
    if (hash.length > 8) {
      return `IBC/${hash.slice(0, 4)}...${hash.slice(-4)}`;
    }
    return denom.toUpperCase();
  }

  // Handle factory denoms
  if (denom.startsWith('factory/')) {
    const parts = denom.split('/');
    const tokenName = parts[parts.length - 1];
    return tokenName.toUpperCase();
  }

  return denom.toUpperCase();
}

/**
 * Shorten an address for display
 * e.g., "osmo1abc...xyz"
 */
export function shortenAddress(address: string, prefixLength = 6, suffixLength = 4): string {
  if (!address) {
    return '';
  }

  if (address.length <= prefixLength + suffixLength + 3) {
    return address;
  }

  return `${address.slice(0, prefixLength)}...${address.slice(-suffixLength)}`;
}

/**
 * Get color class for health factor
 */
export function getHealthFactorColor(healthFactor: number | undefined): string {
  if (healthFactor === undefined) {
    return 'text-muted-foreground';
  }

  if (healthFactor >= 2) {
    return 'text-green-600';
  }
  if (healthFactor >= 1.5) {
    return 'text-yellow-600';
  }
  if (healthFactor >= 1.2) {
    return 'text-orange-600';
  }
  return 'text-red-600';
}

/**
 * Get status text for health factor
 */
export function getHealthFactorStatus(healthFactor: number | undefined): string {
  if (healthFactor === undefined) {
    return 'No Position';
  }

  if (healthFactor >= 2) {
    return 'Healthy';
  }
  if (healthFactor >= 1.5) {
    return 'Moderate';
  }
  if (healthFactor >= 1.2) {
    return 'At Risk';
  }
  if (healthFactor >= 1) {
    return 'Danger';
  }
  return 'Liquidatable';
}
