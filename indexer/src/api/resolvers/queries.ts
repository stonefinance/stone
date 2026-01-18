import { GraphQLContext } from '../context';
import { Decimal } from 'decimal.js';
import { TransactionAction } from '@prisma/client';

export const Query = {
  // ============================================================================
  // Market Queries
  // ============================================================================

  async market(_: unknown, { id }: { id: string }, context: GraphQLContext) {
    return context.loaders.marketLoader.load(id);
  },

  async marketByAddress(
    _: unknown,
    { address }: { address: string },
    context: GraphQLContext
  ) {
    return context.prisma.market.findFirst({
      where: { marketAddress: address },
    });
  },

  async markets(
    _: unknown,
    args: {
      limit?: number;
      offset?: number;
      curator?: string;
      collateralDenom?: string;
      debtDenom?: string;
      enabledOnly?: boolean;
    },
    context: GraphQLContext
  ) {
    const {
      limit = 20,
      offset = 0,
      curator,
      collateralDenom,
      debtDenom,
      enabledOnly = false,
    } = args;

    return context.prisma.market.findMany({
      where: {
        ...(curator && { curator }),
        ...(collateralDenom && { collateralDenom }),
        ...(debtDenom && { debtDenom }),
        ...(enabledOnly && { enabled: true }),
      },
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
    });
  },

  async marketCount(_: unknown, __: unknown, context: GraphQLContext) {
    return context.prisma.market.count();
  },

  // ============================================================================
  // User Position Queries
  // ============================================================================

  async userPosition(
    _: unknown,
    { marketId, userAddress }: { marketId: string; userAddress: string },
    context: GraphQLContext
  ) {
    const positionId = `${marketId}:${userAddress}`;
    return context.loaders.userPositionLoader.load(positionId);
  },

  async userPositions(
    _: unknown,
    { userAddress, hasDebt }: { userAddress: string; hasDebt?: boolean },
    context: GraphQLContext
  ) {
    return context.prisma.userPosition.findMany({
      where: {
        userAddress,
        ...(hasDebt !== undefined && {
          debtScaled: hasDebt ? { gt: new Decimal(0) } : new Decimal(0),
        }),
      },
      orderBy: { lastInteraction: 'desc' },
    });
  },

  async liquidatablePositions(
    _: unknown,
    { limit = 20, offset = 0 }: { limit?: number; offset?: number },
    context: GraphQLContext
  ) {
    // Get positions with debt
    const positions = await context.prisma.userPosition.findMany({
      where: {
        debtScaled: { gt: new Decimal(0) },
      },
      include: {
        market: true,
      },
      take: limit * 5, // Fetch more since we'll filter by health factor
      skip: offset,
    });

    // Filter positions with health factor < 1.0
    // Note: In production, this should query oracle for prices
    // For now, we return positions with debt (oracle integration is Phase 4)
    return positions.slice(0, limit);
  },

  // ============================================================================
  // Transaction Queries
  // ============================================================================

  async transaction(_: unknown, { id }: { id: string }, context: GraphQLContext) {
    return context.prisma.transaction.findUnique({
      where: { id },
    });
  },

  async transactions(
    _: unknown,
    args: {
      limit?: number;
      offset?: number;
      marketId?: string;
      userAddress?: string;
      action?: TransactionAction;
    },
    context: GraphQLContext
  ) {
    const { limit = 20, offset = 0, marketId, userAddress, action } = args;

    return context.prisma.transaction.findMany({
      where: {
        ...(marketId && { marketId }),
        ...(userAddress && { userAddress }),
        ...(action && { action }),
      },
      take: limit,
      skip: offset,
      orderBy: { timestamp: 'desc' },
    });
  },

  // ============================================================================
  // Historical Data Queries
  // ============================================================================

  async marketSnapshots(
    _: unknown,
    args: {
      marketId: string;
      fromTime?: Date;
      toTime?: Date;
      limit?: number;
    },
    context: GraphQLContext
  ) {
    const { marketId, fromTime, toTime, limit = 100 } = args;

    return context.prisma.marketSnapshot.findMany({
      where: {
        marketId,
        ...(fromTime && { timestamp: { gte: fromTime } }),
        ...(toTime && { timestamp: { lte: toTime } }),
      },
      take: limit,
      orderBy: { timestamp: 'desc' },
    });
  },

  async interestAccrualEvents(
    _: unknown,
    args: {
      marketId: string;
      fromTime?: Date;
      toTime?: Date;
      limit?: number;
    },
    context: GraphQLContext
  ) {
    const { marketId, fromTime, toTime, limit = 100 } = args;

    return context.prisma.interestAccrualEvent.findMany({
      where: {
        marketId,
        ...(fromTime && { timestamp: { gte: fromTime } }),
        ...(toTime && { timestamp: { lte: toTime } }),
      },
      take: limit,
      orderBy: { timestamp: 'desc' },
    });
  },
};
