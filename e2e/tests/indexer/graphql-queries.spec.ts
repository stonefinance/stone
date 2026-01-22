import { test, expect } from '@playwright/test';
import { GraphQLClient, gql } from 'graphql-request';

const GRAPHQL_ENDPOINT = 'http://localhost:4000/graphql';

test.describe('GraphQL API @integration', () => {
  let client: GraphQLClient;

  test.beforeAll(() => {
    client = new GraphQLClient(GRAPHQL_ENDPOINT);
  });

  test('fetches all markets', async () => {
    const query = gql`
      query {
        markets {
          id
          address
          collateralDenom
          debtDenom
          ltv
          liquidationThreshold
          totalSupply
          totalDebt
        }
      }
    `;

    const data = await client.request<{ markets: unknown[] }>(query);
    expect(data.markets).toBeInstanceOf(Array);
    expect(data.markets.length).toBeGreaterThanOrEqual(2);
  });

  test('fetches single market by ID', async () => {
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
        }
      }
    `;

    const data = await client.request<{ market: { id: string; collateralDenom: string } | null }>(
      query,
      { id: '1' }
    );
    expect(data.market).toBeDefined();
    expect(data.market?.collateralDenom).toBe('uatom');
  });

  test('fetches market with transactions', async () => {
    const query = gql`
      query GetMarketWithTransactions($id: ID!) {
        market(id: $id) {
          id
          collateralDenom
          debtDenom
          transactions(limit: 10) {
            id
            txHash
            action
            amount
          }
        }
      }
    `;

    const data = await client.request<{
      market: {
        id: string;
        transactions: unknown[];
      } | null;
    }>(query, { id: '1' });

    expect(data.market).toBeDefined();
    expect(data.market?.transactions).toBeInstanceOf(Array);
  });

  test('fetches user positions', async () => {
    const query = gql`
      query GetUserPositions($userAddress: String!) {
        userPositions(userAddress: $userAddress) {
          id
          marketId
          supplyBalance
          debtBalance
          collateralBalance
        }
      }
    `;

    // Use test user address
    const testAddress = 'wasm18vd8fpwxzck93qlwghaj6arh4p7c5n89uzcee5';
    const data = await client.request<{ userPositions: unknown[] }>(query, { userAddress: testAddress });
    expect(data.userPositions).toBeInstanceOf(Array);
  });

  test('fetches transactions with filters', async () => {
    const query = gql`
      query GetTransactions($action: String, $limit: Int) {
        transactions(action: $action, limit: $limit) {
          id
          txHash
          blockHeight
          timestamp
          action
          userAddress
          amount
          denom
        }
      }
    `;

    const data = await client.request<{ transactions: unknown[] }>(query, {
      limit: 10,
    });

    expect(data.transactions).toBeInstanceOf(Array);
  });

  test('returns null for non-existent market', async () => {
    const query = gql`
      query GetMarket($id: ID!) {
        market(id: $id) {
          id
          address
        }
      }
    `;

    const data = await client.request<{ market: unknown | null }>(query, { id: '99999' });
    expect(data.market).toBeNull();
  });

  test('validates market data types', async () => {
    const query = gql`
      query {
        markets {
          id
          address
          ltv
          liquidationThreshold
          liquidationBonus
          totalSupply
          totalDebt
          utilizationRate
          supplyRate
          borrowRate
        }
      }
    `;

    const data = await client.request<{
      markets: Array<{
        id: string;
        address: string;
        ltv: string;
        liquidationThreshold: string;
        liquidationBonus: string;
        totalSupply: string;
        totalDebt: string;
        utilizationRate: string;
        supplyRate: string;
        borrowRate: string;
      }>;
    }>(query);

    const market = data.markets[0];

    // Validate address format
    expect(market.address).toMatch(/^wasm1[a-z0-9]+$/);

    // Validate numeric strings
    expect(() => BigInt(market.totalSupply)).not.toThrow();
    expect(() => BigInt(market.totalDebt)).not.toThrow();
  });
});
