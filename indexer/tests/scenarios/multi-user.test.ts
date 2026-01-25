import { describe, it, expect, beforeEach } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  handleSupply,
  handleWithdraw,
  handleBorrow,
  handleRepay,
  handleSupplyCollateral,
} from '../../src/events/handlers';
import { prisma } from '../../src/db/client';
import {
  ADDRESSES,
  DECIMALS,
  createTestMarket,
  createSupplyEvent,
  createWithdrawEvent,
  createBorrowEvent,
  createRepayEvent,
  createSupplyCollateralEvent,
  assertMarketState,
  assertPositionState,
  assertRecordCount,
} from '../helpers';

describe('Multi-User Scenarios', () => {
  const marketId = '1';

  describe('Multiple users interacting with same market', () => {
    beforeEach(async () => {
      await createTestMarket({ id: marketId });
    });

    it('tracks separate positions for multiple suppliers', async () => {
      // User A supplies 1000
      await handleSupply(
        createSupplyEvent({
          supplier: ADDRESSES.userA,
          recipient: ADDRESSES.userA,
          amount: DECIMALS.thousand,
          scaledAmount: DECIMALS.thousand,
          totalSupply: DECIMALS.thousand,
          logIndex: 0,
        }),
        marketId
      );

      // User B supplies 2000
      await handleSupply(
        createSupplyEvent({
          supplier: ADDRESSES.userB,
          recipient: ADDRESSES.userB,
          amount: '2000000000000000000000',
          scaledAmount: '2000000000000000000000',
          totalSupply: '3000000000000000000000',
          logIndex: 1,
        }),
        marketId
      );

      // User C supplies 500
      await handleSupply(
        createSupplyEvent({
          supplier: ADDRESSES.userC,
          recipient: ADDRESSES.userC,
          amount: '500000000000000000000',
          scaledAmount: '500000000000000000000',
          totalSupply: '3500000000000000000000',
          logIndex: 2,
        }),
        marketId
      );

      // Verify each position is independent
      await assertPositionState(marketId, ADDRESSES.userA, {
        supplyScaled: DECIMALS.thousand,
      });
      await assertPositionState(marketId, ADDRESSES.userB, {
        supplyScaled: '2000000000000000000000',
      });
      await assertPositionState(marketId, ADDRESSES.userC, {
        supplyScaled: '500000000000000000000',
      });

      // Market totals should be sum of all
      await assertMarketState(marketId, {
        totalSupplyScaled: '3500000000000000000000',
      });

      // Three positions, three transactions
      await assertRecordCount('userPosition', 3);
      await assertRecordCount('transaction', 3);
    });

    it('handles mixed operations from multiple users', async () => {
      // User A supplies 1000
      await handleSupply(
        createSupplyEvent({
          supplier: ADDRESSES.userA,
          recipient: ADDRESSES.userA,
          amount: DECIMALS.thousand,
          scaledAmount: DECIMALS.thousand,
          logIndex: 0,
        }),
        marketId
      );

      // User B supplies 1000
      await handleSupply(
        createSupplyEvent({
          supplier: ADDRESSES.userB,
          recipient: ADDRESSES.userB,
          amount: DECIMALS.thousand,
          scaledAmount: DECIMALS.thousand,
          logIndex: 1,
        }),
        marketId
      );

      // User C supplies collateral 1000
      await handleSupplyCollateral(
        createSupplyCollateralEvent({
          supplier: ADDRESSES.userC,
          recipient: ADDRESSES.userC,
          amount: DECIMALS.thousand,
          logIndex: 2,
        }),
        marketId
      );

      // User C borrows 500
      await handleBorrow(
        createBorrowEvent({
          borrower: ADDRESSES.userC,
          recipient: ADDRESSES.userC,
          amount: '500000000000000000000',
          scaledAmount: '500000000000000000000',
          logIndex: 3,
        }),
        marketId
      );

      // User A withdraws 500
      await handleWithdraw(
        createWithdrawEvent({
          withdrawer: ADDRESSES.userA,
          recipient: ADDRESSES.userA,
          amount: '500000000000000000000',
          scaledDecrease: '500000000000000000000',
          logIndex: 4,
        }),
        marketId
      );

      // Verify final states
      await assertPositionState(marketId, ADDRESSES.userA, {
        supplyScaled: '500000000000000000000',
        debtScaled: '0',
        collateral: '0',
      });

      await assertPositionState(marketId, ADDRESSES.userB, {
        supplyScaled: DECIMALS.thousand,
        debtScaled: '0',
        collateral: '0',
      });

      await assertPositionState(marketId, ADDRESSES.userC, {
        supplyScaled: '0',
        debtScaled: '500000000000000000000',
        collateral: DECIMALS.thousand,
      });

      // Market totals
      await assertMarketState(marketId, {
        totalSupplyScaled: '1500000000000000000000', // 500 + 1000
        totalDebtScaled: '500000000000000000000',
        totalCollateral: DECIMALS.thousand,
      });
    });

    it('maintains correct totals after multiple withdrawals', async () => {
      // Multiple users supply
      await handleSupply(
        createSupplyEvent({
          supplier: ADDRESSES.userA,
          recipient: ADDRESSES.userA,
          amount: DECIMALS.thousand,
          scaledAmount: DECIMALS.thousand,
          logIndex: 0,
        }),
        marketId
      );

      await handleSupply(
        createSupplyEvent({
          supplier: ADDRESSES.userB,
          recipient: ADDRESSES.userB,
          amount: DECIMALS.thousand,
          scaledAmount: DECIMALS.thousand,
          logIndex: 1,
        }),
        marketId
      );

      // User A full withdrawal
      await handleWithdraw(
        createWithdrawEvent({
          withdrawer: ADDRESSES.userA,
          recipient: ADDRESSES.userA,
          amount: DECIMALS.thousand,
          scaledDecrease: DECIMALS.thousand,
          logIndex: 2,
        }),
        marketId
      );

      // User B partial withdrawal
      await handleWithdraw(
        createWithdrawEvent({
          withdrawer: ADDRESSES.userB,
          recipient: ADDRESSES.userB,
          amount: '300000000000000000000',
          scaledDecrease: '300000000000000000000',
          logIndex: 3,
        }),
        marketId
      );

      await assertPositionState(marketId, ADDRESSES.userA, {
        supplyScaled: '0',
      });

      await assertPositionState(marketId, ADDRESSES.userB, {
        supplyScaled: '700000000000000000000',
      });

      await assertMarketState(marketId, {
        totalSupplyScaled: '700000000000000000000',
      });
    });
  });

  describe('User interactions with each other', () => {
    beforeEach(async () => {
      await createTestMarket({ id: marketId });
    });

    it('handles supply to different recipient', async () => {
      // User A supplies but credits to User B
      await handleSupply(
        createSupplyEvent({
          supplier: ADDRESSES.userA,
          recipient: ADDRESSES.userB, // Different recipient
          amount: DECIMALS.thousand,
          scaledAmount: DECIMALS.thousand,
          logIndex: 0,
        }),
        marketId
      );

      // User A has no position
      await assertPositionState(marketId, ADDRESSES.userA, { exists: false });

      // User B has the position
      await assertPositionState(marketId, ADDRESSES.userB, {
        supplyScaled: DECIMALS.thousand,
      });

      // Transaction records User A as the actor
      const tx = await prisma.transaction.findFirst({
        where: { action: 'SUPPLY' },
      });
      expect(tx!.userAddress).toBe(ADDRESSES.userA);
      expect(tx!.recipient).toBe(ADDRESSES.userB);
    });

    it('handles repay on behalf of another user', async () => {
      // Setup: User A supplies, User B borrows
      await handleSupply(
        createSupplyEvent({
          supplier: ADDRESSES.userA,
          recipient: ADDRESSES.userA,
          amount: DECIMALS.thousand,
          scaledAmount: DECIMALS.thousand,
          logIndex: 0,
        }),
        marketId
      );

      await handleBorrow(
        createBorrowEvent({
          borrower: ADDRESSES.userB,
          recipient: ADDRESSES.userB,
          amount: '500000000000000000000',
          scaledAmount: '500000000000000000000',
          logIndex: 1,
        }),
        marketId
      );

      // User C repays User B's debt
      await handleRepay(
        createRepayEvent({
          repayer: ADDRESSES.userC,
          borrower: ADDRESSES.userB,
          amount: '500000000000000000000',
          scaledDecrease: '500000000000000000000',
          logIndex: 2,
        }),
        marketId
      );

      // User B's debt is cleared
      await assertPositionState(marketId, ADDRESSES.userB, {
        debtScaled: '0',
      });

      // User C has no position (just repaid)
      await assertPositionState(marketId, ADDRESSES.userC, { exists: false });
    });
  });

  describe('Concurrent user activity simulation', () => {
    beforeEach(async () => {
      await createTestMarket({ id: marketId });
    });

    it('handles rapid sequential events from different users', async () => {
      const users = [ADDRESSES.userA, ADDRESSES.userB, ADDRESSES.userC];

      // Simulate 10 rapid supplies from different users
      for (let i = 0; i < 10; i++) {
        const user = users[i % 3];
        await handleSupply(
          createSupplyEvent({
            supplier: user,
            recipient: user,
            amount: DECIMALS.oneToken,
            scaledAmount: DECIMALS.oneToken,
            logIndex: i,
          }),
          marketId
        );
      }

      // Each user: A=4, B=3, C=3 supplies (indices 0,3,6,9 / 1,4,7 / 2,5,8)
      await assertPositionState(marketId, ADDRESSES.userA, {
        supplyScaled: '4000000000000000000', // 4 tokens
      });
      await assertPositionState(marketId, ADDRESSES.userB, {
        supplyScaled: '3000000000000000000', // 3 tokens
      });
      await assertPositionState(marketId, ADDRESSES.userC, {
        supplyScaled: '3000000000000000000', // 3 tokens
      });

      // Total should be 10 tokens
      await assertMarketState(marketId, {
        totalSupplyScaled: '10000000000000000000',
      });

      // 10 transactions
      await assertRecordCount('transaction', 10);
    });

    it('handles interleaved supply and withdraw from multiple users', async () => {
      // Initial supplies
      await handleSupply(
        createSupplyEvent({
          supplier: ADDRESSES.userA,
          recipient: ADDRESSES.userA,
          amount: '100000000000000000000',
          scaledAmount: '100000000000000000000',
          logIndex: 0,
        }),
        marketId
      );

      await handleSupply(
        createSupplyEvent({
          supplier: ADDRESSES.userB,
          recipient: ADDRESSES.userB,
          amount: '200000000000000000000',
          scaledAmount: '200000000000000000000',
          logIndex: 1,
        }),
        marketId
      );

      // A withdraws, B supplies more
      await handleWithdraw(
        createWithdrawEvent({
          withdrawer: ADDRESSES.userA,
          recipient: ADDRESSES.userA,
          amount: '50000000000000000000',
          scaledDecrease: '50000000000000000000',
          logIndex: 2,
        }),
        marketId
      );

      await handleSupply(
        createSupplyEvent({
          supplier: ADDRESSES.userB,
          recipient: ADDRESSES.userB,
          amount: '100000000000000000000',
          scaledAmount: '100000000000000000000',
          logIndex: 3,
        }),
        marketId
      );

      // C joins
      await handleSupply(
        createSupplyEvent({
          supplier: ADDRESSES.userC,
          recipient: ADDRESSES.userC,
          amount: '150000000000000000000',
          scaledAmount: '150000000000000000000',
          logIndex: 4,
        }),
        marketId
      );

      // A withdraws rest
      await handleWithdraw(
        createWithdrawEvent({
          withdrawer: ADDRESSES.userA,
          recipient: ADDRESSES.userA,
          amount: '50000000000000000000',
          scaledDecrease: '50000000000000000000',
          logIndex: 5,
        }),
        marketId
      );

      // Final state
      await assertPositionState(marketId, ADDRESSES.userA, {
        supplyScaled: '0', // 100 - 50 - 50
      });
      await assertPositionState(marketId, ADDRESSES.userB, {
        supplyScaled: '300000000000000000000', // 200 + 100
      });
      await assertPositionState(marketId, ADDRESSES.userC, {
        supplyScaled: '150000000000000000000',
      });

      await assertMarketState(marketId, {
        totalSupplyScaled: '450000000000000000000', // 0 + 300 + 150
      });
    });
  });
});
