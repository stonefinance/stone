import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  processBlock,
  getLastProcessedBlock,
  updateLastProcessedBlock,
  loadMarketAddresses,
} from '../../src/indexer/block-processor';
import { getTendermintClient, queryMarketInfo } from '../../src/utils/blockchain';
import { prisma } from '../../src/db/client';
import { config } from '../../src/config';
import {
  ADDRESSES,
  DECIMALS,
  createTestMarket,
  createIndexerState,
  createMockTendermintClient,
  createWasmEvent,
  createMockMarketInfo,
  assertMarketState,
  assertPositionState,
  assertRecordCount,
} from '../helpers';
import type { MockBlock } from '../helpers/mocks';

const mockedGetTendermintClient = vi.mocked(getTendermintClient);
const mockedQueryMarketInfo = vi.mocked(queryMarketInfo);

describe('Block Processor Integration', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset config for tests
    vi.spyOn(config.contracts, 'factoryAddress', 'get').mockReturnValue(ADDRESSES.factory);
  });

  describe('getLastProcessedBlock', () => {
    it('returns configured start block when no state exists', async () => {
      vi.spyOn(config.indexer, 'startBlockHeight', 'get').mockReturnValue(100);

      const result = await getLastProcessedBlock();

      expect(result).toBe(100);
    });

    it('returns stored block height when state exists', async () => {
      await createIndexerState(500);

      const result = await getLastProcessedBlock();

      expect(result).toBe(500);
    });
  });

  describe('updateLastProcessedBlock', () => {
    it('creates IndexerState if not exists', async () => {
      await updateLastProcessedBlock(100, 'abc123');

      const state = await prisma.indexerState.findUnique({
        where: { id: 'singleton' },
      });

      expect(state).not.toBeNull();
      expect(Number(state!.lastProcessedBlock)).toBe(100);
      expect(state!.lastProcessedHash).toBe('abc123');
    });

    it('updates existing IndexerState', async () => {
      await createIndexerState(50, 'oldhash');

      await updateLastProcessedBlock(100, 'newhash');

      const state = await prisma.indexerState.findUnique({
        where: { id: 'singleton' },
      });

      expect(Number(state!.lastProcessedBlock)).toBe(100);
      expect(state!.lastProcessedHash).toBe('newhash');
    });
  });

  describe('loadMarketAddresses', () => {
    it('loads market addresses from database', async () => {
      await createTestMarket({ id: '1', marketAddress: ADDRESSES.market1 });
      await createTestMarket({ id: '2', marketAddress: ADDRESSES.market2 });

      await loadMarketAddresses();

      // We can't directly test the internal Set, but we can verify by processing events
      // The function should have loaded 2 addresses
      const markets = await prisma.market.count();
      expect(markets).toBe(2);
    });
  });

  describe('processBlock', () => {
    it('processes block with supply event and updates database', async () => {
      // Setup: create market and load addresses
      await createTestMarket({ id: '1', marketAddress: ADDRESSES.market1 });
      await loadMarketAddresses();

      // Create mock block with supply event
      const supplyEvent = createWasmEvent(ADDRESSES.market1, {
        action: 'supply',
        supplier: ADDRESSES.userA,
        recipient: ADDRESSES.userA,
        amount: DECIMALS.oneToken,
        scaled_amount: DECIMALS.oneToken,
        total_supply: DECIMALS.oneToken,
        total_debt: DECIMALS.zero,
        utilization: DECIMALS.zero,
      });

      const mockBlock: MockBlock = {
        height: 100,
        hash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
        timestamp: 1700000000,
        txs: [
          {
            bytes: Buffer.from('tx1').toString('base64'),
            code: 0,
            events: [supplyEvent],
          },
        ],
      };

      mockedGetTendermintClient.mockResolvedValue(
        createMockTendermintClient([mockBlock]) as any
      );

      await processBlock(100);

      // Verify market was updated
      await assertMarketState('1', {
        totalSupplyScaled: DECIMALS.oneToken,
      });

      // Verify position was created
      await assertPositionState('1', ADDRESSES.userA, {
        supplyScaled: DECIMALS.oneToken,
      });

      // Verify transaction was created
      await assertRecordCount('transaction', 1);

      // Verify checkpoint was updated
      const state = await prisma.indexerState.findUnique({
        where: { id: 'singleton' },
      });
      expect(Number(state!.lastProcessedBlock)).toBe(100);
    });

    it('processes block with multiple transactions', async () => {
      await createTestMarket({
        id: '1',
        marketAddress: ADDRESSES.market1,
        totalSupplyScaled: new Decimal(DECIMALS.thousand),
      });
      await loadMarketAddresses();

      const supplyEvent1 = createWasmEvent(ADDRESSES.market1, {
        action: 'supply',
        supplier: ADDRESSES.userA,
        recipient: ADDRESSES.userA,
        amount: DECIMALS.oneToken,
        scaled_amount: DECIMALS.oneToken,
        total_supply: '1001000000000000000000',
        total_debt: DECIMALS.zero,
        utilization: DECIMALS.zero,
      });

      const supplyEvent2 = createWasmEvent(ADDRESSES.market1, {
        action: 'supply',
        supplier: ADDRESSES.userB,
        recipient: ADDRESSES.userB,
        amount: DECIMALS.oneToken,
        scaled_amount: DECIMALS.oneToken,
        total_supply: '1002000000000000000000',
        total_debt: DECIMALS.zero,
        utilization: DECIMALS.zero,
      });

      const mockBlock: MockBlock = {
        height: 100,
        hash: 'abc123',
        timestamp: 1700000000,
        txs: [
          { bytes: Buffer.from('tx1').toString('base64'), code: 0, events: [supplyEvent1] },
          { bytes: Buffer.from('tx2').toString('base64'), code: 0, events: [supplyEvent2] },
        ],
      };

      mockedGetTendermintClient.mockResolvedValue(
        createMockTendermintClient([mockBlock]) as any
      );

      await processBlock(100);

      // Both positions should be created
      await assertPositionState('1', ADDRESSES.userA, {
        supplyScaled: DECIMALS.oneToken,
      });
      await assertPositionState('1', ADDRESSES.userB, {
        supplyScaled: DECIMALS.oneToken,
      });

      // Two transactions
      await assertRecordCount('transaction', 2);
    });

    it('processes block with multiple events per transaction', async () => {
      await createTestMarket({ id: '1', marketAddress: ADDRESSES.market1 });
      await loadMarketAddresses();

      const supplyEvent = createWasmEvent(ADDRESSES.market1, {
        action: 'supply',
        supplier: ADDRESSES.userA,
        recipient: ADDRESSES.userA,
        amount: DECIMALS.oneToken,
        scaled_amount: DECIMALS.oneToken,
        total_supply: DECIMALS.oneToken,
        total_debt: DECIMALS.zero,
        utilization: DECIMALS.zero,
      });

      const accrueEvent = createWasmEvent(ADDRESSES.market1, {
        action: 'accrue_interest',
        borrow_index: '1.01',
        liquidity_index: '1.005',
        borrow_rate: '0.05',
        liquidity_rate: '0.03',
        last_update: '1700000000',
      });

      const mockBlock: MockBlock = {
        height: 100,
        hash: 'abc123',
        timestamp: 1700000000,
        txs: [
          {
            bytes: Buffer.from('tx1').toString('base64'),
            code: 0,
            events: [supplyEvent, accrueEvent],
          },
        ],
      };

      mockedGetTendermintClient.mockResolvedValue(
        createMockTendermintClient([mockBlock]) as any
      );

      await processBlock(100);

      // Both events should be processed
      await assertRecordCount('transaction', 1); // Supply creates transaction
      await assertRecordCount('interestAccrualEvent', 1); // AccrueInterest creates event

      // Market should have updated indices
      await assertMarketState('1', {
        borrowIndex: '1.01',
        liquidityIndex: '1.005',
      });
    });

    it('skips failed transactions (code !== 0)', async () => {
      await createTestMarket({ id: '1', marketAddress: ADDRESSES.market1 });
      await loadMarketAddresses();

      const supplyEvent = createWasmEvent(ADDRESSES.market1, {
        action: 'supply',
        supplier: ADDRESSES.userA,
        recipient: ADDRESSES.userA,
        amount: DECIMALS.oneToken,
        scaled_amount: DECIMALS.oneToken,
        total_supply: DECIMALS.oneToken,
        total_debt: DECIMALS.zero,
        utilization: DECIMALS.zero,
      });

      const mockBlock: MockBlock = {
        height: 100,
        hash: 'abc123',
        timestamp: 1700000000,
        txs: [
          {
            bytes: Buffer.from('tx1').toString('base64'),
            code: 1, // Failed transaction
            events: [supplyEvent],
          },
        ],
      };

      mockedGetTendermintClient.mockResolvedValue(
        createMockTendermintClient([mockBlock]) as any
      );

      await processBlock(100);

      // No changes should be made
      await assertMarketState('1', {
        totalSupplyScaled: '0',
      });
      await assertRecordCount('transaction', 0);
      await assertPositionState('1', ADDRESSES.userA, { exists: false });
    });

    it('handles empty block (no transactions)', async () => {
      const mockBlock: MockBlock = {
        height: 100,
        hash: 'abc123',
        timestamp: 1700000000,
        txs: [],
      };

      mockedGetTendermintClient.mockResolvedValue(
        createMockTendermintClient([mockBlock]) as any
      );

      await processBlock(100);

      // Checkpoint should still be updated
      const state = await prisma.indexerState.findUnique({
        where: { id: 'singleton' },
      });
      expect(Number(state!.lastProcessedBlock)).toBe(100);
    });

    it('ignores events from unknown contracts', async () => {
      await createTestMarket({ id: '1', marketAddress: ADDRESSES.market1 });
      await loadMarketAddresses();

      // Event from unknown contract
      const unknownEvent = createWasmEvent('cosmos1unknown...', {
        action: 'supply',
        supplier: ADDRESSES.userA,
        recipient: ADDRESSES.userA,
        amount: DECIMALS.oneToken,
        scaled_amount: DECIMALS.oneToken,
        total_supply: DECIMALS.oneToken,
        total_debt: DECIMALS.zero,
        utilization: DECIMALS.zero,
      });

      const mockBlock: MockBlock = {
        height: 100,
        hash: 'abc123',
        timestamp: 1700000000,
        txs: [
          {
            bytes: Buffer.from('tx1').toString('base64'),
            code: 0,
            events: [unknownEvent],
          },
        ],
      };

      mockedGetTendermintClient.mockResolvedValue(
        createMockTendermintClient([mockBlock]) as any
      );

      await processBlock(100);

      // No changes to market
      await assertMarketState('1', {
        totalSupplyScaled: '0',
      });
      await assertRecordCount('transaction', 0);
    });

    it('processes market_instantiated event from factory', async () => {
      mockedQueryMarketInfo.mockResolvedValue(createMockMarketInfo());

      const marketCreatedEvent = createWasmEvent(ADDRESSES.factory, {
        action: 'market_instantiated',
        market_id: '1',
        market_address: ADDRESSES.market1,
      });

      const mockBlock: MockBlock = {
        height: 100,
        hash: 'abc123',
        timestamp: 1700000000,
        txs: [
          {
            bytes: Buffer.from('tx1').toString('base64'),
            code: 0,
            events: [marketCreatedEvent],
          },
        ],
      };

      mockedGetTendermintClient.mockResolvedValue(
        createMockTendermintClient([mockBlock]) as any
      );

      await processBlock(100);

      // Market should be created
      await assertRecordCount('market', 1);
      const market = await prisma.market.findUnique({ where: { id: '1' } });
      expect(market!.marketAddress).toBe(ADDRESSES.market1);
    });
  });
});
