import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/cosmjs/client';
import { Market } from '@/types';
import { parseDecimal, formatDenom } from '@/lib/utils/format';

export function useMarkets() {
  return useQuery({
    queryKey: ['markets'],
    queryFn: async (): Promise<Market[]> => {
      const { markets } = await queryClient.getMarkets(undefined, 100);

      // Fetch state for each market to get APY and other details
      const marketsWithDetails = await Promise.all(
        markets.map(async (marketInfo) => {
          try {
            const state = await queryClient.getMarketState(marketInfo.address);

            // Convert rates from annual decimal to percentage
            const supplyApy = parseDecimal(state.liquidity_rate) * 100;
            const borrowApy = parseDecimal(state.borrow_rate) * 100;
            const utilization = parseDecimal(state.utilization) * 100;

            return {
              id: marketInfo.market_id,
              address: marketInfo.address,
              collateralDenom: formatDenom(marketInfo.collateral_denom),
              debtDenom: formatDenom(marketInfo.debt_denom),
              curator: marketInfo.curator,
              supplyApy,
              borrowApy,
              totalSupplied: state.total_supply_scaled,
              totalBorrowed: state.total_debt_scaled,
              utilization,
              availableLiquidity: state.available_liquidity,
            };
          } catch (error) {
            console.error(`Failed to fetch state for market ${marketInfo.market_id}:`, error);
            // Return market with placeholder data if state fetch fails
            return {
              id: marketInfo.market_id,
              address: marketInfo.address,
              collateralDenom: formatDenom(marketInfo.collateral_denom),
              debtDenom: formatDenom(marketInfo.debt_denom),
              curator: marketInfo.curator,
              supplyApy: 0,
              borrowApy: 0,
              totalSupplied: '0',
              totalBorrowed: '0',
              utilization: 0,
              availableLiquidity: '0',
            };
          }
        })
      );

      return marketsWithDetails;
    },
    staleTime: 30_000, // 30 seconds
  });
}

export function useMarket(marketId: string | undefined) {
  return useQuery({
    queryKey: ['market', marketId],
    queryFn: async () => {
      if (!marketId) throw new Error('Market ID is required');

      const marketInfo = await queryClient.getMarket(marketId);
      const state = await queryClient.getMarketState(marketInfo.address);
      const config = await queryClient.getMarketConfig(marketInfo.address);
      const params = await queryClient.getMarketParams(marketInfo.address);

      const supplyApy = parseDecimal(state.liquidity_rate) * 100;
      const borrowApy = parseDecimal(state.borrow_rate) * 100;
      const utilization = parseDecimal(state.utilization) * 100;

      return {
        info: marketInfo,
        state,
        config,
        params,
        id: marketInfo.market_id,
        address: marketInfo.address,
        collateralDenom: formatDenom(config.collateral_denom),
        debtDenom: formatDenom(config.debt_denom),
        curator: config.curator,
        supplyApy,
        borrowApy,
        totalSupplied: state.total_supply_scaled,
        totalBorrowed: state.total_debt_scaled,
        utilization,
        availableLiquidity: state.available_liquidity,
      };
    },
    enabled: !!marketId,
    staleTime: 30_000,
  });
}
