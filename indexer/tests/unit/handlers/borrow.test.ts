import { describe, it, expect, beforeEach } from 'vitest';
import { Decimal } from 'decimal.js';
import { handleBorrow } from '../../../src/events/handlers';
import { prisma } from '../../../src/db/client';
import {
  ADDRESSES,
  DECIMALS,
  createTestMarket,
  createTestPosition,
  createBorrowEvent,
  assertMarketState,
  assertPositionState,
  assertTransactionCreated,
  expectDecimalEquals,
} from '../../helpers';

describe('handleBorrow', () => {
  const marketId = '1';

  beforeEach(async () => {
    await createTestMarket({
      id: marketId,
      totalSupplyScaled: new Decimal(DECIMALS.thousand),
    });
  });

  describe('happy path', () => {
    it('increments totalDebtScaled on market', async () => {
      const event = createBorrowEvent({
        scaledAmount: DECIMALS.oneToken,
      });

      await handleBorrow(event, marketId);

      await assertMarketState(marketId, {
        totalDebtScaled: DECIMALS.oneToken,
      });
    });

    it('creates new position with debt when user has no existing position', async () => {
      const event = createBorrowEvent({
        borrower: ADDRESSES.userA,
        scaledAmount: DECIMALS.oneToken,
      });

      await handleBorrow(event, marketId);

      await assertPositionState(marketId, ADDRESSES.userA, {
        supplyScaled: '0',
        debtScaled: DECIMALS.oneToken,
        collateral: '0',
      });
    });

    it('increments existing position debtScaled', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        debtScaled: new Decimal(DECIMALS.oneToken),
      });

      const event = createBorrowEvent({
        borrower: ADDRESSES.userA,
        scaledAmount: DECIMALS.oneToken,
      });

      await handleBorrow(event, marketId);

      await assertPositionState(marketId, ADDRESSES.userA, {
        debtScaled: '2000000000000000000',
      });
    });

    it('creates transaction with action BORROW', async () => {
      const event = createBorrowEvent({
        borrower: ADDRESSES.userA,
        recipient: ADDRESSES.userA,
        amount: DECIMALS.oneToken,
        scaledAmount: DECIMALS.oneToken,
      });

      await handleBorrow(event, marketId);

      await assertTransactionCreated(event.txHash, event.logIndex, {
        action: 'BORROW',
        marketId,
        userAddress: ADDRESSES.userA,
        amount: DECIMALS.oneToken,
        scaledAmount: DECIMALS.oneToken,
        recipient: ADDRESSES.userA,
      });
    });

    it('records market state snapshot in transaction', async () => {
      const event = createBorrowEvent({
        totalSupply: DECIMALS.thousand,
        totalDebt: DECIMALS.oneToken,
        utilization: DECIMALS.tenPercent,
      });

      await handleBorrow(event, marketId);

      const tx = await prisma.transaction.findUnique({
        where: { id: `${event.txHash}:${event.logIndex}` },
      });

      expectDecimalEquals(tx!.totalSupply, DECIMALS.thousand);
      expectDecimalEquals(tx!.totalDebt, DECIMALS.oneToken);
      expectDecimalEquals(tx!.utilization, DECIMALS.tenPercent);
    });
  });

  describe('edge cases', () => {
    it('handles borrow to different recipient', async () => {
      const event = createBorrowEvent({
        borrower: ADDRESSES.userA,
        recipient: ADDRESSES.userB,
        scaledAmount: DECIMALS.oneToken,
      });

      await handleBorrow(event, marketId);

      // Debt is recorded against borrower, not recipient
      await assertPositionState(marketId, ADDRESSES.userA, {
        debtScaled: DECIMALS.oneToken,
      });

      // No position for recipient
      await assertPositionState(marketId, ADDRESSES.userB, { exists: false });
    });

    it('preserves existing supplyScaled and collateral', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        supplyScaled: new Decimal(DECIMALS.thousand),
        collateral: new Decimal(DECIMALS.oneToken),
        debtScaled: new Decimal(0),
      });

      const event = createBorrowEvent({
        borrower: ADDRESSES.userA,
        scaledAmount: DECIMALS.oneToken,
      });

      await handleBorrow(event, marketId);

      await assertPositionState(marketId, ADDRESSES.userA, {
        supplyScaled: DECIMALS.thousand,
        collateral: DECIMALS.oneToken,
        debtScaled: DECIMALS.oneToken,
      });
    });

    it('handles large borrow amounts', async () => {
      const largeAmount = '100000000000000000000000000000';

      const event = createBorrowEvent({
        amount: largeAmount,
        scaledAmount: largeAmount,
      });

      await handleBorrow(event, marketId);

      await assertMarketState(marketId, {
        totalDebtScaled: largeAmount,
      });
    });

    it('throws error when market not found', async () => {
      const event = createBorrowEvent();

      await expect(handleBorrow(event, 'non-existent')).rejects.toThrow(
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
          supplyScaled: new Decimal(0),
          debtScaled: new Decimal(DECIMALS.oneToken),
          collateral: new Decimal(0),
          firstInteraction: oldDate,
          lastInteraction: oldDate,
        },
      });

      const event = createBorrowEvent({
        borrower: ADDRESSES.userA,
        timestamp: Math.floor(Date.now() / 1000),
      });

      await handleBorrow(event, marketId);

      const position = await prisma.userPosition.findUnique({
        where: { id: `${marketId}:${ADDRESSES.userA}` },
      });

      expect(position!.lastInteraction.getTime()).toBeGreaterThan(oldDate.getTime());
    });
  });
});
