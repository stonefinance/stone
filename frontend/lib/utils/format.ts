import Decimal from 'decimal.js';

// Format token amount with proper decimals
export function formatTokenAmount(amount: string | number, decimals: number = 6): string {
  const value = new Decimal(amount).div(new Decimal(10).pow(decimals));
  return value.toFixed(decimals);
}

// Format to display with commas and limited decimals
export function formatDisplayAmount(amount: string | number, maxDecimals: number = 2): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (isNaN(value)) return '0.00';

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: Math.min(2, maxDecimals),
    maximumFractionDigits: maxDecimals,
  }).format(value);
}

// Format USD value
export function formatUSD(amount: string | number): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (isNaN(value)) return '$0.00';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// Format percentage
export function formatPercentage(value: string | number, decimals: number = 2): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(num)) return '0.00%';

  return `${num.toFixed(decimals)}%`;
}

// Format APY from decimal (e.g., "0.05" -> "5.00%")
export function formatAPY(decimalValue: string | number): string {
  const value = typeof decimalValue === 'string' ? parseFloat(decimalValue) : decimalValue;
  return formatPercentage(value * 100);
}

// Shorten address for display
export function shortenAddress(address: string, chars: number = 4): string {
  if (!address) return '';
  return `${address.slice(0, chars + 5)}...${address.slice(-chars)}`;
}

// Format denom to display name
export function formatDenom(denom: string): string {
  // Remove "u" prefix for micro denominations
  if (denom.startsWith('u')) {
    return denom.slice(1).toUpperCase();
  }

  // Handle IBC denoms
  if (denom.startsWith('ibc/')) {
    return 'IBC';
  }

  return denom.toUpperCase();
}

// Parse Decimal type from contract
export function parseDecimal(decimal: { value: string }): number {
  return parseFloat(decimal.value);
}

// Convert micro amount to base amount
export function microToBase(microAmount: string, decimals: number = 6): string {
  return new Decimal(microAmount).div(new Decimal(10).pow(decimals)).toString();
}

// Convert base amount to micro amount
export function baseToMicro(baseAmount: string, decimals: number = 6): string {
  return new Decimal(baseAmount).mul(new Decimal(10).pow(decimals)).floor().toString();
}

// Calculate health factor color
export function getHealthFactorColor(healthFactor?: number): string {
  if (healthFactor === null || healthFactor === undefined) return 'text-gray-500';
  if (!Number.isFinite(healthFactor)) return 'text-gray-500';
  if (healthFactor >= 2) return 'text-green-600';
  if (healthFactor >= 1.5) return 'text-yellow-600';
  if (healthFactor >= 1.2) return 'text-orange-600';
  return 'text-red-600';
}

// Get health factor status text
export function getHealthFactorStatus(healthFactor?: number): string {
  if (healthFactor === null || healthFactor === undefined) return 'No debt';
  if (!Number.isFinite(healthFactor)) return 'No debt';
  if (healthFactor >= 2) return 'Safe';
  if (healthFactor >= 1.5) return 'Moderate';
  if (healthFactor >= 1.2) return 'Risky';
  return 'Danger';
}

/**
 * Format a unix timestamp (seconds) to a human-readable relative string.
 * e.g. "just now", "3 mins ago", "2 hours ago", "1 day ago"
 */
export function formatRelativeTime(timestamp: number): string {
  const diff = Math.floor(Date.now() / 1000) - timestamp;

  if (diff < 60) return 'just now';
  if (diff < 3600) {
    const mins = Math.floor(diff / 60);
    return `${mins} min${mins > 1 ? 's' : ''} ago`;
  }
  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }
  const days = Math.floor(diff / 86400);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}
