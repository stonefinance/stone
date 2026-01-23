/* eslint-disable */
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = T | null | undefined;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  BigInt: { input: any; output: any; }
  DateTime: { input: any; output: any; }
  Decimal: { input: any; output: any; }
  JSON: { input: any; output: any; }
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

export type MarketFieldsFragment = { __typename?: 'Market', id: string, marketAddress: string, curator: string, collateralDenom: string, debtDenom: string, oracle: string, createdAt: any, createdAtBlock: number, loanToValue: any, liquidationThreshold: any, liquidationBonus: any, liquidationProtocolFee: any, closeFactor: any, interestRateModel: any, protocolFee: any, curatorFee: any, supplyCap?: any | null, borrowCap?: any | null, enabled: boolean, isMutable: boolean, borrowIndex: any, liquidityIndex: any, borrowRate: any, liquidityRate: any, totalSupply: any, totalDebt: any, totalCollateral: any, utilization: any, availableLiquidity: any, lastUpdate: number } & { ' $fragmentName'?: 'MarketFieldsFragment' };

export type MarketSummaryFieldsFragment = { __typename?: 'Market', id: string, marketAddress: string, collateralDenom: string, debtDenom: string, curator: string, loanToValue: any, liquidationThreshold: any, borrowRate: any, liquidityRate: any, totalSupply: any, totalDebt: any, totalCollateral: any, utilization: any, availableLiquidity: any, enabled: boolean } & { ' $fragmentName'?: 'MarketSummaryFieldsFragment' };

export type PositionFieldsFragment = { __typename?: 'UserPosition', id: string, userAddress: string, supplyScaled: any, debtScaled: any, collateral: any, supplyAmount: any, debtAmount: any, healthFactor?: any | null, firstInteraction: any, lastInteraction: any, market: { __typename?: 'Market', id: string, marketAddress: string, collateralDenom: string, debtDenom: string, loanToValue: any, liquidationThreshold: any, liquidityIndex: any, borrowIndex: any } } & { ' $fragmentName'?: 'PositionFieldsFragment' };

export type TransactionFieldsFragment = { __typename?: 'Transaction', id: string, txHash: string, blockHeight: number, timestamp: any, userAddress: string, action: TransactionAction, amount?: any | null, scaledAmount?: any | null, recipient?: string | null, liquidator?: string | null, borrower?: string | null, debtRepaid?: any | null, collateralSeized?: any | null, protocolFee?: any | null, totalSupply?: any | null, totalDebt?: any | null, totalCollateral?: any | null, utilization?: any | null, market: { __typename?: 'Market', id: string, marketAddress: string, collateralDenom: string, debtDenom: string } } & { ' $fragmentName'?: 'TransactionFieldsFragment' };

