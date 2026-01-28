import { UserPosition, PositionType } from '@/types';

/**
 * Dust threshold for position detection
 * 100 micro units = 0.0001 base units
 * Amounts below this are treated as zero to handle rounding dust
 */
const DUST_THRESHOLD = 100;

/**
 * Determines the user's position type based on their collateral, supply, and debt amounts
 * 
 * @param position - User position data from GraphQL, or null if no position
 * @returns PositionType - One of 'none', 'supply', 'borrow', or 'both'
 * 
 * Position type logic:
 * - 'none': No position in this market
 * - 'supply': Has supplied tokens but no collateral or debt
 * - 'borrow': Has collateral and/or debt but no supply
 * - 'both': Has both supply AND borrow position (edge case)
 */
export function getPositionType(position: UserPosition | null): PositionType {
  if (!position) return 'none';

  const hasCollateral = parseInt(position.collateralAmount) > DUST_THRESHOLD;
  const hasDebt = parseInt(position.debtAmount) > DUST_THRESHOLD;
  const hasSupply = parseInt(position.supplyAmount) > DUST_THRESHOLD;

  // Borrow position = has collateral AND/OR debt
  const isBorrower = hasCollateral || hasDebt;
  // Supply position = has supplied tokens
  const isSupplier = hasSupply;

  if (isBorrower && isSupplier) return 'both';
  if (isBorrower) return 'borrow';
  if (isSupplier) return 'supply';
  return 'none';
}

/**
 * Check if user has active debt (above dust threshold)
 * Used to determine if supply actions should be blocked
 */
export function hasActiveDebt(position: UserPosition | null): boolean {
  if (!position) return false;
  return parseInt(position.debtAmount) > DUST_THRESHOLD;
}
