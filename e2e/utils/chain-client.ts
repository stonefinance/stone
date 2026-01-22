import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { GasPrice, Coin } from '@cosmjs/stargate';
import { CHAIN_CONFIG } from '../fixtures/test-accounts';

const RPC_ENDPOINT = process.env.RPC_ENDPOINT || CHAIN_CONFIG.rpcEndpoint;

export class ChainClient {
  private constructor(
    public readonly client: SigningCosmWasmClient,
    public readonly address: string
  ) {}

  static async connect(mnemonic: string): Promise<ChainClient> {
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
      prefix: CHAIN_CONFIG.prefix,
    });
    const [account] = await wallet.getAccounts();

    const client = await SigningCosmWasmClient.connectWithSigner(
      RPC_ENDPOINT,
      wallet,
      { gasPrice: GasPrice.fromString(CHAIN_CONFIG.gasPrice) }
    );

    return new ChainClient(client, account.address);
  }

  async supplyCollateral(
    marketAddress: string,
    amount: string,
    denom: string
  ): Promise<string> {
    const result = await this.client.execute(
      this.address,
      marketAddress,
      { supply_collateral: {} },
      'auto',
      '',
      [{ denom, amount }]
    );
    return result.transactionHash;
  }

  async withdrawCollateral(
    marketAddress: string,
    amount: string
  ): Promise<string> {
    const result = await this.client.execute(
      this.address,
      marketAddress,
      { withdraw_collateral: { amount } },
      'auto'
    );
    return result.transactionHash;
  }

  async supply(
    marketAddress: string,
    amount: string,
    denom: string
  ): Promise<string> {
    const result = await this.client.execute(
      this.address,
      marketAddress,
      { supply: {} },
      'auto',
      '',
      [{ denom, amount }]
    );
    return result.transactionHash;
  }

  async withdraw(
    marketAddress: string,
    amount: string
  ): Promise<string> {
    const result = await this.client.execute(
      this.address,
      marketAddress,
      { withdraw: { amount } },
      'auto'
    );
    return result.transactionHash;
  }

  async borrow(marketAddress: string, amount: string): Promise<string> {
    const result = await this.client.execute(
      this.address,
      marketAddress,
      { borrow: { amount } },
      'auto'
    );
    return result.transactionHash;
  }

  async repay(
    marketAddress: string,
    amount: string,
    denom: string
  ): Promise<string> {
    const result = await this.client.execute(
      this.address,
      marketAddress,
      { repay: {} },
      'auto',
      '',
      [{ denom, amount }]
    );
    return result.transactionHash;
  }

  async liquidate(
    marketAddress: string,
    borrower: string,
    amount: string,
    denom: string
  ): Promise<string> {
    const result = await this.client.execute(
      this.address,
      marketAddress,
      { liquidate: { borrower } },
      'auto',
      '',
      [{ denom, amount }]
    );
    return result.transactionHash;
  }

  async getBalance(denom: string): Promise<Coin> {
    return this.client.getBalance(this.address, denom);
  }

  async getAllBalances(): Promise<Coin[]> {
    return this.client.getAllBalances(this.address);
  }

  async queryContract<T>(contractAddress: string, query: object): Promise<T> {
    return this.client.queryContractSmart(contractAddress, query);
  }

  async getPosition(marketAddress: string): Promise<{
    collateral_amount: string;
    supply_amount: string;
    debt_amount: string;
    health_factor: string;
  }> {
    return this.queryContract(marketAddress, {
      position: { user: this.address },
    });
  }

  async getMarketState(marketAddress: string): Promise<{
    total_supply: string;
    total_debt: string;
    total_collateral: string;
    utilization_rate: string;
    supply_rate: string;
    borrow_rate: string;
  }> {
    return this.queryContract(marketAddress, { market_state: {} });
  }
}
