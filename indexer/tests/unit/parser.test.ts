import { describe, it, expect } from 'vitest';
import {
  parseEventAttributes,
  parseMarketCreatedEvent,
  parseMarketEvent,
} from '../../src/events/parser';
import type { Event as TendermintEvent } from '@cosmjs/tendermint-rpc/build/tendermint37/responses';
import { ADDRESSES, DECIMALS } from '../helpers';

describe('Event Parsers', () => {
  describe('parseEventAttributes', () => {
    it('converts Tendermint event attributes to Record<string, string>', () => {
      const event: TendermintEvent = {
        type: 'wasm',
        attributes: [
          { key: 'action', value: 'supply' },
          { key: 'amount', value: '1000' },
          { key: '_contract_address', value: ADDRESSES.market1 },
        ],
      };

      const result = parseEventAttributes(event);

      expect(result).toEqual({
        action: 'supply',
        amount: '1000',
        _contract_address: ADDRESSES.market1,
      });
    });

    it('handles empty attributes', () => {
      const event: TendermintEvent = {
        type: 'wasm',
        attributes: [],
      };

      const result = parseEventAttributes(event);
      expect(result).toEqual({});
    });
  });

  describe('parseMarketCreatedEvent', () => {
    const baseMetadata = {
      txHash: 'ABC123',
      blockHeight: 12345,
      timestamp: 1700000000,
      logIndex: 0,
    };

    it('parses valid market_instantiated event', () => {
      const attributes = {
        action: 'market_instantiated',
        market_id: '1',
        market_address: ADDRESSES.market1,
      };

      const result = parseMarketCreatedEvent(
        attributes,
        baseMetadata.txHash,
        baseMetadata.blockHeight,
        baseMetadata.timestamp,
        baseMetadata.logIndex
      );

      expect(result).toEqual({
        action: 'market_instantiated',
        marketId: '1',
        marketAddress: ADDRESSES.market1,
        txHash: 'ABC123',
        blockHeight: 12345,
        timestamp: 1700000000,
        logIndex: 0,
      });
    });

    it('returns null for wrong action', () => {
      const attributes = {
        action: 'supply',
        market_id: '1',
        market_address: ADDRESSES.market1,
      };

      const result = parseMarketCreatedEvent(
        attributes,
        baseMetadata.txHash,
        baseMetadata.blockHeight,
        baseMetadata.timestamp,
        baseMetadata.logIndex
      );

      expect(result).toBeNull();
    });

    it('returns null when market_id is missing', () => {
      const attributes = {
        action: 'market_instantiated',
        market_address: ADDRESSES.market1,
      };

      const result = parseMarketCreatedEvent(
        attributes,
        baseMetadata.txHash,
        baseMetadata.blockHeight,
        baseMetadata.timestamp,
        baseMetadata.logIndex
      );

      expect(result).toBeNull();
    });

    it('returns null when market_address is missing', () => {
      const attributes = {
        action: 'market_instantiated',
        market_id: '1',
      };

      const result = parseMarketCreatedEvent(
        attributes,
        baseMetadata.txHash,
        baseMetadata.blockHeight,
        baseMetadata.timestamp,
        baseMetadata.logIndex
      );

      expect(result).toBeNull();
    });
  });

  describe('parseMarketEvent', () => {
    const baseMetadata = {
      marketAddress: ADDRESSES.market1,
      txHash: 'ABC123',
      blockHeight: 12345,
      timestamp: 1700000000,
      logIndex: 0,
    };

    describe('supply', () => {
      it('parses supply event with all fields', () => {
        const attributes = {
          action: 'supply',
          supplier: ADDRESSES.userA,
          recipient: ADDRESSES.userA,
          amount: DECIMALS.oneToken,
          scaled_amount: DECIMALS.oneToken,
          total_supply: DECIMALS.thousand,
          total_debt: DECIMALS.zero,
          utilization: DECIMALS.zero,
        };

        const result = parseMarketEvent(
          attributes,
          baseMetadata.marketAddress,
          baseMetadata.txHash,
          baseMetadata.blockHeight,
          baseMetadata.timestamp,
          baseMetadata.logIndex
        );

        expect(result).toEqual({
          action: 'supply',
          supplier: ADDRESSES.userA,
          recipient: ADDRESSES.userA,
          amount: DECIMALS.oneToken,
          scaledAmount: DECIMALS.oneToken,
          totalSupply: DECIMALS.thousand,
          totalDebt: DECIMALS.zero,
          utilization: DECIMALS.zero,
          marketAddress: ADDRESSES.market1,
          txHash: 'ABC123',
          blockHeight: 12345,
          timestamp: 1700000000,
          logIndex: 0,
        });
      });
    });

    describe('withdraw', () => {
      it('parses withdraw event with scaled_decrease', () => {
        const attributes = {
          action: 'withdraw',
          withdrawer: ADDRESSES.userA,
          recipient: ADDRESSES.userA,
          amount: DECIMALS.oneToken,
          scaled_decrease: DECIMALS.oneToken,
          total_supply: DECIMALS.zero,
          total_debt: DECIMALS.zero,
          utilization: DECIMALS.zero,
        };

        const result = parseMarketEvent(
          attributes,
          baseMetadata.marketAddress,
          baseMetadata.txHash,
          baseMetadata.blockHeight,
          baseMetadata.timestamp,
          baseMetadata.logIndex
        );

        expect(result).not.toBeNull();
        expect(result!.action).toBe('withdraw');
        expect((result as any).withdrawer).toBe(ADDRESSES.userA);
        expect((result as any).scaledDecrease).toBe(DECIMALS.oneToken);
      });
    });

    describe('supply_collateral', () => {
      it('parses supply_collateral event (no scaled amount)', () => {
        const attributes = {
          action: 'supply_collateral',
          supplier: ADDRESSES.userA,
          recipient: ADDRESSES.userA,
          amount: DECIMALS.oneToken,
        };

        const result = parseMarketEvent(
          attributes,
          baseMetadata.marketAddress,
          baseMetadata.txHash,
          baseMetadata.blockHeight,
          baseMetadata.timestamp,
          baseMetadata.logIndex
        );

        expect(result).not.toBeNull();
        expect(result!.action).toBe('supply_collateral');
        expect((result as any).supplier).toBe(ADDRESSES.userA);
        expect((result as any).amount).toBe(DECIMALS.oneToken);
        // Should not have scaledAmount field
        expect((result as any).scaledAmount).toBeUndefined();
      });
    });

    describe('withdraw_collateral', () => {
      it('parses withdraw_collateral event', () => {
        const attributes = {
          action: 'withdraw_collateral',
          withdrawer: ADDRESSES.userA,
          recipient: ADDRESSES.userB,
          amount: DECIMALS.oneToken,
        };

        const result = parseMarketEvent(
          attributes,
          baseMetadata.marketAddress,
          baseMetadata.txHash,
          baseMetadata.blockHeight,
          baseMetadata.timestamp,
          baseMetadata.logIndex
        );

        expect(result).not.toBeNull();
        expect(result!.action).toBe('withdraw_collateral');
        expect((result as any).withdrawer).toBe(ADDRESSES.userA);
        expect((result as any).recipient).toBe(ADDRESSES.userB);
      });
    });

    describe('borrow', () => {
      it('parses borrow event with scaled_amount', () => {
        const attributes = {
          action: 'borrow',
          borrower: ADDRESSES.userA,
          recipient: ADDRESSES.userA,
          amount: DECIMALS.oneToken,
          scaled_amount: DECIMALS.oneToken,
          total_supply: DECIMALS.thousand,
          total_debt: DECIMALS.oneToken,
          utilization: DECIMALS.tenPercent,
        };

        const result = parseMarketEvent(
          attributes,
          baseMetadata.marketAddress,
          baseMetadata.txHash,
          baseMetadata.blockHeight,
          baseMetadata.timestamp,
          baseMetadata.logIndex
        );

        expect(result).not.toBeNull();
        expect(result!.action).toBe('borrow');
        expect((result as any).borrower).toBe(ADDRESSES.userA);
        expect((result as any).scaledAmount).toBe(DECIMALS.oneToken);
      });
    });

    describe('repay', () => {
      it('parses repay event with repayer and borrower', () => {
        const attributes = {
          action: 'repay',
          repayer: ADDRESSES.userB,
          borrower: ADDRESSES.userA,
          amount: DECIMALS.oneToken,
          scaled_decrease: DECIMALS.oneToken,
          total_supply: DECIMALS.thousand,
          total_debt: DECIMALS.zero,
          utilization: DECIMALS.zero,
        };

        const result = parseMarketEvent(
          attributes,
          baseMetadata.marketAddress,
          baseMetadata.txHash,
          baseMetadata.blockHeight,
          baseMetadata.timestamp,
          baseMetadata.logIndex
        );

        expect(result).not.toBeNull();
        expect(result!.action).toBe('repay');
        expect((result as any).repayer).toBe(ADDRESSES.userB);
        expect((result as any).borrower).toBe(ADDRESSES.userA);
        expect((result as any).scaledDecrease).toBe(DECIMALS.oneToken);
      });
    });

    describe('liquidate', () => {
      it('parses liquidate event with all liquidation fields', () => {
        const attributes = {
          action: 'liquidate',
          liquidator: ADDRESSES.liquidator,
          borrower: ADDRESSES.userA,
          debt_repaid: DECIMALS.oneToken,
          collateral_seized: DECIMALS.oneToken,
          protocol_fee: DECIMALS.dust,
          scaled_debt_decrease: DECIMALS.oneToken,
          total_supply: DECIMALS.thousand,
          total_debt: DECIMALS.zero,
          total_collateral: DECIMALS.zero,
          utilization: DECIMALS.zero,
        };

        const result = parseMarketEvent(
          attributes,
          baseMetadata.marketAddress,
          baseMetadata.txHash,
          baseMetadata.blockHeight,
          baseMetadata.timestamp,
          baseMetadata.logIndex
        );

        expect(result).not.toBeNull();
        expect(result!.action).toBe('liquidate');
        expect((result as any).liquidator).toBe(ADDRESSES.liquidator);
        expect((result as any).borrower).toBe(ADDRESSES.userA);
        expect((result as any).debtRepaid).toBe(DECIMALS.oneToken);
        expect((result as any).collateralSeized).toBe(DECIMALS.oneToken);
        expect((result as any).protocolFee).toBe(DECIMALS.dust);
        expect((result as any).scaledDebtDecrease).toBe(DECIMALS.oneToken);
        expect((result as any).totalCollateral).toBe(DECIMALS.zero);
      });
    });

    describe('accrue_interest', () => {
      it('parses accrue_interest event with indices and rates', () => {
        const attributes = {
          action: 'accrue_interest',
          borrow_index: '1.05',
          liquidity_index: '1.03',
          borrow_rate: '0.05',
          liquidity_rate: '0.03',
          last_update: '1700000000',
        };

        const result = parseMarketEvent(
          attributes,
          baseMetadata.marketAddress,
          baseMetadata.txHash,
          baseMetadata.blockHeight,
          baseMetadata.timestamp,
          baseMetadata.logIndex
        );

        expect(result).not.toBeNull();
        expect(result!.action).toBe('accrue_interest');
        expect((result as any).borrowIndex).toBe('1.05');
        expect((result as any).liquidityIndex).toBe('1.03');
        expect((result as any).borrowRate).toBe('0.05');
        expect((result as any).liquidityRate).toBe('0.03');
        expect((result as any).lastUpdate).toBe('1700000000');
      });
    });

    describe('update_params', () => {
      it('parses update_params event with all parameter fields', () => {
        const attributes = {
          action: 'update_params',
          final_ltv: '0.8',
          final_liquidation_threshold: '0.85',
          final_liquidation_bonus: '0.05',
          final_liquidation_protocol_fee: '0.1',
          final_close_factor: '0.5',
          final_protocol_fee: '0.1',
          final_curator_fee: '0.05',
          final_supply_cap: DECIMALS.million,
          final_borrow_cap: DECIMALS.million,
          final_enabled: 'true',
          final_is_mutable: 'false',
        };

        const result = parseMarketEvent(
          attributes,
          baseMetadata.marketAddress,
          baseMetadata.txHash,
          baseMetadata.blockHeight,
          baseMetadata.timestamp,
          baseMetadata.logIndex
        );

        expect(result).not.toBeNull();
        expect(result!.action).toBe('update_params');
        expect((result as any).finalLtv).toBe('0.8');
        expect((result as any).finalLiquidationThreshold).toBe('0.85');
        expect((result as any).finalLiquidationBonus).toBe('0.05');
        expect((result as any).finalLiquidationProtocolFee).toBe('0.1');
        expect((result as any).finalCloseFactor).toBe('0.5');
        expect((result as any).finalProtocolFee).toBe('0.1');
        expect((result as any).finalCuratorFee).toBe('0.05');
        expect((result as any).finalSupplyCap).toBe(DECIMALS.million);
        expect((result as any).finalBorrowCap).toBe(DECIMALS.million);
        expect((result as any).finalEnabled).toBe('true');
        expect((result as any).finalIsMutable).toBe('false');
      });

      it('handles optional supply_cap and borrow_cap (undefined)', () => {
        const attributes = {
          action: 'update_params',
          final_ltv: '0.8',
          final_liquidation_threshold: '0.85',
          final_liquidation_bonus: '0.05',
          final_liquidation_protocol_fee: '0.1',
          final_close_factor: '0.5',
          final_protocol_fee: '0.1',
          final_curator_fee: '0.05',
          final_enabled: 'true',
          final_is_mutable: 'true',
        };

        const result = parseMarketEvent(
          attributes,
          baseMetadata.marketAddress,
          baseMetadata.txHash,
          baseMetadata.blockHeight,
          baseMetadata.timestamp,
          baseMetadata.logIndex
        );

        expect(result).not.toBeNull();
        expect((result as any).finalSupplyCap).toBeUndefined();
        expect((result as any).finalBorrowCap).toBeUndefined();
      });
    });

    describe('unknown action', () => {
      it('returns null for unknown action type', () => {
        const attributes = {
          action: 'unknown_action',
          some_field: 'value',
        };

        const result = parseMarketEvent(
          attributes,
          baseMetadata.marketAddress,
          baseMetadata.txHash,
          baseMetadata.blockHeight,
          baseMetadata.timestamp,
          baseMetadata.logIndex
        );

        expect(result).toBeNull();
      });
    });
  });
});
