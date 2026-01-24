import { describe, it, expect } from 'vitest';
import {
  calculateCollateralAtRisk,
  generatePriceDropRange,
  convertCollateralRiskToUSD,
  calculateLiquidationPriceDropPercent,
  aggregatePositionsByRiskLevel,
  Position,
} from './collateral-risk';

describe('Collateral Risk Calculations', () => {
  describe('generatePriceDropRange', () => {
    it('generates default range from -90 to 0', () => {
      const range = generatePriceDropRange();
      expect(range[0]).toBe(-90);
      expect(range[range.length - 1]).toBe(0);
    });

    it('generates correct number of steps', () => {
      const range = generatePriceDropRange(-90, 0, 5);
      // -90, -85, -80, ..., -5, 0 = 19 values
      expect(range).toHaveLength(19);
    });

    it('handles custom ranges', () => {
      const range = generatePriceDropRange(-50, -10, 10);
      expect(range).toEqual([-50, -40, -30, -20, -10]);
    });
  });

  describe('calculateCollateralAtRisk', () => {
    // Test scenario: 86% liquidation threshold (LLTV)
    const liquidationThreshold = 0.86;
    const currentPrice = 89539.3; // cbBTC price in USDC

    it('returns 0 collateral at risk when no positions exist', () => {
      const result = calculateCollateralAtRisk([], currentPrice, liquidationThreshold);
      expect(result.every((point) => point.collateralAtRisk === 0)).toBe(true);
    });

    it('returns 0 collateral at risk at 0% price drop for healthy positions', () => {
      // Position with 1 cbBTC collateral, 50,000 USDC debt
      // Current LTV = 50000 / (1 * 89539.3) = 0.558 = 55.8% (healthy)
      const positions: Position[] = [{ collateral: 1, debt: 50000 }];

      const result = calculateCollateralAtRisk(
        positions,
        currentPrice,
        liquidationThreshold,
        [0]
      );

      expect(result[0].collateralAtRisk).toBe(0);
    });

    it('identifies position at risk after price drop', () => {
      // Position with 1 cbBTC collateral, 70,000 USDC debt
      // Current LTV = 70000 / 89539.3 = 78.2%
      // At -20% price: LTV = 70000 / (89539.3 * 0.8) = 70000 / 71631.4 = 97.7% > 86%
      const positions: Position[] = [{ collateral: 1, debt: 70000 }];

      const result = calculateCollateralAtRisk(
        positions,
        currentPrice,
        liquidationThreshold,
        [-20, 0]
      );

      // At 0% drop, position is healthy (78.2% < 86%)
      expect(result[1].collateralAtRisk).toBe(0);

      // At -20% drop, position is liquidatable (97.7% > 86%)
      expect(result[0].collateralAtRisk).toBe(1);
    });

    it('accumulates multiple positions at risk', () => {
      // Two positions that become liquidatable at -30% drop
      const positions: Position[] = [
        { collateral: 1, debt: 60000 }, // LTV at -30% = 60000/(89539.3*0.7) = 95.7%
        { collateral: 2, debt: 120000 }, // LTV at -30% = 120000/(2*89539.3*0.7) = 95.7%
      ];

      const result = calculateCollateralAtRisk(
        positions,
        currentPrice,
        liquidationThreshold,
        [-30]
      );

      // Both positions (total 3 cbBTC) should be at risk
      expect(result[0].collateralAtRisk).toBe(3);
    });

    it('ignores positions with no collateral', () => {
      const positions: Position[] = [
        { collateral: 0, debt: 10000 },
        { collateral: 1, debt: 80000 },
      ];

      const result = calculateCollateralAtRisk(
        positions,
        currentPrice,
        liquidationThreshold,
        [-10]
      );

      // Only the valid position should be considered
      // LTV at -10% = 80000/(1*89539.3*0.9) = 99.3% > 86%
      expect(result[0].collateralAtRisk).toBe(1);
    });

    it('ignores positions with no debt', () => {
      const positions: Position[] = [
        { collateral: 1, debt: 0 },
        { collateral: 1, debt: 80000 },
      ];

      const result = calculateCollateralAtRisk(
        positions,
        currentPrice,
        liquidationThreshold,
        [-10]
      );

      // Only the position with debt should be considered
      expect(result[0].collateralAtRisk).toBe(1);
    });

    it('shows cumulative risk as price drops more', () => {
      // Multiple positions with different risk levels
      const positions: Position[] = [
        { collateral: 1, debt: 76000 }, // Becomes risky at small drop
        { collateral: 1, debt: 60000 }, // Needs bigger drop
        { collateral: 1, debt: 40000 }, // Very healthy, needs large drop
      ];

      const result = calculateCollateralAtRisk(
        positions,
        currentPrice,
        liquidationThreshold,
        [-60, -40, -20, 0]
      );

      // Risk should generally increase (or stay same) as price drops more
      const riskAt0 = result.find((r) => r.priceDropPercent === 0)!.collateralAtRisk;
      const riskAt20 = result.find((r) => r.priceDropPercent === -20)!.collateralAtRisk;
      const riskAt40 = result.find((r) => r.priceDropPercent === -40)!.collateralAtRisk;
      const riskAt60 = result.find((r) => r.priceDropPercent === -60)!.collateralAtRisk;

      expect(riskAt0).toBeLessThanOrEqual(riskAt20);
      expect(riskAt20).toBeLessThanOrEqual(riskAt40);
      expect(riskAt40).toBeLessThanOrEqual(riskAt60);
    });
  });

  describe('convertCollateralRiskToUSD', () => {
    it('converts collateral amounts to USD values', () => {
      const points = [
        { priceDropPercent: -50, collateralAtRisk: 10 },
        { priceDropPercent: 0, collateralAtRisk: 2 },
      ];
      const price = 89539.3;

      const result = convertCollateralRiskToUSD(points, price);

      expect(result[0].collateralAtRisk).toBeCloseTo(895393, 0);
      expect(result[1].collateralAtRisk).toBeCloseTo(179078.6, 0);
    });

    it('preserves price drop percentages', () => {
      const points = [{ priceDropPercent: -30, collateralAtRisk: 5 }];
      const result = convertCollateralRiskToUSD(points, 100);

      expect(result[0].priceDropPercent).toBe(-30);
    });
  });

  describe('calculateLiquidationPriceDropPercent', () => {
    const liquidationThreshold = 0.86;
    const currentPrice = 89539.3;

    it('returns null for positions with no collateral', () => {
      const position: Position = { collateral: 0, debt: 10000 };
      const result = calculateLiquidationPriceDropPercent(
        position,
        currentPrice,
        liquidationThreshold
      );
      expect(result).toBeNull();
    });

    it('returns null for positions with no debt', () => {
      const position: Position = { collateral: 1, debt: 0 };
      const result = calculateLiquidationPriceDropPercent(
        position,
        currentPrice,
        liquidationThreshold
      );
      expect(result).toBeNull();
    });

    it('returns 0 for already liquidatable positions', () => {
      // Position at 90% LTV (above 86% threshold)
      // debt = collateral * price * 0.9 = 1 * 89539.3 * 0.9 = 80585.37
      const position: Position = { collateral: 1, debt: 80586 };
      const result = calculateLiquidationPriceDropPercent(
        position,
        currentPrice,
        liquidationThreshold
      );
      expect(result).toBe(0);
    });

    it('calculates correct price drop for healthy position', () => {
      // Position at 60% LTV
      // debt = 1 * 89539.3 * 0.6 = 53723.58
      const position: Position = { collateral: 1, debt: 53723.58 };

      const result = calculateLiquidationPriceDropPercent(
        position,
        currentPrice,
        liquidationThreshold
      );

      // Liquidation price = debt / (collateral * threshold) = 53723.58 / (1 * 0.86) = 62469.28
      // Price drop = (62469.28 / 89539.3 - 1) * 100 = -30.2%
      expect(result).not.toBeNull();
      expect(result!).toBeCloseTo(-30.2, 1);
    });

    it('returns more negative value for healthier positions', () => {
      const healthyPosition: Position = { collateral: 1, debt: 40000 }; // ~44.7% LTV
      const riskyPosition: Position = { collateral: 1, debt: 70000 }; // ~78.2% LTV

      const healthyDrop = calculateLiquidationPriceDropPercent(
        healthyPosition,
        currentPrice,
        liquidationThreshold
      );
      const riskyDrop = calculateLiquidationPriceDropPercent(
        riskyPosition,
        currentPrice,
        liquidationThreshold
      );

      // Healthier position needs bigger price drop (more negative)
      expect(healthyDrop).not.toBeNull();
      expect(riskyDrop).not.toBeNull();
      expect(healthyDrop!).toBeLessThan(riskyDrop!);
    });
  });

  describe('aggregatePositionsByRiskLevel', () => {
    const liquidationThreshold = 0.86;
    const currentPrice = 89539.3;

    it('returns empty map for no positions', () => {
      const result = aggregatePositionsByRiskLevel([], currentPrice, liquidationThreshold);
      expect(result.size).toBe(0);
    });

    it('groups positions by rounded price drop threshold', () => {
      // Two positions that liquidate at similar price drops
      const positions: Position[] = [
        { collateral: 1, debt: 70000 }, // ~-9% drop to liquidate
        { collateral: 2, debt: 140000 }, // Same LTV, same drop threshold
      ];

      const result = aggregatePositionsByRiskLevel(
        positions,
        currentPrice,
        liquidationThreshold
      );

      // Both should be in the same bucket
      // Total collateral should be 3
      const totalCollateral = Array.from(result.values()).reduce((a, b) => a + b, 0);
      expect(totalCollateral).toBe(3);
    });

    it('separates positions by risk level', () => {
      const positions: Position[] = [
        { collateral: 1, debt: 75000 }, // Higher LTV, small drop needed
        { collateral: 1, debt: 50000 }, // Lower LTV, bigger drop needed
      ];

      const result = aggregatePositionsByRiskLevel(
        positions,
        currentPrice,
        liquidationThreshold
      );

      // Should have entries in different buckets
      expect(result.size).toBeGreaterThan(1);
    });

    it('skips positions without debt', () => {
      const positions: Position[] = [
        { collateral: 1, debt: 0 },
        { collateral: 1, debt: 70000 },
      ];

      const result = aggregatePositionsByRiskLevel(
        positions,
        currentPrice,
        liquidationThreshold
      );

      const totalCollateral = Array.from(result.values()).reduce((a, b) => a + b, 0);
      expect(totalCollateral).toBe(1);
    });
  });
});
