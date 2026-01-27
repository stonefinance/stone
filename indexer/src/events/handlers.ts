import { Decimal } from 'decimal.js';
import { prisma } from '../db/client';
import { logger } from '../utils/logger';
import { queryMarketInfo } from '../utils/blockchain';
import {
  publishMarketUpdate,
  publishTransaction,
  publishPositionUpdate,
} from '../api/resolvers/subscriptions';
import {
  SupplyEvent,
  WithdrawEvent,
  SupplyCollateralEvent,
  WithdrawCollateralEvent,
  BorrowEvent,
  RepayEvent,
  LiquidateEvent,
  AccrueInterestEvent,
  UpdateParamsEvent,
} from './types';
import { PartialMarketCreatedEvent } from './parser';

// Type for transaction client used in Prisma transactions
type TransactionClient = Omit<
  typeof prisma,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a market snapshot capturing the current state of a market.
 * Used to track historical market data for charts and analytics.
 */
async function createMarketSnapshot(
  tx: TransactionClient,
  marketId: string,
  timestamp: number,
  blockHeight: number
): Promise<void> {
  const market = await tx.market.findUnique({ where: { id: marketId } });
  if (!market) {
    logger.warn('Cannot create snapshot: market not found', { marketId });
    return;
  }

  await tx.marketSnapshot.create({
    data: {
      id: `${marketId}:${timestamp}`,
      marketId,
      timestamp: new Date(timestamp * 1000),
      blockHeight: BigInt(blockHeight),
      borrowIndex: market.borrowIndex,
      liquidityIndex: market.liquidityIndex,
      borrowRate: market.borrowRate,
      liquidityRate: market.liquidityRate,
      totalSupply: new Decimal(market.totalSupplyScaled.toString()).mul(
        market.liquidityIndex
      ),
      totalDebt: new Decimal(market.totalDebtScaled.toString()).mul(market.borrowIndex),
      totalCollateral: market.totalCollateral,
      utilization: market.utilization || new Decimal(0),
      loanToValue: market.loanToValue,
      liquidationThreshold: market.liquidationThreshold,
      enabled: market.enabled,
    },
  });

  logger.debug('Market snapshot created', { marketId, timestamp });
}

// ============================================================================
// Factory Event Handlers
// ============================================================================

export async function handleMarketCreated(event: PartialMarketCreatedEvent): Promise<void> {
  logger.info('Processing MarketCreated event', {
    marketId: event.marketId,
    marketAddress: event.marketAddress,
  });

  try {
    // Check if market already exists (to handle reprocessing/reorgs)
    const existingMarket = await prisma.market.findUnique({
      where: { id: event.marketId },
    });

    if (existingMarket) {
      logger.info('Market already exists, skipping creation', {
        marketId: event.marketId,
        marketAddress: event.marketAddress,
      });
      return;
    }

    // Query market contract for config and params
    const { config, params } = await queryMarketInfo(event.marketAddress);
    logger.info('Market info fetched', { marketAddress: event.marketAddress });

    await prisma.$transaction(async (tx) => {
      await tx.market.create({
        data: {
          id: event.marketId,
          marketAddress: event.marketAddress,
          curator: config.curator,
          collateralDenom: config.collateral_denom,
          debtDenom: config.debt_denom,
          oracle: config.oracle,
          createdAt: new Date(event.timestamp * 1000),
          createdAtBlock: BigInt(event.blockHeight),

          // Use params from contract params query
          loanToValue: new Decimal(params.loan_to_value),
          liquidationThreshold: new Decimal(params.liquidation_threshold),
          liquidationBonus: new Decimal(params.liquidation_bonus),
          liquidationProtocolFee: new Decimal(params.liquidation_protocol_fee),
          closeFactor: new Decimal(params.close_factor),
          interestRateModel: params.interest_rate_model as object,
          protocolFee: new Decimal(params.protocol_fee),
          curatorFee: new Decimal(params.curator_fee),
          supplyCap: params.supply_cap ? new Decimal(params.supply_cap) : null,
          borrowCap: params.borrow_cap ? new Decimal(params.borrow_cap) : null,
          enabled: params.enabled,
          isMutable: params.is_mutable,

          // Initialize state
          borrowIndex: new Decimal(1),
          liquidityIndex: new Decimal(1),
          borrowRate: new Decimal(0),
          liquidityRate: new Decimal(0),
          totalSupplyScaled: new Decimal(0),
          totalDebtScaled: new Decimal(0),
          totalCollateral: new Decimal(0),
          lastUpdate: BigInt(event.timestamp),
          utilization: new Decimal(0),
          availableLiquidity: new Decimal(0),
        },
      });

      // Create initial snapshot for the market
      await tx.marketSnapshot.create({
        data: {
          id: `${event.marketId}:${event.timestamp}`,
          marketId: event.marketId,
          timestamp: new Date(event.timestamp * 1000),
          blockHeight: BigInt(event.blockHeight),
          borrowIndex: new Decimal(1),
          liquidityIndex: new Decimal(1),
          borrowRate: new Decimal(0),
          liquidityRate: new Decimal(0),
          totalSupply: new Decimal(0),
          totalDebt: new Decimal(0),
          totalCollateral: new Decimal(0),
          utilization: new Decimal(0),
          loanToValue: new Decimal(params.loan_to_value),
          liquidationThreshold: new Decimal(params.liquidation_threshold),
          enabled: params.enabled,
        },
      });
    });

    logger.info('Market created in database with initial snapshot', {
      marketId: event.marketId,
      collateralDenom: config.collateral_denom,
      debtDenom: config.debt_denom,
    });
  } catch (error) {
    logger.error('Failed to handle MarketCreated event', {
      error: error instanceof Error ? error.message : String(error),
      event,
    });
    throw error;
  }
}

