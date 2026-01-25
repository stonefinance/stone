import { describe, it, expect, beforeEach } from 'vitest';
import { Decimal } from 'decimal.js';
import { handleSupplyCollateral } from '../../../src/events/handlers';
import { prisma } from '../../../src/db/client';
import {
  ADDRESSES,
  DECIMALS,
  createTestMarket,
  createTestPosition,
  createSupplyCollateralEvent,
  assertMarketState,
  assertPositionState,
  assertTransactionCreated,
} from '../../helpers';

describe('handleSupplyCollateral', () => {
  const marketId = '1';

  beforeEach(async () => {
    await createTestMarket({ id: marketId });
  });

  describe('happy path', () => {
    it('increments totalCollateral on market', async () => {
      const event = createSupplyCollateralEvent({
        amount: DECIMALS.oneToken,
      });

      await handleSupplyCollateral(event, marketId);

      await assertMarketState(marketId, {
        totalCollateral: DECIMALS.oneToken,
      });
    });

    it('creates new position with only collateral (no supply/debt)', async () => {
      const event = createSupplyCollateralEvent({
        supplier: ADDRESSES.userA,
        recipient: ADDRESSES.userA,
        amount: DECIMALS.oneToken,
      });

      await handleSupplyCollateral(event, marketId);

      await assertPositionState(marketId, ADDRESSES.userA, {
        supplyScaled: '0',
        debtScaled: '0',
        collateral: DECIMALS.oneToken,
      });
    });

    it('increments existing position collateral', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        collateral: new Decimal(DECIMALS.oneToken),
      });

      const event = createSupplyCollateralEvent({
        supplier: ADDRESSES.userA,
        recipient: ADDRESSES.userA,
        amount: DECIMALS.oneToken,
      });

      await handleSupplyCollateral(event, marketId);

      await assertPositionState(marketId, ADDRESSES.userA, {
        collateral: '2000000000000000000',
      });
    });

    it('creates transaction with totalCollateral snapshot', async () => {
      const event = createSupplyCollateralEvent({
        supplier: ADDRESSES.userA,
        recipient: ADDRESSES.userA,
        amount: DECIMALS.oneToken,
      });

      await handleSupplyCollateral(event, marketId);

      const tx = await prisma.transaction.findUnique({
        where: { id: `${event.txHash}:${event.logIndex}` },
      });

      expect(tx!.action).toBe('SUPPLY_COLLATERAL');
      expect(tx!.totalCollateral?.toString()).toBe(DECIMALS.oneToken);
    });

    it('preserves existing supplyScaled and debtScaled when updating collateral', async () => {
      await createTestPosition(marketId, ADDRESSES.userA, {
        supplyScaled: new Decimal(DECIMALS.thousand),
        debtScaled: new Decimal(DECIMALS.oneToken),
        collateral: new Decimal(DECIMALS.oneToken),
      });

      const event = createSupplyCollateralEvent({
        supplier: ADDRESSES.userA,
        recipient: ADDRESSES.userA,
        amount: DECIMALS.oneToken,
      });

      await handleSupplyCollateral(event, marketId);

      await assertPositionState(marketId, ADDRESSES.userA, {
        supplyScaled: DECIMALS.thousand,
        debtScaled: DECIMALS.oneToken,
        collateral: '2000000000000000000',
      });
    });
  });

  describe('edge cases', () => {
    it('handles supply collateral to different recipient', async () => {
      const event = createSupplyCollateralEvent({
        supplier: ADDRESSES.userA,
        recipient: ADDRESSES.userB,
        amount: DECIMALS.oneToken,
      });

      await handleSupplyCollateral(event, marketId);

      // Position created for recipient
      await assertPositionState(marketId, ADDRESSES.userB, {
        collateral: DECIMALS.oneToken,
      });

      // No position for supplier
      await assertPositionState(marketId, ADDRESSES.userA, { exists: false });

      // Transaction userAddress is supplier
      await assertTransactionCreated(event.txHash, event.logIndex, {
        action: 'SUPPLY_COLLATERAL',
        marketId,
        userAddress: ADDRESSES.userA,
        recipient: ADDRESSES.userB,
      });
    });

    it('handles zero amount', async () => {
      const event = createSupplyCollateralEvent({
        amount: DECIMALS.zero,
      });

      await handleSupplyCollateral(event, marketId);

      await assertMarketState(marketId, {
        totalCollateral: '0',
      });
    });

    it('handles large amounts', async () => {
      const largeAmount = '100000000000000000000000000000';

      const event = createSupplyCollateralEvent({
        amount: largeAmount,
      });

      await handleSupplyCollateral(event, marketId);

      await assertMarketState(marketId, {
        totalCollateral: largeAmount,
      });
    });
  });
});
