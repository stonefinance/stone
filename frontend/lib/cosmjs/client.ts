import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import {
  MarketInfo,
  MarketState,
  MarketConfig,
  MarketParams,
  UserPositionResponse,
  MarketsResponse,
} from '@/types';

// Default chain config
const RPC_ENDPOINT = process.env.NEXT_PUBLIC_RPC_ENDPOINT || 'https://rpc.osmosis.zone';
const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS || '';

class QueryClient {
  private client: CosmWasmClient | null = null;
  private clientPromise: Promise<CosmWasmClient> | null = null;

  private async getClient(): Promise<CosmWasmClient> {
    if (this.client) {
      return this.client;
    }

    if (this.clientPromise) {
      return this.clientPromise;
    }

    this.clientPromise = CosmWasmClient.connect(RPC_ENDPOINT).then((client) => {
      this.client = client;
      return client;
    });

    return this.clientPromise;
  }

  async getMarkets(
    startAfter?: string,
    limit?: number
  ): Promise<MarketsResponse> {
    const client = await this.getClient();

    if (!FACTORY_ADDRESS) {
      console.warn('FACTORY_ADDRESS not configured');
      return { markets: [] };
    }

    const response = await client.queryContractSmart(FACTORY_ADDRESS, {
      markets: {
        start_after: startAfter,
        limit,
      },
    });

    return response as MarketsResponse;
  }

  async getMarket(marketId: string): Promise<MarketInfo> {
    const client = await this.getClient();

    if (!FACTORY_ADDRESS) {
      throw new Error('FACTORY_ADDRESS not configured');
    }

    const response = await client.queryContractSmart(FACTORY_ADDRESS, {
      market: { market_id: marketId },
    });

    return response as MarketInfo;
  }

  async getMarketState(marketAddress: string): Promise<MarketState> {
    const client = await this.getClient();

    const response = await client.queryContractSmart(marketAddress, {
      state: {},
    });

    return response as MarketState;
  }

  async getMarketConfig(marketAddress: string): Promise<MarketConfig> {
    const client = await this.getClient();

    const response = await client.queryContractSmart(marketAddress, {
      config: {},
    });

    return response as MarketConfig;
  }

  async getMarketParams(marketAddress: string): Promise<MarketParams> {
    const client = await this.getClient();

    const response = await client.queryContractSmart(marketAddress, {
      params: {},
    });

    return response as MarketParams;
  }

  async getUserPosition(
    marketAddress: string,
    userAddress: string
  ): Promise<UserPositionResponse> {
    const client = await this.getClient();

    const response = await client.queryContractSmart(marketAddress, {
      user_position: { user: userAddress },
    });

    return response as UserPositionResponse;
  }

  async getMarketsByCollateral(
    collateralDenom: string,
    startAfter?: string,
    limit?: number
  ): Promise<MarketsResponse> {
    const client = await this.getClient();

    if (!FACTORY_ADDRESS) {
      return { markets: [] };
    }

    const response = await client.queryContractSmart(FACTORY_ADDRESS, {
      markets_by_collateral: {
        collateral_denom: collateralDenom,
        start_after: startAfter,
        limit,
      },
    });

    return response as MarketsResponse;
  }

  async getMarketsByDebt(
    debtDenom: string,
    startAfter?: string,
    limit?: number
  ): Promise<MarketsResponse> {
    const client = await this.getClient();

    if (!FACTORY_ADDRESS) {
      return { markets: [] };
    }

    const response = await client.queryContractSmart(FACTORY_ADDRESS, {
      markets_by_debt: {
        debt_denom: debtDenom,
        start_after: startAfter,
        limit,
      },
    });

    return response as MarketsResponse;
  }

  async getMarketsByCurator(
    curator: string,
    startAfter?: string,
    limit?: number
  ): Promise<MarketsResponse> {
    const client = await this.getClient();

    if (!FACTORY_ADDRESS) {
      return { markets: [] };
    }

    const response = await client.queryContractSmart(FACTORY_ADDRESS, {
      markets_by_curator: {
        curator,
        start_after: startAfter,
        limit,
      },
    });

    return response as MarketsResponse;
  }
}

// Export a singleton instance
export const queryClient = new QueryClient();
