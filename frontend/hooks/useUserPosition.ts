'use client';

import { useWallet } from '@/lib/cosmjs/wallet';
import { UserPosition } from '@/types';
import {
  useGetUserPositionQuery,
  useGetUserPositionsQuery,
  PositionFieldsFragment,
} from '@/lib/graphql/generated/hooks';
import { getPositionType } from '@/lib/utils/position';

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

  const { data, loading, error, refetch } = useGetUserPositionQuery({
    variables: {
      marketId: marketId!,
      userAddress: address!,
    },
    skip: !isConnected || !address || !marketId,
    pollInterval: 10000, // Poll every 10 seconds
  });

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

  const { data, loading, error, refetch } = useGetUserPositionsQuery({
    variables: {
      userAddress: address!,
    },
    skip: !isConnected || !address,
    pollInterval: 10000,
  });

  const positions = data?.userPositions.map(transformPosition) ?? [];

  return {
    data: positions,
    isLoading: loading,
    error: error ? new Error(error.message) : undefined,
    refetch,
  };
}
