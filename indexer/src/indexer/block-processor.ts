import { IndexedTx, Event } from '@cosmjs/stargate';
import { getCosmWasmClient, getTendermintClient } from '../utils/blockchain';
import { logger } from '../utils/logger';
import { config } from '../config';
import { prisma } from '../db/client';
import { parseEventAttributesFromStargate, parseMarketCreatedEvent, parseMarketEvent } from '../events/parser';
import {
  handleMarketCreated,
  handleSupply,
  handleWithdraw,
  handleSupplyCollateral,
  handleWithdrawCollateral,
  handleBorrow,
  handleRepay,
  handleLiquidate,
  handleAccrueInterest,
  handleUpdateParams,
} from '../events/handlers';

// Track market addresses to filter events
const marketAddresses = new Set<string>();

export async function loadMarketAddresses(): Promise<void> {
  const markets = await prisma.market.findMany({
    select: { id: true, marketAddress: true },
  });

  for (const market of markets) {
    marketAddresses.add(market.marketAddress);
  }

  logger.info('Loaded market addresses', { count: marketAddresses.size });
}

export async function getLastProcessedBlock(): Promise<number> {
  const state = await prisma.indexerState.findUnique({
    where: { id: 'singleton' },
  });

  if (state) {
    return Number(state.lastProcessedBlock);
  }

  // If no state, start from configured block
  return config.indexer.startBlockHeight;
}

export async function updateLastProcessedBlock(
  blockHeight: number,
  blockHash: string
): Promise<void> {
  await prisma.indexerState.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      lastProcessedBlock: BigInt(blockHeight),
      lastProcessedHash: blockHash,
    },
    update: {
      lastProcessedBlock: BigInt(blockHeight),
      lastProcessedHash: blockHash,
    },
  });
}

/**
 * Process a single block and extract all relevant events
 */
export async function processBlock(blockHeight: number): Promise<void> {
  logger.debug('Processing block', { blockHeight });

  try {
    const client = await getCosmWasmClient();
    const tmClient = await getTendermintClient();

    // Get block and block results
    const block = await tmClient.block(blockHeight);
    const blockHash = Buffer.from(block.blockId.hash).toString('hex');
    // Convert ReadonlyDateWithNanoseconds to timestamp
    const blockTime = block.block.header.time;
    const timestamp = Math.floor(blockTime.getTime() / 1000);

    // Process each transaction in the block
    const txs = block.block.txs;

    if (txs.length === 0) {
      // No transactions in block, just update checkpoint
      await updateLastProcessedBlock(blockHeight, blockHash);
      return;
    }

    for (let txIndex = 0; txIndex < txs.length; txIndex++) {
      const txHash = Buffer.from(block.block.txs[txIndex]).toString('hex');

      // Get transaction details
      const tx = await client.getTx(txHash);
      if (!tx) {
        logger.warn('Transaction not found', { txHash, blockHeight });
        continue;
      }

      await processTx(tx, timestamp);
    }

    // Update checkpoint after processing all transactions
    await updateLastProcessedBlock(blockHeight, blockHash);

    logger.debug('Block processed successfully', { blockHeight, txCount: txs.length });
  } catch (error) {
    logger.error('Error processing block', { blockHeight, error });
    throw error;
  }
}

/**
 * Process a single transaction and extract events
 */
async function processTx(tx: IndexedTx, blockTimestamp: number): Promise<void> {
  if (tx.code !== 0) {
    // Transaction failed, skip
    logger.debug('Skipping failed transaction', { txHash: tx.hash, code: tx.code });
    return;
  }

  // Events are in tx.events array
  // Each event has a 'type' and 'attributes' array
  for (let logIndex = 0; logIndex < tx.events.length; logIndex++) {
    const event = tx.events[logIndex];

    // Parse event attributes (stargate events have string attributes)
    const attributes = parseEventAttributesFromStargate(event);

    // Check if this is a wasm event (CosmWasm contract events)
    if (event.type === 'wasm') {
      await processWasmEvent(
        event,
        attributes,
        tx.hash,
        tx.height,
        blockTimestamp,
        logIndex
      );
    }
  }
}

/**
 * Process a wasm event (contract event)
 */
async function processWasmEvent(
  _event: Event,
  attributes: Record<string, string>,
  txHash: string,
  blockHeight: number,
  timestamp: number,
  logIndex: number
): Promise<void> {
  const contractAddress = attributes._contract_address || attributes.contract_address;

  if (!contractAddress) {
    logger.warn('Wasm event missing contract address', { attributes });
    return;
  }

  // Check if this is a Factory event (market creation)
  if (contractAddress === config.contracts.factoryAddress) {
    await processFactoryEvent(attributes, txHash, blockHeight, timestamp, logIndex);
    return;
  }

  // Check if this is a Market event
  if (marketAddresses.has(contractAddress)) {
    await processMarketEventFromContract(
      attributes,
      contractAddress,
      txHash,
      blockHeight,
      timestamp,
      logIndex
    );
    return;
  }

  // Unknown contract, ignore
}

/**
 * Process Factory contract events
 */
