import { Market, UserPosition, Transaction, MarketSnapshot, InterestAccrualEvent } from '@prisma/client';
import { GraphQLContext } from '../context';
import { Decimal } from 'decimal.js';

// ============================================================================
// Market Field Resolvers
// ============================================================================

export const MarketResolvers = {
  // Computed fields
  totalSupply(parent: Market) {
    return new Decimal(parent.totalSupplyScaled.toString())
      .mul(parent.liquidityIndex.toString())
      .toFixed(0);
  },

  totalDebt(parent: Market) {
    return new Decimal(parent.totalDebtScaled.toString())
      .mul(parent.borrowIndex.toString())
      .toFixed(0);
  },

  availableLiquidity(parent: Market) {
    const supply = new Decimal(parent.totalSupplyScaled.toString()).mul(
      parent.liquidityIndex.toString()
    );
    const debt = new Decimal(parent.totalDebtScaled.toString()).mul(
      parent.borrowIndex.toString()
    );
    return supply.sub(debt).toFixed(0);
  },

  // Relations
  async positions(
    parent: Market,
    { limit, offset }: { limit?: number; offset?: number },
    context: GraphQLContext
  ) {
    return context.prisma.userPosition.findMany({
      where: { marketId: parent.id },
      take: limit,
      skip: offset,
      orderBy: { lastInteraction: 'desc' },
    });
  },

  async transactions(
    parent: Market,
    { limit, offset }: { limit?: number; offset?: number },
    context: GraphQLContext
  ) {
    return context.prisma.transaction.findMany({
      where: { marketId: parent.id },
      take: limit,
      skip: offset,
      orderBy: { timestamp: 'desc' },
    });
  },

  async snapshots(
    parent: Market,
    { limit, orderBy }: { limit?: number; orderBy?: 'TIMESTAMP_ASC' | 'TIMESTAMP_DESC' },
    context: GraphQLContext
  ) {
    return context.prisma.marketSnapshot.findMany({
      where: { marketId: parent.id },
      take: limit,
      orderBy: {
        timestamp: orderBy === 'TIMESTAMP_ASC' ? 'asc' : 'desc',
      },
    });
  },
};

// ============================================================================
// UserPosition Field Resolvers
// ============================================================================

export const UserPositionResolvers = {
  // Computed fields
  async supplyAmount(parent: UserPosition, _: unknown, context: GraphQLContext) {
    const market = await context.loaders.marketLoader.load(parent.marketId);
    if (!market) return '0';

    return new Decimal(parent.supplyScaled.toString())
      .mul(market.liquidityIndex.toString())
      .toFixed(0);
  },

  async debtAmount(parent: UserPosition, _: unknown, context: GraphQLContext) {
    const market = await context.loaders.marketLoader.load(parent.marketId);
    if (!market) return '0';

    return new Decimal(parent.debtScaled.toString())
      .mul(market.borrowIndex.toString())
      .toFixed(0);
  },

  async healthFactor(parent: UserPosition, _: unknown, context: GraphQLContext) {
    // Health factor requires oracle prices (Phase 4)
    // For now, return null
    // Formula: (collateralValue * liquidationThreshold) / debtValue
    return null;
  },

  // Relations
  async market(parent: UserPosition, _: unknown, context: GraphQLContext) {
    return context.loaders.marketLoader.load(parent.marketId);
  },

  async transactions(
    parent: UserPosition,
    { limit, offset }: { limit?: number; offset?: number },
    context: GraphQLContext
  ) {
    return context.prisma.transaction.findMany({
      where: {
        marketId: parent.marketId,
        userAddress: parent.userAddress,
      },
      take: limit,
      skip: offset,
      orderBy: { timestamp: 'desc' },
    });
  },
};

// ============================================================================
// Transaction Field Resolvers
// ============================================================================

export const TransactionResolvers = {
  async market(parent: Transaction, _: unknown, context: GraphQLContext) {
    return context.loaders.marketLoader.load(parent.marketId);
  },
};

// ============================================================================
// MarketSnapshot Field Resolvers
// ============================================================================

export const MarketSnapshotResolvers = {
  async market(parent: MarketSnapshot, _: unknown, context: GraphQLContext) {
    return context.loaders.marketLoader.load(parent.marketId);
  },
};

// ============================================================================
// InterestAccrualEvent Field Resolvers
// ============================================================================

export const InterestAccrualEventResolvers = {
  async market(parent: InterestAccrualEvent, _: unknown, context: GraphQLContext) {
    return context.loaders.marketLoader.load(parent.marketId);
  },
};
