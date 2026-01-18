import { PubSub } from 'graphql-subscriptions';
import { GraphQLContext } from '../context';

export const pubsub = new PubSub();

// Event types
export const MARKET_UPDATED = 'MARKET_UPDATED';
export const NEW_TRANSACTION = 'NEW_TRANSACTION';
export const POSITION_UPDATED = 'POSITION_UPDATED';

export const Subscription = {
  marketUpdated: {
    subscribe: (_: unknown, { marketId }: { marketId: string }) => {
      return pubsub.asyncIterator([`${MARKET_UPDATED}:${marketId}`]);
    },
  },

  newTransaction: {
    subscribe: (_: unknown, { marketId }: { marketId?: string }) => {
      if (marketId) {
        return pubsub.asyncIterator([`${NEW_TRANSACTION}:${marketId}`]);
      }
      return pubsub.asyncIterator([NEW_TRANSACTION]);
    },
  },

  positionUpdated: {
    subscribe: (_: unknown, { userAddress }: { userAddress: string }) => {
      return pubsub.asyncIterator([`${POSITION_UPDATED}:${userAddress}`]);
    },
  },
};

// Helper functions to publish events (called from event handlers)

export function publishMarketUpdate(marketId: string, market: unknown) {
  pubsub.publish(`${MARKET_UPDATED}:${marketId}`, {
    marketUpdated: market,
  });
}

export function publishTransaction(transaction: unknown, marketId?: string) {
  // Publish to global feed
  pubsub.publish(NEW_TRANSACTION, {
    newTransaction: transaction,
  });

  // Publish to market-specific feed
  if (marketId) {
    pubsub.publish(`${NEW_TRANSACTION}:${marketId}`, {
      newTransaction: transaction,
    });
  }
}

export function publishPositionUpdate(userAddress: string, position: unknown) {
  pubsub.publish(`${POSITION_UPDATED}:${userAddress}`, {
    positionUpdated: position,
  });
}
