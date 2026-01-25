import { describe, it, expect, beforeEach } from 'vitest';
import { Decimal } from 'decimal.js';
import { handleSupply } from '../../../src/events/handlers';
import { prisma } from '../../../src/db/client';
import {
  ADDRESSES,
  DECIMALS,
  createTestMarket,
  createTestPosition,
  createSupplyEvent,
  assertMarketState,
  assertPositionState,
  assertTransactionCreated,
  assertRecordCount,
  expectDecimalEquals,
} from '../../helpers';

describe('handleSupply', () => {
  const marketId = '1';

  beforeEach(async () => {
    await createTestMarket({ id: marketId });
  });

  describe('happy path', () => {
    it('increments totalSupplyScaled on market', async () => {
      const event = createSupplyEvent({
        scaledAmount: DECIMALS.oneToken,
      });

      await handleSupply(event, marketId);

      await assertMarketState(marketId, {
        totalSupplyScaled: DECIMALS.oneToken,
      });
    });

    it('creates new position when user has no existing position', async () => {
      const event = createSupplyEvent({
        supplier: ADDRESSES.userA,
        recipient: ADDRESSES.userA,
        scaledAmount: DECIMALS.oneToken,
      });

      await handleSupply(event, marketId);

      await assertPositionState(marketId, ADDRESSES.userA, {
        supplyScaled: DECIMALS.oneToken,
        debtScaled: '0',
        collateral: '0',
      });
    });

    it('increments existing position supplyScaled', async () => {
      // Create existing position with 1 token
      await createTestPosition(marketId, ADDRESSES.userA, {
        supplyScaled: new Decimal(DECIMALS.oneToken),
      });

      const event = createSupplyEvent({
        supplier: ADDRESSES.userA,
        recipient: ADDRESSES.userA,
        scaledAmount: DECIMALS.oneToken,
      });

      await handleSupply(event, marketId);

      // Should have 2 tokens now
      await assertPositionState(marketId, ADDRESSES.userA, {
        supplyScaled: '2000000000000000000',
      });
    });

    it('creates transaction record with correct action', async () => {
      const event = createSupplyEvent({
        supplier: ADDRESSES.userA,
        recipient: ADDRESSES.userA,
        amount: DECIMALS.oneToken,
        scaledAmount: DECIMALS.oneToken,
      });

      await handleSupply(event, marketId);

      await assertTransactionCreated(event.txHash, event.logIndex, {
        action: 'SUPPLY',
        marketId,
        userAddress: ADDRESSES.userA,
        amount: DECIMALS.oneToken,
        scaledAmount: DECIMALS.oneToken,
        recipient: ADDRESSES.userA,
      });
    });

    it('records market state snapshot in transaction', async () => {
      const event = createSupplyEvent({
        totalSupply: DECIMALS.thousand,
        totalDebt: DECIMALS.oneToken,
        utilization: DECIMALS.tenPercent,
      });

      await handleSupply(event, marketId);

      const tx = await prisma.transaction.findUnique({
        where: { id: `${event.txHash}:${event.logIndex}` },
      });

      expectDecimalEquals(tx!.totalSupply, DECIMALS.thousand);
      expectDecimalEquals(tx!.totalDebt, DECIMALS.oneToken);
      expectDecimalEquals(tx!.utilization, DECIMALS.tenPercent);
    });

    it('updates lastInteraction timestamp on existing position', async () => {
      const oldDate = new Date('2020-01-01');
      await prisma.userPosition.create({
        data: {
          id: `${marketId}:${ADDRESSES.userA}`,
          marketId,
          userAddress: ADDRESSES.userA,
          supplyScaled: new Decimal(DECIMALS.oneToken),
          debtScaled: new Decimal(0),
          collateral: new Decimal(0),
          firstInteraction: oldDate,
          lastInteraction: oldDate,
        },
      });

      const newTimestamp = Math.floor(Date.now() / 1000);
      const event = createSupplyEvent({
        supplier: ADDRESSES.userA,
        recipient: ADDRESSES.userA,
        timestamp: newTimestamp,
      });

      await handleSupply(event, marketId);

      const position = await prisma.userPosition.findUnique({
        where: { id: `${marketId}:${ADDRESSES.userA}` },
      });

      expect(position!.lastInteraction.getTime()).toBeGreaterThan(oldDate.getTime());
    });
  });

  describe('edge cases', () => {
    it('handles supply to different recipient than supplier', async () => {
      const event = createSupplyEvent({
        supplier: ADDRESSES.userA,
        recipient: ADDRESSES.userB,
        scaledAmount: DECIMALS.oneToken,
      });

      await handleSupply(event, marketId);

      // Position should be created for recipient, not supplier
      await assertPositionState(marketId, ADDRESSES.userB, {
        supplyScaled: DECIMALS.oneToken,
      });
      await assertPositionState(marketId, ADDRESSES.userA, { exists: false });

      // Transaction userAddress should be supplier
      await assertTransactionCreated(event.txHash, event.logIndex, {
        action: 'SUPPLY',
        marketId,
        userAddress: ADDRESSES.userA,
        recipient: ADDRESSES.userB,
      });
    });

    it('handles zero amount supply', async () => {
      const event = createSupplyEvent({
        amount: DECIMALS.zero,
        scaledAmount: DECIMALS.zero,
      });

      await handleSupply(event, marketId);

      await assertMarketState(marketId, {
        totalSupplyScaled: '0',
      });

      await assertPositionState(marketId, ADDRESSES.userA, {
        supplyScaled: '0',
      });
    });

    it('handles large amounts (near Uint128 max)', async () => {
      const largeAmount = '100000000000000000000000000000'; // 1e29

      const event = createSupplyEvent({
        amount: largeAmount,
        scaledAmount: largeAmount,
      });

      await handleSupply(event, marketId);

      await assertMarketState(marketId, {
        totalSupplyScaled: largeAmount,
      });
    });

    it('throws error when market not found', async () => {
      const event = createSupplyEvent();

      await expect(handleSupply(event, 'non-existent-market')).rejects.toThrow(
        'Market not found: non-existent-market'
      );
    });
  });

  describe('atomicity', () => {
    it('does not create transaction if market update fails', async () => {
      // Delete the market to cause failure
      await prisma.market.delete({ where: { id: marketId } });

      const event = createSupplyEvent();

      await expect(handleSupply(event, marketId)).rejects.toThrow();

      // No transaction should be created
      await assertRecordCount('transaction', 0);
    });
  });
});
