import { GraphQLClient, gql } from 'graphql-request';

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT || 'http://localhost:4000/graphql';

export interface Market {
  id: string;
  address: string;
  collateralDenom: string;
  debtDenom: string;
  ltv: string;
  liquidationThreshold: string;
  liquidationBonus: string;
  totalSupply: string;
  totalDebt: string;
  totalCollateral: string;
  utilizationRate: string;
  supplyRate: string;
  borrowRate: string;
}

export interface UserPosition {
  id: string;
  userAddress: string;
  marketId: string;
  supplyBalance: string;
  debtBalance: string;
  collateralBalance: string;
  healthFactor: string;
}

export interface Transaction {
  id: string;
  txHash: string;
  blockHeight: number;
  timestamp: string;
  action: string;
  userAddress: string;
  marketId: string;
  amount: string;
  denom: string;
}

export class GraphQLTestClient {
  private client: GraphQLClient;

  constructor(endpoint: string = GRAPHQL_ENDPOINT) {
    this.client = new GraphQLClient(endpoint);
  }

  async getMarkets(): Promise<Market[]> {
    const query = gql`
      query {
        markets {
          id
          address
          collateralDenom
          debtDenom
          ltv
          liquidationThreshold
          liquidationBonus
          totalSupply
          totalDebt
          totalCollateral
          utilizationRate
          supplyRate
          borrowRate
        }
      }
    `;

    const data = await this.client.request<{ markets: Market[] }>(query);
    return data.markets;
  }

  async getMarket(id: string): Promise<Market | null> {
    const query = gql`
      query GetMarket($id: ID!) {
        market(id: $id) {
          id
          address
          collateralDenom
          debtDenom
          ltv
          liquidationThreshold
          liquidationBonus
          totalSupply
          totalDebt
          totalCollateral
          utilizationRate
          supplyRate
          borrowRate
        }
      }
    `;

    const data = await this.client.request<{ market: Market | null }>(query, { id });
    return data.market;
  }

  async getUserPositions(userAddress: string): Promise<UserPosition[]> {
    const query = gql`
      query GetUserPositions($userAddress: String!) {
        userPositions(userAddress: $userAddress) {
          id
          userAddress
          marketId
          supplyBalance
          debtBalance
          collateralBalance
          healthFactor
        }
      }
    `;

    const data = await this.client.request<{ userPositions: UserPosition[] }>(query, { userAddress });
    return data.userPositions;
  }

  async getTransactions(options?: {
    marketId?: string;
    userAddress?: string;
    action?: string;
    limit?: number;
  }): Promise<Transaction[]> {
    const query = gql`
      query GetTransactions(
        $marketId: String
        $userAddress: String
        $action: String
        $limit: Int
      ) {
        transactions(
          marketId: $marketId
          userAddress: $userAddress
          action: $action
          limit: $limit
        ) {
          id
          txHash
          blockHeight
          timestamp
          action
          userAddress
          marketId
          amount
          denom
        }
      }
    `;

    const data = await this.client.request<{ transactions: Transaction[] }>(query, options);
    return data.transactions;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(GRAPHQL_ENDPOINT.replace('/graphql', '/health'));
      return response.ok;
    } catch {
      return false;
    }
  }
}
