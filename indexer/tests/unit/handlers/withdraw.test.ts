import { describe, it, expect, beforeEach } from 'vitest';
import { Decimal } from 'decimal.js';
import { handleWithdraw } from '../../../src/events/handlers';
import { prisma } from '../../../src/db/client';
import {
  ADDRESSES,
  DECIMALS,
  createTestMarket,
  createTestPosition,
  createWithdrawEvent,
  assertMarketState,
  assertPositionState,
  assertTransactionCreated,
} from '../../helpers';

describe('handleWithdraw', () => {
  const marketId = '1';

  beforeEach(async () => {
    await createTestMarket({
      id: marketId,
      totalSupplyScaled: new Decimal(DECIMALS.thousand),
    });
  });

  describe('happy path', () => {
    it('decrements totalSupplyScaled on market', async () => {
      const event = createWithdrawEvent({
        scaledDecrease: DECIMALS.oneToken,
      });

      await handleWithdraw(event, marketId);

      // 1000 - 1 = 999 tokens
      await assertMarketState(marketId, {
        totalSupplyScaled: '999000000000000000000',
      });
    });

    it('decrements existing position supplyScaled', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        supplyScaled: new Decimal(DECIMALS.thousand),
      });

      const event = createWithdrawEvent({
        withdrawer: ADDRESSES.userA,
        scaledDecrease: DECIMALS.oneToken,
      });

      await handleWithdraw(event, marketId);

      await assertPositionState(marketId, ADDRESSES.userA, {
        supplyScaled: '999000000000000000000',
      });
    });

    it('creates transaction record with action WITHDRAW', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        supplyScaled: new Decimal(DECIMALS.thousand),
      });

      const event = createWithdrawEvent({
        withdrawer: ADDRESSES.userA,
        recipient: ADDRESSES.userA,
        amount: DECIMALS.oneToken,
        scaledDecrease: DECIMALS.oneToken,
      });

      await handleWithdraw(event, marketId);

      await assertTransactionCreated(event.txHash, event.logIndex, {
        action: 'WITHDRAW',
        marketId,
        userAddress: ADDRESSES.userA,
        amount: DECIMALS.oneToken,
        scaledAmount: DECIMALS.oneToken,
        recipient: ADDRESSES.userA,
      });
    });
  });

  describe('edge cases', () => {
    it('does not create position if none exists', async () => {
      const event = createWithdrawEvent({
        withdrawer: ADDRESSES.userA,
        scaledDecrease: DECIMALS.oneToken,
      });

      await handleWithdraw(event, marketId);

      // Position should not be created
      await assertPositionState(marketId, ADDRESSES.userA, { exists: false });

      // But market should still be updated
      await assertMarketState(marketId, {
        totalSupplyScaled: '999000000000000000000',
      });
    });

    it('allows withdrawing to zero balance', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        supplyScaled: new Decimal(DECIMALS.oneToken),
      });

      const event = createWithdrawEvent({
        withdrawer: ADDRESSES.userA,
        scaledDecrease: DECIMALS.oneToken,
      });

      await handleWithdraw(event, marketId);

      await assertPositionState(marketId, ADDRESSES.userA, {
        supplyScaled: '0',
      });
    });

    it('handles withdraw to different recipient', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        supplyScaled: new Decimal(DECIMALS.thousand),
      });

      const event = createWithdrawEvent({
        withdrawer: ADDRESSES.userA,
        recipient: ADDRESSES.userB,
        scaledDecrease: DECIMALS.oneToken,
      });

      await handleWithdraw(event, marketId);

      // Position for withdrawer is updated
      await assertPositionState(marketId, ADDRESSES.userA, {
        supplyScaled: '999000000000000000000',
      });

      // No position created for recipient
      await assertPositionState(marketId, ADDRESSES.userB, { exists: false });
    });

    it('throws error when market not found', async () => {
      const event = createWithdrawEvent();

      await expect(handleWithdraw(event, 'non-existent')).rejects.toThrow(
        'Market not found: non-existent'
      );
    });

    it('updates lastInteraction timestamp', async () => {
      const oldDate = new Date('2020-01-01');
      await prisma.userPosition.create({
        data: {
          id: `${marketId}:${ADDRESSES.userA}`,
          marketId,
          userAddress: ADDRESSES.userA,
          supplyScaled: new Decimal(DECIMALS.thousand),
          debtScaled: new Decimal(0),
          collateral: new Decimal(0),
          firstInteraction: oldDate,
          lastInteraction: oldDate,
        },
      });

      const event = createWithdrawEvent({
        withdrawer: ADDRESSES.userA,
        timestamp: Math.floor(Date.now() / 1000),
      });

      await handleWithdraw(event, marketId);

      const position = await prisma.userPosition.findUnique({
        where: { id: `${marketId}:${ADDRESSES.userA}` },
      });

      expect(position!.lastInteraction.getTime()).toBeGreaterThan(oldDate.getTime());
    });
  });
});
