import { describe, it, expect, beforeEach } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  handleSupplyCollateral,
  handleBorrow,
  handleAccrueInterest,
  handleLiquidate,
} from '../../src/events/handlers';
import { prisma } from '../../src/db/client';
import {
  ADDRESSES,
  DECIMALS,
  createTestMarket,
  createSupplyCollateralEvent,
  createBorrowEvent,
  createAccrueInterestEvent,
  createLiquidateEvent,
  assertMarketState,
  assertPositionState,
  assertRecordCount,
} from '../helpers';

describe('Liquidation Flow Scenarios', () => {
  const marketId = '1';

  describe('Complete liquidation flow', () => {
    beforeEach(async () => {
      await createTestMarket({
        id: marketId,
        totalSupplyScaled: new Decimal(DECIMALS.million), // Existing liquidity
      });
    });

    it('full liquidation flow: Collateral -> Borrow -> Interest -> Liquidation', async () => {
      const borrower = ADDRESSES.userA;
      const liquidator = ADDRESSES.liquidator;

      // Step 1: Borrower supplies collateral (1000 ETH)
      const collateralAmount = DECIMALS.thousand;
      await handleSupplyCollateral(
        createSupplyCollateralEvent({
          supplier: borrower,
          recipient: borrower,
          amount: collateralAmount,
          logIndex: 0,
        }),
        marketId
      );

      await assertPositionState(marketId, borrower, {
        collateral: collateralAmount,
        debtScaled: '0',
      });

      await assertMarketState(marketId, {
        totalCollateral: collateralAmount,
      });

      // Step 2: Borrower takes a loan (800 USDC at 80% LTV)
      const borrowAmount = '800000000000000000000'; // 800 tokens
      await handleBorrow(
        createBorrowEvent({
          borrower,
          recipient: borrower,
          amount: borrowAmount,
          scaledAmount: borrowAmount,
          totalSupply: DECIMALS.million,
          totalDebt: borrowAmount,
          logIndex: 1,
        }),
        marketId
      );

      await assertPositionState(marketId, borrower, {
        collateral: collateralAmount,
        debtScaled: borrowAmount,
      });

      // Step 3: Interest accrues significantly (simulate time passing)
      // Borrow index increases from 1 to 1.2 (20% interest)
      // This makes actual debt = 800 * 1.2 = 960
      // If collateral price dropped or stayed same, position is now undercollateralized
      await handleAccrueInterest(
        createAccrueInterestEvent({
          borrowIndex: '1.2',
          liquidityIndex: '1.1',
          borrowRate: '0.2',
          liquidityRate: '0.1',
          logIndex: 2,
        }),
        marketId
      );

      // Step 4: Liquidator liquidates the position
      // Repays 400 debt (50% close factor), seizes collateral with bonus
      const debtRepaid = '400000000000000000000'; // 400 actual debt
      const scaledDebtDecrease = '333333333333333333333'; // 400 / 1.2 = 333.33 scaled
      const collateralSeized = '440000000000000000000'; // 400 + 10% bonus = 440

      const remainingCollateral = new Decimal(collateralAmount)
        .sub(collateralSeized)
        .toString();

      await handleLiquidate(
        createLiquidateEvent({
          liquidator,
          borrower,
          debtRepaid,
          scaledDebtDecrease,
          collateralSeized,
          protocolFee: '40000000000000000000', // 10% of seized = 40
          totalSupply: DECIMALS.million,
          totalDebt: '560000000000000000000', // Remaining debt
          totalCollateral: remainingCollateral,
          logIndex: 3,
        }),
        marketId
      );

      // Verify borrower position after liquidation
      const expectedDebtRemaining = new Decimal(borrowAmount)
        .sub(scaledDebtDecrease)
        .toString();

      await assertPositionState(marketId, borrower, {
        collateral: remainingCollateral,
        debtScaled: expectedDebtRemaining,
      });

      // Verify market state
      await assertMarketState(marketId, {
        totalCollateral: remainingCollateral,
      });

      // Verify transaction records
      await assertRecordCount('transaction', 3); // collateral, borrow, liquidate
      await assertRecordCount('interestAccrualEvent', 1);

      // Verify liquidation transaction details
      const liquidateTx = await prisma.transaction.findFirst({
        where: { action: 'LIQUIDATE' },
      });

      expect(liquidateTx).not.toBeNull();
      expect(liquidateTx!.userAddress).toBe(liquidator);
      expect(liquidateTx!.liquidator).toBe(liquidator);
      expect(liquidateTx!.borrower).toBe(borrower);
      expect(liquidateTx!.debtRepaid?.toString()).toBe(debtRepaid);
      expect(liquidateTx!.collateralSeized?.toString()).toBe(collateralSeized);
      expect(liquidateTx!.protocolFee?.toString()).toBe('40000000000000000000');
    });

    it('handles full position liquidation (100% close factor scenario)', async () => {
      const borrower = ADDRESSES.userA;
      const liquidator = ADDRESSES.liquidator;

      // Supply collateral
      await handleSupplyCollateral(
        createSupplyCollateralEvent({
          supplier: borrower,
          recipient: borrower,
          amount: DECIMALS.oneToken,
          logIndex: 0,
        }),
        marketId
      );

      // Borrow against collateral
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

      // Full liquidation - all debt and collateral cleared
      await handleLiquidate(
        createLiquidateEvent({
          liquidator,
          borrower,
          debtRepaid: DECIMALS.oneToken,
          scaledDebtDecrease: DECIMALS.oneToken,
          collateralSeized: DECIMALS.oneToken,
          protocolFee: DECIMALS.dust,
          totalCollateral: '0',
          logIndex: 2,
        }),
        marketId
      );

      // Position should have zero debt and collateral
      await assertPositionState(marketId, borrower, {
        debtScaled: '0',
        collateral: '0',
      });

      await assertMarketState(marketId, {
        totalCollateral: '0',
      });
    });

    it('handles partial liquidation preserving user position', async () => {
      const borrower = ADDRESSES.userA;
      const liquidator = ADDRESSES.liquidator;

      // Supply 1000 collateral
      await handleSupplyCollateral(
        createSupplyCollateralEvent({
          supplier: borrower,
          recipient: borrower,
          amount: DECIMALS.thousand,
          logIndex: 0,
        }),
        marketId
      );

      // Borrow 500
      const borrowAmount = '500000000000000000000';
      await handleBorrow(
        createBorrowEvent({
          borrower,
          recipient: borrower,
          amount: borrowAmount,
          scaledAmount: borrowAmount,
          logIndex: 1,
        }),
        marketId
      );

      // Partial liquidation - repay 100, seize 110 (10% bonus)
      const debtRepaid = '100000000000000000000';
      const collateralSeized = '110000000000000000000';

      await handleLiquidate(
        createLiquidateEvent({
          liquidator,
          borrower,
          debtRepaid,
          scaledDebtDecrease: debtRepaid,
          collateralSeized,
          protocolFee: '10000000000000000000',
          totalCollateral: '890000000000000000000', // 1000 - 110
          logIndex: 2,
        }),
        marketId
      );

      // Position should still have remaining debt and collateral
      await assertPositionState(marketId, borrower, {
        debtScaled: '400000000000000000000', // 500 - 100
        collateral: '890000000000000000000', // 1000 - 110
      });
    });
  });

  describe('Multiple liquidations on same position', () => {
    beforeEach(async () => {
      await createTestMarket({
        id: marketId,
        totalSupplyScaled: new Decimal(DECIMALS.million),
      });
    });

    it('handles sequential liquidations on same borrower', async () => {
      const borrower = ADDRESSES.userA;
      const liquidator1 = ADDRESSES.liquidator;
      const liquidator2 = ADDRESSES.userB;

      // Setup: collateral and borrow
      await handleSupplyCollateral(
        createSupplyCollateralEvent({
          supplier: borrower,
          recipient: borrower,
          amount: DECIMALS.thousand,
          logIndex: 0,
        }),
        marketId
      );

      await handleBorrow(
        createBorrowEvent({
          borrower,
          recipient: borrower,
          amount: '500000000000000000000',
          scaledAmount: '500000000000000000000',
          logIndex: 1,
        }),
        marketId
      );

      // First liquidation by liquidator1
      await handleLiquidate(
        createLiquidateEvent({
          liquidator: liquidator1,
          borrower,
          debtRepaid: '100000000000000000000',
          scaledDebtDecrease: '100000000000000000000',
          collateralSeized: '110000000000000000000',
          protocolFee: '10000000000000000000',
          totalCollateral: '890000000000000000000',
          logIndex: 2,
        }),
        marketId
      );

      // Second liquidation by liquidator2
      await handleLiquidate(
        createLiquidateEvent({
          liquidator: liquidator2,
          borrower,
          debtRepaid: '100000000000000000000',
          scaledDebtDecrease: '100000000000000000000',
          collateralSeized: '110000000000000000000',
          protocolFee: '10000000000000000000',
          totalCollateral: '780000000000000000000',
          logIndex: 3,
        }),
        marketId
      );

      // Final position state
      await assertPositionState(marketId, borrower, {
        debtScaled: '300000000000000000000', // 500 - 100 - 100
        collateral: '780000000000000000000', // 1000 - 110 - 110
      });

      // Two liquidation transactions
      const liquidateTxs = await prisma.transaction.findMany({
        where: { action: 'LIQUIDATE' },
        orderBy: { timestamp: 'asc' },
      });

      expect(liquidateTxs).toHaveLength(2);
      expect(liquidateTxs[0].liquidator).toBe(liquidator1);
      expect(liquidateTxs[1].liquidator).toBe(liquidator2);
    });
  });

  describe('Edge cases in liquidation', () => {
    beforeEach(async () => {
      await createTestMarket({
        id: marketId,
        totalSupplyScaled: new Decimal(DECIMALS.million),
        totalCollateral: new Decimal(DECIMALS.thousand),
      });
    });

    it('handles liquidation with zero protocol fee', async () => {
      const borrower = ADDRESSES.userA;
      const liquidator = ADDRESSES.liquidator;

      await handleSupplyCollateral(
        createSupplyCollateralEvent({
          supplier: borrower,
          recipient: borrower,
          amount: DECIMALS.thousand,
          logIndex: 0,
        }),
        marketId
      );

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

      await handleLiquidate(
        createLiquidateEvent({
          liquidator,
          borrower,
          debtRepaid: DECIMALS.oneToken,
          scaledDebtDecrease: DECIMALS.oneToken,
          collateralSeized: DECIMALS.oneToken,
          protocolFee: DECIMALS.zero, // No protocol fee
          totalCollateral: '999000000000000000000',
          logIndex: 2,
        }),
        marketId
      );

      const tx = await prisma.transaction.findFirst({
        where: { action: 'LIQUIDATE' },
      });

      expect(tx!.protocolFee?.toString()).toBe('0');
    });

    it('preserves supplyScaled during liquidation', async () => {
      const borrower = ADDRESSES.userA;

      // User has both supply and collateral position
      await prisma.userPosition.create({
        data: {
          id: `${marketId}:${borrower}`,
          marketId,
          userAddress: borrower,
          supplyScaled: new Decimal(DECIMALS.thousand),
          debtScaled: new Decimal('500000000000000000000'),
          collateral: new Decimal(DECIMALS.thousand),
          firstInteraction: new Date(),
          lastInteraction: new Date(),
        },
      });

      // Liquidate - should only affect debt and collateral
      await handleLiquidate(
        createLiquidateEvent({
          liquidator: ADDRESSES.liquidator,
          borrower,
          debtRepaid: '100000000000000000000',
          scaledDebtDecrease: '100000000000000000000',
          collateralSeized: '110000000000000000000',
          protocolFee: '10000000000000000000',
          totalCollateral: '890000000000000000000',
          logIndex: 0,
        }),
        marketId
      );

      // supplyScaled should be unchanged
      await assertPositionState(marketId, borrower, {
        supplyScaled: DECIMALS.thousand, // Unchanged
        debtScaled: '400000000000000000000', // Reduced
        collateral: '890000000000000000000', // Reduced
      });
    });
  });
});