// ============================================================================
// Market Event Handlers
// ============================================================================

export async function handleSupply(event: SupplyEvent, marketId: string): Promise<void> {
  logger.debug('Processing Supply event', { marketId, supplier: event.supplier });

  try {
    await prisma.$transaction(async (tx) => {
      // Update market state
      const market = await tx.market.findUnique({ where: { id: marketId } });
      if (!market) {
        throw new Error(`Market not found: ${marketId}`);
      }

      await tx.market.update({
        where: { id: marketId },
        data: {
          totalSupplyScaled: new Decimal(market.totalSupplyScaled.toString()).add(
            event.scaledAmount
          ),
          borrowIndex: new Decimal(event.borrowIndex),
          liquidityIndex: new Decimal(event.liquidityIndex),
          borrowRate: new Decimal(event.borrowRate),
          liquidityRate: new Decimal(event.liquidityRate),
          utilization: new Decimal(event.utilization),
        },
      });

      // Update user position
      const positionId = `${marketId}:${event.recipient}`;
      const existingPosition = await tx.userPosition.findUnique({
        where: { id: positionId },
      });

      if (existingPosition) {
        await tx.userPosition.update({
          where: { id: positionId },
          data: {
            supplyScaled: new Decimal(existingPosition.supplyScaled.toString()).add(
              event.scaledAmount
            ),
            lastInteraction: new Date(event.timestamp * 1000),
          },
        });
      } else {
        await tx.userPosition.create({
          data: {
            id: positionId,
            marketId,
            userAddress: event.recipient,
            supplyScaled: new Decimal(event.scaledAmount),
            debtScaled: new Decimal(0),
            collateral: new Decimal(0),
            firstInteraction: new Date(event.timestamp * 1000),
            lastInteraction: new Date(event.timestamp * 1000),
          },
        });
      }

      // Create transaction record
      const transaction = await tx.transaction.create({
        data: {
          id: `${event.txHash}:${event.logIndex}`,
          txHash: event.txHash,
          blockHeight: BigInt(event.blockHeight),
          timestamp: new Date(event.timestamp * 1000),
          marketId,
          userAddress: event.supplier,
          action: 'SUPPLY',
          amount: new Decimal(event.amount),
          scaledAmount: new Decimal(event.scaledAmount),
          recipient: event.recipient,
          totalSupply: new Decimal(event.totalSupply),
          totalDebt: new Decimal(event.totalDebt),
          utilization: new Decimal(event.utilization),
          borrowRate: new Decimal(event.borrowRate),
          liquidityRate: new Decimal(event.liquidityRate),
        },
      });

      // Publish subscription events
      publishTransaction(transaction, marketId);
      publishPositionUpdate(event.recipient, existingPosition);

      // Create market snapshot for historical tracking
      await createMarketSnapshot(tx, marketId, event.timestamp, event.blockHeight);
    });

    // Publish market update after transaction completes
    const updatedMarket = await prisma.market.findUnique({ where: { id: marketId } });
    if (updatedMarket) {
      publishMarketUpdate(marketId, updatedMarket);
    }

    logger.debug('Supply event processed', { marketId });
  } catch (error) {
    logger.error('Failed to handle Supply event', { error, event });
    throw error;
  }
}

