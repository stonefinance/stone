import { describe, it, expect, beforeEach } from 'vitest';
import { Decimal } from 'decimal.js';
import { handleUpdateParams } from '../../../src/events/handlers';
import { prisma } from '../../../src/db/client';
import {
  ADDRESSES,
  DECIMALS,
  createTestMarket,
  createUpdateParamsEvent,
  assertMarketSnapshotCreated,
  assertRecordCount,
  expectDecimalEquals,
} from '../../helpers';

describe('handleUpdateParams', () => {
  const marketId = '1';

  beforeEach(async () => {
    await createTestMarket({ id: marketId });
  });

  describe('happy path', () => {
    it('updates loanToValue (finalLtv)', async () => {
      const event = createUpdateParamsEvent({
        finalLtv: '0.75',
      });

      await handleUpdateParams(event, marketId);

      const market = await prisma.market.findUnique({ where: { id: marketId } });
      expect(market!.loanToValue.toString()).toBe('0.75');
    });

    it('updates liquidationThreshold', async () => {
      const event = createUpdateParamsEvent({
        finalLiquidationThreshold: '0.9',
      });

      await handleUpdateParams(event, marketId);

      const market = await prisma.market.findUnique({ where: { id: marketId } });
      expect(market!.liquidationThreshold.toString()).toBe('0.9');
    });

    it('updates liquidationBonus', async () => {
      const event = createUpdateParamsEvent({
        finalLiquidationBonus: '0.1',
      });

      await handleUpdateParams(event, marketId);

      const market = await prisma.market.findUnique({ where: { id: marketId } });
      expect(market!.liquidationBonus.toString()).toBe('0.1');
    });

    it('updates liquidationProtocolFee', async () => {
      const event = createUpdateParamsEvent({
        finalLiquidationProtocolFee: '0.2',
      });

      await handleUpdateParams(event, marketId);

      const market = await prisma.market.findUnique({ where: { id: marketId } });
      expect(market!.liquidationProtocolFee.toString()).toBe('0.2');
    });

    it('updates closeFactor', async () => {
      const event = createUpdateParamsEvent({
        finalCloseFactor: '0.6',
      });

      await handleUpdateParams(event, marketId);

      const market = await prisma.market.findUnique({ where: { id: marketId } });
      expect(market!.closeFactor.toString()).toBe('0.6');
    });

    it('updates protocolFee', async () => {
      const event = createUpdateParamsEvent({
        finalProtocolFee: '0.15',
      });

      await handleUpdateParams(event, marketId);

      const market = await prisma.market.findUnique({ where: { id: marketId } });
      expect(market!.protocolFee.toString()).toBe('0.15');
    });

    it('updates curatorFee', async () => {
      const event = createUpdateParamsEvent({
        finalCuratorFee: '0.1',
      });

      await handleUpdateParams(event, marketId);

      const market = await prisma.market.findUnique({ where: { id: marketId } });
      expect(market!.curatorFee.toString()).toBe('0.1');
    });

    it('updates all 9 parameters at once', async () => {
      const event = createUpdateParamsEvent({
        finalLtv: '0.7',
        finalLiquidationThreshold: '0.8',
        finalLiquidationBonus: '0.08',
        finalLiquidationProtocolFee: '0.15',
        finalCloseFactor: '0.55',
        finalProtocolFee: '0.12',
        finalCuratorFee: '0.08',
        finalSupplyCap: DECIMALS.million,
        finalBorrowCap: DECIMALS.million,
        finalEnabled: 'true',
        finalIsMutable: 'true',
      });

      await handleUpdateParams(event, marketId);

      const market = await prisma.market.findUnique({ where: { id: marketId } });
      expectDecimalEquals(market!.loanToValue, '0.7');
      expectDecimalEquals(market!.liquidationThreshold, '0.8');
      expectDecimalEquals(market!.liquidationBonus, '0.08');
      expectDecimalEquals(market!.liquidationProtocolFee, '0.15');
      expectDecimalEquals(market!.closeFactor, '0.55');
      expectDecimalEquals(market!.protocolFee, '0.12');
      expectDecimalEquals(market!.curatorFee, '0.08');
      expectDecimalEquals(market!.supplyCap, DECIMALS.million);
      expectDecimalEquals(market!.borrowCap, DECIMALS.million);
      expect(market!.enabled).toBe(true);
      expect(market!.isMutable).toBe(true);
    });

    it('creates MarketSnapshot with updated params', async () => {
      const timestamp = 1700000000;
      const event = createUpdateParamsEvent({
        finalLtv: '0.7',
        finalLiquidationThreshold: '0.8',
        finalEnabled: 'true',
        timestamp,
      });

      await handleUpdateParams(event, marketId);

      await assertMarketSnapshotCreated(marketId, timestamp, {
        loanToValue: '0.7',
        liquidationThreshold: '0.8',
        enabled: true,
      });
    });

    it('does NOT create Transaction record', async () => {
      const event = createUpdateParamsEvent();

      await handleUpdateParams(event, marketId);

      // No transaction should be created for update_params
      await assertRecordCount('transaction', 0);

      // But MarketSnapshot should exist
      await assertRecordCount('marketSnapshot', 1);
    });
  });

  describe('edge cases', () => {
    it('handles optional supplyCap (sets to null when undefined)', async () => {
      // First set a supply cap
      await prisma.market.update({
        where: { id: marketId },
        data: { supplyCap: new Decimal(DECIMALS.million) },
      });

      const event = createUpdateParamsEvent({
        finalSupplyCap: undefined, // Not provided
      });

      await handleUpdateParams(event, marketId);

      const market = await prisma.market.findUnique({ where: { id: marketId } });
      expect(market!.supplyCap).toBeNull();
    });

    it('handles optional borrowCap (sets to null when undefined)', async () => {
      // First set a borrow cap
      await prisma.market.update({
        where: { id: marketId },
        data: { borrowCap: new Decimal(DECIMALS.million) },
      });

      const event = createUpdateParamsEvent({
        finalBorrowCap: undefined, // Not provided
      });

      await handleUpdateParams(event, marketId);

      const market = await prisma.market.findUnique({ where: { id: marketId } });
      expect(market!.borrowCap).toBeNull();
    });

    it('sets supplyCap and borrowCap when provided', async () => {
      const event = createUpdateParamsEvent({
        finalSupplyCap: DECIMALS.million,
        finalBorrowCap: DECIMALS.thousand,
      });

      await handleUpdateParams(event, marketId);

      const market = await prisma.market.findUnique({ where: { id: marketId } });
      expectDecimalEquals(market!.supplyCap, DECIMALS.million);
      expectDecimalEquals(market!.borrowCap, DECIMALS.thousand);
    });

    it('converts string "true" to boolean true for enabled', async () => {
      const event = createUpdateParamsEvent({
        finalEnabled: 'true',
      });

      await handleUpdateParams(event, marketId);

      const market = await prisma.market.findUnique({ where: { id: marketId } });
      expect(market!.enabled).toBe(true);
    });

    it('converts string "false" to boolean false for enabled', async () => {
      const event = createUpdateParamsEvent({
        finalEnabled: 'false',
      });

      await handleUpdateParams(event, marketId);

      const market = await prisma.market.findUnique({ where: { id: marketId } });
      expect(market!.enabled).toBe(false);
    });

    it('converts string "true" to boolean true for isMutable', async () => {
      const event = createUpdateParamsEvent({
        finalIsMutable: 'true',
      });

      await handleUpdateParams(event, marketId);

      const market = await prisma.market.findUnique({ where: { id: marketId } });
      expect(market!.isMutable).toBe(true);
    });

    it('converts string "false" to boolean false for isMutable', async () => {
      const event = createUpdateParamsEvent({
        finalIsMutable: 'false',
      });

      await handleUpdateParams(event, marketId);

      const market = await prisma.market.findUnique({ where: { id: marketId } });
      expect(market!.isMutable).toBe(false);
    });

    it('snapshot includes calculated totalSupply (scaled * liquidityIndex)', async () => {
      // Set some scaled supply
      await prisma.market.update({
        where: { id: marketId },
        data: {
          totalSupplyScaled: new Decimal('1000000000000000000000'), // 1000
          liquidityIndex: new Decimal('1.1'),
        },
      });

      const timestamp = 1700000000;
      const event = createUpdateParamsEvent({ timestamp });

      await handleUpdateParams(event, marketId);

      const snapshot = await prisma.marketSnapshot.findUnique({
        where: { id: `${marketId}:${timestamp}` },
      });

      // totalSupply = 1000 * 1.1 = 1100
      expectDecimalEquals(snapshot!.totalSupply, '1100000000000000000000');
    });

    it('snapshot includes calculated totalDebt (scaled * borrowIndex)', async () => {
      // Set some scaled debt
      await prisma.market.update({
        where: { id: marketId },
        data: {
          totalDebtScaled: new Decimal('500000000000000000000'), // 500
          borrowIndex: new Decimal('1.2'),
        },
      });

      const timestamp = 1700000000;
      const event = createUpdateParamsEvent({ timestamp });

      await handleUpdateParams(event, marketId);

      const snapshot = await prisma.marketSnapshot.findUnique({
        where: { id: `${marketId}:${timestamp}` },
      });

      // totalDebt = 500 * 1.2 = 600
      expectDecimalEquals(snapshot!.totalDebt, '600000000000000000000');
    });

    it('preserves market state fields not in params', async () => {
      // Set some state
      await prisma.market.update({
        where: { id: marketId },
        data: {
          totalSupplyScaled: new Decimal(DECIMALS.thousand),
          totalDebtScaled: new Decimal(DECIMALS.oneToken),
          totalCollateral: new Decimal(DECIMALS.oneToken),
          borrowIndex: new Decimal('1.1'),
          liquidityIndex: new Decimal('1.05'),
        },
      });

      const event = createUpdateParamsEvent({
        finalLtv: '0.9',
      });

      await handleUpdateParams(event, marketId);

      const market = await prisma.market.findUnique({ where: { id: marketId } });
      // Param should be updated
      expectDecimalEquals(market!.loanToValue, '0.9');
      // State should be preserved
      expectDecimalEquals(market!.totalSupplyScaled, DECIMALS.thousand);
      expectDecimalEquals(market!.totalDebtScaled, DECIMALS.oneToken);
      expectDecimalEquals(market!.totalCollateral, DECIMALS.oneToken);
      expectDecimalEquals(market!.borrowIndex, '1.1');
      expectDecimalEquals(market!.liquidityIndex, '1.05');
    });
  });
});
