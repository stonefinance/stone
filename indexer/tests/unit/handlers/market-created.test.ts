import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMarketCreated } from '../../../src/events/handlers';
import { queryMarketInfo } from '../../../src/utils/blockchain';
import { prisma } from '../../../src/db/client';
import {
  ADDRESSES,
  createMarketCreatedEvent,
  createMockMarketInfo,
  assertRecordCount,
  expectDecimalEquals,
} from '../../helpers';

// Get the mocked version
const mockedQueryMarketInfo = vi.mocked(queryMarketInfo);

describe('handleMarketCreated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('happy path', () => {
    it('calls queryMarketInfo with market address', async () => {
      mockedQueryMarketInfo.mockResolvedValue(createMockMarketInfo());

      const event = createMarketCreatedEvent({
        marketAddress: ADDRESSES.market1,
      });

      await handleMarketCreated(event);

      expect(mockedQueryMarketInfo).toHaveBeenCalledWith(ADDRESSES.market1);
    });

    it('creates Market with config fields from contract', async () => {
      mockedQueryMarketInfo.mockResolvedValue(
        createMockMarketInfo({
          curator: ADDRESSES.curator,
          collateralDenom: 'ueth',
          debtDenom: 'uusdc',
          oracle: ADDRESSES.oracle,
        })
      );

      const event = createMarketCreatedEvent({
        marketId: '1',
        marketAddress: ADDRESSES.market1,
      });

      await handleMarketCreated(event);

      const market = await prisma.market.findUnique({ where: { id: '1' } });
      expect(market).not.toBeNull();
      expect(market!.marketAddress).toBe(ADDRESSES.market1);
      expect(market!.curator).toBe(ADDRESSES.curator);
      expect(market!.collateralDenom).toBe('ueth');
      expect(market!.debtDenom).toBe('uusdc');
      expect(market!.oracle).toBe(ADDRESSES.oracle);
    });

    it('creates Market with params from contract', async () => {
      mockedQueryMarketInfo.mockResolvedValue(
        createMockMarketInfo({
          params: {
            loan_to_value: '0.75',
            liquidation_threshold: '0.8',
            liquidation_bonus: '0.1',
            liquidation_protocol_fee: '0.2',
            close_factor: '0.6',
            interest_rate_model: { optimal_utilization: '0.9' },
            protocol_fee: '0.15',
            curator_fee: '0.1',
            supply_cap: '1000000000000000000000000',
            borrow_cap: '500000000000000000000000',
            enabled: true,
            is_mutable: false,
          },
        })
      );

      const event = createMarketCreatedEvent({
        marketId: '1',
      });

      await handleMarketCreated(event);

      const market = await prisma.market.findUnique({ where: { id: '1' } });
      expectDecimalEquals(market!.loanToValue, '0.75');
      expectDecimalEquals(market!.liquidationThreshold, '0.8');
      expectDecimalEquals(market!.liquidationBonus, '0.1');
      expectDecimalEquals(market!.liquidationProtocolFee, '0.2');
      expectDecimalEquals(market!.closeFactor, '0.6');
      expectDecimalEquals(market!.protocolFee, '0.15');
      expectDecimalEquals(market!.curatorFee, '0.1');
      expectDecimalEquals(market!.supplyCap, '1000000000000000000000000');
      expectDecimalEquals(market!.borrowCap, '500000000000000000000000');
      expect(market!.enabled).toBe(true);
      expect(market!.isMutable).toBe(false);
    });

    it('stores interestRateModel as JSON', async () => {
      const irm = {
        optimal_utilization: '0.8',
        base_rate: '0.02',
        slope1: '0.04',
        slope2: '0.75',
      };

      mockedQueryMarketInfo.mockResolvedValue(
        createMockMarketInfo({
          params: {
            loan_to_value: '0.8',
            liquidation_threshold: '0.85',
            liquidation_bonus: '0.05',
            liquidation_protocol_fee: '0.1',
            close_factor: '0.5',
            interest_rate_model: irm,
            protocol_fee: '0.1',
            curator_fee: '0.05',
            supply_cap: null,
            borrow_cap: null,
            enabled: true,
            is_mutable: true,
          },
        })
      );

      const event = createMarketCreatedEvent({ marketId: '1' });

      await handleMarketCreated(event);

      const market = await prisma.market.findUnique({ where: { id: '1' } });
      expect(market!.interestRateModel).toEqual(irm);
    });

    it('initializes state fields with default values', async () => {
      mockedQueryMarketInfo.mockResolvedValue(createMockMarketInfo());

      const event = createMarketCreatedEvent({ marketId: '1' });

      await handleMarketCreated(event);

      const market = await prisma.market.findUnique({ where: { id: '1' } });
      expectDecimalEquals(market!.borrowIndex, '1');
      expectDecimalEquals(market!.liquidityIndex, '1');
      expectDecimalEquals(market!.borrowRate, '0');
      expectDecimalEquals(market!.liquidityRate, '0');
      expectDecimalEquals(market!.totalSupplyScaled, '0');
      expectDecimalEquals(market!.totalDebtScaled, '0');
      expectDecimalEquals(market!.totalCollateral, '0');
      expectDecimalEquals(market!.utilization, '0');
      expectDecimalEquals(market!.availableLiquidity, '0');
    });

    it('sets createdAt and createdAtBlock from event', async () => {
      mockedQueryMarketInfo.mockResolvedValue(createMockMarketInfo());

      const timestamp = 1700000000;
      const blockHeight = 12345;
      const event = createMarketCreatedEvent({
        marketId: '1',
        timestamp,
        blockHeight,
      });

      await handleMarketCreated(event);

      const market = await prisma.market.findUnique({ where: { id: '1' } });
      expect(market!.createdAt.getTime()).toBe(timestamp * 1000);
      expect(Number(market!.createdAtBlock)).toBe(blockHeight);
    });

    it('sets lastUpdate from event timestamp', async () => {
      mockedQueryMarketInfo.mockResolvedValue(createMockMarketInfo());

      const timestamp = 1700000000;
      const event = createMarketCreatedEvent({
        marketId: '1',
        timestamp,
      });

      await handleMarketCreated(event);

      const market = await prisma.market.findUnique({ where: { id: '1' } });
      expect(Number(market!.lastUpdate)).toBe(timestamp);
    });
  });

  describe('edge cases', () => {
    it('handles null supply_cap from contract', async () => {
      mockedQueryMarketInfo.mockResolvedValue(
        createMockMarketInfo({
          params: {
            loan_to_value: '0.8',
            liquidation_threshold: '0.85',
            liquidation_bonus: '0.05',
            liquidation_protocol_fee: '0.1',
            close_factor: '0.5',
            interest_rate_model: {},
            protocol_fee: '0.1',
            curator_fee: '0.05',
            supply_cap: null,
            borrow_cap: null,
            enabled: true,
            is_mutable: true,
          },
        })
      );

      const event = createMarketCreatedEvent({ marketId: '1' });

      await handleMarketCreated(event);

      const market = await prisma.market.findUnique({ where: { id: '1' } });
      expect(market!.supplyCap).toBeNull();
      expect(market!.borrowCap).toBeNull();
    });

    it('throws and logs error when queryMarketInfo fails', async () => {
      mockedQueryMarketInfo.mockRejectedValue(new Error('Network error'));

      const event = createMarketCreatedEvent({ marketId: '1' });

      await expect(handleMarketCreated(event)).rejects.toThrow('Network error');

      // No market should be created
      await assertRecordCount('market', 0);
    });

    it('handles market with disabled state', async () => {
      mockedQueryMarketInfo.mockResolvedValue(
        createMockMarketInfo({
          params: {
            loan_to_value: '0.8',
            liquidation_threshold: '0.85',
            liquidation_bonus: '0.05',
            liquidation_protocol_fee: '0.1',
            close_factor: '0.5',
            interest_rate_model: {},
            protocol_fee: '0.1',
            curator_fee: '0.05',
            supply_cap: null,
            borrow_cap: null,
            enabled: false,
            is_mutable: false,
          },
        })
      );

      const event = createMarketCreatedEvent({ marketId: '1' });

      await handleMarketCreated(event);

      const market = await prisma.market.findUnique({ where: { id: '1' } });
      expect(market!.enabled).toBe(false);
      expect(market!.isMutable).toBe(false);
    });

    it('creates unique markets with different IDs', async () => {
      mockedQueryMarketInfo.mockResolvedValue(createMockMarketInfo());

      const event1 = createMarketCreatedEvent({
        marketId: '1',
        marketAddress: ADDRESSES.market1,
      });
      const event2 = createMarketCreatedEvent({
        marketId: '2',
        marketAddress: ADDRESSES.market2,
      });

      await handleMarketCreated(event1);
      await handleMarketCreated(event2);

      await assertRecordCount('market', 2);

      const market1 = await prisma.market.findUnique({ where: { id: '1' } });
      const market2 = await prisma.market.findUnique({ where: { id: '2' } });
      expect(market1!.marketAddress).toBe(ADDRESSES.market1);
      expect(market2!.marketAddress).toBe(ADDRESSES.market2);
    });
  });
});
