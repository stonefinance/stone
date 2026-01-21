import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/cosmjs/client';
import { useWallet } from '@/lib/cosmjs/wallet';
import { UserPosition } from '@/types';
import { parseDecimal } from '@/lib/utils/format';

export function useUserPosition(marketAddress: string | undefined) {
  const { address, isConnected } = useWallet();

  return useQuery({
    queryKey: ['userPosition', marketAddress, address],
    queryFn: async (): Promise<UserPosition | null> => {
      if (!address || !marketAddress) return null;

      try {
        const position = await queryClient.getUserPosition(marketAddress, address);

        return {
          marketId: marketAddress,
          collateralAmount: position.collateral_amount,
          collateralValue: parseDecimal(position.collateral_value),
          supplyAmount: position.supply_amount,
          supplyValue: parseDecimal(position.supply_value),
          debtAmount: position.debt_amount,
          debtValue: parseDecimal(position.debt_value),
          healthFactor: position.health_factor ? parseDecimal(position.health_factor) : undefined,
          maxBorrowValue: parseDecimal(position.max_borrow_value),
          liquidationPrice: position.liquidation_price
            ? parseDecimal(position.liquidation_price)
            : undefined,
        };
      } catch (error) {
        console.error('Failed to fetch user position:', error);
        return null;
      }
    },
    enabled: isConnected && !!address && !!marketAddress,
    staleTime: 10_000, // 10 seconds
  });
}

export function useUserPositions(marketAddresses: string[]) {
  const { address, isConnected } = useWallet();

  return useQuery({
    queryKey: ['userPositions', marketAddresses, address],
    queryFn: async (): Promise<UserPosition[]> => {
      if (!address || marketAddresses.length === 0) return [];

      const positions = await Promise.all(
        marketAddresses.map(async (marketAddress) => {
          try {
            const position = await queryClient.getUserPosition(marketAddress, address);

            return {
              marketId: marketAddress,
              collateralAmount: position.collateral_amount,
              collateralValue: parseDecimal(position.collateral_value),
              supplyAmount: position.supply_amount,
              supplyValue: parseDecimal(position.supply_value),
              debtAmount: position.debt_amount,
              debtValue: parseDecimal(position.debt_value),
              healthFactor: position.health_factor
                ? parseDecimal(position.health_factor)
                : undefined,
              maxBorrowValue: parseDecimal(position.max_borrow_value),
              liquidationPrice: position.liquidation_price
                ? parseDecimal(position.liquidation_price)
                : undefined,
            };
          } catch (error) {
            console.error(`Failed to fetch position for market ${marketAddress}:`, error);
            return null;
          }
        })
      );

      return positions.filter((p): p is UserPosition => p !== null);
    },
    enabled: isConnected && !!address && marketAddresses.length > 0,
    staleTime: 10_000,
  });
}
