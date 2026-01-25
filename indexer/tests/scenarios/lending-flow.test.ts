import { describe, it, expect, beforeEach } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  handleSupply,
  handleBorrow,
  handleRepay,
  handleWithdraw,
  handleAccrueInterest,
} from '../../src/events/handlers';
import { prisma } from '../../src/db/client';
import {
  ADDRESSES,
  DECIMALS,
  createTestMarket,
  createSupplyEvent,
  createBorrowEvent,
  createRepayEvent,
  createWithdrawEvent,
  createAccrueInterestEvent,
  assertMarketState,
  assertPositionState,
  assertRecordCount,
  expectDecimalEquals,
} from '../helpers';

describe('Lending Flow Scenarios', () => {
  const marketId = '1';

  describe('Complete lending cycle: Supply -> Borrow -> Repay -> Withdraw', () => {
    beforeEach(async () => {
      await createTestMarket({ id: marketId });
    });

    it('processes full lending flow with interest accrual', async () => {
      const supplier = ADDRESSES.userA;
      const borrower = ADDRESSES.userB;

      // Step 1: Supplier deposits 1000 tokens
      const supplyAmount = DECIMALS.thousand;
      await handleSupply(
        createSupplyEvent({
          supplier,
          recipient: supplier,
          amount: supplyAmount,
          scaledAmount: supplyAmount,
          totalSupply: supplyAmount,
          totalDebt: DECIMALS.zero,
          utilization: DECIMALS.zero,
          logIndex: 0,
        }),
        marketId
      );

      await assertMarketState(marketId, {
        totalSupplyScaled: supplyAmount,
        totalDebtScaled: '0',
      });

      await assertPositionState(marketId, supplier, {
        supplyScaled: supplyAmount,
        debtScaled: '0',
      });

      // Step 2: Borrower borrows 500 tokens
      const borrowAmount = '500000000000000000000';
      await handleBorrow(
        createBorrowEvent({
          borrower,
          recipient: borrower,
          amount: borrowAmount,
          scaledAmount: borrowAmount,
          totalSupply: supplyAmount,
          totalDebt: borrowAmount,
          utilization: '0.5', // 50%
          logIndex: 1,
        }),
        marketId
      );

      await assertMarketState(marketId, {
        totalSupplyScaled: supplyAmount,
        totalDebtScaled: borrowAmount,
      });

      await assertPositionState(marketId, borrower, {
        debtScaled: borrowAmount,
      });

      // Step 3: Interest accrues (indices increase)
      await handleAccrueInterest(
        createAccrueInterestEvent({
          borrowIndex: '1.05',
          liquidityIndex: '1.025',
          borrowRate: '0.1',
          liquidityRate: '0.05',
          logIndex: 2,
        }),
        marketId
      );

      await assertMarketState(marketId, {
        borrowIndex: '1.05',
        liquidityIndex: '1.025',
      });

      // Step 4: Borrower repays full debt
      // Actual repay would be 500 * 1.05 = 525, but scaled decrease is still 500
      await handleRepay(
        createRepayEvent({
          repayer: borrower,
          borrower,
          amount: '525000000000000000000', // With interest
          scaledDecrease: borrowAmount,
          totalSupply: supplyAmount,
          totalDebt: DECIMALS.zero,
          utilization: DECIMALS.zero,
          logIndex: 3,
        }),
        marketId
      );

      await assertMarketState(marketId, {
        totalDebtScaled: '0',
      });

      await assertPositionState(marketId, borrower, {
        debtScaled: '0',
      });

      // Step 5: Supplier withdraws (with earned interest)
      // Actual withdrawal = 1000 * 1.025 = 1025
      await handleWithdraw(
        createWithdrawEvent({
          withdrawer: supplier,
          recipient: supplier,
          amount: '1025000000000000000000',
          scaledDecrease: supplyAmount,
          totalSupply: DECIMALS.zero,
          totalDebt: DECIMALS.zero,
          utilization: DECIMALS.zero,
          logIndex: 4,
        }),
        marketId
      );

      // Final state
      await assertMarketState(marketId, {
        totalSupplyScaled: '0',
        totalDebtScaled: '0',
      });

      await assertPositionState(marketId, supplier, {
        supplyScaled: '0',
      });

      // Verify all transactions were recorded
      await assertRecordCount('transaction', 4); // supply, borrow, repay, withdraw
      await assertRecordCount('interestAccrualEvent', 1);
    });

    it('handles multiple supply/borrow cycles from same users', async () => {
      const user = ADDRESSES.userA;

      // First supply
      await handleSupply(
        createSupplyEvent({
          supplier: user,
          recipient: user,
          amount: DECIMALS.oneToken,
          scaledAmount: DECIMALS.oneToken,
          logIndex: 0,
        }),
        marketId
      );

      // Second supply (same user)
      await handleSupply(
        createSupplyEvent({
          supplier: user,
          recipient: user,
          amount: DECIMALS.oneToken,
          scaledAmount: DECIMALS.oneToken,
          logIndex: 1,
        }),
        marketId
      );

      await assertPositionState(marketId, user, {
        supplyScaled: '2000000000000000000', // 2 tokens
      });

      // Partial withdraw
      await handleWithdraw(
        createWithdrawEvent({
          withdrawer: user,
          recipient: user,
          amount: DECIMALS.oneToken,
          scaledDecrease: DECIMALS.oneToken,
          logIndex: 2,
        }),
        marketId
      );

      await assertPositionState(marketId, user, {
        supplyScaled: DECIMALS.oneToken, // 1 token remaining
      });

      // Verify transaction count
      await assertRecordCount('transaction', 3);
    });
  });

  describe('Interest accrual impact on positions', () => {
    beforeEach(async () => {
      await createTestMarket({
        id: marketId,
        borrowIndex: new Decimal('1'),
        liquidityIndex: new Decimal('1'),
      });
    });

    it('scaled amounts remain constant while actual values change with indices', async () => {
      const user = ADDRESSES.userA;

      // Supply 1000 tokens (scaled = actual when index = 1)
      await handleSupply(
        createSupplyEvent({
          supplier: user,
          recipient: user,
          amount: DECIMALS.thousand,
          scaledAmount: DECIMALS.thousand,
          logIndex: 0,
        }),
        marketId
      );

      // Verify initial state
      const position1 = await prisma.userPosition.findUnique({
        where: { id: `${marketId}:${user}` },
      });
      expectDecimalEquals(position1!.supplyScaled, DECIMALS.thousand);

      // Interest accrues: liquidityIndex goes from 1 to 1.1
      await handleAccrueInterest(
        createAccrueInterestEvent({
          liquidityIndex: '1.1',
          borrowIndex: '1.15',
          logIndex: 1,
        }),
        marketId
      );

      // Position's scaled amount should NOT change
      const position2 = await prisma.userPosition.findUnique({
        where: { id: `${marketId}:${user}` },
      });
      expectDecimalEquals(position2!.supplyScaled, DECIMALS.thousand);

      // But the actual value (scaled * index) is now 1100
      const market = await prisma.market.findUnique({ where: { id: marketId } });
      const actualValue = new Decimal(position2!.supplyScaled.toString()).mul(
        market!.liquidityIndex
      );
      expectDecimalEquals(actualValue, '1100000000000000000000');
    });
  });

  describe('Edge cases in lending flow', () => {
    beforeEach(async () => {
      await createTestMarket({ id: marketId });
    });

    it('handles supply and immediate full withdrawal', async () => {
      const user = ADDRESSES.userA;

      await handleSupply(
        createSupplyEvent({
          supplier: user,
          recipient: user,
          amount: DECIMALS.oneToken,
          scaledAmount: DECIMALS.oneToken,
          logIndex: 0,
        }),
        marketId
      );

      await handleWithdraw(
        createWithdrawEvent({
          withdrawer: user,
          recipient: user,
          amount: DECIMALS.oneToken,
          scaledDecrease: DECIMALS.oneToken,
          logIndex: 1,
        }),
        marketId
      );

      await assertPositionState(marketId, user, {
        supplyScaled: '0',
      });

      await assertMarketState(marketId, {
        totalSupplyScaled: '0',
      });
    });

    it('handles borrow and immediate full repayment', async () => {
      // First, someone needs to supply
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

      const borrower = ADDRESSES.userB;

      await handleBorrow(
        createBorrowEvent({
          borrower,
          recipient: borrower,
          amount: DECIMALS.oneToken,
          scaledAmount: DECIMALS.oneToken,
          logIndex: 1,
        }),
        marketId
      );

      await handleRepay(
        createRepayEvent({
          repayer: borrower,
          borrower,
          amount: DECIMALS.oneToken,
          scaledDecrease: DECIMALS.oneToken,
          logIndex: 2,
        }),
        marketId
      );

      await assertPositionState(marketId, borrower, {
        debtScaled: '0',
      });
    });

    it('handles third party repayment', async () => {
      // Supply liquidity
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

      // UserB borrows
      await handleBorrow(
        createBorrowEvent({
          borrower: ADDRESSES.userB,
          recipient: ADDRESSES.userB,
          amount: DECIMALS.oneToken,
          scaledAmount: DECIMALS.oneToken,
          logIndex: 1,
        }),
        marketId
      );

      // UserC repays on behalf of UserB
      await handleRepay(
        createRepayEvent({
          repayer: ADDRESSES.userC, // Third party repayer
          borrower: ADDRESSES.userB, // Original borrower
          amount: DECIMALS.oneToken,
          scaledDecrease: DECIMALS.oneToken,
          logIndex: 2,
        }),
        marketId
      );

      // UserB's debt should be cleared
      await assertPositionState(marketId, ADDRESSES.userB, {
        debtScaled: '0',
      });

      // UserC should have no position
      await assertPositionState(marketId, ADDRESSES.userC, { exists: false });

      // Transaction should record userC as the actor
      const tx = await prisma.transaction.findMany({
        where: { action: 'REPAY' },
      });
      expect(tx[0].userAddress).toBe(ADDRESSES.userC);
    });
  });
});
