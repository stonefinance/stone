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
import { RPC_ENDPOINT, FACTORY_ADDRESS, GAS_PRICE } from '@/lib/constants';
import { executeSingleWithPriceUpdate, getRelevantDenoms, PythUpdateConfig, PYTH_CONTRACT_ADDRESS, PYTH_MODE } from '@/lib/pyth';

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

  // ============================================================================
  // Pyth-Enabled Transaction Methods
  // These methods bundle Pyth price updates with the actual transaction
  // to ensure fresh oracle data is available on-chain
  // ============================================================================

  /**
   * Get Pyth configuration for transactions
   */
  private getPythConfig(): PythUpdateConfig {
    return {
      pythContractAddress: PYTH_CONTRACT_ADDRESS,
      mode: PYTH_MODE,
    };
  }

  /**
   * Supply liquidity with Pyth price updates
   */
  async supplyWithPriceUpdate(
    marketAddress: string,
    amount: Coin,
    collateralDenom: string,
    debtDenom: string,
    recipient?: string
  ) {
    const client = await this.connect();
    const pythConfig = this.getPythConfig();

    // Skip if mock mode or no Pyth contract configured
    if (pythConfig.mode === 'mock' || !pythConfig.pythContractAddress) {
      return this.supply(marketAddress, amount, recipient);
    }

    const msg: MarketExecuteMsg = { supply: { recipient } };
    const relevantDenoms = getRelevantDenoms('supply', collateralDenom, debtDenom);

    return executeSingleWithPriceUpdate(
      client,
      this.address,
      marketAddress,
      msg,
      [amount],
      relevantDenoms,
      pythConfig
    );
  }

  /**
   * Withdraw supply with Pyth price updates
   */
  async withdrawWithPriceUpdate(
    marketAddress: string,
    amount: string | undefined,
    collateralDenom: string,
    debtDenom: string,
    recipient?: string
  ) {
    const client = await this.connect();
    const pythConfig = this.getPythConfig();

    // Skip if mock mode or no Pyth contract configured
    if (pythConfig.mode === 'mock' || !pythConfig.pythContractAddress) {
      return this.withdraw(marketAddress, amount, recipient);
    }

    const msg: MarketExecuteMsg = { withdraw: { amount, recipient } };
    const relevantDenoms = getRelevantDenoms('withdraw', collateralDenom, debtDenom);

    return executeSingleWithPriceUpdate(
      client,
      this.address,
      marketAddress,
      msg,
      undefined,
      relevantDenoms,
      pythConfig
    );
  }

  /**
   * Supply collateral with Pyth price updates
   */
  async supplyCollateralWithPriceUpdate(
    marketAddress: string,
    amount: Coin,
    collateralDenom: string,
    debtDenom: string,
    recipient?: string
  ) {
    const client = await this.connect();
    const pythConfig = this.getPythConfig();

    // Skip if mock mode or no Pyth contract configured
    if (pythConfig.mode === 'mock' || !pythConfig.pythContractAddress) {
      return this.supplyCollateral(marketAddress, amount, recipient);
    }

    const msg: MarketExecuteMsg = { supply_collateral: { recipient } };
    const relevantDenoms = getRelevantDenoms('supply_collateral', collateralDenom, debtDenom);

    return executeSingleWithPriceUpdate(
      client,
      this.address,
      marketAddress,
      msg,
      [amount],
      relevantDenoms,
      pythConfig
    );
  }

  /**
   * Withdraw collateral with Pyth price updates
   */
  async withdrawCollateralWithPriceUpdate(
    marketAddress: string,
    amount: string | undefined,
    collateralDenom: string,
    debtDenom: string,
    recipient?: string
  ) {
    const client = await this.connect();
    const pythConfig = this.getPythConfig();

    // Skip if mock mode or no Pyth contract configured
    if (pythConfig.mode === 'mock' || !pythConfig.pythContractAddress) {
      return this.withdrawCollateral(marketAddress, amount, recipient);
    }

    const msg: MarketExecuteMsg = { withdraw_collateral: { amount, recipient } };
    const relevantDenoms = getRelevantDenoms('withdraw_collateral', collateralDenom, debtDenom);

    return executeSingleWithPriceUpdate(
      client,
      this.address,
      marketAddress,
      msg,
      undefined,
      relevantDenoms,
      pythConfig
    );
  }

  /**
   * Borrow with Pyth price updates
   */
  async borrowWithPriceUpdate(
    marketAddress: string,
    amount: string,
    collateralDenom: string,
    debtDenom: string,
    recipient?: string
  ) {
    const client = await this.connect();
    const pythConfig = this.getPythConfig();

    // Skip if mock mode or no Pyth contract configured
    if (pythConfig.mode === 'mock' || !pythConfig.pythContractAddress) {
      return this.borrow(marketAddress, amount, recipient);
    }

    const msg: MarketExecuteMsg = { borrow: { amount, recipient } };
    const relevantDenoms = getRelevantDenoms('borrow', collateralDenom, debtDenom);

    return executeSingleWithPriceUpdate(
      client,
      this.address,
      marketAddress,
      msg,
      undefined,
      relevantDenoms,
      pythConfig
    );
  }

  /**
   * Repay debt with Pyth price updates
   */
  async repayWithPriceUpdate(
    marketAddress: string,
    amount: Coin,
    collateralDenom: string,
    debtDenom: string,
    onBehalfOf?: string
  ) {
    const client = await this.connect();
    const pythConfig = this.getPythConfig();

    // Skip if mock mode or no Pyth contract configured
    if (pythConfig.mode === 'mock' || !pythConfig.pythContractAddress) {
      return this.repay(marketAddress, amount, onBehalfOf);
    }

    const msg: MarketExecuteMsg = { repay: { on_behalf_of: onBehalfOf } };
    const relevantDenoms = getRelevantDenoms('repay', collateralDenom, debtDenom);

    return executeSingleWithPriceUpdate(
      client,
      this.address,
      marketAddress,
      msg,
      [amount],
      relevantDenoms,
      pythConfig
    );
  }

  /**
   * Liquidate with Pyth price updates
   */
  async liquidateWithPriceUpdate(
    marketAddress: string,
    borrower: string,
    repayAmount: Coin,
    collateralDenom: string,
    debtDenom: string
  ) {
    const client = await this.connect();
    const pythConfig = this.getPythConfig();

    // Skip if mock mode or no Pyth contract configured
    if (pythConfig.mode === 'mock' || !pythConfig.pythContractAddress) {
      return this.liquidate(marketAddress, borrower, repayAmount);
    }

    const msg: MarketExecuteMsg = { liquidate: { borrower } };
    const relevantDenoms = getRelevantDenoms('liquidate', collateralDenom, debtDenom);

    return executeSingleWithPriceUpdate(
      client,
      this.address,
      marketAddress,
      msg,
      [repayAmount],
      relevantDenoms,
      pythConfig
    );
  }
}

// Singleton instance for query client
export const queryClient = new QueryClient();
