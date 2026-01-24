import { describe, it, expect } from 'vitest';
import {
  calculateRate,
  calculateRateAtTarget,
  generateIRMCurvePoints,
  calculateBorrowToTarget,
  parseIRMParams,
  IRMParams,
} from './irm';

describe('IRM Calculations', () => {
  // Standard IRM params: 2% base, 4% slope1, 75% slope2, 90% optimal
  const standardIRM: IRMParams = {
    base_rate: '0.02',
    slope_1: '0.04',
    slope_2: '0.75',
    optimal_utilization: '0.9',
  };

  describe('calculateRate', () => {
    it('returns base rate at 0% utilization', () => {
      const rate = calculateRate(0, standardIRM);
      expect(rate).toBeCloseTo(0.02, 6);
    });

    it('returns base + slope1 at optimal utilization', () => {
      const rate = calculateRate(0.9, standardIRM);
      // At optimal: base_rate + (0.9 / 0.9) * slope_1 = 0.02 + 1 * 0.04 = 0.06
      expect(rate).toBeCloseTo(0.06, 6);
    });

    it('calculates rate below optimal utilization correctly', () => {
      // At 45% (half of optimal): base_rate + (0.45 / 0.9) * slope_1 = 0.02 + 0.5 * 0.04 = 0.04
      const rate = calculateRate(0.45, standardIRM);
      expect(rate).toBeCloseTo(0.04, 6);
    });

    it('calculates rate above optimal utilization correctly', () => {
      // At 95%: base + slope1 + ((0.95 - 0.9) / (1 - 0.9)) * slope2
      // = 0.02 + 0.04 + (0.05 / 0.1) * 0.75 = 0.06 + 0.5 * 0.75 = 0.06 + 0.375 = 0.435
      const rate = calculateRate(0.95, standardIRM);
      expect(rate).toBeCloseTo(0.435, 6);
    });

    it('returns max rate at 100% utilization', () => {
      // At 100%: base + slope1 + ((1 - 0.9) / (1 - 0.9)) * slope2
      // = 0.02 + 0.04 + 1 * 0.75 = 0.81
      const rate = calculateRate(1, standardIRM);
      expect(rate).toBeCloseTo(0.81, 6);
    });

    it('handles edge case with 0 optimal utilization', () => {
      const edgeIRM: IRMParams = {
        base_rate: '0.02',
        slope_1: '0.04',
        slope_2: '0.75',
        optimal_utilization: '0',
      };
      // With 0 optimal, all utilization is "above optimal"
      // rate = base + slope1 + util * slope2 = 0.02 + 0.04 + 0.5 * 0.75 = 0.435
      const rate = calculateRate(0.5, edgeIRM);
      expect(rate).toBeCloseTo(0.435, 6);
    });

    it('handles edge case with 100% optimal utilization', () => {
      const edgeIRM: IRMParams = {
        base_rate: '0.02',
        slope_1: '0.04',
        slope_2: '0.75',
        optimal_utilization: '1',
      };
      // With 100% optimal, at 50% util: base + (0.5 / 1) * slope1 = 0.02 + 0.5 * 0.04 = 0.04
      const rate = calculateRate(0.5, edgeIRM);
      expect(rate).toBeCloseTo(0.04, 6);
    });
  });

  describe('calculateRateAtTarget', () => {
    it('returns rate at optimal utilization', () => {
      const rate = calculateRateAtTarget(standardIRM);
      // Should equal base_rate + slope_1 = 0.02 + 0.04 = 0.06
      expect(rate).toBeCloseTo(0.06, 6);
    });
  });

  describe('generateIRMCurvePoints', () => {
    it('generates correct number of points', () => {
      const points = generateIRMCurvePoints(standardIRM, 11);
      expect(points).toHaveLength(11);
    });

    it('generates points from 0% to 100% utilization', () => {
      const points = generateIRMCurvePoints(standardIRM, 11);
      expect(points[0].utilization).toBe(0);
      expect(points[10].utilization).toBe(100);
    });

    it('first point has rate equal to base rate percentage', () => {
      const points = generateIRMCurvePoints(standardIRM, 11);
      expect(points[0].rate).toBeCloseTo(2, 2); // 2%
    });

    it('last point has max rate percentage', () => {
      const points = generateIRMCurvePoints(standardIRM, 11);
      // Max rate = base + slope1 + slope2 = 0.02 + 0.04 + 0.75 = 0.81 = 81%
      expect(points[10].rate).toBeCloseTo(81, 1);
    });

    it('curve has inflection point at optimal utilization', () => {
      const points = generateIRMCurvePoints(standardIRM, 101);
      // Find point closest to 90% utilization
      const optimalPoint = points.find((p) => p.utilization === 90);
      expect(optimalPoint).toBeDefined();
      expect(optimalPoint!.rate).toBeCloseTo(6, 1); // 6%
    });

    it('rate increases faster above optimal', () => {
      const points = generateIRMCurvePoints(standardIRM, 101);

      // Below optimal: rate change from 0% to 90% util = 6% - 2% = 4%
      const belowOptimalDelta = points[90].rate - points[0].rate;

      // Above optimal: rate change from 90% to 100% util = 81% - 6% = 75%
      const aboveOptimalDelta = points[100].rate - points[90].rate;

      expect(aboveOptimalDelta).toBeGreaterThan(belowOptimalDelta);
    });
  });

  describe('calculateBorrowToTarget', () => {
    it('returns positive amount when below target', () => {
      // Current 80%, target 90%, supply 1000, price $100
      const amount = calculateBorrowToTarget(0.8, 0.9, 1000, 100);
      // (0.9 - 0.8) * 1000 * 100 = 0.1 * 100000 = 10000
      expect(amount).toBeCloseTo(10000, 2);
    });

    it('returns negative amount when above target', () => {
      // Current 95%, target 90%, supply 1000, price $100
      const amount = calculateBorrowToTarget(0.95, 0.9, 1000, 100);
      // (0.9 - 0.95) * 1000 * 100 = -0.05 * 100000 = -5000
      expect(amount).toBeCloseTo(-5000, 2);
    });

    it('returns zero when at target', () => {
      const amount = calculateBorrowToTarget(0.9, 0.9, 1000, 100);
      expect(amount).toBe(0);
    });

    it('handles large values correctly', () => {
      // Simulating realistic values: 79.95% current, 90% target, $1.4B supply, $1 price
      const amount = calculateBorrowToTarget(0.7995, 0.9, 1400000000, 1);
      // (0.9 - 0.7995) * 1.4B = 0.1005 * 1.4B = 140.7M
      expect(amount).toBeCloseTo(140700000, 0);
    });
  });

  describe('parseIRMParams', () => {
    it('parses flat format correctly', () => {
      const raw = {
        base_rate: '0.02',
        slope_1: '0.04',
        slope_2: '0.75',
        optimal_utilization: '0.9',
      };
      const parsed = parseIRMParams(raw);
      expect(parsed).toEqual(standardIRM);
    });

    it('parses nested linear format correctly', () => {
      const raw = {
        linear: {
          base_rate: '0.02',
          slope_1: '0.04',
          slope_2: '0.75',
          optimal_utilization: '0.9',
        },
      };
      const parsed = parseIRMParams(raw);
      expect(parsed).toEqual(standardIRM);
    });

    it('handles missing values with defaults', () => {
      const raw = {};
      const parsed = parseIRMParams(raw);
      expect(parsed.base_rate).toBe('0');
      expect(parsed.slope_1).toBe('0');
      expect(parsed.slope_2).toBe('0');
      expect(parsed.optimal_utilization).toBe('0.9');
    });

    it('converts numeric values to strings', () => {
      const raw = {
        base_rate: 0.02,
        slope_1: 0.04,
        slope_2: 0.75,
        optimal_utilization: 0.9,
      };
      const parsed = parseIRMParams(raw);
      expect(typeof parsed.base_rate).toBe('string');
      expect(parsed.base_rate).toBe('0.02');
    });
  });
});
