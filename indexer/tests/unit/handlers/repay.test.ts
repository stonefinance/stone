import { describe, it, expect, beforeEach } from 'vitest';
import { Decimal } from 'decimal.js';
import { handleRepay } from '../../../src/events/handlers';
import { prisma } from '../../../src/db/client';
import {
  ADDRESSES,
  DECIMALS,
  createTestMarket,
  createTestPosition,
  createRepayEvent,
  assertMarketState,
  assertPositionState,
  assertTransactionCreated,
  expectDecimalEquals,
} from '../../helpers';

describe('handleRepay', () => {
  const marketId = '1';

  beforeEach(async () => {
    await createTestMarket({
      id: marketId,
      totalDebtScaled: new Decimal(DECIMALS.thousand),
    });
  });

  describe('happy path', () => {
    it('decrements totalDebtScaled on market', async () => {
      const event = createRepayEvent({
        scaledDecrease: DECIMALS.oneToken,
      });

      await handleRepay(event, marketId);

      await assertMarketState(marketId, {
        totalDebtScaled: '999000000000000000000',
      });
    });

    it('decrements existing position debtScaled', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        debtScaled: new Decimal(DECIMALS.thousand),
      });

      const event = createRepayEvent({
        borrower: ADDRESSES.userA,
        scaledDecrease: DECIMALS.oneToken,
      });

      await handleRepay(event, marketId);

      await assertPositionState(marketId, ADDRESSES.userA, {
        debtScaled: '999000000000000000000',
      });
    });

    it('creates transaction with repayer as userAddress', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        debtScaled: new Decimal(DECIMALS.thousand),
      });

      const event = createRepayEvent({
        repayer: ADDRESSES.userB,
        borrower: ADDRESSES.userA,
        amount: DECIMALS.oneToken,
        scaledDecrease: DECIMALS.oneToken,
      });

      await handleRepay(event, marketId);

      await assertTransactionCreated(event.txHash, event.logIndex, {
        action: 'REPAY',
        marketId,
        userAddress: ADDRESSES.userB, // Repayer, not borrower
        amount: DECIMALS.oneToken,
        scaledAmount: DECIMALS.oneToken,
      });
    });

    it('records market state snapshot in transaction', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        debtScaled: new Decimal(DECIMALS.thousand),
      });

      const event = createRepayEvent({
        borrower: ADDRESSES.userA,
        totalSupply: DECIMALS.thousand,
        totalDebt: DECIMALS.zero,
        utilization: DECIMALS.zero,
      });

      await handleRepay(event, marketId);

      const tx = await prisma.transaction.findUnique({
        where: { id: `${event.txHash}:${event.logIndex}` },
      });

      expectDecimalEquals(tx!.totalSupply, DECIMALS.thousand);
      expectDecimalEquals(tx!.totalDebt, DECIMALS.zero);
      expectDecimalEquals(tx!.utilization, DECIMALS.zero);
    });
  });

  describe('edge cases', () => {
    it('uses Decimal.max to prevent negative debt on position', async () => {
      // Create position with small debt
      await createTestPosition(marketId, ADDRESSES.userA, {
        debtScaled: new Decimal(DECIMALS.dust), // 1 wei
      });

      // Repay more than the debt (can happen due to rounding)
      const event = createRepayEvent({
        borrower: ADDRESSES.userA,
        scaledDecrease: DECIMALS.oneToken, // Much larger than debt
      });

      await handleRepay(event, marketId);

      // Position debt should be clamped to 0, not negative
      await assertPositionState(marketId, ADDRESSES.userA, {
        debtScaled: '0',
      });
    });

    it('allows repaying on behalf of another user', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        debtScaled: new Decimal(DECIMALS.thousand),
      });

      const event = createRepayEvent({
        repayer: ADDRESSES.userB,
        borrower: ADDRESSES.userA,
        scaledDecrease: DECIMALS.oneToken,
      });

      await handleRepay(event, marketId);

      // Borrower's debt is reduced
      await assertPositionState(marketId, ADDRESSES.userA, {
        debtScaled: '999000000000000000000',
      });

      // No position for repayer
      await assertPositionState(marketId, ADDRESSES.userB, { exists: false });
    });

    it('does not create position if none exists for borrower', async () => {
      const event = createRepayEvent({
        repayer: ADDRESSES.userB,
        borrower: ADDRESSES.userA,
        scaledDecrease: DECIMALS.oneToken,
      });

      await handleRepay(event, marketId);

      // No position should be created
      await assertPositionState(marketId, ADDRESSES.userA, { exists: false });

      // Market should still be updated
      await assertMarketState(marketId, {
        totalDebtScaled: '999000000000000000000',
      });
    });

    it('allows repaying to zero debt', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        debtScaled: new Decimal(DECIMALS.oneToken),
      });

      const event = createRepayEvent({
        borrower: ADDRESSES.userA,
        scaledDecrease: DECIMALS.oneToken,
      });

      await handleRepay(event, marketId);

      await assertPositionState(marketId, ADDRESSES.userA, {
        debtScaled: '0',
      });
    });

    it('preserves supplyScaled and collateral when repaying', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        supplyScaled: new Decimal(DECIMALS.thousand),
        collateral: new Decimal(DECIMALS.oneToken),
        debtScaled: new Decimal(DECIMALS.thousand),
      });

      const event = createRepayEvent({
        borrower: ADDRESSES.userA,
        scaledDecrease: DECIMALS.oneToken,
      });

      await handleRepay(event, marketId);

      await assertPositionState(marketId, ADDRESSES.userA, {
        supplyScaled: DECIMALS.thousand,
        collateral: DECIMALS.oneToken,
        debtScaled: '999000000000000000000',
      });
    });

    it('throws error when market not found', async () => {
      const event = createRepayEvent();

      await expect(handleRepay(event, 'non-existent')).rejects.toThrow(
        'Market not found: non-existent'
      );
    });
  });
});