async function processFactoryEvent(
  attributes: Record<string, string>,
  txHash: string,
  blockHeight: number,
  timestamp: number,
  logIndex: number
): Promise<void> {
  const action = attributes.action;

  if (action === 'market_instantiated') {
    const event = parseMarketCreatedEvent(attributes, txHash, blockHeight, timestamp, logIndex);

    if (event) {
      logger.info('Market created event detected', {
        marketId: event.marketId,
        marketAddress: event.marketAddress,
      });

      await handleMarketCreated(event);

      // Add to our tracking set
      marketAddresses.add(event.marketAddress);
    }
  }
}

/**
 * Process Market contract events
 */
async function processMarketEventFromContract(
  attributes: Record<string, string>,
  marketAddress: string,
  txHash: string,
  blockHeight: number,
  timestamp: number,
  logIndex: number
): Promise<void> {
  const action = attributes.action;

  // Find market ID from address
  const market = await prisma.market.findFirst({
    where: { marketAddress },
    select: { id: true },
  });

  if (!market) {
    logger.warn('Market not found for address', { marketAddress });
    return;
  }

  const marketId = market.id;

  // Parse the event
  const event = parseMarketEvent(
    attributes,
    marketAddress,
    txHash,
    blockHeight,
    timestamp,
    logIndex
  );

  if (!event) {
    logger.debug('Unknown market event action', { action, marketId });
    return;
  }

  // Route to appropriate handler
  try {
    switch (event.action) {
      case 'supply':
        await handleSupply(event, marketId);
        break;
      case 'withdraw':
        await handleWithdraw(event, marketId);
        break;
      case 'supply_collateral':
        await handleSupplyCollateral(event, marketId);
        break;
      case 'withdraw_collateral':
        await handleWithdrawCollateral(event, marketId);
        break;
      case 'borrow':
        await handleBorrow(event, marketId);
        break;
      case 'repay':
        await handleRepay(event, marketId);
        break;
      case 'liquidate':
        await handleLiquidate(event, marketId);
        break;
      case 'accrue_interest':
        await handleAccrueInterest(event, marketId);
        break;
      case 'update_params':
        await handleUpdateParams(event, marketId);
        break;
    }

    logger.debug('Market event processed', {
      action: event.action,
      marketId,
      txHash,
    });
  } catch (error) {
    logger.error('Error processing market event', {
      error,
      action: event.action,
      marketId,
      txHash,
    });
    throw error;
  }
}

/**
 * Detect and handle blockchain reorganizations
 */
export async function detectReorg(currentHeight: number): Promise<boolean> {
  const state = await prisma.indexerState.findUnique({
    where: { id: 'singleton' },
  });

  if (!state || !state.lastProcessedHash) {
    return false;
  }

  const lastHeight = Number(state.lastProcessedBlock);

  if (currentHeight <= lastHeight) {
    return false;
  }

  try {
    const tmClient = await getTendermintClient();
    const block = await tmClient.block(lastHeight);
    const currentHash = Buffer.from(block.blockId.hash).toString('hex');

    if (currentHash !== state.lastProcessedHash) {
      logger.warn('Blockchain reorg detected!', {
        lastHeight,
        expectedHash: state.lastProcessedHash,
        actualHash: currentHash,
      });
      return true;
    }

    return false;
  } catch (error) {
    logger.error('Error detecting reorg', { error, lastHeight });
    return false;
  }
}

/**
 * Handle blockchain reorganization by rolling back affected blocks
 */
export async function handleReorg(fromHeight: number): Promise<void> {
  logger.warn('Handling blockchain reorganization', { fromHeight });

  // In a reorg, we need to:
  // 1. Delete all data from affected blocks
  // 2. Reset the checkpoint to a safe height (before the reorg)

  const reorgDepth = 10; // Go back 10 blocks to be safe
  const safeHeight = Math.max(config.indexer.startBlockHeight, fromHeight - reorgDepth);

  try {
    await prisma.$transaction(async (tx) => {
      // Delete transactions from affected blocks
      await tx.transaction.deleteMany({
        where: {
          blockHeight: {
            gte: BigInt(safeHeight),
          },
        },
      });

      // Delete interest accrual events from affected blocks
      await tx.interestAccrualEvent.deleteMany({
        where: {
          blockHeight: {
            gte: BigInt(safeHeight),
          },
        },
      });

      // Delete snapshots from affected blocks
      await tx.marketSnapshot.deleteMany({
        where: {
          blockHeight: {
            gte: BigInt(safeHeight),
          },
        },
      });

      // Note: We don't delete markets or user positions as they may have been
      // updated by multiple blocks. Instead, we'll recalculate them during re-indexing.
      // This is a simplification - a production system might need more sophisticated rollback.

      // Update checkpoint to safe height
      const tmClient = await getTendermintClient();
      const safeBlock = await tmClient.block(safeHeight);
      const safeHash = Buffer.from(safeBlock.blockId.hash).toString('hex');

      await tx.indexerState.update({
        where: { id: 'singleton' },
        data: {
          lastProcessedBlock: BigInt(safeHeight),
          lastProcessedHash: safeHash,
        },
      });
    });

    logger.info('Reorg handled, rolled back to safe height', { safeHeight });
  } catch (error) {
    logger.error('Error handling reorg', { error, safeHeight });
    throw error;
  }
}
