import { SigningCosmWasmClient, CosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { GasPrice } from '@cosmjs/stargate';
import { OfflineSigner } from '@cosmjs/proto-signing';
import {
  MarketQueryMsg,
  MarketExecuteMsg,
  FactoryQueryMsg,
  MarketConfigResponse,
  MarketParamsResponse,
  MarketStateResponse,
  UserPositionResponse,
  UserBalanceResponse,
  IsLiquidatableResponse,
  FactoryConfigResponse,
  MarketsResponse,
  MarketCountResponse,
  Coin,
} from '@/types';
import { RPC_ENDPOINT, FACTORY_ADDRESS, GAS_LIMITS, GAS_PRICE } from '@/lib/constants';

// Query-only client (no wallet required)
export class QueryClient {
  private client: CosmWasmClient | null = null;

  async connect() {
    if (!this.client) {
      this.client = await CosmWasmClient.connect(RPC_ENDPOINT);
    }
    return this.client;
  }

  // Factory Queries
  async getFactoryConfig(): Promise<FactoryConfigResponse> {
    const client = await this.connect();
    const msg: FactoryQueryMsg = { config: {} };
    return client.queryContractSmart(FACTORY_ADDRESS, msg);
  }

  async getMarkets(startAfter?: string, limit?: number): Promise<MarketsResponse> {
    const client = await this.connect();
    const msg: FactoryQueryMsg = { markets: { start_after: startAfter, limit } };
    return client.queryContractSmart(FACTORY_ADDRESS, msg);
  }

  async getMarket(marketId: string) {
    const client = await this.connect();
    const msg: FactoryQueryMsg = { market: { market_id: marketId } };
    return client.queryContractSmart(FACTORY_ADDRESS, msg);
  }

  async getMarketCount(): Promise<MarketCountResponse> {
    const client = await this.connect();
    const msg: FactoryQueryMsg = { market_count: {} };
    return client.queryContractSmart(FACTORY_ADDRESS, msg);
  }

  // Market Queries
  async getMarketConfig(marketAddress: string): Promise<MarketConfigResponse> {
    const client = await this.connect();
    const msg: MarketQueryMsg = { config: {} };
    return client.queryContractSmart(marketAddress, msg);
  }

  async getMarketParams(marketAddress: string): Promise<MarketParamsResponse> {
    const client = await this.connect();
    const msg: MarketQueryMsg = { params: {} };
    return client.queryContractSmart(marketAddress, msg);
  }

  async getMarketState(marketAddress: string): Promise<MarketStateResponse> {
    const client = await this.connect();
    const msg: MarketQueryMsg = { state: {} };
    return client.queryContractSmart(marketAddress, msg);
  }

  async getUserPosition(marketAddress: string, userAddress: string): Promise<UserPositionResponse> {
    const client = await this.connect();
    const msg: MarketQueryMsg = { user_position: { user: userAddress } };
    return client.queryContractSmart(marketAddress, msg);
  }

  async getUserSupply(marketAddress: string, userAddress: string): Promise<UserBalanceResponse> {
    const client = await this.connect();
    const msg: MarketQueryMsg = { user_supply: { user: userAddress } };
    return client.queryContractSmart(marketAddress, msg);
  }

  async getUserCollateral(marketAddress: string, userAddress: string): Promise<UserBalanceResponse> {
    const client = await this.connect();
    const msg: MarketQueryMsg = { user_collateral: { user: userAddress } };
    return client.queryContractSmart(marketAddress, msg);
  }

  async getUserDebt(marketAddress: string, userAddress: string): Promise<UserBalanceResponse> {
    const client = await this.connect();
    const msg: MarketQueryMsg = { user_debt: { user: userAddress } };
    return client.queryContractSmart(marketAddress, msg);
  }

  async isLiquidatable(marketAddress: string, userAddress: string): Promise<IsLiquidatableResponse> {
    const client = await this.connect();
    const msg: MarketQueryMsg = { is_liquidatable: { user: userAddress } };
    return client.queryContractSmart(marketAddress, msg);
  }

  async getBalance(address: string, denom: string): Promise<Coin> {
    const client = await this.connect();
    return client.getBalance(address, denom);
  }
}

// Signing client (requires wallet)
export class SigningClient {
  private client: SigningCosmWasmClient | null = null;
  private signer: OfflineSigner;
  private address: string;

  constructor(signer: OfflineSigner, address: string) {
    this.signer = signer;
    this.address = address;
  }

  async connect() {
    if (!this.client) {
      this.client = await SigningCosmWasmClient.connectWithSigner(
        RPC_ENDPOINT,
        this.signer,
        {
          gasPrice: GasPrice.fromString(GAS_PRICE),
        }
      );
    }
    return this.client;
  }

  // Market Execute Functions
  async supply(marketAddress: string, amount: Coin, recipient?: string) {
    const client = await this.connect();
    const msg: MarketExecuteMsg = { supply: { recipient } };

    return client.execute(
      this.address,
      marketAddress,
      msg,
      'auto',
      undefined,
      [amount]
    );
  }

  async withdraw(marketAddress: string, amount?: string, recipient?: string) {
    const client = await this.connect();
    const msg: MarketExecuteMsg = { withdraw: { amount, recipient } };

    return client.execute(
      this.address,
      marketAddress,
      msg,
      'auto'
    );
  }

  async supplyCollateral(marketAddress: string, amount: Coin, recipient?: string) {
    const client = await this.connect();
    const msg: MarketExecuteMsg = { supply_collateral: { recipient } };

    return client.execute(
      this.address,
      marketAddress,
      msg,
      'auto',
      undefined,
      [amount]
    );
  }

  async withdrawCollateral(marketAddress: string, amount?: string, recipient?: string) {
    const client = await this.connect();
    const msg: MarketExecuteMsg = { withdraw_collateral: { amount, recipient } };

    return client.execute(
      this.address,
      marketAddress,
      msg,
      'auto'
    );
  }

  async borrow(marketAddress: string, amount: string, recipient?: string) {
    const client = await this.connect();
    const msg: MarketExecuteMsg = { borrow: { amount, recipient } };

    return client.execute(
      this.address,
      marketAddress,
      msg,
      'auto'
    );
  }

  async repay(marketAddress: string, amount: Coin, onBehalfOf?: string) {
    const client = await this.connect();
    const msg: MarketExecuteMsg = { repay: { on_behalf_of: onBehalfOf } };

    return client.execute(
      this.address,
      marketAddress,
      msg,
      'auto',
      undefined,
      [amount]
    );
  }

  async liquidate(marketAddress: string, borrower: string, repayAmount: Coin) {
    const client = await this.connect();
    const msg: MarketExecuteMsg = { liquidate: { borrower } };

    return client.execute(
      this.address,
      marketAddress,
      msg,
      'auto',
      undefined,
      [repayAmount]
    );
  }
}

// Singleton instance for query client
export const queryClient = new QueryClient();