export async function handleWithdraw(event: WithdrawEvent, marketId: string): Promise<void> {
  logger.debug('Processing Withdraw event', { marketId, withdrawer: event.withdrawer });

  try {
    await prisma.$transaction(async (tx) => {
      // Update market state
      const market = await tx.market.findUnique({ where: { id: marketId } });
      if (!market) {
        throw new Error(`Market not found: ${marketId}`);
      }

      await tx.market.update({
        where: { id: marketId },
        data: {
          totalSupplyScaled: new Decimal(market.totalSupplyScaled.toString()).sub(
            event.scaledDecrease
          ),
          borrowIndex: new Decimal(event.borrowIndex),
          liquidityIndex: new Decimal(event.liquidityIndex),
          borrowRate: new Decimal(event.borrowRate),
          liquidityRate: new Decimal(event.liquidityRate),
          utilization: new Decimal(event.utilization),
        },
      });

      // Update user position
      const positionId = `${marketId}:${event.withdrawer}`;
      const existingPosition = await tx.userPosition.findUnique({
        where: { id: positionId },
      });

      if (existingPosition) {
        await tx.userPosition.update({
          where: { id: positionId },
          data: {
            supplyScaled: new Decimal(existingPosition.supplyScaled.toString()).sub(
              event.scaledDecrease
            ),
            lastInteraction: new Date(event.timestamp * 1000),
          },
        });
      }

      // Create transaction record
      await tx.transaction.create({
        data: {
          id: `${event.txHash}:${event.logIndex}`,
          txHash: event.txHash,
          blockHeight: BigInt(event.blockHeight),
          timestamp: new Date(event.timestamp * 1000),
          marketId,
          userAddress: event.withdrawer,
          action: 'WITHDRAW',
          amount: new Decimal(event.amount),
          scaledAmount: new Decimal(event.scaledDecrease),
          recipient: event.recipient,
          totalSupply: new Decimal(event.totalSupply),
          totalDebt: new Decimal(event.totalDebt),
          utilization: new Decimal(event.utilization),
          borrowRate: new Decimal(event.borrowRate),
          liquidityRate: new Decimal(event.liquidityRate),
        },
      });

      // Create market snapshot for historical tracking
      await createMarketSnapshot(tx, marketId, event.timestamp, event.blockHeight);
    });

    logger.debug('Withdraw event processed', { marketId });
  } catch (error) {
    logger.error('Failed to handle Withdraw event', { error, event });
    throw error;
  }
}

export async function handleSupplyCollateral(
  event: SupplyCollateralEvent,
  marketId: string
): Promise<void> {
  logger.debug('Processing SupplyCollateral event', { marketId, supplier: event.supplier });

  try {
    await prisma.$transaction(async (tx) => {
      // Get current market state to calculate new total
      const market = await tx.market.findUniqueOrThrow({
        where: { id: marketId },
      });
      const newTotalCollateral = new Decimal(market.totalCollateral.toString()).add(event.amount);

      // Update market state
      await tx.market.update({
        where: { id: marketId },
        data: {
          totalCollateral: newTotalCollateral,
        },
      });

      // Update user position
      const positionId = `${marketId}:${event.recipient}`;
      const existingPosition = await tx.userPosition.findUnique({
        where: { id: positionId },
      });

      if (existingPosition) {
        await tx.userPosition.update({
          where: { id: positionId },
          data: {
            collateral: new Decimal(existingPosition.collateral.toString()).add(event.amount),
            lastInteraction: new Date(event.timestamp * 1000),
          },
        });
      } else {
        await tx.userPosition.create({
          data: {
            id: positionId,
            marketId,
            userAddress: event.recipient,
            supplyScaled: new Decimal(0),
            debtScaled: new Decimal(0),
            collateral: new Decimal(event.amount),
            firstInteraction: new Date(event.timestamp * 1000),
            lastInteraction: new Date(event.timestamp * 1000),
          },
        });
      }

      // Create transaction record
      await tx.transaction.create({
        data: {
          id: `${event.txHash}:${event.logIndex}`,
          txHash: event.txHash,
          blockHeight: BigInt(event.blockHeight),
          timestamp: new Date(event.timestamp * 1000),
          marketId,
          userAddress: event.supplier,
          action: 'SUPPLY_COLLATERAL',
          amount: new Decimal(event.amount),
          recipient: event.recipient,
          totalCollateral: newTotalCollateral,
        },
      });
    });

    logger.debug('SupplyCollateral event processed', { marketId });
  } catch (error) {
    logger.error('Failed to handle SupplyCollateral event', { error, event });
    throw error;
  }
}

