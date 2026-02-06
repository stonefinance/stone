import { describe, it, expect } from 'vitest';
import { computeHealthFactor, computeLtv } from '@/lib/utils/position';

describe('position utils', () => {
  describe('computeLtv', () => {
    it('calculates normal LTV values', () => {
      const ltv = computeLtv(10000, 20000, 1, 2);
      expect(ltv).toBeCloseTo(25, 6);
    });

    it('returns null when collateral is zero', () => {
      const ltv = computeLtv(10000, 0, 1, 2);
      expect(ltv).toBeNull();
    });

    it('returns null when prices are missing', () => {
      const ltv = computeLtv(10000, 20000, undefined, 2);
      expect(ltv).toBeNull();
    });

    it('returns 0% when debt is zero', () => {
      const ltv = computeLtv(0, 20000, 1, 2);
      expect(ltv).toBe(0);
    });
  });

  describe('computeHealthFactor', () => {
    it('calculates health factor from LTV', () => {
      const health = computeHealthFactor(25, 0.8);
      expect(health).toBeCloseTo(3.2, 6);
    });

    it('returns infinity for zero LTV', () => {
      const health = computeHealthFactor(0, 0.8);
      expect(health).toBe(Infinity);
    });

    it('returns null for null LTV', () => {
      const health = computeHealthFactor(null, 0.8);
      expect(health).toBeNull();
    });
  });
});
