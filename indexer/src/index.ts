import { logger } from './utils/logger';
import { config } from './config';
import { connectDatabase, disconnectDatabase } from './db/client';
import { disconnectClients, getCurrentBlockHeight } from './utils/blockchain';
import {
  loadMarketAddresses,
  getLastProcessedBlock,
  processBlock,
  detectReorg,
  handleReorg,
} from './indexer/block-processor';
import { startGraphQLServer } from './api/server';

let shouldStop = false;
let graphQLShutdown: (() => Promise<void>) | null = null;

/**
 * Main indexer loop
 */
async function runIndexer(): Promise<void> {
  logger.info('Starting Stone Finance Indexer', {
    rpcEndpoint: config.blockchain.rpcEndpoint,
    chainId: config.blockchain.chainId,
    factoryAddress: config.contracts.factoryAddress,
  });

  try {
    // Connect to database
    await connectDatabase();

    // Start GraphQL API server
    const { shutdown } = await startGraphQLServer();
    graphQLShutdown = shutdown;

    // Load existing market addresses from database
    await loadMarketAddresses();

    // Get starting point
    let lastProcessed = await getLastProcessedBlock();
    logger.info('Indexer checkpoint', { lastProcessedBlock: lastProcessed });

    // Main processing loop
    while (!shouldStop) {
      try {
        // Get current blockchain height
        const currentHeight = await getCurrentBlockHeight();

        if (lastProcessed >= currentHeight) {
          // We're caught up, wait before checking again
          logger.debug('Caught up with blockchain', {
            lastProcessed,
            currentHeight,
          });
          await sleep(config.indexer.pollIntervalMs);
          continue;
        }

        // Check for reorg before processing new blocks
        const reorgDetected = await detectReorg(lastProcessed);
        if (reorgDetected) {
          await handleReorg(lastProcessed);
          lastProcessed = await getLastProcessedBlock();
          continue;
        }

        // Process blocks in batches
        const toHeight = Math.min(
          lastProcessed + config.indexer.batchSize,
          currentHeight
        );

        logger.info('Processing block range', {
          from: lastProcessed + 1,
          to: toHeight,
          currentHeight,
        });

        for (let height = lastProcessed + 1; height <= toHeight; height++) {
          if (shouldStop) {
            logger.info('Stop signal received, exiting loop');
            break;
          }

          await processBlock(height);
          lastProcessed = height;

          // Log progress periodically
          if (height % 100 === 0) {
            const lag = currentHeight - height;
            logger.info('Processing progress', {
              height,
              currentHeight,
              lag,
              lagPercentage: ((lag / currentHeight) * 100).toFixed(2) + '%',
            });
          }
        }

        // Small delay between batches to avoid overwhelming the RPC
        await sleep(100);
      } catch (error) {
        logger.error('Error in indexer loop', { error, lastProcessed });

        // Wait before retrying
        await sleep(5000);
      }
    }
  } catch (error) {
    logger.error('Fatal error in indexer', { error });
    throw error;
  } finally {
    await shutdown();
  }
}

/**
 * Graceful shutdown
 */
async function shutdown(): Promise<void> {
  logger.info('Shutting down indexer...');

  try {
    // Shutdown GraphQL server first
    if (graphQLShutdown) {
      await graphQLShutdown();
    }

    await disconnectClients();
    await disconnectDatabase();
    logger.info('Indexer shutdown complete');
  } catch (error) {
    logger.error('Error during shutdown', { error });
  }
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Handle process signals for graceful shutdown
 */
function setupSignalHandlers(): void {
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];

  for (const signal of signals) {
    process.on(signal, () => {
      logger.info('Received shutdown signal', { signal });
      shouldStop = true;

      // Force exit after 30 seconds if graceful shutdown fails
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    });
  }

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection', { reason, promise });
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error });
    shouldStop = true;
    setTimeout(() => process.exit(1), 1000);
  });
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  setupSignalHandlers();

  try {
    await runIndexer();
  } catch (error) {
    logger.error('Indexer exited with error', { error });
    process.exit(1);
  }
}

// Start the indexer
main();