export async function handleWithdrawCollateral(
  event: WithdrawCollateralEvent,
  marketId: string
): Promise<void> {
  logger.debug('Processing WithdrawCollateral event', {
    marketId,
    withdrawer: event.withdrawer,
  });

  try {
    await prisma.$transaction(async (tx) => {
      // Get current market state to calculate new total
      const market = await tx.market.findUniqueOrThrow({
        where: { id: marketId },
      });
      const newTotalCollateral = new Decimal(market.totalCollateral.toString()).sub(event.amount);

      // Update market state
      await tx.market.update({
        where: { id: marketId },
        data: {
          totalCollateral: newTotalCollateral,
        },
      });

      // Update user position
      const positionId = `${marketId}:${event.withdrawer}`;
      const existingPosition = await tx.userPosition.findUnique({
        where: { id: positionId },
      });

      if (existingPosition) {
        await tx.userPosition.update({
          where: { id: positionId },
          data: {
            collateral: new Decimal(existingPosition.collateral.toString()).sub(event.amount),
            lastInteraction: new Date(event.timestamp * 1000),
          },
        });
      }

      // Create transaction record
      await tx.transaction.create({
        data: {
          id: `${event.txHash}:${event.logIndex}`,
          txHash: event.txHash,
          blockHeight: BigInt(event.blockHeight),
          timestamp: new Date(event.timestamp * 1000),
          marketId,
          userAddress: event.withdrawer,
          action: 'WITHDRAW_COLLATERAL',
          amount: new Decimal(event.amount),
          recipient: event.recipient,
          totalCollateral: newTotalCollateral,
        },
      });
    });

    logger.debug('WithdrawCollateral event processed', { marketId });
  } catch (error) {
    logger.error('Failed to handle WithdrawCollateral event', { error, event });
    throw error;
  }
}

export async function handleBorrow(event: BorrowEvent, marketId: string): Promise<void> {
  logger.debug('Processing Borrow event', { marketId, borrower: event.borrower });

  try {
    await prisma.$transaction(async (tx) => {
      // Update market state
      const market = await tx.market.findUnique({ where: { id: marketId } });
      if (!market) {
        throw new Error(`Market not found: ${marketId}`);
      }

      await tx.market.update({
        where: { id: marketId },
        data: {
          totalDebtScaled: new Decimal(market.totalDebtScaled.toString()).add(
            event.scaledAmount
          ),
          borrowIndex: new Decimal(event.borrowIndex),
          liquidityIndex: new Decimal(event.liquidityIndex),
          borrowRate: new Decimal(event.borrowRate),
          liquidityRate: new Decimal(event.liquidityRate),
          utilization: new Decimal(event.utilization),
        },
      });

      // Update user position
      const positionId = `${marketId}:${event.borrower}`;
      const existingPosition = await tx.userPosition.findUnique({
        where: { id: positionId },
      });

      if (existingPosition) {
        await tx.userPosition.update({
          where: { id: positionId },
          data: {
            debtScaled: new Decimal(existingPosition.debtScaled.toString()).add(
              event.scaledAmount
            ),
            lastInteraction: new Date(event.timestamp * 1000),
          },
        });
      } else {
        await tx.userPosition.create({
          data: {
            id: positionId,
            marketId,
            userAddress: event.borrower,
            supplyScaled: new Decimal(0),
            debtScaled: new Decimal(event.scaledAmount),
            collateral: new Decimal(0),
            firstInteraction: new Date(event.timestamp * 1000),
            lastInteraction: new Date(event.timestamp * 1000),
          },
        });
      }

      // Create transaction record
      await tx.transaction.create({
        data: {
          id: `${event.txHash}:${event.logIndex}`,
          txHash: event.txHash,
          blockHeight: BigInt(event.blockHeight),
          timestamp: new Date(event.timestamp * 1000),
          marketId,
          userAddress: event.borrower,
          action: 'BORROW',
          amount: new Decimal(event.amount),
          scaledAmount: new Decimal(event.scaledAmount),
          recipient: event.recipient,
          totalSupply: new Decimal(event.totalSupply),
          totalDebt: new Decimal(event.totalDebt),
          utilization: new Decimal(event.utilization),
          borrowRate: new Decimal(event.borrowRate),
          liquidityRate: new Decimal(event.liquidityRate),
        },
      });

      // Create market snapshot for historical tracking
      await createMarketSnapshot(tx, marketId, event.timestamp, event.blockHeight);
    });

    logger.debug('Borrow event processed', { marketId });
  } catch (error) {
    logger.error('Failed to handle Borrow event', { error, event });
    throw error;
  }
}

