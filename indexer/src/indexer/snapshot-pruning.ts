import { prisma } from '../db/client';
import { logger } from '../utils/logger';

/**
 * Snapshot pruning strategy:
 * - Last 24 hours: Keep all snapshots (full resolution)
 * - 1-7 days ago: Keep one snapshot per hour
 * - 7-30 days ago: Keep one snapshot per 6 hours
 * - 30+ days ago: Keep one snapshot per day
 */

/**
 * Prune old market snapshots to manage database size
 * Should be called periodically (e.g., every 1000 blocks or once per hour)
 */
export async function pruneSnapshots(): Promise<void> {
  const startTime = Date.now();
  logger.info('Starting snapshot pruning');

  try {
    const now = new Date();

    // Get all markets
    const markets = await prisma.market.findMany({
      select: { id: true },
    });

    let totalDeleted = 0;

    for (const market of markets) {
      const deleted = await pruneMarketSnapshots(market.id, now);
      totalDeleted += deleted;
    }

    const duration = Date.now() - startTime;
    logger.info('Snapshot pruning complete', {
      marketsProcessed: markets.length,
      snapshotsDeleted: totalDeleted,
      durationMs: duration,
    });
  } catch (error) {
    logger.error('Error during snapshot pruning', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Prune snapshots for a single market
 */
async function pruneMarketSnapshots(marketId: string, now: Date): Promise<number> {
  let totalDeleted = 0;

  // Calculate time boundaries
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Prune 1-7 day old snapshots to hourly
  totalDeleted += await pruneToInterval(marketId, sevenDaysAgo, oneDayAgo, 60 * 60 * 1000); // 1 hour

  // Prune 7-30 day old snapshots to 6-hourly
  totalDeleted += await pruneToInterval(marketId, thirtyDaysAgo, sevenDaysAgo, 6 * 60 * 60 * 1000); // 6 hours

  // Prune 30+ day old snapshots to daily
  totalDeleted += await pruneToInterval(marketId, new Date(0), thirtyDaysAgo, 24 * 60 * 60 * 1000); // 24 hours

  return totalDeleted;
}

/**
 * Prune snapshots within a time range to keep only one per interval
 */
async function pruneToInterval(
  marketId: string,
  startTime: Date,
  endTime: Date,
  intervalMs: number
): Promise<number> {
  // Get all snapshots in the time range
  const snapshots = await prisma.marketSnapshot.findMany({
    where: {
      marketId,
      timestamp: {
        gte: startTime,
        lt: endTime,
      },
    },
    orderBy: { timestamp: 'asc' },
    select: { id: true, timestamp: true },
  });

  if (snapshots.length <= 1) {
    return 0;
  }

  // Group snapshots by interval bucket
  const buckets = new Map<number, { id: string; timestamp: Date }[]>();

  for (const snapshot of snapshots) {
    const bucketKey = Math.floor(snapshot.timestamp.getTime() / intervalMs);
    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, []);
    }
    buckets.get(bucketKey)!.push(snapshot);
  }

  // Collect IDs to delete (keep the last snapshot in each bucket)
  const idsToDelete: string[] = [];

  for (const bucket of buckets.values()) {
    if (bucket.length > 1) {
      // Sort by timestamp and keep the last one (most recent in bucket)
      bucket.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      // Delete all but the last one
      for (let i = 0; i < bucket.length - 1; i++) {
        idsToDelete.push(bucket[i].id);
      }
    }
  }

  if (idsToDelete.length === 0) {
    return 0;
  }

  // Delete in batches to avoid overwhelming the database
  const batchSize = 100;
  let deleted = 0;

  for (let i = 0; i < idsToDelete.length; i += batchSize) {
    const batch = idsToDelete.slice(i, i + batchSize);
    const result = await prisma.marketSnapshot.deleteMany({
      where: { id: { in: batch } },
    });
    deleted += result.count;
  }

  return deleted;
}

/**
 * Track when pruning was last run
 */
let lastPruningBlock = 0;
const PRUNING_INTERVAL_BLOCKS = 1000;

/**
 * Check if pruning should run based on current block height
 */
export function shouldPruneSnapshots(currentBlock: number): boolean {
  if (lastPruningBlock === 0) {
    lastPruningBlock = currentBlock;
    return false; // Don't prune on first run
  }

  if (currentBlock - lastPruningBlock >= PRUNING_INTERVAL_BLOCKS) {
    lastPruningBlock = currentBlock;
    return true;
  }

  return false;
}
