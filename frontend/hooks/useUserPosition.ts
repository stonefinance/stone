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
} from '@/lib/graphql/generated/hooks';

function transformPosition(position: PositionFieldsFragment): UserPosition {
  // Note: GraphQL returns amounts as strings (BigInt)
  // healthFactor is returned from GraphQL when available
  // collateralValue, supplyValue, debtValue, maxBorrowValue, liquidationPrice
  // require oracle price integration (Phase 4)

  const healthFactor = position.healthFactor
    ? parseFloat(position.healthFactor)
    : undefined;

  return {
    marketId: position.market.id,
    collateralAmount: position.collateral,
    collateralValue: 0, // Requires oracle price - placeholder
    supplyAmount: position.supplyAmount,
    supplyValue: 0, // Requires oracle price - placeholder
    debtAmount: position.debtAmount,
    debtValue: 0, // Requires oracle price - placeholder
    healthFactor,
    maxBorrowValue: 0, // Requires oracle price - placeholder
    liquidationPrice: undefined, // Requires oracle price - placeholder
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unsubscribe = (subscribeToMore as any)({
      document: OnPositionUpdatedDocument,
      variables: { userAddress: address },
      updateQuery: (prev: any, { subscriptionData }: { subscriptionData: { data?: OnPositionUpdatedSubscription } }) => {
        if (!subscriptionData.data) return prev;
        const updatedPosition = subscriptionData.data.positionUpdated;
        // Only update if the position is for the current market
        if (updatedPosition.market.id !== marketId) return prev;
        return {
          ...prev,
          userPosition: updatedPosition,
        };
      },
    });

    return () => unsubscribe();
  }, [address, isConnected, marketId, subscribeToMore]);

  return {
    data: data?.userPosition ? transformPosition(data.userPosition) : null,
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unsubscribe = (subscribeToMore as any)({
      document: OnPositionUpdatedDocument,
      variables: { userAddress: address },
      updateQuery: (prev: any, { subscriptionData }: { subscriptionData: { data?: OnPositionUpdatedSubscription } }) => {
        if (!subscriptionData.data) return prev;
        const updatedPosition = subscriptionData.data.positionUpdated;
        const existingPositions = prev.userPositions ?? [];
        // Replace the matching position or append if new
        const index = existingPositions.findIndex(
          (p: any) => p.id === updatedPosition.id
        );
        if (index >= 0) {
          const updated = [...existingPositions];
          updated[index] = updatedPosition;
          return { ...prev, userPositions: updated };
        }
        return { ...prev, userPositions: [...existingPositions, updatedPosition] };
      },
    });

    return () => unsubscribe();
  }, [address, isConnected, subscribeToMore]);

  return {
    data: data?.userPositions.map(transformPosition) ?? [],
    isLoading: loading,
    error: error ? new Error(error.message) : undefined,
    refetch,
  };
}
