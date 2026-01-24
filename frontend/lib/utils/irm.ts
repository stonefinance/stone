import Decimal from 'decimal.js';

/**
 * Interest Rate Model (IRM) parameters
 */
export interface IRMParams {
  base_rate: string;
  slope_1: string;
  slope_2: string;
  optimal_utilization: string;
}

/**
 * A single point on the IRM curve
 */
export interface IRMCurvePoint {
  utilization: number; // 0-100 percentage
  rate: number; // 0-100 percentage
}

/**
 * Calculate the interest rate for a given utilization using the IRM parameters.
 *
 * Formula:
 * - If utilization <= optimal: rate = base_rate + (utilization / optimal) * slope_1
 * - If utilization > optimal: rate = base_rate + slope_1 + ((utilization - optimal) / (1 - optimal)) * slope_2
 *
 * @param utilization - Current utilization as a decimal (0-1)
 * @param irm - IRM parameters with decimal string values (e.g., "0.02" for 2%)
 * @returns Interest rate as a decimal (e.g., 0.05 for 5%)
 */
export function calculateRate(utilization: number, irm: IRMParams): number {
  const baseRate = new Decimal(irm.base_rate);
  const slope1 = new Decimal(irm.slope_1);
  const slope2 = new Decimal(irm.slope_2);
  const optimalUtilization = new Decimal(irm.optimal_utilization);
  const util = new Decimal(utilization);

  // Handle edge case where optimal utilization is 0
  if (optimalUtilization.isZero()) {
    // All utilization is "above optimal", use slope2 only
    return baseRate.plus(slope1).plus(util.mul(slope2)).toNumber();
  }

  if (util.lte(optimalUtilization)) {
    // rate = base_rate + (utilization / optimal_utilization) * slope_1
    return baseRate.plus(util.div(optimalUtilization).mul(slope1)).toNumber();
  } else {
    // rate = base_rate + slope_1 + ((utilization - optimal) / (1 - optimal)) * slope_2
    const denominator = new Decimal(1).minus(optimalUtilization);
    if (denominator.isZero()) {
      return baseRate.plus(slope1).toNumber();
    }
    return baseRate
      .plus(slope1)
      .plus(util.minus(optimalUtilization).div(denominator).mul(slope2))
      .toNumber();
  }
}

/**
 * Calculate the rate at target utilization (optimal utilization point)
 *
 * @param irm - IRM parameters
 * @returns Rate at target as a decimal
 */
export function calculateRateAtTarget(irm: IRMParams): number {
  const optimalUtilization = parseFloat(irm.optimal_utilization);
  return calculateRate(optimalUtilization, irm);
}

/**
 * Generate points for the IRM curve chart
 *
 * @param irm - IRM parameters
 * @param numPoints - Number of points to generate (default 101 for 0-100%)
 * @returns Array of curve points with utilization and rate as percentages
 */
export function generateIRMCurvePoints(
  irm: IRMParams,
  numPoints: number = 101
): IRMCurvePoint[] {
  const points: IRMCurvePoint[] = [];

  for (let i = 0; i < numPoints; i++) {
    const utilization = i / (numPoints - 1); // 0 to 1
    const rate = calculateRate(utilization, irm);

    points.push({
      utilization: utilization * 100, // Convert to percentage
      rate: rate * 100, // Convert to percentage
    });
  }

  return points;
}

/**
 * Calculate the borrow amount needed to reach target utilization
 *
 * @param currentUtilization - Current utilization as a decimal (0-1)
 * @param targetUtilization - Target utilization as a decimal (0-1)
 * @param totalSupply - Total supply amount (in base units)
 * @param price - Price per unit (in USD)
 * @returns Borrow amount to target in USD (positive = need to borrow more, negative = over target)
 */
export function calculateBorrowToTarget(
  currentUtilization: number,
  targetUtilization: number,
  totalSupply: number,
  price: number
): number {
  const utilizationDiff = new Decimal(targetUtilization).minus(currentUtilization);
  return utilizationDiff.mul(totalSupply).mul(price).toNumber();
}

/**
 * Parse IRM params from various formats that might come from the API
 *
 * @param rawIrm - Raw IRM data from API (could be nested or flat)
 * @returns Normalized IRM params
 */
export function parseIRMParams(rawIrm: Record<string, unknown>): IRMParams {
  // Handle nested "linear" format
  if (rawIrm.linear && typeof rawIrm.linear === 'object') {
    const linear = rawIrm.linear as Record<string, unknown>;
    return {
      base_rate: String(linear.base_rate ?? '0'),
      slope_1: String(linear.slope_1 ?? '0'),
      slope_2: String(linear.slope_2 ?? '0'),
      optimal_utilization: String(linear.optimal_utilization ?? '0.9'),
    };
  }

  // Handle flat format
  return {
    base_rate: String(rawIrm.base_rate ?? '0'),
    slope_1: String(rawIrm.slope_1 ?? '0'),
    slope_2: String(rawIrm.slope_2 ?? '0'),
    optimal_utilization: String(rawIrm.optimal_utilization ?? '0.9'),
  };
}
