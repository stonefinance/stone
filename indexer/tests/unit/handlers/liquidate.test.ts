import { describe, it, expect, beforeEach } from 'vitest';
import { Decimal } from 'decimal.js';
import { handleLiquidate } from '../../../src/events/handlers';
import { prisma } from '../../../src/db/client';
import {
  ADDRESSES,
  DECIMALS,
  createTestMarket,
  createTestPosition,
  createLiquidateEvent,
  assertMarketState,
  assertPositionState,
  assertTransactionCreated,
  expectDecimalEquals,
} from '../../helpers';

describe('handleLiquidate', () => {
  const marketId = '1';

  beforeEach(async () => {
    await createTestMarket({
      id: marketId,
      totalDebtScaled: new Decimal(DECIMALS.thousand),
      totalCollateral: new Decimal(DECIMALS.thousand),
    });
  });

  describe('happy path', () => {
    it('decrements totalDebtScaled by scaledDebtDecrease', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        debtScaled: new Decimal(DECIMALS.thousand),
        collateral: new Decimal(DECIMALS.thousand),
      });

      const event = createLiquidateEvent({
        borrower: ADDRESSES.userA,
        scaledDebtDecrease: DECIMALS.oneToken,
        totalCollateral: '999000000000000000000', // After seizure
      });

      await handleLiquidate(event, marketId);

      await assertMarketState(marketId, {
        totalDebtScaled: '999000000000000000000',
      });
    });

    it('sets totalCollateral from event (absolute value)', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        debtScaled: new Decimal(DECIMALS.thousand),
        collateral: new Decimal(DECIMALS.thousand),
      });

      const newTotalCollateral = '500000000000000000000';
      const event = createLiquidateEvent({
        borrower: ADDRESSES.userA,
        totalCollateral: newTotalCollateral,
      });

      await handleLiquidate(event, marketId);

      await assertMarketState(marketId, {
        totalCollateral: newTotalCollateral,
      });
    });

    it('updates borrower position: reduces debt and collateral', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        debtScaled: new Decimal(DECIMALS.thousand),
        collateral: new Decimal(DECIMALS.thousand),
      });

      const event = createLiquidateEvent({
        borrower: ADDRESSES.userA,
        scaledDebtDecrease: DECIMALS.oneToken,
        collateralSeized: DECIMALS.oneToken,
      });

      await handleLiquidate(event, marketId);

      await assertPositionState(marketId, ADDRESSES.userA, {
        debtScaled: '999000000000000000000',
        collateral: '999000000000000000000',
      });
    });

    it('creates transaction with all liquidation fields', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        debtScaled: new Decimal(DECIMALS.thousand),
        collateral: new Decimal(DECIMALS.thousand),
      });

      const event = createLiquidateEvent({
        liquidator: ADDRESSES.liquidator,
        borrower: ADDRESSES.userA,
        debtRepaid: DECIMALS.oneToken,
        collateralSeized: DECIMALS.oneToken,
        protocolFee: DECIMALS.dust,
      });

      await handleLiquidate(event, marketId);

      await assertTransactionCreated(event.txHash, event.logIndex, {
        action: 'LIQUIDATE',
        marketId,
        userAddress: ADDRESSES.liquidator, // Liquidator is the user
        liquidator: ADDRESSES.liquidator,
        borrower: ADDRESSES.userA,
        debtRepaid: DECIMALS.oneToken,
        collateralSeized: DECIMALS.oneToken,
        protocolFee: DECIMALS.dust,
      });
    });

    it('records market state snapshot in transaction', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        debtScaled: new Decimal(DECIMALS.thousand),
        collateral: new Decimal(DECIMALS.thousand),
      });

      const event = createLiquidateEvent({
        borrower: ADDRESSES.userA,
        totalSupply: DECIMALS.thousand,
        totalDebt: '999000000000000000000',
        totalCollateral: '999000000000000000000',
        utilization: DECIMALS.tenPercent,
      });

      await handleLiquidate(event, marketId);

      const tx = await prisma.transaction.findUnique({
        where: { id: `${event.txHash}:${event.logIndex}` },
      });

      expectDecimalEquals(tx!.totalSupply, DECIMALS.thousand);
      expectDecimalEquals(tx!.totalDebt, '999000000000000000000');
      expectDecimalEquals(tx!.totalCollateral, '999000000000000000000');
      expectDecimalEquals(tx!.utilization, DECIMALS.tenPercent);
    });
  });

  describe('edge cases', () => {
    it('does not create borrower position if none exists', async () => {
      const event = createLiquidateEvent({
        borrower: ADDRESSES.userA,
        scaledDebtDecrease: DECIMALS.oneToken,
        collateralSeized: DECIMALS.oneToken,
        totalCollateral: '999000000000000000000',
      });

      await handleLiquidate(event, marketId);

      // No position should be created
      await assertPositionState(marketId, ADDRESSES.userA, { exists: false });

      // Market should still be updated
      await assertMarketState(marketId, {
        totalDebtScaled: '999000000000000000000',
        totalCollateral: '999000000000000000000',
      });
    });

    it('handles full liquidation (debt and collateral to zero)', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        debtScaled: new Decimal(DECIMALS.oneToken),
        collateral: new Decimal(DECIMALS.oneToken),
      });

      const event = createLiquidateEvent({
        borrower: ADDRESSES.userA,
        scaledDebtDecrease: DECIMALS.oneToken,
        collateralSeized: DECIMALS.oneToken,
        totalCollateral: '999000000000000000000',
      });

      await handleLiquidate(event, marketId);

      await assertPositionState(marketId, ADDRESSES.userA, {
        debtScaled: '0',
        collateral: '0',
      });
    });

    it('preserves supplyScaled when liquidating', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        supplyScaled: new Decimal(DECIMALS.thousand),
        debtScaled: new Decimal(DECIMALS.thousand),
        collateral: new Decimal(DECIMALS.thousand),
      });

      const event = createLiquidateEvent({
        borrower: ADDRESSES.userA,
        scaledDebtDecrease: DECIMALS.oneToken,
        collateralSeized: DECIMALS.oneToken,
      });

      await handleLiquidate(event, marketId);

      await assertPositionState(marketId, ADDRESSES.userA, {
        supplyScaled: DECIMALS.thousand, // Unchanged
        debtScaled: '999000000000000000000',
        collateral: '999000000000000000000',
      });
    });

    it('handles partial liquidation', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        debtScaled: new Decimal(DECIMALS.thousand),
        collateral: new Decimal(DECIMALS.thousand),
      });

      // Liquidate 50%
      const halfDebt = '500000000000000000000';
      const halfCollateral = '500000000000000000000';
      const event = createLiquidateEvent({
        borrower: ADDRESSES.userA,
        debtRepaid: halfDebt,
        scaledDebtDecrease: halfDebt,
        collateralSeized: halfCollateral,
        totalCollateral: halfCollateral,
      });

      await handleLiquidate(event, marketId);

      await assertPositionState(marketId, ADDRESSES.userA, {
        debtScaled: halfDebt,
        collateral: halfCollateral,
      });
    });

    it('throws error when market not found', async () => {
      const event = createLiquidateEvent();

      await expect(handleLiquidate(event, 'non-existent')).rejects.toThrow(
        'Market not found: non-existent'
      );
    });

    it('handles large protocol fee', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        debtScaled: new Decimal(DECIMALS.thousand),
        collateral: new Decimal(DECIMALS.thousand),
      });

      const largeProtocolFee = '100000000000000000000'; // 100 tokens
      const event = createLiquidateEvent({
        borrower: ADDRESSES.userA,
        protocolFee: largeProtocolFee,
      });

      await handleLiquidate(event, marketId);

      const tx = await prisma.transaction.findUnique({
        where: { id: `${event.txHash}:${event.logIndex}` },
      });

      expect(tx!.protocolFee?.toString()).toBe(largeProtocolFee);
    });
  });
});
