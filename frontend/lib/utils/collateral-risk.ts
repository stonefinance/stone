import Decimal from 'decimal.js';

/**
 * Represents a single position in a market
 */
export interface Position {
  collateral: number; // Collateral amount in base units
  debt: number; // Debt amount in base units
}

/**
 * A single point on the collateral-at-risk chart
 */
export interface CollateralRiskPoint {
  priceDropPercent: number; // Negative value representing price drop (e.g., -50 for 50% drop)
  collateralAtRisk: number; // Total collateral that would be liquidatable at this price drop
}

/**
 * Calculate collateral at risk for different price drop scenarios.
 *
 * This determines how much collateral would become liquidatable if the
 * collateral price dropped by various percentages.
 *
 * @param positions - Array of positions with collateral and debt amounts
 * @param currentPrice - Current price of collateral asset
 * @param liquidationThreshold - LTV at which positions become liquidatable (as decimal, e.g., 0.86 for 86%)
 * @param priceDropPercentages - Array of price drop percentages to calculate (e.g., [-90, -80, -70, ..., 0])
 * @returns Array of collateral risk points
 */
export function calculateCollateralAtRisk(
  positions: Position[],
  currentPrice: number,
  liquidationThreshold: number,
  priceDropPercentages: number[] = generatePriceDropRange()
): CollateralRiskPoint[] {
  return priceDropPercentages.map((priceDrop) => {
    let totalAtRisk = new Decimal(0);

    // Calculate adjusted price after the drop
    const priceMultiplier = new Decimal(1).plus(new Decimal(priceDrop).div(100));
    const adjustedPrice = new Decimal(currentPrice).mul(priceMultiplier);

    for (const position of positions) {
      // Skip positions with no collateral or no debt
      if (position.collateral <= 0 || position.debt <= 0) {
        continue;
      }

      // Calculate collateral value at adjusted price
      const adjustedCollateralValue = new Decimal(position.collateral).mul(adjustedPrice);

      // Calculate LTV at adjusted price
      // LTV = debt / collateral_value
      const adjustedLtv = new Decimal(position.debt).div(adjustedCollateralValue);

      // If LTV exceeds liquidation threshold, this position is at risk
      if (adjustedLtv.gt(liquidationThreshold)) {
        totalAtRisk = totalAtRisk.plus(position.collateral);
      }
    }

    return {
      priceDropPercent: priceDrop,
      collateralAtRisk: totalAtRisk.toNumber(),
    };
  });
}

/**
 * Generate standard price drop range for the chart
 * From -90% to 0% in 5% increments
 */
export function generatePriceDropRange(
  minDrop: number = -90,
  maxDrop: number = 0,
  step: number = 5
): number[] {
  const range: number[] = [];
  for (let drop = minDrop; drop <= maxDrop; drop += step) {
    range.push(drop);
  }
  return range;
}

/**
 * Convert collateral at risk to USD value
 *
 * @param collateralRiskPoints - Points from calculateCollateralAtRisk
 * @param currentPrice - Current price of collateral asset
 * @returns Points with collateralAtRisk in USD
 */
export function convertCollateralRiskToUSD(
  collateralRiskPoints: CollateralRiskPoint[],
  currentPrice: number
): CollateralRiskPoint[] {
  return collateralRiskPoints.map((point) => ({
    priceDropPercent: point.priceDropPercent,
    collateralAtRisk: new Decimal(point.collateralAtRisk).mul(currentPrice).toNumber(),
  }));
}

/**
 * Calculate at what price drop a specific position would become liquidatable
 *
 * @param position - The position to analyze
 * @param currentPrice - Current price of collateral asset
 * @param liquidationThreshold - LTV at which position becomes liquidatable
 * @returns Price drop percentage at which the position becomes liquidatable (negative value), or null if already liquidatable or no debt
 */
export function calculateLiquidationPriceDropPercent(
  position: Position,
  currentPrice: number,
  liquidationThreshold: number
): number | null {
  if (position.collateral <= 0 || position.debt <= 0) {
    return null;
  }

  // Current LTV = debt / (collateral * price)
  const currentCollateralValue = new Decimal(position.collateral).mul(currentPrice);
  const currentLtv = new Decimal(position.debt).div(currentCollateralValue);

  // If already liquidatable
  if (currentLtv.gte(liquidationThreshold)) {
    return 0;
  }

  // Price at liquidation: debt / (collateral * liquidationThreshold)
  const liquidationPrice = new Decimal(position.debt).div(
    new Decimal(position.collateral).mul(liquidationThreshold)
  );

  // Price drop percent = ((liquidationPrice / currentPrice) - 1) * 100
  const priceDropPercent = liquidationPrice
    .div(currentPrice)
    .minus(1)
    .mul(100)
    .toNumber();

  return priceDropPercent;
}

/**
 * Aggregate positions for efficient risk calculation
 * Groups positions by their liquidation price drop threshold
 *
 * @param positions - Array of positions
 * @param currentPrice - Current collateral price
 * @param liquidationThreshold - Liquidation threshold (decimal)
 * @returns Map of price drop threshold to total collateral at that threshold
 */
export function aggregatePositionsByRiskLevel(
  positions: Position[],
  currentPrice: number,
  liquidationThreshold: number
): Map<number, number> {
  const riskLevels = new Map<number, number>();

  for (const position of positions) {
    const dropPercent = calculateLiquidationPriceDropPercent(
      position,
      currentPrice,
      liquidationThreshold
    );

    if (dropPercent === null) continue;

    // Round to nearest 5% for grouping
    const roundedDrop = Math.ceil(dropPercent / 5) * 5;

    const existing = riskLevels.get(roundedDrop) || 0;
    riskLevels.set(roundedDrop, existing + position.collateral);
  }

  return riskLevels;
}
