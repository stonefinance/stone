/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Generated file - type checking disabled due to Apollo Client 4.x compatibility issues
import { gql } from '@apollo/client/index.js';
import * as Apollo from '@apollo/client/index.js';
import * as ApolloReactHooks from '@apollo/client/react/index.js';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
const defaultOptions = {} as const;
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  BigInt: { input: string; output: string; }
  DateTime: { input: string; output: string; }
  Decimal: { input: string; output: string; }
  JSON: { input: Record<string, unknown>; output: Record<string, unknown>; }
};

export type InterestAccrualEvent = {
  __typename?: 'InterestAccrualEvent';
  blockHeight: Scalars['Int']['output'];
  borrowIndex: Scalars['Decimal']['output'];
  borrowRate: Scalars['Decimal']['output'];
  id: Scalars['ID']['output'];
  liquidityIndex: Scalars['Decimal']['output'];
  liquidityRate: Scalars['Decimal']['output'];
  market: Market;
  timestamp: Scalars['DateTime']['output'];
  txHash: Scalars['String']['output'];
};

export type Market = {
  __typename?: 'Market';
  availableLiquidity: Scalars['BigInt']['output'];
  borrowCap?: Maybe<Scalars['BigInt']['output']>;
  borrowIndex: Scalars['Decimal']['output'];
  borrowRate: Scalars['Decimal']['output'];
  closeFactor: Scalars['Decimal']['output'];
  collateralDenom: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  createdAtBlock: Scalars['Int']['output'];
  curator: Scalars['String']['output'];
  curatorFee: Scalars['Decimal']['output'];
  debtDenom: Scalars['String']['output'];
  enabled: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  interestRateModel: Scalars['JSON']['output'];
  isMutable: Scalars['Boolean']['output'];
  lastUpdate: Scalars['Int']['output'];
  liquidationBonus: Scalars['Decimal']['output'];
  liquidationProtocolFee: Scalars['Decimal']['output'];
  liquidationThreshold: Scalars['Decimal']['output'];
  liquidityIndex: Scalars['Decimal']['output'];
  liquidityRate: Scalars['Decimal']['output'];
  loanToValue: Scalars['Decimal']['output'];
  marketAddress: Scalars['String']['output'];
  oracle: Scalars['String']['output'];
  positions: Array<UserPosition>;
  protocolFee: Scalars['Decimal']['output'];
  snapshots: Array<MarketSnapshot>;
  supplyCap?: Maybe<Scalars['BigInt']['output']>;
  totalCollateral: Scalars['BigInt']['output'];
  totalDebt: Scalars['BigInt']['output'];
  totalSupply: Scalars['BigInt']['output'];
  transactions: Array<Transaction>;
  utilization: Scalars['Decimal']['output'];
};


export type MarketPositionsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type MarketSnapshotsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<SnapshotOrderBy>;
};


export type MarketTransactionsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};

export type MarketSnapshot = {
  __typename?: 'MarketSnapshot';
  blockHeight: Scalars['Int']['output'];
  borrowIndex: Scalars['Decimal']['output'];
  borrowRate: Scalars['Decimal']['output'];
  enabled: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  liquidationThreshold: Scalars['Decimal']['output'];
  liquidityIndex: Scalars['Decimal']['output'];
  liquidityRate: Scalars['Decimal']['output'];
  loanToValue: Scalars['Decimal']['output'];
  market: Market;
  timestamp: Scalars['DateTime']['output'];
  totalCollateral: Scalars['BigInt']['output'];
  totalDebt: Scalars['BigInt']['output'];
  totalSupply: Scalars['BigInt']['output'];
  utilization: Scalars['Decimal']['output'];
};

export type Query = {
  __typename?: 'Query';
  interestAccrualEvents: Array<InterestAccrualEvent>;
  liquidatablePositions: Array<UserPosition>;
  market?: Maybe<Market>;
  marketByAddress?: Maybe<Market>;
  marketCount: Scalars['Int']['output'];
  marketSnapshots: Array<MarketSnapshot>;
  markets: Array<Market>;
  transaction?: Maybe<Transaction>;
  transactions: Array<Transaction>;
  userPosition?: Maybe<UserPosition>;
  userPositions: Array<UserPosition>;
};


export type QueryInterestAccrualEventsArgs = {
  fromTime?: InputMaybe<Scalars['DateTime']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  marketId: Scalars['ID']['input'];
  toTime?: InputMaybe<Scalars['DateTime']['input']>;
};


export type QueryLiquidatablePositionsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryMarketArgs = {
  id: Scalars['ID']['input'];
};


export type QueryMarketByAddressArgs = {
  address: Scalars['String']['input'];
};


export type QueryMarketSnapshotsArgs = {
  fromTime?: InputMaybe<Scalars['DateTime']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  marketId: Scalars['ID']['input'];
  toTime?: InputMaybe<Scalars['DateTime']['input']>;
};


export type QueryMarketsArgs = {
  collateralDenom?: InputMaybe<Scalars['String']['input']>;
  curator?: InputMaybe<Scalars['String']['input']>;
  debtDenom?: InputMaybe<Scalars['String']['input']>;
  enabledOnly?: InputMaybe<Scalars['Boolean']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryTransactionArgs = {
  id: Scalars['ID']['input'];
};


export type QueryTransactionsArgs = {
  action?: InputMaybe<TransactionAction>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  marketId?: InputMaybe<Scalars['ID']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  userAddress?: InputMaybe<Scalars['String']['input']>;
};


export type QueryUserPositionArgs = {
  marketId: Scalars['ID']['input'];
  userAddress: Scalars['String']['input'];
};


export type QueryUserPositionsArgs = {
  hasDebt?: InputMaybe<Scalars['Boolean']['input']>;
  userAddress: Scalars['String']['input'];
};

export enum SnapshotOrderBy {
  TimestampAsc = 'TIMESTAMP_ASC',
  TimestampDesc = 'TIMESTAMP_DESC'
}

export type Subscription = {
  __typename?: 'Subscription';
  marketUpdated: Market;
  newTransaction: Transaction;
  positionUpdated: UserPosition;
};


export type SubscriptionMarketUpdatedArgs = {
  marketId: Scalars['ID']['input'];
};


export type SubscriptionNewTransactionArgs = {
  marketId?: InputMaybe<Scalars['ID']['input']>;
};


export type SubscriptionPositionUpdatedArgs = {
  userAddress: Scalars['String']['input'];
};

export type Transaction = {
  __typename?: 'Transaction';
  action: TransactionAction;
  amount?: Maybe<Scalars['BigInt']['output']>;
  blockHeight: Scalars['Int']['output'];
  borrower?: Maybe<Scalars['String']['output']>;
  collateralSeized?: Maybe<Scalars['BigInt']['output']>;
  debtRepaid?: Maybe<Scalars['BigInt']['output']>;
  id: Scalars['ID']['output'];
  liquidator?: Maybe<Scalars['String']['output']>;
  market: Market;
  protocolFee?: Maybe<Scalars['BigInt']['output']>;
  recipient?: Maybe<Scalars['String']['output']>;
  scaledAmount?: Maybe<Scalars['BigInt']['output']>;
  timestamp: Scalars['DateTime']['output'];
  totalCollateral?: Maybe<Scalars['BigInt']['output']>;
  totalDebt?: Maybe<Scalars['BigInt']['output']>;
  totalSupply?: Maybe<Scalars['BigInt']['output']>;
  txHash: Scalars['String']['output'];
  userAddress: Scalars['String']['output'];
  utilization?: Maybe<Scalars['Decimal']['output']>;
};

export enum TransactionAction {
  Borrow = 'BORROW',
  Liquidate = 'LIQUIDATE',
  Repay = 'REPAY',
  Supply = 'SUPPLY',
  SupplyCollateral = 'SUPPLY_COLLATERAL',
  Withdraw = 'WITHDRAW',
  WithdrawCollateral = 'WITHDRAW_COLLATERAL'
}

export type UserPosition = {
  __typename?: 'UserPosition';
  collateral: Scalars['BigInt']['output'];
  debtAmount: Scalars['BigInt']['output'];
  debtScaled: Scalars['BigInt']['output'];
  firstInteraction: Scalars['DateTime']['output'];
  healthFactor?: Maybe<Scalars['Decimal']['output']>;
  id: Scalars['ID']['output'];
  lastInteraction: Scalars['DateTime']['output'];
  market: Market;
  supplyAmount: Scalars['BigInt']['output'];
  supplyScaled: Scalars['BigInt']['output'];
  transactions: Array<Transaction>;
  userAddress: Scalars['String']['output'];
};


export type UserPositionTransactionsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};

