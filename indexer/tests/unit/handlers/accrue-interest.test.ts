import { describe, it, expect, beforeEach } from 'vitest';
import { Decimal } from 'decimal.js';
import { handleAccrueInterest } from '../../../src/events/handlers';
import { prisma } from '../../../src/db/client';
import {
  ADDRESSES,
  createTestMarket,
  createAccrueInterestEvent,
  assertMarketState,
  assertInterestAccrualCreated,
  assertRecordCount,
} from '../../helpers';

describe('handleAccrueInterest', () => {
  const marketId = '1';

  beforeEach(async () => {
    await createTestMarket({ id: marketId });
  });

  describe('happy path', () => {
    it('updates market borrowIndex', async () => {
      const event = createAccrueInterestEvent({
        borrowIndex: '1.05',
      });

      await handleAccrueInterest(event, marketId);

      await assertMarketState(marketId, {
        borrowIndex: '1.05',
      });
    });

    it('updates market liquidityIndex', async () => {
      const event = createAccrueInterestEvent({
        liquidityIndex: '1.03',
      });

      await handleAccrueInterest(event, marketId);

      await assertMarketState(marketId, {
        liquidityIndex: '1.03',
      });
    });

    it('updates market borrowRate', async () => {
      const event = createAccrueInterestEvent({
        borrowRate: '0.08',
      });

      await handleAccrueInterest(event, marketId);

      await assertMarketState(marketId, {
        borrowRate: '0.08',
      });
    });

    it('updates market liquidityRate', async () => {
      const event = createAccrueInterestEvent({
        liquidityRate: '0.04',
      });

      await handleAccrueInterest(event, marketId);

      await assertMarketState(marketId, {
        liquidityRate: '0.04',
      });
    });

    it('updates all interest fields at once', async () => {
      const event = createAccrueInterestEvent({
        borrowIndex: '1.1',
        liquidityIndex: '1.05',
        borrowRate: '0.1',
        liquidityRate: '0.06',
      });

      await handleAccrueInterest(event, marketId);

      await assertMarketState(marketId, {
        borrowIndex: '1.1',
        liquidityIndex: '1.05',
        borrowRate: '0.1',
        liquidityRate: '0.06',
      });
    });

    it('creates InterestAccrualEvent record', async () => {
      const event = createAccrueInterestEvent({
        borrowIndex: '1.05',
        liquidityIndex: '1.03',
        borrowRate: '0.05',
        liquidityRate: '0.03',
      });

      await handleAccrueInterest(event, marketId);

      await assertInterestAccrualCreated(event.txHash, event.logIndex, {
        marketId,
        borrowIndex: '1.05',
        liquidityIndex: '1.03',
        borrowRate: '0.05',
        liquidityRate: '0.03',
      });
    });

    it('does NOT create Transaction record', async () => {
      const event = createAccrueInterestEvent();

      await handleAccrueInterest(event, marketId);

      // No transaction should be created for accrue_interest
      await assertRecordCount('transaction', 0);

      // But InterestAccrualEvent should exist
      await assertRecordCount('interestAccrualEvent', 1);
    });
  });

  describe('edge cases', () => {
    it('handles high precision decimal values', async () => {
      const event = createAccrueInterestEvent({
        borrowIndex: '1.123456789012345678',
        liquidityIndex: '1.098765432109876543',
      });

      await handleAccrueInterest(event, marketId);

      const market = await prisma.market.findUnique({ where: { id: marketId } });
      // Should preserve precision up to 18 decimals
      expect(market!.borrowIndex.toString()).toBe('1.123456789012345678');
      expect(market!.liquidityIndex.toString()).toBe('1.098765432109876543');
    });

    it('handles indices greater than 2', async () => {
      const event = createAccrueInterestEvent({
        borrowIndex: '2.5',
        liquidityIndex: '2.1',
      });

      await handleAccrueInterest(event, marketId);

      await assertMarketState(marketId, {
        borrowIndex: '2.5',
        liquidityIndex: '2.1',
      });
    });

    it('handles zero rates', async () => {
      const event = createAccrueInterestEvent({
        borrowRate: '0',
        liquidityRate: '0',
      });

      await handleAccrueInterest(event, marketId);

      await assertMarketState(marketId, {
        borrowRate: '0',
        liquidityRate: '0',
      });
    });

    it('handles very high interest rates', async () => {
      const event = createAccrueInterestEvent({
        borrowRate: '1.5', // 150% APR
        liquidityRate: '1.0', // 100% APR
      });

      await handleAccrueInterest(event, marketId);

      await assertMarketState(marketId, {
        borrowRate: '1.5',
        liquidityRate: '1.0',
      });
    });

    it('preserves other market state when updating indices', async () => {
      // Create market with some state
      await prisma.market.update({
        where: { id: marketId },
        data: {
          totalSupplyScaled: new Decimal('1000000000000000000000'),
          totalDebtScaled: new Decimal('500000000000000000000'),
        },
      });

      const event = createAccrueInterestEvent({
        borrowIndex: '1.1',
        liquidityIndex: '1.05',
      });

      await handleAccrueInterest(event, marketId);

      // Indices should be updated
      await assertMarketState(marketId, {
        borrowIndex: '1.1',
        liquidityIndex: '1.05',
        // These should be unchanged
        totalSupplyScaled: '1000000000000000000000',
        totalDebtScaled: '500000000000000000000',
      });
    });

    it('updates lastUpdate timestamp', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const event = createAccrueInterestEvent({
        lastUpdate: String(timestamp),
        timestamp,
      });

      await handleAccrueInterest(event, marketId);

      const market = await prisma.market.findUnique({ where: { id: marketId } });
      expect(Number(market!.lastUpdate)).toBe(timestamp);
    });

    it('records correct timestamp in InterestAccrualEvent', async () => {
      const timestamp = 1700000000;
      const event = createAccrueInterestEvent({
        timestamp,
      });

      await handleAccrueInterest(event, marketId);

      const accrualEvent = await prisma.interestAccrualEvent.findUnique({
        where: { id: `${event.txHash}:${event.logIndex}` },
      });

      expect(accrualEvent!.timestamp.getTime()).toBe(timestamp * 1000);
    });
  });
});