export type GetMarketsQueryVariables = Exact<{
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  curator?: InputMaybe<Scalars['String']['input']>;
  collateralDenom?: InputMaybe<Scalars['String']['input']>;
  debtDenom?: InputMaybe<Scalars['String']['input']>;
  enabledOnly?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type GetMarketsQuery = { __typename?: 'Query', markets: Array<(
    { __typename?: 'Market' }
    & { ' $fragmentRefs'?: { 'MarketSummaryFieldsFragment': MarketSummaryFieldsFragment } }
  )> };

export type GetMarketQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type GetMarketQuery = { __typename?: 'Query', market?: (
    { __typename?: 'Market' }
    & { ' $fragmentRefs'?: { 'MarketFieldsFragment': MarketFieldsFragment } }
  ) | null };

export type GetMarketByAddressQueryVariables = Exact<{
  address: Scalars['String']['input'];
}>;


export type GetMarketByAddressQuery = { __typename?: 'Query', marketByAddress?: (
    { __typename?: 'Market' }
    & { ' $fragmentRefs'?: { 'MarketFieldsFragment': MarketFieldsFragment } }
  ) | null };

export type GetMarketCountQueryVariables = Exact<{ [key: string]: never; }>;


export type GetMarketCountQuery = { __typename?: 'Query', marketCount: number };

export type GetUserPositionQueryVariables = Exact<{
  marketId: Scalars['ID']['input'];
  userAddress: Scalars['String']['input'];
}>;


export type GetUserPositionQuery = { __typename?: 'Query', userPosition?: (
    { __typename?: 'UserPosition' }
    & { ' $fragmentRefs'?: { 'PositionFieldsFragment': PositionFieldsFragment } }
  ) | null };

export type GetUserPositionsQueryVariables = Exact<{
  userAddress: Scalars['String']['input'];
  hasDebt?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type GetUserPositionsQuery = { __typename?: 'Query', userPositions: Array<(
    { __typename?: 'UserPosition' }
    & { ' $fragmentRefs'?: { 'PositionFieldsFragment': PositionFieldsFragment } }
  )> };

export type GetLiquidatablePositionsQueryVariables = Exact<{
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
}>;


export type GetLiquidatablePositionsQuery = { __typename?: 'Query', liquidatablePositions: Array<(
    { __typename?: 'UserPosition' }
    & { ' $fragmentRefs'?: { 'PositionFieldsFragment': PositionFieldsFragment } }
  )> };

export type GetTransactionsQueryVariables = Exact<{
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  marketId?: InputMaybe<Scalars['ID']['input']>;
  userAddress?: InputMaybe<Scalars['String']['input']>;
  action?: InputMaybe<TransactionAction>;
}>;


export type GetTransactionsQuery = { __typename?: 'Query', transactions: Array<(
    { __typename?: 'Transaction' }
    & { ' $fragmentRefs'?: { 'TransactionFieldsFragment': TransactionFieldsFragment } }
  )> };

export type GetTransactionQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type GetTransactionQuery = { __typename?: 'Query', transaction?: (
    { __typename?: 'Transaction' }
    & { ' $fragmentRefs'?: { 'TransactionFieldsFragment': TransactionFieldsFragment } }
  ) | null };

export type GetMarketSnapshotsQueryVariables = Exact<{
  marketId: Scalars['ID']['input'];
  fromTime?: InputMaybe<Scalars['DateTime']['input']>;
  toTime?: InputMaybe<Scalars['DateTime']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;


export type GetMarketSnapshotsQuery = { __typename?: 'Query', marketSnapshots: Array<{ __typename?: 'MarketSnapshot', id: string, timestamp: any, blockHeight: number, borrowIndex: any, liquidityIndex: any, borrowRate: any, liquidityRate: any, totalSupply: any, totalDebt: any, totalCollateral: any, utilization: any, loanToValue: any, liquidationThreshold: any, enabled: boolean }> };

export type GetInterestAccrualEventsQueryVariables = Exact<{
  marketId: Scalars['ID']['input'];
  fromTime?: InputMaybe<Scalars['DateTime']['input']>;
  toTime?: InputMaybe<Scalars['DateTime']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;


export type GetInterestAccrualEventsQuery = { __typename?: 'Query', interestAccrualEvents: Array<{ __typename?: 'InterestAccrualEvent', id: string, txHash: string, timestamp: any, blockHeight: number, borrowIndex: any, liquidityIndex: any, borrowRate: any, liquidityRate: any }> };

export type OnMarketUpdatedSubscriptionVariables = Exact<{
  marketId: Scalars['ID']['input'];
}>;


export type OnMarketUpdatedSubscription = { __typename?: 'Subscription', marketUpdated: (
    { __typename?: 'Market' }
    & { ' $fragmentRefs'?: { 'MarketFieldsFragment': MarketFieldsFragment } }
  ) };

export type OnNewTransactionSubscriptionVariables = Exact<{
  marketId?: InputMaybe<Scalars['ID']['input']>;
}>;


export type OnNewTransactionSubscription = { __typename?: 'Subscription', newTransaction: (
    { __typename?: 'Transaction' }
    & { ' $fragmentRefs'?: { 'TransactionFieldsFragment': TransactionFieldsFragment } }
  ) };

export type OnPositionUpdatedSubscriptionVariables = Exact<{
  userAddress: Scalars['String']['input'];
}>;


export type OnPositionUpdatedSubscription = { __typename?: 'Subscription', positionUpdated: (
    { __typename?: 'UserPosition' }
    & { ' $fragmentRefs'?: { 'PositionFieldsFragment': PositionFieldsFragment } }
  ) };

export const MarketFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"MarketFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Market"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"marketAddress"}},{"kind":"Field","name":{"kind":"Name","value":"curator"}},{"kind":"Field","name":{"kind":"Name","value":"collateralDenom"}},{"kind":"Field","name":{"kind":"Name","value":"debtDenom"}},{"kind":"Field","name":{"kind":"Name","value":"oracle"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAtBlock"}},{"kind":"Field","name":{"kind":"Name","value":"loanToValue"}},{"kind":"Field","name":{"kind":"Name","value":"liquidationThreshold"}},{"kind":"Field","name":{"kind":"Name","value":"liquidationBonus"}},{"kind":"Field","name":{"kind":"Name","value":"liquidationProtocolFee"}},{"kind":"Field","name":{"kind":"Name","value":"closeFactor"}},{"kind":"Field","name":{"kind":"Name","value":"interestRateModel"}},{"kind":"Field","name":{"kind":"Name","value":"protocolFee"}},{"kind":"Field","name":{"kind":"Name","value":"curatorFee"}},{"kind":"Field","name":{"kind":"Name","value":"supplyCap"}},{"kind":"Field","name":{"kind":"Name","value":"borrowCap"}},{"kind":"Field","name":{"kind":"Name","value":"enabled"}},{"kind":"Field","name":{"kind":"Name","value":"isMutable"}},{"kind":"Field","name":{"kind":"Name","value":"borrowIndex"}},{"kind":"Field","name":{"kind":"Name","value":"liquidityIndex"}},{"kind":"Field","name":{"kind":"Name","value":"borrowRate"}},{"kind":"Field","name":{"kind":"Name","value":"liquidityRate"}},{"kind":"Field","name":{"kind":"Name","value":"totalSupply"}},{"kind":"Field","name":{"kind":"Name","value":"totalDebt"}},{"kind":"Field","name":{"kind":"Name","value":"totalCollateral"}},{"kind":"Field","name":{"kind":"Name","value":"utilization"}},{"kind":"Field","name":{"kind":"Name","value":"availableLiquidity"}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdate"}}]}}]} as unknown as DocumentNode<MarketFieldsFragment, unknown>;
export const MarketSummaryFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"MarketSummaryFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Market"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"marketAddress"}},{"kind":"Field","name":{"kind":"Name","value":"collateralDenom"}},{"kind":"Field","name":{"kind":"Name","value":"debtDenom"}},{"kind":"Field","name":{"kind":"Name","value":"curator"}},{"kind":"Field","name":{"kind":"Name","value":"loanToValue"}},{"kind":"Field","name":{"kind":"Name","value":"liquidationThreshold"}},{"kind":"Field","name":{"kind":"Name","value":"borrowRate"}},{"kind":"Field","name":{"kind":"Name","value":"liquidityRate"}},{"kind":"Field","name":{"kind":"Name","value":"totalSupply"}},{"kind":"Field","name":{"kind":"Name","value":"totalDebt"}},{"kind":"Field","name":{"kind":"Name","value":"totalCollateral"}},{"kind":"Field","name":{"kind":"Name","value":"utilization"}},{"kind":"Field","name":{"kind":"Name","value":"availableLiquidity"}},{"kind":"Field","name":{"kind":"Name","value":"enabled"}}]}}]} as unknown as DocumentNode<MarketSummaryFieldsFragment, unknown>;
export const PositionFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PositionFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"UserPosition"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"userAddress"}},{"kind":"Field","name":{"kind":"Name","value":"supplyScaled"}},{"kind":"Field","name":{"kind":"Name","value":"debtScaled"}},{"kind":"Field","name":{"kind":"Name","value":"collateral"}},{"kind":"Field","name":{"kind":"Name","value":"supplyAmount"}},{"kind":"Field","name":{"kind":"Name","value":"debtAmount"}},{"kind":"Field","name":{"kind":"Name","value":"healthFactor"}},{"kind":"Field","name":{"kind":"Name","value":"firstInteraction"}},{"kind":"Field","name":{"kind":"Name","value":"lastInteraction"}},{"kind":"Field","name":{"kind":"Name","value":"market"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"marketAddress"}},{"kind":"Field","name":{"kind":"Name","value":"collateralDenom"}},{"kind":"Field","name":{"kind":"Name","value":"debtDenom"}},{"kind":"Field","name":{"kind":"Name","value":"loanToValue"}},{"kind":"Field","name":{"kind":"Name","value":"liquidationThreshold"}},{"kind":"Field","name":{"kind":"Name","value":"liquidityIndex"}},{"kind":"Field","name":{"kind":"Name","value":"borrowIndex"}}]}}]}}]} as unknown as DocumentNode<PositionFieldsFragment, unknown>;
export const TransactionFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TransactionFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Transaction"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"txHash"}},{"kind":"Field","name":{"kind":"Name","value":"blockHeight"}},{"kind":"Field","name":{"kind":"Name","value":"timestamp"}},{"kind":"Field","name":{"kind":"Name","value":"userAddress"}},{"kind":"Field","name":{"kind":"Name","value":"action"}},{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"scaledAmount"}},{"kind":"Field","name":{"kind":"Name","value":"recipient"}},{"kind":"Field","name":{"kind":"Name","value":"liquidator"}},{"kind":"Field","name":{"kind":"Name","value":"borrower"}},{"kind":"Field","name":{"kind":"Name","value":"debtRepaid"}},{"kind":"Field","name":{"kind":"Name","value":"collateralSeized"}},{"kind":"Field","name":{"kind":"Name","value":"protocolFee"}},{"kind":"Field","name":{"kind":"Name","value":"totalSupply"}},{"kind":"Field","name":{"kind":"Name","value":"totalDebt"}},{"kind":"Field","name":{"kind":"Name","value":"totalCollateral"}},{"kind":"Field","name":{"kind":"Name","value":"utilization"}},{"kind":"Field","name":{"kind":"Name","value":"market"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"marketAddress"}},{"kind":"Field","name":{"kind":"Name","value":"collateralDenom"}},{"kind":"Field","name":{"kind":"Name","value":"debtDenom"}}]}}]}}]} as unknown as DocumentNode<TransactionFieldsFragment, unknown>;
export const GetMarketsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetMarkets"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"curator"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"collateralDenom"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"debtDenom"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"enabledOnly"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"markets"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}},{"kind":"Argument","name":{"kind":"Name","value":"curator"},"value":{"kind":"Variable","name":{"kind":"Name","value":"curator"}}},{"kind":"Argument","name":{"kind":"Name","value":"collateralDenom"},"value":{"kind":"Variable","name":{"kind":"Name","value":"collateralDenom"}}},{"kind":"Argument","name":{"kind":"Name","value":"debtDenom"},"value":{"kind":"Variable","name":{"kind":"Name","value":"debtDenom"}}},{"kind":"Argument","name":{"kind":"Name","value":"enabledOnly"},"value":{"kind":"Variable","name":{"kind":"Name","value":"enabledOnly"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"MarketSummaryFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"MarketSummaryFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Market"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"marketAddress"}},{"kind":"Field","name":{"kind":"Name","value":"collateralDenom"}},{"kind":"Field","name":{"kind":"Name","value":"debtDenom"}},{"kind":"Field","name":{"kind":"Name","value":"curator"}},{"kind":"Field","name":{"kind":"Name","value":"loanToValue"}},{"kind":"Field","name":{"kind":"Name","value":"liquidationThreshold"}},{"kind":"Field","name":{"kind":"Name","value":"borrowRate"}},{"kind":"Field","name":{"kind":"Name","value":"liquidityRate"}},{"kind":"Field","name":{"kind":"Name","value":"totalSupply"}},{"kind":"Field","name":{"kind":"Name","value":"totalDebt"}},{"kind":"Field","name":{"kind":"Name","value":"totalCollateral"}},{"kind":"Field","name":{"kind":"Name","value":"utilization"}},{"kind":"Field","name":{"kind":"Name","value":"availableLiquidity"}},{"kind":"Field","name":{"kind":"Name","value":"enabled"}}]}}]} as unknown as DocumentNode<GetMarketsQuery, GetMarketsQueryVariables>;
export const GetMarketDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetMarket"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"market"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"MarketFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"MarketFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Market"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"marketAddress"}},{"kind":"Field","name":{"kind":"Name","value":"curator"}},{"kind":"Field","name":{"kind":"Name","value":"collateralDenom"}},{"kind":"Field","name":{"kind":"Name","value":"debtDenom"}},{"kind":"Field","name":{"kind":"Name","value":"oracle"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAtBlock"}},{"kind":"Field","name":{"kind":"Name","value":"loanToValue"}},{"kind":"Field","name":{"kind":"Name","value":"liquidationThreshold"}},{"kind":"Field","name":{"kind":"Name","value":"liquidationBonus"}},{"kind":"Field","name":{"kind":"Name","value":"liquidationProtocolFee"}},{"kind":"Field","name":{"kind":"Name","value":"closeFactor"}},{"kind":"Field","name":{"kind":"Name","value":"interestRateModel"}},{"kind":"Field","name":{"kind":"Name","value":"protocolFee"}},{"kind":"Field","name":{"kind":"Name","value":"curatorFee"}},{"kind":"Field","name":{"kind":"Name","value":"supplyCap"}},{"kind":"Field","name":{"kind":"Name","value":"borrowCap"}},{"kind":"Field","name":{"kind":"Name","value":"enabled"}},{"kind":"Field","name":{"kind":"Name","value":"isMutable"}},{"kind":"Field","name":{"kind":"Name","value":"borrowIndex"}},{"kind":"Field","name":{"kind":"Name","value":"liquidityIndex"}},{"kind":"Field","name":{"kind":"Name","value":"borrowRate"}},{"kind":"Field","name":{"kind":"Name","value":"liquidityRate"}},{"kind":"Field","name":{"kind":"Name","value":"totalSupply"}},{"kind":"Field","name":{"kind":"Name","value":"totalDebt"}},{"kind":"Field","name":{"kind":"Name","value":"totalCollateral"}},{"kind":"Field","name":{"kind":"Name","value":"utilization"}},{"kind":"Field","name":{"kind":"Name","value":"availableLiquidity"}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdate"}}]}}]} as unknown as DocumentNode<GetMarketQuery, GetMarketQueryVariables>;
export const GetMarketByAddressDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetMarketByAddress"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"address"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"marketByAddress"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"address"},"value":{"kind":"Variable","name":{"kind":"Name","value":"address"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"MarketFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"MarketFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Market"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"marketAddress"}},{"kind":"Field","name":{"kind":"Name","value":"curator"}},{"kind":"Field","name":{"kind":"Name","value":"collateralDenom"}},{"kind":"Field","name":{"kind":"Name","value":"debtDenom"}},{"kind":"Field","name":{"kind":"Name","value":"oracle"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAtBlock"}},{"kind":"Field","name":{"kind":"Name","value":"loanToValue"}},{"kind":"Field","name":{"kind":"Name","value":"liquidationThreshold"}},{"kind":"Field","name":{"kind":"Name","value":"liquidationBonus"}},{"kind":"Field","name":{"kind":"Name","value":"liquidationProtocolFee"}},{"kind":"Field","name":{"kind":"Name","value":"closeFactor"}},{"kind":"Field","name":{"kind":"Name","value":"interestRateModel"}},{"kind":"Field","name":{"kind":"Name","value":"protocolFee"}},{"kind":"Field","name":{"kind":"Name","value":"curatorFee"}},{"kind":"Field","name":{"kind":"Name","value":"supplyCap"}},{"kind":"Field","name":{"kind":"Name","value":"borrowCap"}},{"kind":"Field","name":{"kind":"Name","value":"enabled"}},{"kind":"Field","name":{"kind":"Name","value":"isMutable"}},{"kind":"Field","name":{"kind":"Name","value":"borrowIndex"}},{"kind":"Field","name":{"kind":"Name","value":"liquidityIndex"}},{"kind":"Field","name":{"kind":"Name","value":"borrowRate"}},{"kind":"Field","name":{"kind":"Name","value":"liquidityRate"}},{"kind":"Field","name":{"kind":"Name","value":"totalSupply"}},{"kind":"Field","name":{"kind":"Name","value":"totalDebt"}},{"kind":"Field","name":{"kind":"Name","value":"totalCollateral"}},{"kind":"Field","name":{"kind":"Name","value":"utilization"}},{"kind":"Field","name":{"kind":"Name","value":"availableLiquidity"}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdate"}}]}}]} as unknown as DocumentNode<GetMarketByAddressQuery, GetMarketByAddressQueryVariables>;
export const GetMarketCountDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetMarketCount"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"marketCount"}}]}}]} as unknown as DocumentNode<GetMarketCountQuery, GetMarketCountQueryVariables>;
export const GetUserPositionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetUserPosition"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"marketId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userAddress"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userPosition"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"marketId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"marketId"}}},{"kind":"Argument","name":{"kind":"Name","value":"userAddress"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userAddress"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PositionFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PositionFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"UserPosition"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"userAddress"}},{"kind":"Field","name":{"kind":"Name","value":"supplyScaled"}},{"kind":"Field","name":{"kind":"Name","value":"debtScaled"}},{"kind":"Field","name":{"kind":"Name","value":"collateral"}},{"kind":"Field","name":{"kind":"Name","value":"supplyAmount"}},{"kind":"Field","name":{"kind":"Name","value":"debtAmount"}},{"kind":"Field","name":{"kind":"Name","value":"healthFactor"}},{"kind":"Field","name":{"kind":"Name","value":"firstInteraction"}},{"kind":"Field","name":{"kind":"Name","value":"lastInteraction"}},{"kind":"Field","name":{"kind":"Name","value":"market"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"marketAddress"}},{"kind":"Field","name":{"kind":"Name","value":"collateralDenom"}},{"kind":"Field","name":{"kind":"Name","value":"debtDenom"}},{"kind":"Field","name":{"kind":"Name","value":"loanToValue"}},{"kind":"Field","name":{"kind":"Name","value":"liquidationThreshold"}},{"kind":"Field","name":{"kind":"Name","value":"liquidityIndex"}},{"kind":"Field","name":{"kind":"Name","value":"borrowIndex"}}]}}]}}]} as unknown as DocumentNode<GetUserPositionQuery, GetUserPositionQueryVariables>;
export const GetUserPositionsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetUserPositions"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userAddress"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"hasDebt"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userPositions"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"userAddress"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userAddress"}}},{"kind":"Argument","name":{"kind":"Name","value":"hasDebt"},"value":{"kind":"Variable","name":{"kind":"Name","value":"hasDebt"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PositionFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PositionFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"UserPosition"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"userAddress"}},{"kind":"Field","name":{"kind":"Name","value":"supplyScaled"}},{"kind":"Field","name":{"kind":"Name","value":"debtScaled"}},{"kind":"Field","name":{"kind":"Name","value":"collateral"}},{"kind":"Field","name":{"kind":"Name","value":"supplyAmount"}},{"kind":"Field","name":{"kind":"Name","value":"debtAmount"}},{"kind":"Field","name":{"kind":"Name","value":"healthFactor"}},{"kind":"Field","name":{"kind":"Name","value":"firstInteraction"}},{"kind":"Field","name":{"kind":"Name","value":"lastInteraction"}},{"kind":"Field","name":{"kind":"Name","value":"market"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"marketAddress"}},{"kind":"Field","name":{"kind":"Name","value":"collateralDenom"}},{"kind":"Field","name":{"kind":"Name","value":"debtDenom"}},{"kind":"Field","name":{"kind":"Name","value":"loanToValue"}},{"kind":"Field","name":{"kind":"Name","value":"liquidationThreshold"}},{"kind":"Field","name":{"kind":"Name","value":"liquidityIndex"}},{"kind":"Field","name":{"kind":"Name","value":"borrowIndex"}}]}}]}}]} as unknown as DocumentNode<GetUserPositionsQuery, GetUserPositionsQueryVariables>;
export const GetLiquidatablePositionsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetLiquidatablePositions"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"liquidatablePositions"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PositionFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PositionFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"UserPosition"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"userAddress"}},{"kind":"Field","name":{"kind":"Name","value":"supplyScaled"}},{"kind":"Field","name":{"kind":"Name","value":"debtScaled"}},{"kind":"Field","name":{"kind":"Name","value":"collateral"}},{"kind":"Field","name":{"kind":"Name","value":"supplyAmount"}},{"kind":"Field","name":{"kind":"Name","value":"debtAmount"}},{"kind":"Field","name":{"kind":"Name","value":"healthFactor"}},{"kind":"Field","name":{"kind":"Name","value":"firstInteraction"}},{"kind":"Field","name":{"kind":"Name","value":"lastInteraction"}},{"kind":"Field","name":{"kind":"Name","value":"market"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"marketAddress"}},{"kind":"Field","name":{"kind":"Name","value":"collateralDenom"}},{"kind":"Field","name":{"kind":"Name","value":"debtDenom"}},{"kind":"Field","name":{"kind":"Name","value":"loanToValue"}},{"kind":"Field","name":{"kind":"Name","value":"liquidationThreshold"}},{"kind":"Field","name":{"kind":"Name","value":"liquidityIndex"}},{"kind":"Field","name":{"kind":"Name","value":"borrowIndex"}}]}}]}}]} as unknown as DocumentNode<GetLiquidatablePositionsQuery, GetLiquidatablePositionsQueryVariables>;
export const GetTransactionsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetTransactions"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"marketId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userAddress"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"action"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"TransactionAction"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"transactions"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}},{"kind":"Argument","name":{"kind":"Name","value":"marketId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"marketId"}}},{"kind":"Argument","name":{"kind":"Name","value":"userAddress"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userAddress"}}},{"kind":"Argument","name":{"kind":"Name","value":"action"},"value":{"kind":"Variable","name":{"kind":"Name","value":"action"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TransactionFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TransactionFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Transaction"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"txHash"}},{"kind":"Field","name":{"kind":"Name","value":"blockHeight"}},{"kind":"Field","name":{"kind":"Name","value":"timestamp"}},{"kind":"Field","name":{"kind":"Name","value":"userAddress"}},{"kind":"Field","name":{"kind":"Name","value":"action"}},{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"scaledAmount"}},{"kind":"Field","name":{"kind":"Name","value":"recipient"}},{"kind":"Field","name":{"kind":"Name","value":"liquidator"}},{"kind":"Field","name":{"kind":"Name","value":"borrower"}},{"kind":"Field","name":{"kind":"Name","value":"debtRepaid"}},{"kind":"Field","name":{"kind":"Name","value":"collateralSeized"}},{"kind":"Field","name":{"kind":"Name","value":"protocolFee"}},{"kind":"Field","name":{"kind":"Name","value":"totalSupply"}},{"kind":"Field","name":{"kind":"Name","value":"totalDebt"}},{"kind":"Field","name":{"kind":"Name","value":"totalCollateral"}},{"kind":"Field","name":{"kind":"Name","value":"utilization"}},{"kind":"Field","name":{"kind":"Name","value":"market"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"marketAddress"}},{"kind":"Field","name":{"kind":"Name","value":"collateralDenom"}},{"kind":"Field","name":{"kind":"Name","value":"debtDenom"}}]}}]}}]} as unknown as DocumentNode<GetTransactionsQuery, GetTransactionsQueryVariables>;
export const GetTransactionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetTransaction"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"transaction"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TransactionFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TransactionFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Transaction"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"txHash"}},{"kind":"Field","name":{"kind":"Name","value":"blockHeight"}},{"kind":"Field","name":{"kind":"Name","value":"timestamp"}},{"kind":"Field","name":{"kind":"Name","value":"userAddress"}},{"kind":"Field","name":{"kind":"Name","value":"action"}},{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"scaledAmount"}},{"kind":"Field","name":{"kind":"Name","value":"recipient"}},{"kind":"Field","name":{"kind":"Name","value":"liquidator"}},{"kind":"Field","name":{"kind":"Name","value":"borrower"}},{"kind":"Field","name":{"kind":"Name","value":"debtRepaid"}},{"kind":"Field","name":{"kind":"Name","value":"collateralSeized"}},{"kind":"Field","name":{"kind":"Name","value":"protocolFee"}},{"kind":"Field","name":{"kind":"Name","value":"totalSupply"}},{"kind":"Field","name":{"kind":"Name","value":"totalDebt"}},{"kind":"Field","name":{"kind":"Name","value":"totalCollateral"}},{"kind":"Field","name":{"kind":"Name","value":"utilization"}},{"kind":"Field","name":{"kind":"Name","value":"market"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"marketAddress"}},{"kind":"Field","name":{"kind":"Name","value":"collateralDenom"}},{"kind":"Field","name":{"kind":"Name","value":"debtDenom"}}]}}]}}]} as unknown as DocumentNode<GetTransactionQuery, GetTransactionQueryVariables>;
export const GetMarketSnapshotsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetMarketSnapshots"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"marketId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"fromTime"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"DateTime"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"toTime"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"DateTime"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"marketSnapshots"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"marketId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"marketId"}}},{"kind":"Argument","name":{"kind":"Name","value":"fromTime"},"value":{"kind":"Variable","name":{"kind":"Name","value":"fromTime"}}},{"kind":"Argument","name":{"kind":"Name","value":"toTime"},"value":{"kind":"Variable","name":{"kind":"Name","value":"toTime"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"timestamp"}},{"kind":"Field","name":{"kind":"Name","value":"blockHeight"}},{"kind":"Field","name":{"kind":"Name","value":"borrowIndex"}},{"kind":"Field","name":{"kind":"Name","value":"liquidityIndex"}},{"kind":"Field","name":{"kind":"Name","value":"borrowRate"}},{"kind":"Field","name":{"kind":"Name","value":"liquidityRate"}},{"kind":"Field","name":{"kind":"Name","value":"totalSupply"}},{"kind":"Field","name":{"kind":"Name","value":"totalDebt"}},{"kind":"Field","name":{"kind":"Name","value":"totalCollateral"}},{"kind":"Field","name":{"kind":"Name","value":"utilization"}},{"kind":"Field","name":{"kind":"Name","value":"loanToValue"}},{"kind":"Field","name":{"kind":"Name","value":"liquidationThreshold"}},{"kind":"Field","name":{"kind":"Name","value":"enabled"}}]}}]}}]} as unknown as DocumentNode<GetMarketSnapshotsQuery, GetMarketSnapshotsQueryVariables>;
export const GetInterestAccrualEventsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetInterestAccrualEvents"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"marketId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"fromTime"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"DateTime"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"toTime"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"DateTime"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"interestAccrualEvents"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"marketId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"marketId"}}},{"kind":"Argument","name":{"kind":"Name","value":"fromTime"},"value":{"kind":"Variable","name":{"kind":"Name","value":"fromTime"}}},{"kind":"Argument","name":{"kind":"Name","value":"toTime"},"value":{"kind":"Variable","name":{"kind":"Name","value":"toTime"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"txHash"}},{"kind":"Field","name":{"kind":"Name","value":"timestamp"}},{"kind":"Field","name":{"kind":"Name","value":"blockHeight"}},{"kind":"Field","name":{"kind":"Name","value":"borrowIndex"}},{"kind":"Field","name":{"kind":"Name","value":"liquidityIndex"}},{"kind":"Field","name":{"kind":"Name","value":"borrowRate"}},{"kind":"Field","name":{"kind":"Name","value":"liquidityRate"}}]}}]}}]} as unknown as DocumentNode<GetInterestAccrualEventsQuery, GetInterestAccrualEventsQueryVariables>;
export const OnMarketUpdatedDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"subscription","name":{"kind":"Name","value":"OnMarketUpdated"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"marketId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"marketUpdated"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"marketId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"marketId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"MarketFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"MarketFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Market"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"marketAddress"}},{"kind":"Field","name":{"kind":"Name","value":"curator"}},{"kind":"Field","name":{"kind":"Name","value":"collateralDenom"}},{"kind":"Field","name":{"kind":"Name","value":"debtDenom"}},{"kind":"Field","name":{"kind":"Name","value":"oracle"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAtBlock"}},{"kind":"Field","name":{"kind":"Name","value":"loanToValue"}},{"kind":"Field","name":{"kind":"Name","value":"liquidationThreshold"}},{"kind":"Field","name":{"kind":"Name","value":"liquidationBonus"}},{"kind":"Field","name":{"kind":"Name","value":"liquidationProtocolFee"}},{"kind":"Field","name":{"kind":"Name","value":"closeFactor"}},{"kind":"Field","name":{"kind":"Name","value":"interestRateModel"}},{"kind":"Field","name":{"kind":"Name","value":"protocolFee"}},{"kind":"Field","name":{"kind":"Name","value":"curatorFee"}},{"kind":"Field","name":{"kind":"Name","value":"supplyCap"}},{"kind":"Field","name":{"kind":"Name","value":"borrowCap"}},{"kind":"Field","name":{"kind":"Name","value":"enabled"}},{"kind":"Field","name":{"kind":"Name","value":"isMutable"}},{"kind":"Field","name":{"kind":"Name","value":"borrowIndex"}},{"kind":"Field","name":{"kind":"Name","value":"liquidityIndex"}},{"kind":"Field","name":{"kind":"Name","value":"borrowRate"}},{"kind":"Field","name":{"kind":"Name","value":"liquidityRate"}},{"kind":"Field","name":{"kind":"Name","value":"totalSupply"}},{"kind":"Field","name":{"kind":"Name","value":"totalDebt"}},{"kind":"Field","name":{"kind":"Name","value":"totalCollateral"}},{"kind":"Field","name":{"kind":"Name","value":"utilization"}},{"kind":"Field","name":{"kind":"Name","value":"availableLiquidity"}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdate"}}]}}]} as unknown as DocumentNode<OnMarketUpdatedSubscription, OnMarketUpdatedSubscriptionVariables>;
export const OnNewTransactionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"subscription","name":{"kind":"Name","value":"OnNewTransaction"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"marketId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"newTransaction"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"marketId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"marketId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TransactionFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TransactionFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Transaction"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"txHash"}},{"kind":"Field","name":{"kind":"Name","value":"blockHeight"}},{"kind":"Field","name":{"kind":"Name","value":"timestamp"}},{"kind":"Field","name":{"kind":"Name","value":"userAddress"}},{"kind":"Field","name":{"kind":"Name","value":"action"}},{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"scaledAmount"}},{"kind":"Field","name":{"kind":"Name","value":"recipient"}},{"kind":"Field","name":{"kind":"Name","value":"liquidator"}},{"kind":"Field","name":{"kind":"Name","value":"borrower"}},{"kind":"Field","name":{"kind":"Name","value":"debtRepaid"}},{"kind":"Field","name":{"kind":"Name","value":"collateralSeized"}},{"kind":"Field","name":{"kind":"Name","value":"protocolFee"}},{"kind":"Field","name":{"kind":"Name","value":"totalSupply"}},{"kind":"Field","name":{"kind":"Name","value":"totalDebt"}},{"kind":"Field","name":{"kind":"Name","value":"totalCollateral"}},{"kind":"Field","name":{"kind":"Name","value":"utilization"}},{"kind":"Field","name":{"kind":"Name","value":"market"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"marketAddress"}},{"kind":"Field","name":{"kind":"Name","value":"collateralDenom"}},{"kind":"Field","name":{"kind":"Name","value":"debtDenom"}}]}}]}}]} as unknown as DocumentNode<OnNewTransactionSubscription, OnNewTransactionSubscriptionVariables>;
export const OnPositionUpdatedDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"subscription","name":{"kind":"Name","value":"OnPositionUpdated"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userAddress"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"positionUpdated"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"userAddress"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userAddress"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"PositionFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"PositionFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"UserPosition"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"userAddress"}},{"kind":"Field","name":{"kind":"Name","value":"supplyScaled"}},{"kind":"Field","name":{"kind":"Name","value":"debtScaled"}},{"kind":"Field","name":{"kind":"Name","value":"collateral"}},{"kind":"Field","name":{"kind":"Name","value":"supplyAmount"}},{"kind":"Field","name":{"kind":"Name","value":"debtAmount"}},{"kind":"Field","name":{"kind":"Name","value":"healthFactor"}},{"kind":"Field","name":{"kind":"Name","value":"firstInteraction"}},{"kind":"Field","name":{"kind":"Name","value":"lastInteraction"}},{"kind":"Field","name":{"kind":"Name","value":"market"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"marketAddress"}},{"kind":"Field","name":{"kind":"Name","value":"collateralDenom"}},{"kind":"Field","name":{"kind":"Name","value":"debtDenom"}},{"kind":"Field","name":{"kind":"Name","value":"loanToValue"}},{"kind":"Field","name":{"kind":"Name","value":"liquidationThreshold"}},{"kind":"Field","name":{"kind":"Name","value":"liquidityIndex"}},{"kind":"Field","name":{"kind":"Name","value":"borrowIndex"}}]}}]}}]} as unknown as DocumentNode<OnPositionUpdatedSubscription, OnPositionUpdatedSubscriptionVariables>;