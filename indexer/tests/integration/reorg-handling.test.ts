import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  detectReorg,
  handleReorg,
} from '../../src/indexer/block-processor';
import { getTendermintClient } from '../../src/utils/blockchain';
import { prisma } from '../../src/db/client';
import { config } from '../../src/config';
import {
  ADDRESSES,
  DECIMALS,
  createTestMarket,
  createTestPosition,
  createIndexerState,
  createMockTendermintClient,
  assertRecordCount,
} from '../helpers';
import type { MockBlock } from '../helpers/mocks';

const mockedGetTendermintClient = vi.mocked(getTendermintClient);

describe('Reorg Handling', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(config.indexer, 'startBlockHeight', 'get').mockReturnValue(1);
  });

  describe('detectReorg', () => {
    it('returns false when no state exists', async () => {
      const result = await detectReorg(100);

      expect(result).toBe(false);
    });

    it('returns false when current height is less than or equal to last processed', async () => {
      await createIndexerState(100, 'abc123');

      const result = await detectReorg(100);

      expect(result).toBe(false);
    });

    it('returns false when hash matches', async () => {
      const hash = 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1';
      await createIndexerState(100, hash);

      const mockBlock: MockBlock = {
        height: 100,
        hash,
        timestamp: 1700000000,
        txs: [],
      };

      mockedGetTendermintClient.mockResolvedValue(
        createMockTendermintClient([mockBlock]) as any
      );

      const result = await detectReorg(101);

      expect(result).toBe(false);
    });

    it('returns true when hash differs (reorg detected)', async () => {
      await createIndexerState(100, 'oldhash');

      const mockBlock: MockBlock = {
        height: 100,
        hash: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', // Different hash
        timestamp: 1700000000,
        txs: [],
      };

      mockedGetTendermintClient.mockResolvedValue(
        createMockTendermintClient([mockBlock]) as any
      );

      const result = await detectReorg(101);

      expect(result).toBe(true);
    });

    it('returns false on RPC error (fails safe)', async () => {
      await createIndexerState(100, 'abc123');

      mockedGetTendermintClient.mockRejectedValue(new Error('Network error'));

      const result = await detectReorg(101);

      expect(result).toBe(false);
    });
  });

  describe('handleReorg', () => {
    it('deletes transactions from affected blocks', async () => {
      await createIndexerState(100, 'oldhash');
      await createTestMarket({ id: '1', marketAddress: ADDRESSES.market1 });

      // Create transactions at different block heights
      await prisma.transaction.createMany({
        data: [
          {
            id: 'tx1:0',
            txHash: 'tx1',
            blockHeight: BigInt(95),
            timestamp: new Date(),
            marketId: '1',
            userAddress: ADDRESSES.userA,
            action: 'SUPPLY',
            amount: new Decimal(DECIMALS.oneToken),
          },
          {
            id: 'tx2:0',
            txHash: 'tx2',
            blockHeight: BigInt(100),
            timestamp: new Date(),
            marketId: '1',
            userAddress: ADDRESSES.userA,
            action: 'SUPPLY',
            amount: new Decimal(DECIMALS.oneToken),
          },
          {
            id: 'tx3:0',
            txHash: 'tx3',
            blockHeight: BigInt(105),
            timestamp: new Date(),
            marketId: '1',
            userAddress: ADDRESSES.userA,
            action: 'SUPPLY',
            amount: new Decimal(DECIMALS.oneToken),
          },
        ],
      });

      // Create safe block for reorg handler
      const mockBlock: MockBlock = {
        height: 90, // safeHeight = 100 - 10 = 90
        hash: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
        timestamp: 1700000000,
        txs: [],
      };

      mockedGetTendermintClient.mockResolvedValue(
        createMockTendermintClient([mockBlock]) as any
      );

      await handleReorg(100);

      // Transactions from blocks >= 90 should be deleted
      await assertRecordCount('transaction', 0);
    });

    it('deletes InterestAccrualEvents from affected blocks', async () => {
      await createIndexerState(100, 'oldhash');
      await createTestMarket({ id: '1', marketAddress: ADDRESSES.market1 });

      await prisma.interestAccrualEvent.createMany({
        data: [
          {
            id: 'event1:0',
            marketId: '1',
            txHash: 'tx1',
            timestamp: new Date(),
            blockHeight: BigInt(85),
            borrowIndex: new Decimal('1.01'),
            liquidityIndex: new Decimal('1.005'),
            borrowRate: new Decimal('0.05'),
            liquidityRate: new Decimal('0.03'),
          },
          {
            id: 'event2:0',
            marketId: '1',
            txHash: 'tx2',
            timestamp: new Date(),
            blockHeight: BigInt(95),
            borrowIndex: new Decimal('1.02'),
            liquidityIndex: new Decimal('1.01'),
            borrowRate: new Decimal('0.05'),
            liquidityRate: new Decimal('0.03'),
          },
        ],
      });

      const mockBlock: MockBlock = {
        height: 90,
        hash: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
        timestamp: 1700000000,
        txs: [],
      };

      mockedGetTendermintClient.mockResolvedValue(
        createMockTendermintClient([mockBlock]) as any
      );

      await handleReorg(100);

      // Event at block 85 should be preserved, event at block 95 deleted
      await assertRecordCount('interestAccrualEvent', 1);
    });

    it('deletes MarketSnapshots from affected blocks', async () => {
      await createIndexerState(100, 'oldhash');
      await createTestMarket({ id: '1', marketAddress: ADDRESSES.market1 });

      await prisma.marketSnapshot.createMany({
        data: [
          {
            id: '1:1700000000',
            marketId: '1',
            timestamp: new Date(1700000000 * 1000),
            blockHeight: BigInt(85),
            borrowIndex: new Decimal('1'),
            liquidityIndex: new Decimal('1'),
            borrowRate: new Decimal('0.05'),
            liquidityRate: new Decimal('0.03'),
            totalSupply: new Decimal('0'),
            totalDebt: new Decimal('0'),
            totalCollateral: new Decimal('0'),
            utilization: new Decimal('0'),
            loanToValue: new Decimal('0.8'),
            liquidationThreshold: new Decimal('0.85'),
            enabled: true,
          },
          {
            id: '1:1700001000',
            marketId: '1',
            timestamp: new Date(1700001000 * 1000),
            blockHeight: BigInt(95),
            borrowIndex: new Decimal('1.01'),
            liquidityIndex: new Decimal('1.005'),
            borrowRate: new Decimal('0.05'),
            liquidityRate: new Decimal('0.03'),
            totalSupply: new Decimal(DECIMALS.thousand),
            totalDebt: new Decimal(DECIMALS.oneToken),
            totalCollateral: new Decimal('0'),
            utilization: new Decimal('0.1'),
            loanToValue: new Decimal('0.8'),
            liquidationThreshold: new Decimal('0.85'),
            enabled: true,
          },
        ],
      });

      const mockBlock: MockBlock = {
        height: 90,
        hash: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
        timestamp: 1700000000,
        txs: [],
      };

      mockedGetTendermintClient.mockResolvedValue(
        createMockTendermintClient([mockBlock]) as any
      );

      await handleReorg(100);

      // Snapshot at block 85 should be preserved (85 < 90), snapshot at 95 deleted
      await assertRecordCount('marketSnapshot', 1);
    });

    it('preserves Markets (not deleted during reorg)', async () => {
      await createIndexerState(100, 'oldhash');
      await createTestMarket({ id: '1', marketAddress: ADDRESSES.market1 });
      await createTestMarket({ id: '2', marketAddress: ADDRESSES.market2 });

      const mockBlock: MockBlock = {
        height: 90,
        hash: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
        timestamp: 1700000000,
        txs: [],
      };

      mockedGetTendermintClient.mockResolvedValue(
        createMockTendermintClient([mockBlock]) as any
      );

      await handleReorg(100);

      // Markets should still exist
      await assertRecordCount('market', 2);
    });

    it('preserves UserPositions (not deleted during reorg)', async () => {
      await createIndexerState(100, 'oldhash');
      await createTestMarket({ id: '1', marketAddress: ADDRESSES.market1 });
      await createTestPosition('1', ADDRESSES.userA, {
        supplyScaled: new Decimal(DECIMALS.thousand),
      });
      await createTestPosition('1', ADDRESSES.userB, {
        supplyScaled: new Decimal(DECIMALS.thousand),
      });

      const mockBlock: MockBlock = {
        height: 90,
        hash: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
        timestamp: 1700000000,
        txs: [],
      };

      mockedGetTendermintClient.mockResolvedValue(
        createMockTendermintClient([mockBlock]) as any
      );

      await handleReorg(100);

      // Positions should still exist
      await assertRecordCount('userPosition', 2);
    });

    it('resets IndexerState to safe height', async () => {
      await createIndexerState(100, 'oldhash');
      await createTestMarket({ id: '1', marketAddress: ADDRESSES.market1 });

      const safeHash = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const mockBlock: MockBlock = {
        height: 90,
        hash: safeHash,
        timestamp: 1700000000,
        txs: [],
      };

      mockedGetTendermintClient.mockResolvedValue(
        createMockTendermintClient([mockBlock]) as any
      );

      await handleReorg(100);

      const state = await prisma.indexerState.findUnique({
        where: { id: 'singleton' },
      });

      expect(Number(state!.lastProcessedBlock)).toBe(90);
      expect(state!.lastProcessedHash).toBe(safeHash);
    });

    it('uses startBlockHeight as minimum safe height', async () => {
      vi.spyOn(config.indexer, 'startBlockHeight', 'get').mockReturnValue(95);
      await createIndexerState(100, 'oldhash');
      await createTestMarket({ id: '1', marketAddress: ADDRESSES.market1 });

      const mockBlock: MockBlock = {
        height: 95, // startBlockHeight
        hash: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
        timestamp: 1700000000,
        txs: [],
      };

      mockedGetTendermintClient.mockResolvedValue(
        createMockTendermintClient([mockBlock]) as any
      );

      await handleReorg(100);

      const state = await prisma.indexerState.findUnique({
        where: { id: 'singleton' },
      });

      // Should not go below startBlockHeight
      expect(Number(state!.lastProcessedBlock)).toBe(95);
    });

    it('handles reorg at very low block height', async () => {
      vi.spyOn(config.indexer, 'startBlockHeight', 'get').mockReturnValue(1);
      await createIndexerState(5, 'oldhash');
      await createTestMarket({ id: '1', marketAddress: ADDRESSES.market1 });

      const mockBlock: MockBlock = {
        height: 1, // Can't go below startBlockHeight
        hash: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
        timestamp: 1700000000,
        txs: [],
      };

      mockedGetTendermintClient.mockResolvedValue(
        createMockTendermintClient([mockBlock]) as any
      );

      await handleReorg(5);

      const state = await prisma.indexerState.findUnique({
        where: { id: 'singleton' },
      });

      expect(Number(state!.lastProcessedBlock)).toBe(1);
    });
  });
});