export type MarketFieldsFragment = { __typename?: 'Market', id: string, marketAddress: string, curator: string, collateralDenom: string, debtDenom: string, oracle: string, createdAt: string, createdAtBlock: number, loanToValue: string, liquidationThreshold: string, liquidationBonus: string, liquidationProtocolFee: string, closeFactor: string, interestRateModel: Record<string, unknown>, protocolFee: string, curatorFee: string, supplyCap?: string | null, borrowCap?: string | null, enabled: boolean, isMutable: boolean, borrowIndex: string, liquidityIndex: string, borrowRate: string, liquidityRate: string, totalSupply: string, totalDebt: string, totalCollateral: string, utilization: string, availableLiquidity: string, lastUpdate: number };

export type MarketSummaryFieldsFragment = { __typename?: 'Market', id: string, marketAddress: string, collateralDenom: string, debtDenom: string, curator: string, loanToValue: string, liquidationThreshold: string, borrowRate: string, liquidityRate: string, totalSupply: string, totalDebt: string, totalCollateral: string, utilization: string, availableLiquidity: string, enabled: boolean };

export type PositionFieldsFragment = { __typename?: 'UserPosition', id: string, userAddress: string, supplyScaled: string, debtScaled: string, collateral: string, supplyAmount: string, debtAmount: string, healthFactor?: string | null, firstInteraction: string, lastInteraction: string, market: { __typename?: 'Market', id: string, marketAddress: string, collateralDenom: string, debtDenom: string, loanToValue: string, liquidationThreshold: string, liquidityIndex: string, borrowIndex: string } };

export type TransactionFieldsFragment = { __typename?: 'Transaction', id: string, txHash: string, blockHeight: number, timestamp: string, userAddress: string, action: TransactionAction, amount?: string | null, scaledAmount?: string | null, recipient?: string | null, liquidator?: string | null, borrower?: string | null, debtRepaid?: string | null, collateralSeized?: string | null, protocolFee?: string | null, totalSupply?: string | null, totalDebt?: string | null, totalCollateral?: string | null, utilization?: string | null, market: { __typename?: 'Market', id: string, marketAddress: string, collateralDenom: string, debtDenom: string } };

