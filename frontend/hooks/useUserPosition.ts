'use client';

import { useEffect } from 'react';
import { useWallet } from '@/lib/cosmjs/wallet';
import { UserPosition } from '@/types';
import {
  useGetUserPositionQuery,
  useGetUserPositionsQuery,
  PositionFieldsFragment,
  OnPositionUpdatedDocument,
  OnPositionUpdatedSubscription,
  OnPositionUpdatedSubscriptionVariables,
  GetUserPositionQuery,
  GetUserPositionsQuery,
} from '@/lib/graphql/generated/hooks';
import { getPositionType } from '@/lib/utils/position';

function transformPosition(position: PositionFieldsFragment): UserPosition {
  // Note: GraphQL returns amounts as strings (BigInt)
  // healthFactor is returned from GraphQL when available
  //
  // Price-dependent values (collateralValue, supplyValue, debtValue, liquidationPrice)
  // are set to placeholders here since this hook doesn't have access to oracle prices.
  // maxBorrowValue is calculated in the market page component where Pyth prices
  // are already fetched (see app/markets/[id]/page.tsx).

  const healthFactor = position.healthFactor
    ? parseFloat(position.healthFactor)
    : undefined;

  return {
    marketId: position.market.id,
    collateralAmount: position.collateral,
    collateralValue: 0, // Calculated where oracle prices are available
    supplyAmount: position.supplyAmount,
    supplyValue: 0, // Calculated where oracle prices are available
    debtAmount: position.debtAmount,
    debtValue: 0, // Calculated where oracle prices are available
    healthFactor,
    maxBorrowValue: 0, // Calculated in page component with Pyth prices
    liquidationPrice: undefined, // Calculated where oracle prices are available
  };
}

/**
 * Fetch user position for a specific market
 * @param marketId - The market ID (not contract address)
 */
export function useUserPosition(marketId: string | undefined) {
  const { address, isConnected } = useWallet();

  const { data, loading, error, refetch, subscribeToMore } = useGetUserPositionQuery({
    variables: {
      marketId: marketId!,
      userAddress: address!,
    },
    skip: !isConnected || !address || !marketId,
  });

  // Subscribe to real-time position updates
  useEffect(() => {
    if (!isConnected || !address) return;

    const unsubscribe = subscribeToMore<
      OnPositionUpdatedSubscription,
      OnPositionUpdatedSubscriptionVariables
    >({
      document: OnPositionUpdatedDocument,
      variables: { userAddress: address },
      updateQuery: (prev, { subscriptionData }): GetUserPositionQuery => {
        if (!subscriptionData.data) return prev as GetUserPositionQuery;
        const updatedPosition = subscriptionData.data.positionUpdated;
        if (updatedPosition.market.id !== marketId) return prev as GetUserPositionQuery;
        return {
          __typename: 'Query',
          userPosition: updatedPosition as GetUserPositionQuery['userPosition'],
        };
      },
    });

    return () => unsubscribe();
  }, [address, isConnected, marketId, subscribeToMore]);

  const position = data?.userPosition ? transformPosition(data.userPosition) : null;
  const positionType = getPositionType(position);

  return {
    data: position,
    positionType,
    isLoading: loading,
    error: error ? new Error(error.message) : undefined,
    refetch,
  };
}

/**
 * Fetch all positions for the connected user
 */
export function useUserPositions() {
  const { address, isConnected } = useWallet();

  const { data, loading, error, refetch, subscribeToMore } = useGetUserPositionsQuery({
    variables: {
      userAddress: address!,
    },
    skip: !isConnected || !address,
  });

  // Subscribe to real-time position updates
  useEffect(() => {
    if (!isConnected || !address) return;

    const unsubscribe = subscribeToMore<
      OnPositionUpdatedSubscription,
      OnPositionUpdatedSubscriptionVariables
    >({
      document: OnPositionUpdatedDocument,
      variables: { userAddress: address },
      updateQuery: (prev, { subscriptionData }): GetUserPositionsQuery => {
        if (!subscriptionData.data) return prev as GetUserPositionsQuery;

        const updatedPosition = subscriptionData.data.positionUpdated;
        const existingPositions = prev.userPositions ?? [];
        const index = existingPositions.findIndex((p) => p.id === updatedPosition.id);

        if (index >= 0) {
          const updated = [...existingPositions];
          updated[index] = updatedPosition;
          return {
            __typename: 'Query',
            userPositions: updated as GetUserPositionsQuery['userPositions'],
          };
        }

        return {
          __typename: 'Query',
          userPositions: [...existingPositions, updatedPosition] as GetUserPositionsQuery['userPositions'],
        };
      },
    });

    return () => unsubscribe();
  }, [address, isConnected, subscribeToMore]);

  const positions = data?.userPositions.map(transformPosition) ?? [];

  return {
    data: positions,
    isLoading: loading,
    error: error ? new Error(error.message) : undefined,
    refetch,
  };
}