export async function handleRepay(event: RepayEvent, marketId: string): Promise<void> {
  logger.debug('Processing Repay event', { marketId, borrower: event.borrower });

  try {
    await prisma.$transaction(async (tx) => {
      // Update market state
      const market = await tx.market.findUnique({ where: { id: marketId } });
      if (!market) {
        throw new Error(`Market not found: ${marketId}`);
      }

      await tx.market.update({
        where: { id: marketId },
        data: {
          totalDebtScaled: new Decimal(market.totalDebtScaled.toString()).sub(
            event.scaledDecrease
          ),
          borrowIndex: new Decimal(event.borrowIndex),
          liquidityIndex: new Decimal(event.liquidityIndex),
          borrowRate: new Decimal(event.borrowRate),
          liquidityRate: new Decimal(event.liquidityRate),
          utilization: new Decimal(event.utilization),
        },
      });

      // Update user position
      const positionId = `${marketId}:${event.borrower}`;
      const existingPosition = await tx.userPosition.findUnique({
        where: { id: positionId },
      });

      if (existingPosition) {
        const calculated = new Decimal(existingPosition.debtScaled.toString())
          .sub(event.scaledDecrease);
        const newDebtScaled = Decimal.max(calculated, 0);

        await tx.userPosition.update({
          where: { id: positionId },
          data: {
            debtScaled: newDebtScaled,
            lastInteraction: new Date(event.timestamp * 1000),
          },
        });
      }

      // Create transaction record
      await tx.transaction.create({
        data: {
          id: `${event.txHash}:${event.logIndex}`,
          txHash: event.txHash,
          blockHeight: BigInt(event.blockHeight),
          timestamp: new Date(event.timestamp * 1000),
          marketId,
          userAddress: event.repayer,
          action: 'REPAY',
          amount: new Decimal(event.amount),
          scaledAmount: new Decimal(event.scaledDecrease),
          totalSupply: new Decimal(event.totalSupply),
          totalDebt: new Decimal(event.totalDebt),
          utilization: new Decimal(event.utilization),
          borrowRate: new Decimal(event.borrowRate),
          liquidityRate: new Decimal(event.liquidityRate),
        },
      });

      // Create market snapshot for historical tracking
      await createMarketSnapshot(tx, marketId, event.timestamp, event.blockHeight);
    });

    logger.debug('Repay event processed', { marketId });
  } catch (error) {
    logger.error('Failed to handle Repay event', { error, event });
    throw error;
  }
}

