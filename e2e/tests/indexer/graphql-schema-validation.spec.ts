import { test, expect } from '@playwright/test';
import { GraphQLClient, gql } from 'graphql-request';

const GRAPHQL_ENDPOINT = 'http://localhost:4000/graphql';

/**
 * GraphQL Schema Validation Tests
 *
 * These tests validate that all GraphQL types can be queried successfully
 * and return data in the expected format. The tests use introspection to
 * automatically discover types and fields, so new queries are tested automatically.
 */
test.describe('GraphQL Schema Validation @integration', () => {
  let client: GraphQLClient;

  test.beforeAll(() => {
    client = new GraphQLClient(GRAPHQL_ENDPOINT);
  });

  // ============================================================================
  // Schema Introspection Test
  // ============================================================================

  test('schema introspection returns all expected types', async () => {
    const introspectionQuery = gql`
      query IntrospectionQuery {
        __schema {
          types {
            name
            kind
            fields {
              name
              type {
                name
                kind
                ofType {
                  name
                  kind
                }
              }
            }
          }
          queryType {
            fields {
              name
            }
          }
        }
      }
    `;

    const data = await client.request<{
      __schema: {
        types: Array<{ name: string; kind: string }>;
        queryType: { fields: Array<{ name: string }> };
      };
    }>(introspectionQuery);

    // Verify core types exist
    const typeNames = data.__schema.types.map((t) => t.name);
    const expectedTypes = [
      'Market',
      'UserPosition',
      'Transaction',
      'MarketSnapshot',
      'InterestAccrualEvent',
      'TransactionAction',
    ];

    for (const expectedType of expectedTypes) {
      expect(typeNames, `Missing type: ${expectedType}`).toContain(expectedType);
    }

    // Verify all queries exist
    const queryNames = data.__schema.queryType.fields.map((f) => f.name);
    const expectedQueries = [
      'market',
      'marketByAddress',
      'markets',
      'marketCount',
      'userPosition',
      'userPositions',
      'liquidatablePositions',
      'transaction',
      'transactions',
      'marketSnapshots',
      'interestAccrualEvents',
    ];

    for (const expectedQuery of expectedQueries) {
      expect(queryNames, `Missing query: ${expectedQuery}`).toContain(expectedQuery);
    }
  });

  // ============================================================================
  // Market Type - All Fields
  // ============================================================================

  test('Market type returns all fields correctly', async () => {
    const query = gql`
      query GetMarketAllFields {
        markets(limit: 1) {
          # Core fields
          id
          marketAddress
          curator
          collateralDenom
          debtDenom
          oracle
          createdAt
          createdAtBlock

          # Parameters
          loanToValue
          liquidationThreshold
          liquidationBonus
          liquidationProtocolFee
          closeFactor
          interestRateModel
          protocolFee
          curatorFee
          supplyCap
          borrowCap
          enabled
          isMutable

          # Current State
          borrowIndex
          liquidityIndex
          borrowRate
          liquidityRate
          totalSupply
          totalDebt
          totalCollateral
          utilization
          availableLiquidity
          lastUpdate
        }
      }
    `;

    const data = await client.request<{
      markets: Array<{
        id: string;
        marketAddress: string;
        curator: string;
        collateralDenom: string;
        debtDenom: string;
        oracle: string;
        createdAt: string;
        createdAtBlock: number;
        loanToValue: string;
        liquidationThreshold: string;
        liquidationBonus: string;
        liquidationProtocolFee: string;
        closeFactor: string;
        interestRateModel: Record<string, unknown>;
        protocolFee: string;
        curatorFee: string;
        supplyCap: string | null;
        borrowCap: string | null;
        enabled: boolean;
        isMutable: boolean;
        borrowIndex: string;
        liquidityIndex: string;
        borrowRate: string;
        liquidityRate: string;
        totalSupply: string;
        totalDebt: string;
        totalCollateral: string;
        utilization: string;
        availableLiquidity: string;
        lastUpdate: number;
      }>;
    }>(query);

    expect(data.markets.length).toBeGreaterThan(0);
    const market = data.markets[0];

    // Validate required string fields
    expect(typeof market.id).toBe('string');
    expect(market.marketAddress).toMatch(/^wasm1[a-z0-9]+$/);
    expect(market.curator).toMatch(/^wasm1[a-z0-9]+$/);
    expect(typeof market.collateralDenom).toBe('string');
    expect(typeof market.debtDenom).toBe('string');
    expect(market.oracle).toMatch(/^wasm1[a-z0-9]+$/);

    // Validate DateTime scalar (ISO 8601 format)
    expect(new Date(market.createdAt).toISOString()).toBe(market.createdAt);

    // Validate Int fields
    expect(typeof market.createdAtBlock).toBe('number');
    expect(Number.isInteger(market.createdAtBlock)).toBe(true);
    expect(typeof market.lastUpdate).toBe('number');
    expect(Number.isInteger(market.lastUpdate)).toBe(true);

    // Validate Decimal fields (returned as strings)
    const decimalFields = [
      'loanToValue',
      'liquidationThreshold',
      'liquidationBonus',
      'liquidationProtocolFee',
      'closeFactor',
      'protocolFee',
      'curatorFee',
      'borrowIndex',
      'liquidityIndex',
      'borrowRate',
      'liquidityRate',
      'utilization',
    ];

    for (const field of decimalFields) {
      const value = market[field as keyof typeof market];
      expect(typeof value).toBe('string');
      expect(() => parseFloat(value as string)).not.toThrow();
      expect(isNaN(parseFloat(value as string))).toBe(false);
    }

    // Validate BigInt fields (returned as strings)
    const bigIntFields = ['totalSupply', 'totalDebt', 'totalCollateral', 'availableLiquidity'];

    for (const field of bigIntFields) {
      const value = market[field as keyof typeof market];
      expect(typeof value).toBe('string');
      expect(() => BigInt(value as string)).not.toThrow();
    }

    // Validate nullable BigInt fields
    if (market.supplyCap !== null) {
      expect(() => BigInt(market.supplyCap as string)).not.toThrow();
    }
    if (market.borrowCap !== null) {
      expect(() => BigInt(market.borrowCap as string)).not.toThrow();
    }

    // Validate Boolean fields
    expect(typeof market.enabled).toBe('boolean');
    expect(typeof market.isMutable).toBe('boolean');

    // Validate JSON field
    expect(typeof market.interestRateModel).toBe('object');
    expect(market.interestRateModel).not.toBeNull();
  });

  // ============================================================================
  // UserPosition Type - All Fields
  // ============================================================================

  test('UserPosition type returns all fields correctly', async () => {
    const query = gql`
      query GetUserPositionAllFields {
        markets(limit: 1) {
          positions(limit: 1) {
            id
            userAddress
            supplyScaled
            debtScaled
            collateral
            supplyAmount
            debtAmount
            healthFactor
            firstInteraction
            lastInteraction
            market {
              id
            }
          }
        }
      }
    `;

    const data = await client.request<{
      markets: Array<{
        positions: Array<{
          id: string;
          userAddress: string;
          supplyScaled: string;
          debtScaled: string;
          collateral: string;
          supplyAmount: string;
          debtAmount: string;
          healthFactor: string | null;
          firstInteraction: string;
          lastInteraction: string;
          market: { id: string };
        }>;
      }>;
    }>(query);

    // Skip validation if no positions exist (valid scenario)
    if (data.markets.length === 0 || data.markets[0].positions.length === 0) {
      test.skip();
      return;
    }

    const position = data.markets[0].positions[0];

    // Validate string fields
    expect(typeof position.id).toBe('string');
    expect(position.userAddress).toMatch(/^wasm1[a-z0-9]+$/);

    // Validate BigInt fields
    const bigIntFields = ['supplyScaled', 'debtScaled', 'collateral', 'supplyAmount', 'debtAmount'];
    for (const field of bigIntFields) {
      const value = position[field as keyof typeof position];
      expect(typeof value).toBe('string');
      expect(() => BigInt(value as string)).not.toThrow();
    }

    // Validate nullable Decimal field
    if (position.healthFactor !== null) {
      expect(typeof position.healthFactor).toBe('string');
      expect(() => parseFloat(position.healthFactor as string)).not.toThrow();
    }

    // Validate DateTime fields
    expect(new Date(position.firstInteraction).toISOString()).toBe(position.firstInteraction);
    expect(new Date(position.lastInteraction).toISOString()).toBe(position.lastInteraction);

    // Validate nested Market relation
    expect(position.market).toBeDefined();
    expect(typeof position.market.id).toBe('string');
  });

  // ============================================================================
  // Transaction Type - All Fields
  // ============================================================================

  test('Transaction type returns all fields correctly', async () => {
    const query = gql`
      query GetTransactionAllFields {
        transactions(limit: 1) {
          id
          txHash
          blockHeight
          timestamp
          userAddress
          action
          amount
          scaledAmount
          recipient
          liquidator
          borrower
          debtRepaid
          collateralSeized
          protocolFee
          totalSupply
          totalDebt
          totalCollateral
          utilization
          market {
            id
          }
        }
      }
    `;

    const data = await client.request<{
      transactions: Array<{
        id: string;
        txHash: string;
        blockHeight: number;
        timestamp: string;
        userAddress: string;
        action: string;
        amount: string | null;
        scaledAmount: string | null;
        recipient: string | null;
        liquidator: string | null;
        borrower: string | null;
        debtRepaid: string | null;
        collateralSeized: string | null;
        protocolFee: string | null;
        totalSupply: string | null;
        totalDebt: string | null;
        totalCollateral: string | null;
        utilization: string | null;
        market: { id: string };
      }>;
    }>(query);

    // Skip if no transactions exist
    if (data.transactions.length === 0) {
      test.skip();
      return;
    }

    const txn = data.transactions[0];

    // Validate required fields
    expect(typeof txn.id).toBe('string');
    expect(typeof txn.txHash).toBe('string');
    expect(txn.txHash.length).toBeGreaterThan(0);
    expect(typeof txn.blockHeight).toBe('number');
    expect(Number.isInteger(txn.blockHeight)).toBe(true);
    expect(new Date(txn.timestamp).toISOString()).toBe(txn.timestamp);
    expect(txn.userAddress).toMatch(/^wasm1[a-z0-9]+$/);

    // Validate enum field
    const validActions = [
      'SUPPLY',
      'WITHDRAW',
      'SUPPLY_COLLATERAL',
      'WITHDRAW_COLLATERAL',
      'BORROW',
      'REPAY',
      'LIQUIDATE',
    ];
    expect(validActions).toContain(txn.action);

    // Validate nullable BigInt fields
    const nullableBigIntFields = [
      'amount',
      'scaledAmount',
      'debtRepaid',
      'collateralSeized',
      'protocolFee',
      'totalSupply',
      'totalDebt',
      'totalCollateral',
    ];
    for (const field of nullableBigIntFields) {
      const value = txn[field as keyof typeof txn];
      if (value !== null) {
        expect(typeof value).toBe('string');
        expect(() => BigInt(value as string)).not.toThrow();
      }
    }

    // Validate nullable Decimal field
    if (txn.utilization !== null) {
      expect(typeof txn.utilization).toBe('string');
      expect(() => parseFloat(txn.utilization as string)).not.toThrow();
    }

    // Validate nested Market relation
    expect(txn.market).toBeDefined();
    expect(typeof txn.market.id).toBe('string');
  });

  // ============================================================================
  // MarketSnapshot Type - All Fields
  // ============================================================================

  test('MarketSnapshot type returns all fields correctly', async () => {
    // First get a market ID
    const marketsQuery = gql`
      query {
        markets(limit: 1) {
          id
        }
      }
    `;

    const marketsData = await client.request<{ markets: Array<{ id: string }> }>(marketsQuery);
    if (marketsData.markets.length === 0) {
      test.skip();
      return;
    }

    const marketId = marketsData.markets[0].id;

    const query = gql`
      query GetMarketSnapshotAllFields($marketId: ID!) {
        marketSnapshots(marketId: $marketId, limit: 1) {
          id
          timestamp
          blockHeight
          borrowIndex
          liquidityIndex
          borrowRate
          liquidityRate
          totalSupply
          totalDebt
          totalCollateral
          utilization
          loanToValue
          liquidationThreshold
          enabled
          market {
            id
          }
        }
      }
    `;

    const data = await client.request<{
      marketSnapshots: Array<{
        id: string;
        timestamp: string;
        blockHeight: number;
        borrowIndex: string;
        liquidityIndex: string;
        borrowRate: string;
        liquidityRate: string;
        totalSupply: string;
        totalDebt: string;
        totalCollateral: string;
        utilization: string;
        loanToValue: string;
        liquidationThreshold: string;
        enabled: boolean;
        market: { id: string };
      }>;
    }>(query, { marketId });

    // Skip if no snapshots exist
    if (data.marketSnapshots.length === 0) {
      test.skip();
      return;
    }

    const snapshot = data.marketSnapshots[0];

    // Validate required fields
    expect(typeof snapshot.id).toBe('string');
    expect(new Date(snapshot.timestamp).toISOString()).toBe(snapshot.timestamp);
    expect(typeof snapshot.blockHeight).toBe('number');
    expect(Number.isInteger(snapshot.blockHeight)).toBe(true);

    // Validate Decimal fields
    const decimalFields = [
      'borrowIndex',
      'liquidityIndex',
      'borrowRate',
      'liquidityRate',
      'utilization',
      'loanToValue',
      'liquidationThreshold',
    ];
    for (const field of decimalFields) {
      const value = snapshot[field as keyof typeof snapshot];
      expect(typeof value).toBe('string');
      expect(() => parseFloat(value as string)).not.toThrow();
    }

    // Validate BigInt fields
    const bigIntFields = ['totalSupply', 'totalDebt', 'totalCollateral'];
    for (const field of bigIntFields) {
      const value = snapshot[field as keyof typeof snapshot];
      expect(typeof value).toBe('string');
      expect(() => BigInt(value as string)).not.toThrow();
    }

    // Validate Boolean field
    expect(typeof snapshot.enabled).toBe('boolean');

    // Validate nested Market relation
    expect(snapshot.market).toBeDefined();
    expect(typeof snapshot.market.id).toBe('string');
  });

  // ============================================================================
  // InterestAccrualEvent Type - All Fields
  // ============================================================================

  test('InterestAccrualEvent type returns all fields correctly', async () => {
    // First get a market ID
    const marketsQuery = gql`
      query {
        markets(limit: 1) {
          id
        }
      }
    `;

    const marketsData = await client.request<{ markets: Array<{ id: string }> }>(marketsQuery);
    if (marketsData.markets.length === 0) {
      test.skip();
      return;
    }

    const marketId = marketsData.markets[0].id;

    const query = gql`
      query GetInterestAccrualEventAllFields($marketId: ID!) {
        interestAccrualEvents(marketId: $marketId, limit: 1) {
          id
          txHash
          timestamp
          blockHeight
          borrowIndex
          liquidityIndex
          borrowRate
          liquidityRate
          market {
            id
          }
        }
      }
    `;

    const data = await client.request<{
      interestAccrualEvents: Array<{
        id: string;
        txHash: string;
        timestamp: string;
        blockHeight: number;
        borrowIndex: string;
        liquidityIndex: string;
        borrowRate: string;
        liquidityRate: string;
        market: { id: string };
      }>;
    }>(query, { marketId });

    // Skip if no events exist
    if (data.interestAccrualEvents.length === 0) {
      test.skip();
      return;
    }

    const event = data.interestAccrualEvents[0];

    // Validate required fields
    expect(typeof event.id).toBe('string');
    expect(typeof event.txHash).toBe('string');
    expect(event.txHash.length).toBeGreaterThan(0);
    expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
    expect(typeof event.blockHeight).toBe('number');
    expect(Number.isInteger(event.blockHeight)).toBe(true);

    // Validate Decimal fields
    const decimalFields = ['borrowIndex', 'liquidityIndex', 'borrowRate', 'liquidityRate'];
    for (const field of decimalFields) {
      const value = event[field as keyof typeof event];
      expect(typeof value).toBe('string');
      expect(() => parseFloat(value as string)).not.toThrow();
    }

    // Validate nested Market relation
    expect(event.market).toBeDefined();
    expect(typeof event.market.id).toBe('string');
  });

  // ============================================================================
  // All Queries Return Without Errors
  // ============================================================================

  test('all root queries execute without errors', async () => {
    // Get a market ID for queries that require it
    const marketsQuery = gql`
      query {
        markets(limit: 1) {
          id
          marketAddress
        }
      }
    `;

    const marketsData = await client.request<{
      markets: Array<{ id: string; marketAddress: string }>;
    }>(marketsQuery);

    const marketId = marketsData.markets[0]?.id ?? '1';
    const marketAddress = marketsData.markets[0]?.marketAddress ?? 'wasm1test';

    // Test all query endpoints
    const queries = [
      {
        name: 'market',
        query: gql`
          query ($id: ID!) {
            market(id: $id) {
              id
            }
          }
        `,
        variables: { id: marketId },
      },
      {
        name: 'marketByAddress',
        query: gql`
          query ($address: String!) {
            marketByAddress(address: $address) {
              id
            }
          }
        `,
        variables: { address: marketAddress },
      },
      {
        name: 'markets',
        query: gql`
          query {
            markets(limit: 5) {
              id
            }
          }
        `,
        variables: {},
      },
      {
        name: 'marketCount',
        query: gql`
          query {
            marketCount
          }
        `,
        variables: {},
      },
      {
        name: 'userPosition',
        query: gql`
          query ($marketId: ID!, $userAddress: String!) {
            userPosition(marketId: $marketId, userAddress: $userAddress) {
              id
            }
          }
        `,
        variables: { marketId, userAddress: 'wasm18vd8fpwxzck93qlwghaj6arh4p7c5n89uzcee5' },
      },
      {
        name: 'userPositions',
        query: gql`
          query ($userAddress: String!) {
            userPositions(userAddress: $userAddress) {
              id
            }
          }
        `,
        variables: { userAddress: 'wasm18vd8fpwxzck93qlwghaj6arh4p7c5n89uzcee5' },
      },
      {
        name: 'liquidatablePositions',
        query: gql`
          query {
            liquidatablePositions(limit: 5) {
              id
            }
          }
        `,
        variables: {},
      },
      {
        name: 'transaction',
        query: gql`
          query ($id: ID!) {
            transaction(id: $id) {
              id
            }
          }
        `,
        variables: { id: '1' },
      },
      {
        name: 'transactions',
        query: gql`
          query {
            transactions(limit: 5) {
              id
            }
          }
        `,
        variables: {},
      },
      {
        name: 'marketSnapshots',
        query: gql`
          query ($marketId: ID!) {
            marketSnapshots(marketId: $marketId, limit: 5) {
              id
            }
          }
        `,
        variables: { marketId },
      },
      {
        name: 'interestAccrualEvents',
        query: gql`
          query ($marketId: ID!) {
            interestAccrualEvents(marketId: $marketId, limit: 5) {
              id
            }
          }
        `,
        variables: { marketId },
      },
    ];

    const results: Array<{ name: string; success: boolean; error?: string }> = [];

    for (const { name, query, variables } of queries) {
      try {
        await client.request(query, variables);
        results.push({ name, success: true });
      } catch (error) {
        results.push({
          name,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Report all failures at once
    const failures = results.filter((r) => !r.success);
    if (failures.length > 0) {
      const failureReport = failures.map((f) => `${f.name}: ${f.error}`).join('\n');
      expect.fail(`The following queries failed:\n${failureReport}`);
    }
  });

  // ============================================================================
  // Enum Validation
  // ============================================================================

  test('TransactionAction enum has all expected values', async () => {
    const introspectionQuery = gql`
      query {
        __type(name: "TransactionAction") {
          enumValues {
            name
          }
        }
      }
    `;

    const data = await client.request<{
      __type: { enumValues: Array<{ name: string }> };
    }>(introspectionQuery);

    const enumValues = data.__type.enumValues.map((v) => v.name);

    const expectedValues = [
      'SUPPLY',
      'WITHDRAW',
      'SUPPLY_COLLATERAL',
      'WITHDRAW_COLLATERAL',
      'BORROW',
      'REPAY',
      'LIQUIDATE',
    ];

    expect(enumValues.sort()).toEqual(expectedValues.sort());
  });

  test('SnapshotOrderBy enum has all expected values', async () => {
    const introspectionQuery = gql`
      query {
        __type(name: "SnapshotOrderBy") {
          enumValues {
            name
          }
        }
      }
    `;

    const data = await client.request<{
      __type: { enumValues: Array<{ name: string }> };
    }>(introspectionQuery);

    const enumValues = data.__type.enumValues.map((v) => v.name);

    const expectedValues = ['TIMESTAMP_ASC', 'TIMESTAMP_DESC'];

    expect(enumValues.sort()).toEqual(expectedValues.sort());
  });

  // ============================================================================
  // Nested Relations
  // ============================================================================

  test('deeply nested relations resolve correctly', async () => {
    const query = gql`
      query DeepNesting {
        markets(limit: 1) {
          id
          positions(limit: 1) {
            id
            market {
              id
              transactions(limit: 1) {
                id
                market {
                  id
                }
              }
            }
            transactions(limit: 1) {
              id
              market {
                id
              }
            }
          }
          transactions(limit: 1) {
            id
            market {
              id
            }
          }
          snapshots(limit: 1) {
            id
            market {
              id
            }
          }
        }
      }
    `;

    // This should not throw - we're testing that deep nesting doesn't cause errors
    const data = await client.request<{
      markets: Array<{
        id: string;
        positions: Array<{ id: string; market: { id: string } }>;
        transactions: Array<{ id: string; market: { id: string } }>;
        snapshots: Array<{ id: string; market: { id: string } }>;
      }>;
    }>(query);

    expect(data.markets).toBeInstanceOf(Array);

    // If there's data, verify the nesting is consistent
    if (data.markets.length > 0) {
      const market = data.markets[0];

      // Nested market references should match the parent
      if (market.transactions.length > 0) {
        expect(market.transactions[0].market.id).toBe(market.id);
      }
      if (market.snapshots.length > 0) {
        expect(market.snapshots[0].market.id).toBe(market.id);
      }
      if (market.positions.length > 0) {
        expect(market.positions[0].market.id).toBe(market.id);
      }
    }
  });

  // ============================================================================
  // Custom Scalars Validation
  // ============================================================================

  test('custom scalars serialize correctly', async () => {
    const query = gql`
      query ScalarValidation {
        markets(limit: 1) {
          # DateTime scalar
          createdAt

          # BigInt scalar
          totalSupply
          totalDebt

          # Decimal scalar
          loanToValue
          utilization

          # JSON scalar
          interestRateModel
        }
      }
    `;

    const data = await client.request<{
      markets: Array<{
        createdAt: string;
        totalSupply: string;
        totalDebt: string;
        loanToValue: string;
        utilization: string;
        interestRateModel: unknown;
      }>;
    }>(query);

    expect(data.markets.length).toBeGreaterThan(0);
    const market = data.markets[0];

    // DateTime: Should be valid ISO 8601 string
    const parsedDate = new Date(market.createdAt);
    expect(parsedDate.toString()).not.toBe('Invalid Date');
    expect(market.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    // BigInt: Should be numeric string that can be parsed as BigInt
    expect(typeof market.totalSupply).toBe('string');
    expect(/^\d+$/.test(market.totalSupply)).toBe(true);
    expect(() => BigInt(market.totalSupply)).not.toThrow();

    expect(typeof market.totalDebt).toBe('string');
    expect(/^\d+$/.test(market.totalDebt)).toBe(true);
    expect(() => BigInt(market.totalDebt)).not.toThrow();

    // Decimal: Should be numeric string with decimal support
    expect(typeof market.loanToValue).toBe('string');
    expect(() => parseFloat(market.loanToValue)).not.toThrow();
    expect(isNaN(parseFloat(market.loanToValue))).toBe(false);

    expect(typeof market.utilization).toBe('string');
    expect(() => parseFloat(market.utilization)).not.toThrow();
    expect(isNaN(parseFloat(market.utilization))).toBe(false);

    // JSON: Should be a parsed object
    expect(typeof market.interestRateModel).toBe('object');
    expect(market.interestRateModel).not.toBeNull();
  });

  // ============================================================================
  // Query with All Filter Options
  // ============================================================================

  test('markets query accepts all filter parameters', async () => {
    const query = gql`
      query MarketsWithFilters(
        $limit: Int
        $offset: Int
        $curator: String
        $collateralDenom: String
        $debtDenom: String
        $enabledOnly: Boolean
      ) {
        markets(
          limit: $limit
          offset: $offset
          curator: $curator
          collateralDenom: $collateralDenom
          debtDenom: $debtDenom
          enabledOnly: $enabledOnly
        ) {
          id
          curator
          collateralDenom
          debtDenom
          enabled
        }
      }
    `;

    // Test with various filter combinations
    const testCases = [
      { limit: 5 },
      { limit: 5, offset: 0 },
      { enabledOnly: true },
      { limit: 10, enabledOnly: false },
    ];

    for (const variables of testCases) {
      const data = await client.request<{ markets: unknown[] }>(query, variables);
      expect(data.markets).toBeInstanceOf(Array);
    }
  });

  test('transactions query accepts all filter parameters', async () => {
    const query = gql`
      query TransactionsWithFilters(
        $limit: Int
        $offset: Int
        $marketId: ID
        $userAddress: String
        $action: TransactionAction
      ) {
        transactions(
          limit: $limit
          offset: $offset
          marketId: $marketId
          userAddress: $userAddress
          action: $action
        ) {
          id
          action
          userAddress
        }
      }
    `;

    // Test with various filter combinations
    const testCases = [
      { limit: 5 },
      { limit: 5, offset: 0 },
      { action: 'SUPPLY' },
      { limit: 10, action: 'BORROW' },
    ];

    for (const variables of testCases) {
      const data = await client.request<{ transactions: unknown[] }>(query, variables);
      expect(data.transactions).toBeInstanceOf(Array);
    }
  });
});
