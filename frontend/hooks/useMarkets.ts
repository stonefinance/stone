'use client';

import { Market, MarketDetail } from '@/types';
import { formatDenom } from '@/lib/utils/format';
import {
  useGetMarketsQuery,
  useGetMarketQuery,
  MarketSummaryFieldsFragment,
  MarketFieldsFragment,
} from '@/lib/graphql/generated/hooks';

function parseRate(rate: string): number {
  // Rates come as decimals (e.g., "0.05" for 5%), convert to percentage
  return parseFloat(rate) * 100;
}

function transformMarketSummary(market: MarketSummaryFieldsFragment): Market {
  return {
    id: market.id,
    address: market.marketAddress,
    collateralDenom: formatDenom(market.collateralDenom),
    debtDenom: formatDenom(market.debtDenom),
    curator: market.curator,
    supplyApy: parseRate(market.liquidityRate),
    borrowApy: parseRate(market.borrowRate),
    totalSupplied: market.totalSupply,
    totalBorrowed: market.totalDebt,
    utilization: parseFloat(market.utilization) * 100,
    availableLiquidity: market.availableLiquidity,
  };
}

function transformMarketDetail(market: MarketFieldsFragment): MarketDetail {
  return {
    id: market.id,
    address: market.marketAddress,
    collateralDenom: formatDenom(market.collateralDenom),
    debtDenom: formatDenom(market.debtDenom),
    curator: market.curator,
    supplyApy: parseRate(market.liquidityRate),
    borrowApy: parseRate(market.borrowRate),
    totalSupplied: market.totalSupply,
    totalBorrowed: market.totalDebt,
    utilization: parseFloat(market.utilization) * 100,
    availableLiquidity: market.availableLiquidity,
    info: {
      market_id: market.id,
      address: market.marketAddress,
      collateral_denom: market.collateralDenom,
      debt_denom: market.debtDenom,
      curator: market.curator,
    },
    state: {
      total_supply_scaled: market.totalSupply,
      total_debt_scaled: market.totalDebt,
      liquidity_rate: market.liquidityRate,
      borrow_rate: market.borrowRate,
      utilization: market.utilization,
      available_liquidity: market.availableLiquidity,
      liquidity_index: market.liquidityIndex,
      borrow_index: market.borrowIndex,
    },
    config: {
      collateral_denom: market.collateralDenom,
      debt_denom: market.debtDenom,
      curator: market.curator,
      oracle: market.oracle,
    },
    params: {
      loan_to_value: market.loanToValue,
      liquidation_threshold: market.liquidationThreshold,
      liquidation_bonus: market.liquidationBonus,
      close_factor: market.closeFactor,
      interest_rate_model: market.interestRateModel,
      supply_cap: market.supplyCap ?? undefined,
      borrow_cap: market.borrowCap ?? undefined,
    },
  };
}

export function useMarkets() {
  const { data, loading, error, refetch } = useGetMarketsQuery({
    variables: {
      limit: 100,
      enabledOnly: false,
    },
    pollInterval: 30000, // Poll every 30 seconds
  });

  return {
    data: data?.markets.map(transformMarketSummary),
    isLoading: loading,
    error: error ? new Error(error.message) : undefined,
    refetch,
  };
}

export function useMarket(marketId: string | undefined) {
  const { data, loading, error, refetch } = useGetMarketQuery({
    variables: {
      id: marketId!,
    },
    skip: !marketId,
    pollInterval: 30000,
  });

  return {
    data: data?.market ? transformMarketDetail(data.market) : undefined,
    isLoading: loading,
    error: error ? new Error(error.message) : undefined,
    refetch,
  };
}
