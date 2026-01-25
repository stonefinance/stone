import { describe, it, expect, beforeEach } from 'vitest';
import { Decimal } from 'decimal.js';
import { handleWithdrawCollateral } from '../../../src/events/handlers';
import { prisma } from '../../../src/db/client';
import {
  ADDRESSES,
  DECIMALS,
  createTestMarket,
  createTestPosition,
  createWithdrawCollateralEvent,
  assertMarketState,
  assertPositionState,
  assertTransactionCreated,
} from '../../helpers';

describe('handleWithdrawCollateral', () => {
  const marketId = '1';

  beforeEach(async () => {
    await createTestMarket({
      id: marketId,
      totalCollateral: new Decimal(DECIMALS.thousand),
    });
  });

  describe('happy path', () => {
    it('decrements totalCollateral on market', async () => {
      const event = createWithdrawCollateralEvent({
        amount: DECIMALS.oneToken,
      });

      await handleWithdrawCollateral(event, marketId);

      await assertMarketState(marketId, {
        totalCollateral: '999000000000000000000',
      });
    });

    it('decrements existing position collateral', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        collateral: new Decimal(DECIMALS.thousand),
      });

      const event = createWithdrawCollateralEvent({
        withdrawer: ADDRESSES.userA,
        amount: DECIMALS.oneToken,
      });

      await handleWithdrawCollateral(event, marketId);

      await assertPositionState(marketId, ADDRESSES.userA, {
        collateral: '999000000000000000000',
      });
    });

    it('creates transaction with action WITHDRAW_COLLATERAL', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        collateral: new Decimal(DECIMALS.thousand),
      });

      const event = createWithdrawCollateralEvent({
        withdrawer: ADDRESSES.userA,
        recipient: ADDRESSES.userA,
        amount: DECIMALS.oneToken,
      });

      await handleWithdrawCollateral(event, marketId);

      await assertTransactionCreated(event.txHash, event.logIndex, {
        action: 'WITHDRAW_COLLATERAL',
        marketId,
        userAddress: ADDRESSES.userA,
        amount: DECIMALS.oneToken,
        recipient: ADDRESSES.userA,
      });
    });

    it('records new totalCollateral in transaction', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        collateral: new Decimal(DECIMALS.thousand),
      });

      const event = createWithdrawCollateralEvent({
        withdrawer: ADDRESSES.userA,
        amount: DECIMALS.oneToken,
      });

      await handleWithdrawCollateral(event, marketId);

      const tx = await prisma.transaction.findUnique({
        where: { id: `${event.txHash}:${event.logIndex}` },
      });

      expect(tx!.totalCollateral?.toString()).toBe('999000000000000000000');
    });
  });

  describe('edge cases', () => {
    it('does not create position if none exists', async () => {
      const event = createWithdrawCollateralEvent({
        withdrawer: ADDRESSES.userA,
        amount: DECIMALS.oneToken,
      });

      await handleWithdrawCollateral(event, marketId);

      // No position should be created
      await assertPositionState(marketId, ADDRESSES.userA, { exists: false });

      // Market should still be updated
      await assertMarketState(marketId, {
        totalCollateral: '999000000000000000000',
      });
    });

    it('allows withdrawing to zero collateral', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        collateral: new Decimal(DECIMALS.oneToken),
      });

      const event = createWithdrawCollateralEvent({
        withdrawer: ADDRESSES.userA,
        amount: DECIMALS.oneToken,
      });

      await handleWithdrawCollateral(event, marketId);

      await assertPositionState(marketId, ADDRESSES.userA, {
        collateral: '0',
      });
    });

    it('handles withdraw to different recipient', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        collateral: new Decimal(DECIMALS.thousand),
      });

      const event = createWithdrawCollateralEvent({
        withdrawer: ADDRESSES.userA,
        recipient: ADDRESSES.userB,
        amount: DECIMALS.oneToken,
      });

      await handleWithdrawCollateral(event, marketId);

      // Withdrawer's position is updated
      await assertPositionState(marketId, ADDRESSES.userA, {
        collateral: '999000000000000000000',
      });

      // No position for recipient
      await assertPositionState(marketId, ADDRESSES.userB, { exists: false });
    });

    it('preserves supplyScaled and debtScaled when withdrawing collateral', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        supplyScaled: new Decimal(DECIMALS.thousand),
        debtScaled: new Decimal(DECIMALS.oneToken),
        collateral: new Decimal(DECIMALS.thousand),
      });

      const event = createWithdrawCollateralEvent({
        withdrawer: ADDRESSES.userA,
        amount: DECIMALS.oneToken,
      });

      await handleWithdrawCollateral(event, marketId);

      await assertPositionState(marketId, ADDRESSES.userA, {
        supplyScaled: DECIMALS.thousand,
        debtScaled: DECIMALS.oneToken,
        collateral: '999000000000000000000',
      });
    });
  });
});