export type GetMarketsQueryVariables = Exact<{
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  curator?: InputMaybe<Scalars['String']['input']>;
  collateralDenom?: InputMaybe<Scalars['String']['input']>;
  debtDenom?: InputMaybe<Scalars['String']['input']>;
  enabledOnly?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type GetMarketsQuery = { __typename?: 'Query', markets: Array<{ __typename?: 'Market', id: string, marketAddress: string, collateralDenom: string, debtDenom: string, curator: string, loanToValue: string, liquidationThreshold: string, borrowRate: string, liquidityRate: string, totalSupply: string, totalDebt: string, totalCollateral: string, utilization: string, availableLiquidity: string, enabled: boolean }> };

export type GetMarketQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type GetMarketQuery = { __typename?: 'Query', market?: { __typename?: 'Market', id: string, marketAddress: string, curator: string, collateralDenom: string, debtDenom: string, oracle: string, createdAt: string, createdAtBlock: number, loanToValue: string, liquidationThreshold: string, liquidationBonus: string, liquidationProtocolFee: string, closeFactor: string, interestRateModel: Record<string, unknown>, protocolFee: string, curatorFee: string, supplyCap?: string | null, borrowCap?: string | null, enabled: boolean, isMutable: boolean, borrowIndex: string, liquidityIndex: string, borrowRate: string, liquidityRate: string, totalSupply: string, totalDebt: string, totalCollateral: string, utilization: string, availableLiquidity: string, lastUpdate: number } | null };

export type GetMarketByAddressQueryVariables = Exact<{
  address: Scalars['String']['input'];
}>;


export type GetMarketByAddressQuery = { __typename?: 'Query', marketByAddress?: { __typename?: 'Market', id: string, marketAddress: string, curator: string, collateralDenom: string, debtDenom: string, oracle: string, createdAt: string, createdAtBlock: number, loanToValue: string, liquidationThreshold: string, liquidationBonus: string, liquidationProtocolFee: string, closeFactor: string, interestRateModel: Record<string, unknown>, protocolFee: string, curatorFee: string, supplyCap?: string | null, borrowCap?: string | null, enabled: boolean, isMutable: boolean, borrowIndex: string, liquidityIndex: string, borrowRate: string, liquidityRate: string, totalSupply: string, totalDebt: string, totalCollateral: string, utilization: string, availableLiquidity: string, lastUpdate: number } | null };

export type GetMarketCountQueryVariables = Exact<{ [key: string]: never; }>;


export type GetMarketCountQuery = { __typename?: 'Query', marketCount: number };

export type GetUserPositionQueryVariables = Exact<{
  marketId: Scalars['ID']['input'];
  userAddress: Scalars['String']['input'];
}>;


export type GetUserPositionQuery = { __typename?: 'Query', userPosition?: { __typename?: 'UserPosition', id: string, userAddress: string, supplyScaled: string, debtScaled: string, collateral: string, supplyAmount: string, debtAmount: string, healthFactor?: string | null, firstInteraction: string, lastInteraction: string, market: { __typename?: 'Market', id: string, marketAddress: string, collateralDenom: string, debtDenom: string, loanToValue: string, liquidationThreshold: string, liquidityIndex: string, borrowIndex: string } } | null };

export type GetUserPositionsQueryVariables = Exact<{
  userAddress: Scalars['String']['input'];
  hasDebt?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type GetUserPositionsQuery = { __typename?: 'Query', userPositions: Array<{ __typename?: 'UserPosition', id: string, userAddress: string, supplyScaled: string, debtScaled: string, collateral: string, supplyAmount: string, debtAmount: string, healthFactor?: string | null, firstInteraction: string, lastInteraction: string, market: { __typename?: 'Market', id: string, marketAddress: string, collateralDenom: string, debtDenom: string, loanToValue: string, liquidationThreshold: string, liquidityIndex: string, borrowIndex: string } }> };

export type GetLiquidatablePositionsQueryVariables = Exact<{
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
}>;


export type GetLiquidatablePositionsQuery = { __typename?: 'Query', liquidatablePositions: Array<{ __typename?: 'UserPosition', id: string, userAddress: string, supplyScaled: string, debtScaled: string, collateral: string, supplyAmount: string, debtAmount: string, healthFactor?: string | null, firstInteraction: string, lastInteraction: string, market: { __typename?: 'Market', id: string, marketAddress: string, collateralDenom: string, debtDenom: string, loanToValue: string, liquidationThreshold: string, liquidityIndex: string, borrowIndex: string } }> };

export type GetTransactionsQueryVariables = Exact<{
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  marketId?: InputMaybe<Scalars['ID']['input']>;
  userAddress?: InputMaybe<Scalars['String']['input']>;
  action?: InputMaybe<TransactionAction>;
}>;


export type GetTransactionsQuery = { __typename?: 'Query', transactions: Array<{ __typename?: 'Transaction', id: string, txHash: string, blockHeight: number, timestamp: string, userAddress: string, action: TransactionAction, amount?: string | null, scaledAmount?: string | null, recipient?: string | null, liquidator?: string | null, borrower?: string | null, debtRepaid?: string | null, collateralSeized?: string | null, protocolFee?: string | null, totalSupply?: string | null, totalDebt?: string | null, totalCollateral?: string | null, utilization?: string | null, market: { __typename?: 'Market', id: string, marketAddress: string, collateralDenom: string, debtDenom: string } }> };

export type GetTransactionQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type GetTransactionQuery = { __typename?: 'Query', transaction?: { __typename?: 'Transaction', id: string, txHash: string, blockHeight: number, timestamp: string, userAddress: string, action: TransactionAction, amount?: string | null, scaledAmount?: string | null, recipient?: string | null, liquidator?: string | null, borrower?: string | null, debtRepaid?: string | null, collateralSeized?: string | null, protocolFee?: string | null, totalSupply?: string | null, totalDebt?: string | null, totalCollateral?: string | null, utilization?: string | null, market: { __typename?: 'Market', id: string, marketAddress: string, collateralDenom: string, debtDenom: string } } | null };

export type GetMarketSnapshotsQueryVariables = Exact<{
  marketId: Scalars['ID']['input'];
  fromTime?: InputMaybe<Scalars['DateTime']['input']>;
  toTime?: InputMaybe<Scalars['DateTime']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;


export type GetMarketSnapshotsQuery = { __typename?: 'Query', marketSnapshots: Array<{ __typename?: 'MarketSnapshot', id: string, timestamp: string, blockHeight: number, borrowIndex: string, liquidityIndex: string, borrowRate: string, liquidityRate: string, totalSupply: string, totalDebt: string, totalCollateral: string, utilization: string, loanToValue: string, liquidationThreshold: string, enabled: boolean }> };

export type GetInterestAccrualEventsQueryVariables = Exact<{
  marketId: Scalars['ID']['input'];
  fromTime?: InputMaybe<Scalars['DateTime']['input']>;
  toTime?: InputMaybe<Scalars['DateTime']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;


export type GetInterestAccrualEventsQuery = { __typename?: 'Query', interestAccrualEvents: Array<{ __typename?: 'InterestAccrualEvent', id: string, txHash: string, timestamp: string, blockHeight: number, borrowIndex: string, liquidityIndex: string, borrowRate: string, liquidityRate: string }> };

export type OnMarketUpdatedSubscriptionVariables = Exact<{
  marketId: Scalars['ID']['input'];
}>;


export type OnMarketUpdatedSubscription = { __typename?: 'Subscription', marketUpdated: { __typename?: 'Market', id: string, marketAddress: string, curator: string, collateralDenom: string, debtDenom: string, oracle: string, createdAt: string, createdAtBlock: number, loanToValue: string, liquidationThreshold: string, liquidationBonus: string, liquidationProtocolFee: string, closeFactor: string, interestRateModel: Record<string, unknown>, protocolFee: string, curatorFee: string, supplyCap?: string | null, borrowCap?: string | null, enabled: boolean, isMutable: boolean, borrowIndex: string, liquidityIndex: string, borrowRate: string, liquidityRate: string, totalSupply: string, totalDebt: string, totalCollateral: string, utilization: string, availableLiquidity: string, lastUpdate: number } };

export type OnNewTransactionSubscriptionVariables = Exact<{
  marketId?: InputMaybe<Scalars['ID']['input']>;
}>;


export type OnNewTransactionSubscription = { __typename?: 'Subscription', newTransaction: { __typename?: 'Transaction', id: string, txHash: string, blockHeight: number, timestamp: string, userAddress: string, action: TransactionAction, amount?: string | null, scaledAmount?: string | null, recipient?: string | null, liquidator?: string | null, borrower?: string | null, debtRepaid?: string | null, collateralSeized?: string | null, protocolFee?: string | null, totalSupply?: string | null, totalDebt?: string | null, totalCollateral?: string | null, utilization?: string | null, market: { __typename?: 'Market', id: string, marketAddress: string, collateralDenom: string, debtDenom: string } } };

export type OnPositionUpdatedSubscriptionVariables = Exact<{
  userAddress: Scalars['String']['input'];
}>;


export type OnPositionUpdatedSubscription = { __typename?: 'Subscription', positionUpdated: { __typename?: 'UserPosition', id: string, userAddress: string, supplyScaled: string, debtScaled: string, collateral: string, supplyAmount: string, debtAmount: string, healthFactor?: string | null, firstInteraction: string, lastInteraction: string, market: { __typename?: 'Market', id: string, marketAddress: string, collateralDenom: string, debtDenom: string, loanToValue: string, liquidationThreshold: string, liquidityIndex: string, borrowIndex: string } } };

export const MarketFieldsFragmentDoc = gql`
    fragment MarketFields on Market {
  id
  marketAddress
  curator
  collateralDenom
  debtDenom
  oracle
  createdAt
  createdAtBlock
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
    `;
export const MarketSummaryFieldsFragmentDoc = gql`
    fragment MarketSummaryFields on Market {
  id
  marketAddress
  collateralDenom
  debtDenom
  curator
  loanToValue
  liquidationThreshold
  borrowRate
  liquidityRate
  totalSupply
  totalDebt
  totalCollateral
  utilization
  availableLiquidity
  enabled
}
    `;
export const PositionFieldsFragmentDoc = gql`
    fragment PositionFields on UserPosition {
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
    marketAddress
    collateralDenom
    debtDenom
    loanToValue
    liquidationThreshold
    liquidityIndex
    borrowIndex
  }
}
    `;
export const TransactionFieldsFragmentDoc = gql`
    fragment TransactionFields on Transaction {
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
    marketAddress
    collateralDenom
    debtDenom
  }
}
    `;
export const GetMarketsDocument = gql`
    query GetMarkets($limit: Int, $offset: Int, $curator: String, $collateralDenom: String, $debtDenom: String, $enabledOnly: Boolean) {
  markets(
    limit: $limit
    offset: $offset
    curator: $curator
    collateralDenom: $collateralDenom
    debtDenom: $debtDenom
    enabledOnly: $enabledOnly
  ) {
    ...MarketSummaryFields
  }
}
    ${MarketSummaryFieldsFragmentDoc}`;

/**
 * __useGetMarketsQuery__
 *
 * To run a query within a React component, call `useGetMarketsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetMarketsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetMarketsQuery({
 *   variables: {
 *      limit: // value for 'limit'
 *      offset: // value for 'offset'
 *      curator: // value for 'curator'
 *      collateralDenom: // value for 'collateralDenom'
 *      debtDenom: // value for 'debtDenom'
 *      enabledOnly: // value for 'enabledOnly'
 *   },
 * });
 */
export function useGetMarketsQuery(baseOptions?: ApolloReactHooks.QueryHookOptions<GetMarketsQuery, GetMarketsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return ApolloReactHooks.useQuery<GetMarketsQuery, GetMarketsQueryVariables>(GetMarketsDocument, options);
      }
export function useGetMarketsLazyQuery(baseOptions?: ApolloReactHooks.LazyQueryHookOptions<GetMarketsQuery, GetMarketsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return ApolloReactHooks.useLazyQuery<GetMarketsQuery, GetMarketsQueryVariables>(GetMarketsDocument, options);
        }
// @ts-ignore
export function useGetMarketsSuspenseQuery(baseOptions?: ApolloReactHooks.SuspenseQueryHookOptions<GetMarketsQuery, GetMarketsQueryVariables>): ApolloReactHooks.UseSuspenseQueryResult<GetMarketsQuery, GetMarketsQueryVariables>;
export function useGetMarketsSuspenseQuery(baseOptions?: ApolloReactHooks.SkipToken | ApolloReactHooks.SuspenseQueryHookOptions<GetMarketsQuery, GetMarketsQueryVariables>): ApolloReactHooks.UseSuspenseQueryResult<GetMarketsQuery | undefined, GetMarketsQueryVariables>;
export function useGetMarketsSuspenseQuery(baseOptions?: ApolloReactHooks.SkipToken | ApolloReactHooks.SuspenseQueryHookOptions<GetMarketsQuery, GetMarketsQueryVariables>) {
          const options = baseOptions === ApolloReactHooks.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return ApolloReactHooks.useSuspenseQuery<GetMarketsQuery, GetMarketsQueryVariables>(GetMarketsDocument, options);
        }
export type GetMarketsQueryHookResult = ReturnType<typeof useGetMarketsQuery>;
export type GetMarketsLazyQueryHookResult = ReturnType<typeof useGetMarketsLazyQuery>;
export type GetMarketsSuspenseQueryHookResult = ReturnType<typeof useGetMarketsSuspenseQuery>;
export type GetMarketsQueryResult = Apollo.QueryResult<GetMarketsQuery, GetMarketsQueryVariables>;
export const GetMarketDocument = gql`
    query GetMarket($id: ID!) {
  market(id: $id) {
    ...MarketFields
  }
}
    ${MarketFieldsFragmentDoc}`;

/**
 * __useGetMarketQuery__
 *
 * To run a query within a React component, call `useGetMarketQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetMarketQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetMarketQuery({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useGetMarketQuery(baseOptions: ApolloReactHooks.QueryHookOptions<GetMarketQuery, GetMarketQueryVariables> & ({ variables: GetMarketQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return ApolloReactHooks.useQuery<GetMarketQuery, GetMarketQueryVariables>(GetMarketDocument, options);
      }
export function useGetMarketLazyQuery(baseOptions?: ApolloReactHooks.LazyQueryHookOptions<GetMarketQuery, GetMarketQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return ApolloReactHooks.useLazyQuery<GetMarketQuery, GetMarketQueryVariables>(GetMarketDocument, options);
        }
// @ts-ignore
export function useGetMarketSuspenseQuery(baseOptions?: ApolloReactHooks.SuspenseQueryHookOptions<GetMarketQuery, GetMarketQueryVariables>): ApolloReactHooks.UseSuspenseQueryResult<GetMarketQuery, GetMarketQueryVariables>;
export function useGetMarketSuspenseQuery(baseOptions?: ApolloReactHooks.SkipToken | ApolloReactHooks.SuspenseQueryHookOptions<GetMarketQuery, GetMarketQueryVariables>): ApolloReactHooks.UseSuspenseQueryResult<GetMarketQuery | undefined, GetMarketQueryVariables>;
export function useGetMarketSuspenseQuery(baseOptions?: ApolloReactHooks.SkipToken | ApolloReactHooks.SuspenseQueryHookOptions<GetMarketQuery, GetMarketQueryVariables>) {
          const options = baseOptions === ApolloReactHooks.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return ApolloReactHooks.useSuspenseQuery<GetMarketQuery, GetMarketQueryVariables>(GetMarketDocument, options);
        }
export type GetMarketQueryHookResult = ReturnType<typeof useGetMarketQuery>;
export type GetMarketLazyQueryHookResult = ReturnType<typeof useGetMarketLazyQuery>;
export type GetMarketSuspenseQueryHookResult = ReturnType<typeof useGetMarketSuspenseQuery>;
export type GetMarketQueryResult = Apollo.QueryResult<GetMarketQuery, GetMarketQueryVariables>;
export const GetMarketByAddressDocument = gql`
    query GetMarketByAddress($address: String!) {
  marketByAddress(address: $address) {
    ...MarketFields
  }
}
    ${MarketFieldsFragmentDoc}`;

/**
 * __useGetMarketByAddressQuery__
 *
 * To run a query within a React component, call `useGetMarketByAddressQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetMarketByAddressQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetMarketByAddressQuery({
 *   variables: {
 *      address: // value for 'address'
 *   },
 * });
 */
export function useGetMarketByAddressQuery(baseOptions: ApolloReactHooks.QueryHookOptions<GetMarketByAddressQuery, GetMarketByAddressQueryVariables> & ({ variables: GetMarketByAddressQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return ApolloReactHooks.useQuery<GetMarketByAddressQuery, GetMarketByAddressQueryVariables>(GetMarketByAddressDocument, options);
      }
export function useGetMarketByAddressLazyQuery(baseOptions?: ApolloReactHooks.LazyQueryHookOptions<GetMarketByAddressQuery, GetMarketByAddressQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return ApolloReactHooks.useLazyQuery<GetMarketByAddressQuery, GetMarketByAddressQueryVariables>(GetMarketByAddressDocument, options);
        }
// @ts-ignore
export function useGetMarketByAddressSuspenseQuery(baseOptions?: ApolloReactHooks.SuspenseQueryHookOptions<GetMarketByAddressQuery, GetMarketByAddressQueryVariables>): ApolloReactHooks.UseSuspenseQueryResult<GetMarketByAddressQuery, GetMarketByAddressQueryVariables>;
export function useGetMarketByAddressSuspenseQuery(baseOptions?: ApolloReactHooks.SkipToken | ApolloReactHooks.SuspenseQueryHookOptions<GetMarketByAddressQuery, GetMarketByAddressQueryVariables>): ApolloReactHooks.UseSuspenseQueryResult<GetMarketByAddressQuery | undefined, GetMarketByAddressQueryVariables>;
export function useGetMarketByAddressSuspenseQuery(baseOptions?: ApolloReactHooks.SkipToken | ApolloReactHooks.SuspenseQueryHookOptions<GetMarketByAddressQuery, GetMarketByAddressQueryVariables>) {
          const options = baseOptions === ApolloReactHooks.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return ApolloReactHooks.useSuspenseQuery<GetMarketByAddressQuery, GetMarketByAddressQueryVariables>(GetMarketByAddressDocument, options);
        }
export type GetMarketByAddressQueryHookResult = ReturnType<typeof useGetMarketByAddressQuery>;
export type GetMarketByAddressLazyQueryHookResult = ReturnType<typeof useGetMarketByAddressLazyQuery>;
export type GetMarketByAddressSuspenseQueryHookResult = ReturnType<typeof useGetMarketByAddressSuspenseQuery>;
export type GetMarketByAddressQueryResult = Apollo.QueryResult<GetMarketByAddressQuery, GetMarketByAddressQueryVariables>;
export const GetMarketCountDocument = gql`
    query GetMarketCount {
  marketCount
}
    `;

/**
 * __useGetMarketCountQuery__
 *
 * To run a query within a React component, call `useGetMarketCountQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetMarketCountQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetMarketCountQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetMarketCountQuery(baseOptions?: ApolloReactHooks.QueryHookOptions<GetMarketCountQuery, GetMarketCountQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return ApolloReactHooks.useQuery<GetMarketCountQuery, GetMarketCountQueryVariables>(GetMarketCountDocument, options);
      }
export function useGetMarketCountLazyQuery(baseOptions?: ApolloReactHooks.LazyQueryHookOptions<GetMarketCountQuery, GetMarketCountQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return ApolloReactHooks.useLazyQuery<GetMarketCountQuery, GetMarketCountQueryVariables>(GetMarketCountDocument, options);
        }
// @ts-ignore
export function useGetMarketCountSuspenseQuery(baseOptions?: ApolloReactHooks.SuspenseQueryHookOptions<GetMarketCountQuery, GetMarketCountQueryVariables>): ApolloReactHooks.UseSuspenseQueryResult<GetMarketCountQuery, GetMarketCountQueryVariables>;
export function useGetMarketCountSuspenseQuery(baseOptions?: ApolloReactHooks.SkipToken | ApolloReactHooks.SuspenseQueryHookOptions<GetMarketCountQuery, GetMarketCountQueryVariables>): ApolloReactHooks.UseSuspenseQueryResult<GetMarketCountQuery | undefined, GetMarketCountQueryVariables>;
export function useGetMarketCountSuspenseQuery(baseOptions?: ApolloReactHooks.SkipToken | ApolloReactHooks.SuspenseQueryHookOptions<GetMarketCountQuery, GetMarketCountQueryVariables>) {
          const options = baseOptions === ApolloReactHooks.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return ApolloReactHooks.useSuspenseQuery<GetMarketCountQuery, GetMarketCountQueryVariables>(GetMarketCountDocument, options);
        }
export type GetMarketCountQueryHookResult = ReturnType<typeof useGetMarketCountQuery>;
export type GetMarketCountLazyQueryHookResult = ReturnType<typeof useGetMarketCountLazyQuery>;
export type GetMarketCountSuspenseQueryHookResult = ReturnType<typeof useGetMarketCountSuspenseQuery>;
export type GetMarketCountQueryResult = Apollo.QueryResult<GetMarketCountQuery, GetMarketCountQueryVariables>;
export const GetUserPositionDocument = gql`
    query GetUserPosition($marketId: ID!, $userAddress: String!) {
  userPosition(marketId: $marketId, userAddress: $userAddress) {
    ...PositionFields
  }
}
    ${PositionFieldsFragmentDoc}`;

/**
 * __useGetUserPositionQuery__
 *
 * To run a query within a React component, call `useGetUserPositionQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetUserPositionQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetUserPositionQuery({
 *   variables: {
 *      marketId: // value for 'marketId'
 *      userAddress: // value for 'userAddress'
 *   },
 * });
 */
export function useGetUserPositionQuery(baseOptions: ApolloReactHooks.QueryHookOptions<GetUserPositionQuery, GetUserPositionQueryVariables> & ({ variables: GetUserPositionQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return ApolloReactHooks.useQuery<GetUserPositionQuery, GetUserPositionQueryVariables>(GetUserPositionDocument, options);
      }
export function useGetUserPositionLazyQuery(baseOptions?: ApolloReactHooks.LazyQueryHookOptions<GetUserPositionQuery, GetUserPositionQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return ApolloReactHooks.useLazyQuery<GetUserPositionQuery, GetUserPositionQueryVariables>(GetUserPositionDocument, options);
        }
// @ts-ignore
export function useGetUserPositionSuspenseQuery(baseOptions?: ApolloReactHooks.SuspenseQueryHookOptions<GetUserPositionQuery, GetUserPositionQueryVariables>): ApolloReactHooks.UseSuspenseQueryResult<GetUserPositionQuery, GetUserPositionQueryVariables>;
export function useGetUserPositionSuspenseQuery(baseOptions?: ApolloReactHooks.SkipToken | ApolloReactHooks.SuspenseQueryHookOptions<GetUserPositionQuery, GetUserPositionQueryVariables>): ApolloReactHooks.UseSuspenseQueryResult<GetUserPositionQuery | undefined, GetUserPositionQueryVariables>;
export function useGetUserPositionSuspenseQuery(baseOptions?: ApolloReactHooks.SkipToken | ApolloReactHooks.SuspenseQueryHookOptions<GetUserPositionQuery, GetUserPositionQueryVariables>) {
          const options = baseOptions === ApolloReactHooks.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return ApolloReactHooks.useSuspenseQuery<GetUserPositionQuery, GetUserPositionQueryVariables>(GetUserPositionDocument, options);
        }
export type GetUserPositionQueryHookResult = ReturnType<typeof useGetUserPositionQuery>;
export type GetUserPositionLazyQueryHookResult = ReturnType<typeof useGetUserPositionLazyQuery>;
export type GetUserPositionSuspenseQueryHookResult = ReturnType<typeof useGetUserPositionSuspenseQuery>;
export type GetUserPositionQueryResult = Apollo.QueryResult<GetUserPositionQuery, GetUserPositionQueryVariables>;
export const GetUserPositionsDocument = gql`
    query GetUserPositions($userAddress: String!, $hasDebt: Boolean) {
  userPositions(userAddress: $userAddress, hasDebt: $hasDebt) {
    ...PositionFields
  }
}
    ${PositionFieldsFragmentDoc}`;

/**
 * __useGetUserPositionsQuery__
 *
 * To run a query within a React component, call `useGetUserPositionsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetUserPositionsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetUserPositionsQuery({
 *   variables: {
 *      userAddress: // value for 'userAddress'
 *      hasDebt: // value for 'hasDebt'
 *   },
 * });
 */
export function useGetUserPositionsQuery(baseOptions: ApolloReactHooks.QueryHookOptions<GetUserPositionsQuery, GetUserPositionsQueryVariables> & ({ variables: GetUserPositionsQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return ApolloReactHooks.useQuery<GetUserPositionsQuery, GetUserPositionsQueryVariables>(GetUserPositionsDocument, options);
      }
export function useGetUserPositionsLazyQuery(baseOptions?: ApolloReactHooks.LazyQueryHookOptions<GetUserPositionsQuery, GetUserPositionsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return ApolloReactHooks.useLazyQuery<GetUserPositionsQuery, GetUserPositionsQueryVariables>(GetUserPositionsDocument, options);
        }
// @ts-ignore
export function useGetUserPositionsSuspenseQuery(baseOptions?: ApolloReactHooks.SuspenseQueryHookOptions<GetUserPositionsQuery, GetUserPositionsQueryVariables>): ApolloReactHooks.UseSuspenseQueryResult<GetUserPositionsQuery, GetUserPositionsQueryVariables>;
export function useGetUserPositionsSuspenseQuery(baseOptions?: ApolloReactHooks.SkipToken | ApolloReactHooks.SuspenseQueryHookOptions<GetUserPositionsQuery, GetUserPositionsQueryVariables>): ApolloReactHooks.UseSuspenseQueryResult<GetUserPositionsQuery | undefined, GetUserPositionsQueryVariables>;
export function useGetUserPositionsSuspenseQuery(baseOptions?: ApolloReactHooks.SkipToken | ApolloReactHooks.SuspenseQueryHookOptions<GetUserPositionsQuery, GetUserPositionsQueryVariables>) {
          const options = baseOptions === ApolloReactHooks.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return ApolloReactHooks.useSuspenseQuery<GetUserPositionsQuery, GetUserPositionsQueryVariables>(GetUserPositionsDocument, options);
        }
export type GetUserPositionsQueryHookResult = ReturnType<typeof useGetUserPositionsQuery>;
export type GetUserPositionsLazyQueryHookResult = ReturnType<typeof useGetUserPositionsLazyQuery>;
export type GetUserPositionsSuspenseQueryHookResult = ReturnType<typeof useGetUserPositionsSuspenseQuery>;
export type GetUserPositionsQueryResult = Apollo.QueryResult<GetUserPositionsQuery, GetUserPositionsQueryVariables>;
export const GetLiquidatablePositionsDocument = gql`
    query GetLiquidatablePositions($limit: Int, $offset: Int) {
  liquidatablePositions(limit: $limit, offset: $offset) {
    ...PositionFields
  }
}
    ${PositionFieldsFragmentDoc}`;

/**
 * __useGetLiquidatablePositionsQuery__
 *
 * To run a query within a React component, call `useGetLiquidatablePositionsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetLiquidatablePositionsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetLiquidatablePositionsQuery({
 *   variables: {
 *      limit: // value for 'limit'
 *      offset: // value for 'offset'
 *   },
 * });
 */
export function useGetLiquidatablePositionsQuery(baseOptions?: ApolloReactHooks.QueryHookOptions<GetLiquidatablePositionsQuery, GetLiquidatablePositionsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return ApolloReactHooks.useQuery<GetLiquidatablePositionsQuery, GetLiquidatablePositionsQueryVariables>(GetLiquidatablePositionsDocument, options);
      }
export function useGetLiquidatablePositionsLazyQuery(baseOptions?: ApolloReactHooks.LazyQueryHookOptions<GetLiquidatablePositionsQuery, GetLiquidatablePositionsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return ApolloReactHooks.useLazyQuery<GetLiquidatablePositionsQuery, GetLiquidatablePositionsQueryVariables>(GetLiquidatablePositionsDocument, options);
        }
// @ts-ignore
export function useGetLiquidatablePositionsSuspenseQuery(baseOptions?: ApolloReactHooks.SuspenseQueryHookOptions<GetLiquidatablePositionsQuery, GetLiquidatablePositionsQueryVariables>): ApolloReactHooks.UseSuspenseQueryResult<GetLiquidatablePositionsQuery, GetLiquidatablePositionsQueryVariables>;
export function useGetLiquidatablePositionsSuspenseQuery(baseOptions?: ApolloReactHooks.SkipToken | ApolloReactHooks.SuspenseQueryHookOptions<GetLiquidatablePositionsQuery, GetLiquidatablePositionsQueryVariables>): ApolloReactHooks.UseSuspenseQueryResult<GetLiquidatablePositionsQuery | undefined, GetLiquidatablePositionsQueryVariables>;
export function useGetLiquidatablePositionsSuspenseQuery(baseOptions?: ApolloReactHooks.SkipToken | ApolloReactHooks.SuspenseQueryHookOptions<GetLiquidatablePositionsQuery, GetLiquidatablePositionsQueryVariables>) {
          const options = baseOptions === ApolloReactHooks.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return ApolloReactHooks.useSuspenseQuery<GetLiquidatablePositionsQuery, GetLiquidatablePositionsQueryVariables>(GetLiquidatablePositionsDocument, options);
        }
export type GetLiquidatablePositionsQueryHookResult = ReturnType<typeof useGetLiquidatablePositionsQuery>;
export type GetLiquidatablePositionsLazyQueryHookResult = ReturnType<typeof useGetLiquidatablePositionsLazyQuery>;
export type GetLiquidatablePositionsSuspenseQueryHookResult = ReturnType<typeof useGetLiquidatablePositionsSuspenseQuery>;
export type GetLiquidatablePositionsQueryResult = Apollo.QueryResult<GetLiquidatablePositionsQuery, GetLiquidatablePositionsQueryVariables>;
export const GetTransactionsDocument = gql`
    query GetTransactions($limit: Int, $offset: Int, $marketId: ID, $userAddress: String, $action: TransactionAction) {
  transactions(
    limit: $limit
    offset: $offset
    marketId: $marketId
    userAddress: $userAddress
    action: $action
  ) {
    ...TransactionFields
  }
}
    ${TransactionFieldsFragmentDoc}`;

/**
 * __useGetTransactionsQuery__
 *
 * To run a query within a React component, call `useGetTransactionsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetTransactionsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetTransactionsQuery({
 *   variables: {
 *      limit: // value for 'limit'
 *      offset: // value for 'offset'
 *      marketId: // value for 'marketId'
 *      userAddress: // value for 'userAddress'
 *      action: // value for 'action'
 *   },
 * });
 */
export function useGetTransactionsQuery(baseOptions?: ApolloReactHooks.QueryHookOptions<GetTransactionsQuery, GetTransactionsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return ApolloReactHooks.useQuery<GetTransactionsQuery, GetTransactionsQueryVariables>(GetTransactionsDocument, options);
      }
export function useGetTransactionsLazyQuery(baseOptions?: ApolloReactHooks.LazyQueryHookOptions<GetTransactionsQuery, GetTransactionsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return ApolloReactHooks.useLazyQuery<GetTransactionsQuery, GetTransactionsQueryVariables>(GetTransactionsDocument, options);
        }
// @ts-ignore
export function useGetTransactionsSuspenseQuery(baseOptions?: ApolloReactHooks.SuspenseQueryHookOptions<GetTransactionsQuery, GetTransactionsQueryVariables>): ApolloReactHooks.UseSuspenseQueryResult<GetTransactionsQuery, GetTransactionsQueryVariables>;
export function useGetTransactionsSuspenseQuery(baseOptions?: ApolloReactHooks.SkipToken | ApolloReactHooks.SuspenseQueryHookOptions<GetTransactionsQuery, GetTransactionsQueryVariables>): ApolloReactHooks.UseSuspenseQueryResult<GetTransactionsQuery | undefined, GetTransactionsQueryVariables>;
export function useGetTransactionsSuspenseQuery(baseOptions?: ApolloReactHooks.SkipToken | ApolloReactHooks.SuspenseQueryHookOptions<GetTransactionsQuery, GetTransactionsQueryVariables>) {
          const options = baseOptions === ApolloReactHooks.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return ApolloReactHooks.useSuspenseQuery<GetTransactionsQuery, GetTransactionsQueryVariables>(GetTransactionsDocument, options);
        }
export type GetTransactionsQueryHookResult = ReturnType<typeof useGetTransactionsQuery>;
export type GetTransactionsLazyQueryHookResult = ReturnType<typeof useGetTransactionsLazyQuery>;
export type GetTransactionsSuspenseQueryHookResult = ReturnType<typeof useGetTransactionsSuspenseQuery>;
export type GetTransactionsQueryResult = Apollo.QueryResult<GetTransactionsQuery, GetTransactionsQueryVariables>;
export const GetTransactionDocument = gql`
    query GetTransaction($id: ID!) {
  transaction(id: $id) {
    ...TransactionFields
  }
}
    ${TransactionFieldsFragmentDoc}`;

/**
 * __useGetTransactionQuery__
 *
 * To run a query within a React component, call `useGetTransactionQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetTransactionQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetTransactionQuery({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useGetTransactionQuery(baseOptions: ApolloReactHooks.QueryHookOptions<GetTransactionQuery, GetTransactionQueryVariables> & ({ variables: GetTransactionQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return ApolloReactHooks.useQuery<GetTransactionQuery, GetTransactionQueryVariables>(GetTransactionDocument, options);
      }
export function useGetTransactionLazyQuery(baseOptions?: ApolloReactHooks.LazyQueryHookOptions<GetTransactionQuery, GetTransactionQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return ApolloReactHooks.useLazyQuery<GetTransactionQuery, GetTransactionQueryVariables>(GetTransactionDocument, options);
        }
// @ts-ignore
export function useGetTransactionSuspenseQuery(baseOptions?: ApolloReactHooks.SuspenseQueryHookOptions<GetTransactionQuery, GetTransactionQueryVariables>): ApolloReactHooks.UseSuspenseQueryResult<GetTransactionQuery, GetTransactionQueryVariables>;
export function useGetTransactionSuspenseQuery(baseOptions?: ApolloReactHooks.SkipToken | ApolloReactHooks.SuspenseQueryHookOptions<GetTransactionQuery, GetTransactionQueryVariables>): ApolloReactHooks.UseSuspenseQueryResult<GetTransactionQuery | undefined, GetTransactionQueryVariables>;
export function useGetTransactionSuspenseQuery(baseOptions?: ApolloReactHooks.SkipToken | ApolloReactHooks.SuspenseQueryHookOptions<GetTransactionQuery, GetTransactionQueryVariables>) {
          const options = baseOptions === ApolloReactHooks.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return ApolloReactHooks.useSuspenseQuery<GetTransactionQuery, GetTransactionQueryVariables>(GetTransactionDocument, options);
        }
export type GetTransactionQueryHookResult = ReturnType<typeof useGetTransactionQuery>;
export type GetTransactionLazyQueryHookResult = ReturnType<typeof useGetTransactionLazyQuery>;
export type GetTransactionSuspenseQueryHookResult = ReturnType<typeof useGetTransactionSuspenseQuery>;
export type GetTransactionQueryResult = Apollo.QueryResult<GetTransactionQuery, GetTransactionQueryVariables>;
export const GetMarketSnapshotsDocument = gql`
    query GetMarketSnapshots($marketId: ID!, $fromTime: DateTime, $toTime: DateTime, $limit: Int) {
  marketSnapshots(
    marketId: $marketId
    fromTime: $fromTime
    toTime: $toTime
    limit: $limit
  ) {
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
  }
}
    `;

/**
 * __useGetMarketSnapshotsQuery__
 *
 * To run a query within a React component, call `useGetMarketSnapshotsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetMarketSnapshotsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetMarketSnapshotsQuery({
 *   variables: {
 *      marketId: // value for 'marketId'
 *      fromTime: // value for 'fromTime'
 *      toTime: // value for 'toTime'
 *      limit: // value for 'limit'
 *   },
 * });
 */
export function useGetMarketSnapshotsQuery(baseOptions: ApolloReactHooks.QueryHookOptions<GetMarketSnapshotsQuery, GetMarketSnapshotsQueryVariables> & ({ variables: GetMarketSnapshotsQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return ApolloReactHooks.useQuery<GetMarketSnapshotsQuery, GetMarketSnapshotsQueryVariables>(GetMarketSnapshotsDocument, options);
      }
export function useGetMarketSnapshotsLazyQuery(baseOptions?: ApolloReactHooks.LazyQueryHookOptions<GetMarketSnapshotsQuery, GetMarketSnapshotsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return ApolloReactHooks.useLazyQuery<GetMarketSnapshotsQuery, GetMarketSnapshotsQueryVariables>(GetMarketSnapshotsDocument, options);
        }
// @ts-ignore
export function useGetMarketSnapshotsSuspenseQuery(baseOptions?: ApolloReactHooks.SuspenseQueryHookOptions<GetMarketSnapshotsQuery, GetMarketSnapshotsQueryVariables>): ApolloReactHooks.UseSuspenseQueryResult<GetMarketSnapshotsQuery, GetMarketSnapshotsQueryVariables>;
export function useGetMarketSnapshotsSuspenseQuery(baseOptions?: ApolloReactHooks.SkipToken | ApolloReactHooks.SuspenseQueryHookOptions<GetMarketSnapshotsQuery, GetMarketSnapshotsQueryVariables>): ApolloReactHooks.UseSuspenseQueryResult<GetMarketSnapshotsQuery | undefined, GetMarketSnapshotsQueryVariables>;
export function useGetMarketSnapshotsSuspenseQuery(baseOptions?: ApolloReactHooks.SkipToken | ApolloReactHooks.SuspenseQueryHookOptions<GetMarketSnapshotsQuery, GetMarketSnapshotsQueryVariables>) {
          const options = baseOptions === ApolloReactHooks.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return ApolloReactHooks.useSuspenseQuery<GetMarketSnapshotsQuery, GetMarketSnapshotsQueryVariables>(GetMarketSnapshotsDocument, options);
        }
export type GetMarketSnapshotsQueryHookResult = ReturnType<typeof useGetMarketSnapshotsQuery>;
export type GetMarketSnapshotsLazyQueryHookResult = ReturnType<typeof useGetMarketSnapshotsLazyQuery>;
export type GetMarketSnapshotsSuspenseQueryHookResult = ReturnType<typeof useGetMarketSnapshotsSuspenseQuery>;
export type GetMarketSnapshotsQueryResult = Apollo.QueryResult<GetMarketSnapshotsQuery, GetMarketSnapshotsQueryVariables>;
export const GetInterestAccrualEventsDocument = gql`
    query GetInterestAccrualEvents($marketId: ID!, $fromTime: DateTime, $toTime: DateTime, $limit: Int) {
  interestAccrualEvents(
    marketId: $marketId
    fromTime: $fromTime
    toTime: $toTime
    limit: $limit
  ) {
    id
    txHash
    timestamp
    blockHeight
    borrowIndex
    liquidityIndex
    borrowRate
    liquidityRate
  }
}
    `;

/**
 * __useGetInterestAccrualEventsQuery__
 *
 * To run a query within a React component, call `useGetInterestAccrualEventsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetInterestAccrualEventsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetInterestAccrualEventsQuery({
 *   variables: {
 *      marketId: // value for 'marketId'
 *      fromTime: // value for 'fromTime'
 *      toTime: // value for 'toTime'
 *      limit: // value for 'limit'
 *   },
 * });
 */
export function useGetInterestAccrualEventsQuery(baseOptions: ApolloReactHooks.QueryHookOptions<GetInterestAccrualEventsQuery, GetInterestAccrualEventsQueryVariables> & ({ variables: GetInterestAccrualEventsQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return ApolloReactHooks.useQuery<GetInterestAccrualEventsQuery, GetInterestAccrualEventsQueryVariables>(GetInterestAccrualEventsDocument, options);
      }
export function useGetInterestAccrualEventsLazyQuery(baseOptions?: ApolloReactHooks.LazyQueryHookOptions<GetInterestAccrualEventsQuery, GetInterestAccrualEventsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return ApolloReactHooks.useLazyQuery<GetInterestAccrualEventsQuery, GetInterestAccrualEventsQueryVariables>(GetInterestAccrualEventsDocument, options);
        }
// @ts-ignore
export function useGetInterestAccrualEventsSuspenseQuery(baseOptions?: ApolloReactHooks.SuspenseQueryHookOptions<GetInterestAccrualEventsQuery, GetInterestAccrualEventsQueryVariables>): ApolloReactHooks.UseSuspenseQueryResult<GetInterestAccrualEventsQuery, GetInterestAccrualEventsQueryVariables>;
export function useGetInterestAccrualEventsSuspenseQuery(baseOptions?: ApolloReactHooks.SkipToken | ApolloReactHooks.SuspenseQueryHookOptions<GetInterestAccrualEventsQuery, GetInterestAccrualEventsQueryVariables>): ApolloReactHooks.UseSuspenseQueryResult<GetInterestAccrualEventsQuery | undefined, GetInterestAccrualEventsQueryVariables>;
export function useGetInterestAccrualEventsSuspenseQuery(baseOptions?: ApolloReactHooks.SkipToken | ApolloReactHooks.SuspenseQueryHookOptions<GetInterestAccrualEventsQuery, GetInterestAccrualEventsQueryVariables>) {
          const options = baseOptions === ApolloReactHooks.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return ApolloReactHooks.useSuspenseQuery<GetInterestAccrualEventsQuery, GetInterestAccrualEventsQueryVariables>(GetInterestAccrualEventsDocument, options);
        }
export type GetInterestAccrualEventsQueryHookResult = ReturnType<typeof useGetInterestAccrualEventsQuery>;
export type GetInterestAccrualEventsLazyQueryHookResult = ReturnType<typeof useGetInterestAccrualEventsLazyQuery>;
export type GetInterestAccrualEventsSuspenseQueryHookResult = ReturnType<typeof useGetInterestAccrualEventsSuspenseQuery>;
export type GetInterestAccrualEventsQueryResult = Apollo.QueryResult<GetInterestAccrualEventsQuery, GetInterestAccrualEventsQueryVariables>;
export const OnMarketUpdatedDocument = gql`
    subscription OnMarketUpdated($marketId: ID!) {
  marketUpdated(marketId: $marketId) {
    ...MarketFields
  }
}
    ${MarketFieldsFragmentDoc}`;

/**
 * __useOnMarketUpdatedSubscription__
 *
 * To run a query within a React component, call `useOnMarketUpdatedSubscription` and pass it any options that fit your needs.
 * When your component renders, `useOnMarketUpdatedSubscription` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the subscription, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useOnMarketUpdatedSubscription({
 *   variables: {
 *      marketId: // value for 'marketId'
 *   },
 * });
 */
export function useOnMarketUpdatedSubscription(baseOptions: ApolloReactHooks.SubscriptionHookOptions<OnMarketUpdatedSubscription, OnMarketUpdatedSubscriptionVariables> & ({ variables: OnMarketUpdatedSubscriptionVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return ApolloReactHooks.useSubscription<OnMarketUpdatedSubscription, OnMarketUpdatedSubscriptionVariables>(OnMarketUpdatedDocument, options);
      }
export type OnMarketUpdatedSubscriptionHookResult = ReturnType<typeof useOnMarketUpdatedSubscription>;
export type OnMarketUpdatedSubscriptionResult = Apollo.SubscriptionResult<OnMarketUpdatedSubscription>;
export const OnNewTransactionDocument = gql`
    subscription OnNewTransaction($marketId: ID) {
  newTransaction(marketId: $marketId) {
    ...TransactionFields
  }
}
    ${TransactionFieldsFragmentDoc}`;

/**
 * __useOnNewTransactionSubscription__
 *
 * To run a query within a React component, call `useOnNewTransactionSubscription` and pass it any options that fit your needs.
 * When your component renders, `useOnNewTransactionSubscription` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the subscription, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useOnNewTransactionSubscription({
 *   variables: {
 *      marketId: // value for 'marketId'
 *   },
 * });
 */
export function useOnNewTransactionSubscription(baseOptions?: ApolloReactHooks.SubscriptionHookOptions<OnNewTransactionSubscription, OnNewTransactionSubscriptionVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return ApolloReactHooks.useSubscription<OnNewTransactionSubscription, OnNewTransactionSubscriptionVariables>(OnNewTransactionDocument, options);
      }
export type OnNewTransactionSubscriptionHookResult = ReturnType<typeof useOnNewTransactionSubscription>;
export type OnNewTransactionSubscriptionResult = Apollo.SubscriptionResult<OnNewTransactionSubscription>;
export const OnPositionUpdatedDocument = gql`
    subscription OnPositionUpdated($userAddress: String!) {
  positionUpdated(userAddress: $userAddress) {
    ...PositionFields
  }
}
    ${PositionFieldsFragmentDoc}`;

/**
 * __useOnPositionUpdatedSubscription__
 *
 * To run a query within a React component, call `useOnPositionUpdatedSubscription` and pass it any options that fit your needs.
 * When your component renders, `useOnPositionUpdatedSubscription` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the subscription, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useOnPositionUpdatedSubscription({
 *   variables: {
 *      userAddress: // value for 'userAddress'
 *   },
 * });
 */
export function useOnPositionUpdatedSubscription(baseOptions: ApolloReactHooks.SubscriptionHookOptions<OnPositionUpdatedSubscription, OnPositionUpdatedSubscriptionVariables> & ({ variables: OnPositionUpdatedSubscriptionVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return ApolloReactHooks.useSubscription<OnPositionUpdatedSubscription, OnPositionUpdatedSubscriptionVariables>(OnPositionUpdatedDocument, options);
      }
export type OnPositionUpdatedSubscriptionHookResult = ReturnType<typeof useOnPositionUpdatedSubscription>;
export type OnPositionUpdatedSubscriptionResult = Apollo.SubscriptionResult<OnPositionUpdatedSubscription>;