export async function handleLiquidate(event: LiquidateEvent, marketId: string): Promise<void> {
  logger.debug('Processing Liquidate event', {
    marketId,
    liquidator: event.liquidator,
    borrower: event.borrower,
  });

  try {
    await prisma.$transaction(async (tx) => {
      // Update market state
      const market = await tx.market.findUnique({ where: { id: marketId } });
      if (!market) {
        throw new Error(`Market not found: ${marketId}`);
      }

      await tx.market.update({
        where: { id: marketId },
        data: {
          totalDebtScaled: new Decimal(market.totalDebtScaled.toString()).sub(
            event.scaledDebtDecrease
          ),
          totalCollateral: new Decimal(event.totalCollateral),
          borrowIndex: new Decimal(event.borrowIndex),
          liquidityIndex: new Decimal(event.liquidityIndex),
          borrowRate: new Decimal(event.borrowRate),
          liquidityRate: new Decimal(event.liquidityRate),
          utilization: new Decimal(event.utilization),
        },
      });

      // Update borrower position
      const positionId = `${marketId}:${event.borrower}`;
      const existingPosition = await tx.userPosition.findUnique({
        where: { id: positionId },
      });

      if (existingPosition) {
        await tx.userPosition.update({
          where: { id: positionId },
          data: {
            debtScaled: new Decimal(existingPosition.debtScaled.toString()).sub(
              event.scaledDebtDecrease
            ),
            collateral: new Decimal(existingPosition.collateral.toString()).sub(
              event.collateralSeized
            ),
            lastInteraction: new Date(event.timestamp * 1000),
          },
        });
      }

      // Create transaction record
      await tx.transaction.create({
        data: {
          id: `${event.txHash}:${event.logIndex}`,
          txHash: event.txHash,
          blockHeight: BigInt(event.blockHeight),
          timestamp: new Date(event.timestamp * 1000),
          marketId,
          userAddress: event.liquidator,
          action: 'LIQUIDATE',
          liquidator: event.liquidator,
          borrower: event.borrower,
          debtRepaid: new Decimal(event.debtRepaid),
          collateralSeized: new Decimal(event.collateralSeized),
          protocolFee: new Decimal(event.protocolFee),
          totalSupply: new Decimal(event.totalSupply),
          totalDebt: new Decimal(event.totalDebt),
          totalCollateral: new Decimal(event.totalCollateral),
          utilization: new Decimal(event.utilization),
          borrowRate: new Decimal(event.borrowRate),
          liquidityRate: new Decimal(event.liquidityRate),
        },
      });

      // Create market snapshot for historical tracking
      await createMarketSnapshot(tx, marketId, event.timestamp, event.blockHeight);
    });

    logger.debug('Liquidate event processed', { marketId });
  } catch (error) {
    logger.error('Failed to handle Liquidate event', { error, event });
    throw error;
  }
}

export async function handleAccrueInterest(
  event: AccrueInterestEvent,
  marketId: string
): Promise<void> {
  logger.debug('Processing AccrueInterest event', { marketId });

  try {
    await prisma.$transaction(async (tx) => {
      // Update market state
      await tx.market.update({
        where: { id: marketId },
        data: {
          borrowIndex: new Decimal(event.borrowIndex),
          liquidityIndex: new Decimal(event.liquidityIndex),
          borrowRate: new Decimal(event.borrowRate),
          liquidityRate: new Decimal(event.liquidityRate),
          lastUpdate: BigInt(event.lastUpdate),
        },
      });

      // Create interest accrual event
      await tx.interestAccrualEvent.create({
        data: {
          id: `${event.txHash}:${event.logIndex}`,
          marketId,
          txHash: event.txHash,
          timestamp: new Date(event.timestamp * 1000),
          blockHeight: BigInt(event.blockHeight),
          borrowIndex: new Decimal(event.borrowIndex),
          liquidityIndex: new Decimal(event.liquidityIndex),
          borrowRate: new Decimal(event.borrowRate),
          liquidityRate: new Decimal(event.liquidityRate),
        },
      });

      // Create market snapshot for historical tracking
      await createMarketSnapshot(tx, marketId, event.timestamp, event.blockHeight);
    });

    logger.debug('AccrueInterest event processed', { marketId });
  } catch (error) {
    logger.error('Failed to handle AccrueInterest event', { error, event });
    throw error;
  }
}

export async function handleUpdateParams(
  event: UpdateParamsEvent,
  marketId: string
): Promise<void> {
  logger.debug('Processing UpdateParams event', { marketId });

  try {
    await prisma.$transaction(async (tx) => {
      // Update market params
      await tx.market.update({
        where: { id: marketId },
        data: {
          loanToValue: new Decimal(event.finalLtv),
          liquidationThreshold: new Decimal(event.finalLiquidationThreshold),
          liquidationBonus: new Decimal(event.finalLiquidationBonus),
          liquidationProtocolFee: new Decimal(event.finalLiquidationProtocolFee),
          closeFactor: new Decimal(event.finalCloseFactor),
          protocolFee: new Decimal(event.finalProtocolFee),
          curatorFee: new Decimal(event.finalCuratorFee),
          supplyCap: event.finalSupplyCap ? new Decimal(event.finalSupplyCap) : null,
          borrowCap: event.finalBorrowCap ? new Decimal(event.finalBorrowCap) : null,
          enabled: event.finalEnabled === 'true',
          isMutable: event.finalIsMutable === 'true',
        },
      });

      // Create snapshot to track parameter changes
      await createMarketSnapshot(tx, marketId, event.timestamp, event.blockHeight);
    });

    logger.debug('UpdateParams event processed', { marketId });
  } catch (error) {
    logger.error('Failed to handle UpdateParams event', { error, event });
    throw error;
  }
}
