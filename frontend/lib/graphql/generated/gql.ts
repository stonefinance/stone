/* eslint-disable */
import * as types from './graphql';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  fragment MarketFields on Market {\n    id\n    marketAddress\n    curator\n    collateralDenom\n    debtDenom\n    oracle\n    createdAt\n    createdAtBlock\n    loanToValue\n    liquidationThreshold\n    liquidationBonus\n    liquidationProtocolFee\n    closeFactor\n    interestRateModel\n    protocolFee\n    curatorFee\n    supplyCap\n    borrowCap\n    enabled\n    isMutable\n    borrowIndex\n    liquidityIndex\n    borrowRate\n    liquidityRate\n    totalSupply\n    totalDebt\n    totalCollateral\n    utilization\n    availableLiquidity\n    lastUpdate\n  }\n": typeof types.MarketFieldsFragmentDoc,
    "\n  fragment MarketSummaryFields on Market {\n    id\n    marketAddress\n    collateralDenom\n    debtDenom\n    curator\n    loanToValue\n    liquidationThreshold\n    borrowRate\n    liquidityRate\n    totalSupply\n    totalDebt\n    totalCollateral\n    utilization\n    availableLiquidity\n    enabled\n  }\n": typeof types.MarketSummaryFieldsFragmentDoc,
    "\n  fragment PositionFields on UserPosition {\n    id\n    userAddress\n    supplyScaled\n    debtScaled\n    collateral\n    supplyAmount\n    debtAmount\n    healthFactor\n    firstInteraction\n    lastInteraction\n    market {\n      id\n      marketAddress\n      collateralDenom\n      debtDenom\n      loanToValue\n      liquidationThreshold\n      liquidityIndex\n      borrowIndex\n    }\n  }\n": typeof types.PositionFieldsFragmentDoc,
    "\n  fragment TransactionFields on Transaction {\n    id\n    txHash\n    blockHeight\n    timestamp\n    userAddress\n    action\n    amount\n    scaledAmount\n    recipient\n    liquidator\n    borrower\n    debtRepaid\n    collateralSeized\n    protocolFee\n    totalSupply\n    totalDebt\n    totalCollateral\n    utilization\n    market {\n      id\n      marketAddress\n      collateralDenom\n      debtDenom\n    }\n  }\n": typeof types.TransactionFieldsFragmentDoc,
    "\n  \n  query GetMarkets(\n    $limit: Int\n    $offset: Int\n    $curator: String\n    $collateralDenom: String\n    $debtDenom: String\n    $enabledOnly: Boolean\n  ) {\n    markets(\n      limit: $limit\n      offset: $offset\n      curator: $curator\n      collateralDenom: $collateralDenom\n      debtDenom: $debtDenom\n      enabledOnly: $enabledOnly\n    ) {\n      ...MarketSummaryFields\n    }\n  }\n": typeof types.GetMarketsDocument,
    "\n  \n  query GetMarket($id: ID!) {\n    market(id: $id) {\n      ...MarketFields\n    }\n  }\n": typeof types.GetMarketDocument,
    "\n  \n  query GetMarketByAddress($address: String!) {\n    marketByAddress(address: $address) {\n      ...MarketFields\n    }\n  }\n": typeof types.GetMarketByAddressDocument,
    "\n  query GetMarketCount {\n    marketCount\n  }\n": typeof types.GetMarketCountDocument,
    "\n  \n  query GetUserPosition($marketId: ID!, $userAddress: String!) {\n    userPosition(marketId: $marketId, userAddress: $userAddress) {\n      ...PositionFields\n    }\n  }\n": typeof types.GetUserPositionDocument,
    "\n  \n  query GetUserPositions($userAddress: String!, $hasDebt: Boolean) {\n    userPositions(userAddress: $userAddress, hasDebt: $hasDebt) {\n      ...PositionFields\n    }\n  }\n": typeof types.GetUserPositionsDocument,
    "\n  \n  query GetLiquidatablePositions($limit: Int, $offset: Int) {\n    liquidatablePositions(limit: $limit, offset: $offset) {\n      ...PositionFields\n    }\n  }\n": typeof types.GetLiquidatablePositionsDocument,
    "\n  \n  query GetTransactions(\n    $limit: Int\n    $offset: Int\n    $marketId: ID\n    $userAddress: String\n    $action: TransactionAction\n  ) {\n    transactions(\n      limit: $limit\n      offset: $offset\n      marketId: $marketId\n      userAddress: $userAddress\n      action: $action\n    ) {\n      ...TransactionFields\n    }\n  }\n": typeof types.GetTransactionsDocument,
    "\n  \n  query GetTransaction($id: ID!) {\n    transaction(id: $id) {\n      ...TransactionFields\n    }\n  }\n": typeof types.GetTransactionDocument,
    "\n  query GetMarketSnapshots(\n    $marketId: ID!\n    $fromTime: DateTime\n    $toTime: DateTime\n    $limit: Int\n  ) {\n    marketSnapshots(\n      marketId: $marketId\n      fromTime: $fromTime\n      toTime: $toTime\n      limit: $limit\n    ) {\n      id\n      timestamp\n      blockHeight\n      borrowIndex\n      liquidityIndex\n      borrowRate\n      liquidityRate\n      totalSupply\n      totalDebt\n      totalCollateral\n      utilization\n      loanToValue\n      liquidationThreshold\n      enabled\n    }\n  }\n": typeof types.GetMarketSnapshotsDocument,
    "\n  query GetInterestAccrualEvents(\n    $marketId: ID!\n    $fromTime: DateTime\n    $toTime: DateTime\n    $limit: Int\n  ) {\n    interestAccrualEvents(\n      marketId: $marketId\n      fromTime: $fromTime\n      toTime: $toTime\n      limit: $limit\n    ) {\n      id\n      txHash\n      timestamp\n      blockHeight\n      borrowIndex\n      liquidityIndex\n      borrowRate\n      liquidityRate\n    }\n  }\n": typeof types.GetInterestAccrualEventsDocument,
    "\n  \n  subscription OnMarketUpdated($marketId: ID!) {\n    marketUpdated(marketId: $marketId) {\n      ...MarketFields\n    }\n  }\n": typeof types.OnMarketUpdatedDocument,
    "\n  \n  subscription OnNewTransaction($marketId: ID) {\n    newTransaction(marketId: $marketId) {\n      ...TransactionFields\n    }\n  }\n": typeof types.OnNewTransactionDocument,
    "\n  \n  subscription OnPositionUpdated($userAddress: String!) {\n    positionUpdated(userAddress: $userAddress) {\n      ...PositionFields\n    }\n  }\n": typeof types.OnPositionUpdatedDocument,
};
const documents: Documents = {
    "\n  fragment MarketFields on Market {\n    id\n    marketAddress\n    curator\n    collateralDenom\n    debtDenom\n    oracle\n    createdAt\n    createdAtBlock\n    loanToValue\n    liquidationThreshold\n    liquidationBonus\n    liquidationProtocolFee\n    closeFactor\n    interestRateModel\n    protocolFee\n    curatorFee\n    supplyCap\n    borrowCap\n    enabled\n    isMutable\n    borrowIndex\n    liquidityIndex\n    borrowRate\n    liquidityRate\n    totalSupply\n    totalDebt\n    totalCollateral\n    utilization\n    availableLiquidity\n    lastUpdate\n  }\n": types.MarketFieldsFragmentDoc,
    "\n  fragment MarketSummaryFields on Market {\n    id\n    marketAddress\n    collateralDenom\n    debtDenom\n    curator\n    loanToValue\n    liquidationThreshold\n    borrowRate\n    liquidityRate\n    totalSupply\n    totalDebt\n    totalCollateral\n    utilization\n    availableLiquidity\n    enabled\n  }\n": types.MarketSummaryFieldsFragmentDoc,
    "\n  fragment PositionFields on UserPosition {\n    id\n    userAddress\n    supplyScaled\n    debtScaled\n    collateral\n    supplyAmount\n    debtAmount\n    healthFactor\n    firstInteraction\n    lastInteraction\n    market {\n      id\n      marketAddress\n      collateralDenom\n      debtDenom\n      loanToValue\n      liquidationThreshold\n      liquidityIndex\n      borrowIndex\n    }\n  }\n": types.PositionFieldsFragmentDoc,
    "\n  fragment TransactionFields on Transaction {\n    id\n    txHash\n    blockHeight\n    timestamp\n    userAddress\n    action\n    amount\n    scaledAmount\n    recipient\n    liquidator\n    borrower\n    debtRepaid\n    collateralSeized\n    protocolFee\n    totalSupply\n    totalDebt\n    totalCollateral\n    utilization\n    market {\n      id\n      marketAddress\n      collateralDenom\n      debtDenom\n    }\n  }\n": types.TransactionFieldsFragmentDoc,
    "\n  \n  query GetMarkets(\n    $limit: Int\n    $offset: Int\n    $curator: String\n    $collateralDenom: String\n    $debtDenom: String\n    $enabledOnly: Boolean\n  ) {\n    markets(\n      limit: $limit\n      offset: $offset\n      curator: $curator\n      collateralDenom: $collateralDenom\n      debtDenom: $debtDenom\n      enabledOnly: $enabledOnly\n    ) {\n      ...MarketSummaryFields\n    }\n  }\n": types.GetMarketsDocument,
    "\n  \n  query GetMarket($id: ID!) {\n    market(id: $id) {\n      ...MarketFields\n    }\n  }\n": types.GetMarketDocument,
    "\n  \n  query GetMarketByAddress($address: String!) {\n    marketByAddress(address: $address) {\n      ...MarketFields\n    }\n  }\n": types.GetMarketByAddressDocument,
    "\n  query GetMarketCount {\n    marketCount\n  }\n": types.GetMarketCountDocument,
    "\n  \n  query GetUserPosition($marketId: ID!, $userAddress: String!) {\n    userPosition(marketId: $marketId, userAddress: $userAddress) {\n      ...PositionFields\n    }\n  }\n": types.GetUserPositionDocument,
    "\n  \n  query GetUserPositions($userAddress: String!, $hasDebt: Boolean) {\n    userPositions(userAddress: $userAddress, hasDebt: $hasDebt) {\n      ...PositionFields\n    }\n  }\n": types.GetUserPositionsDocument,
    "\n  \n  query GetLiquidatablePositions($limit: Int, $offset: Int) {\n    liquidatablePositions(limit: $limit, offset: $offset) {\n      ...PositionFields\n    }\n  }\n": types.GetLiquidatablePositionsDocument,
    "\n  \n  query GetTransactions(\n    $limit: Int\n    $offset: Int\n    $marketId: ID\n    $userAddress: String\n    $action: TransactionAction\n  ) {\n    transactions(\n      limit: $limit\n      offset: $offset\n      marketId: $marketId\n      userAddress: $userAddress\n      action: $action\n    ) {\n      ...TransactionFields\n    }\n  }\n": types.GetTransactionsDocument,
    "\n  \n  query GetTransaction($id: ID!) {\n    transaction(id: $id) {\n      ...TransactionFields\n    }\n  }\n": types.GetTransactionDocument,
    "\n  query GetMarketSnapshots(\n    $marketId: ID!\n    $fromTime: DateTime\n    $toTime: DateTime\n    $limit: Int\n  ) {\n    marketSnapshots(\n      marketId: $marketId\n      fromTime: $fromTime\n      toTime: $toTime\n      limit: $limit\n    ) {\n      id\n      timestamp\n      blockHeight\n      borrowIndex\n      liquidityIndex\n      borrowRate\n      liquidityRate\n      totalSupply\n      totalDebt\n      totalCollateral\n      utilization\n      loanToValue\n      liquidationThreshold\n      enabled\n    }\n  }\n": types.GetMarketSnapshotsDocument,
    "\n  query GetInterestAccrualEvents(\n    $marketId: ID!\n    $fromTime: DateTime\n    $toTime: DateTime\n    $limit: Int\n  ) {\n    interestAccrualEvents(\n      marketId: $marketId\n      fromTime: $fromTime\n      toTime: $toTime\n      limit: $limit\n    ) {\n      id\n      txHash\n      timestamp\n      blockHeight\n      borrowIndex\n      liquidityIndex\n      borrowRate\n      liquidityRate\n    }\n  }\n": types.GetInterestAccrualEventsDocument,
    "\n  \n  subscription OnMarketUpdated($marketId: ID!) {\n    marketUpdated(marketId: $marketId) {\n      ...MarketFields\n    }\n  }\n": types.OnMarketUpdatedDocument,
    "\n  \n  subscription OnNewTransaction($marketId: ID) {\n    newTransaction(marketId: $marketId) {\n      ...TransactionFields\n    }\n  }\n": types.OnNewTransactionDocument,
    "\n  \n  subscription OnPositionUpdated($userAddress: String!) {\n    positionUpdated(userAddress: $userAddress) {\n      ...PositionFields\n    }\n  }\n": types.OnPositionUpdatedDocument,
};

/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = gql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function gql(source: string): unknown;

/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  fragment MarketFields on Market {\n    id\n    marketAddress\n    curator\n    collateralDenom\n    debtDenom\n    oracle\n    createdAt\n    createdAtBlock\n    loanToValue\n    liquidationThreshold\n    liquidationBonus\n    liquidationProtocolFee\n    closeFactor\n    interestRateModel\n    protocolFee\n    curatorFee\n    supplyCap\n    borrowCap\n    enabled\n    isMutable\n    borrowIndex\n    liquidityIndex\n    borrowRate\n    liquidityRate\n    totalSupply\n    totalDebt\n    totalCollateral\n    utilization\n    availableLiquidity\n    lastUpdate\n  }\n"): (typeof documents)["\n  fragment MarketFields on Market {\n    id\n    marketAddress\n    curator\n    collateralDenom\n    debtDenom\n    oracle\n    createdAt\n    createdAtBlock\n    loanToValue\n    liquidationThreshold\n    liquidationBonus\n    liquidationProtocolFee\n    closeFactor\n    interestRateModel\n    protocolFee\n    curatorFee\n    supplyCap\n    borrowCap\n    enabled\n    isMutable\n    borrowIndex\n    liquidityIndex\n    borrowRate\n    liquidityRate\n    totalSupply\n    totalDebt\n    totalCollateral\n    utilization\n    availableLiquidity\n    lastUpdate\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  fragment MarketSummaryFields on Market {\n    id\n    marketAddress\n    collateralDenom\n    debtDenom\n    curator\n    loanToValue\n    liquidationThreshold\n    borrowRate\n    liquidityRate\n    totalSupply\n    totalDebt\n    totalCollateral\n    utilization\n    availableLiquidity\n    enabled\n  }\n"): (typeof documents)["\n  fragment MarketSummaryFields on Market {\n    id\n    marketAddress\n    collateralDenom\n    debtDenom\n    curator\n    loanToValue\n    liquidationThreshold\n    borrowRate\n    liquidityRate\n    totalSupply\n    totalDebt\n    totalCollateral\n    utilization\n    availableLiquidity\n    enabled\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  fragment PositionFields on UserPosition {\n    id\n    userAddress\n    supplyScaled\n    debtScaled\n    collateral\n    supplyAmount\n    debtAmount\n    healthFactor\n    firstInteraction\n    lastInteraction\n    market {\n      id\n      marketAddress\n      collateralDenom\n      debtDenom\n      loanToValue\n      liquidationThreshold\n      liquidityIndex\n      borrowIndex\n    }\n  }\n"): (typeof documents)["\n  fragment PositionFields on UserPosition {\n    id\n    userAddress\n    supplyScaled\n    debtScaled\n    collateral\n    supplyAmount\n    debtAmount\n    healthFactor\n    firstInteraction\n    lastInteraction\n    market {\n      id\n      marketAddress\n      collateralDenom\n      debtDenom\n      loanToValue\n      liquidationThreshold\n      liquidityIndex\n      borrowIndex\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  fragment TransactionFields on Transaction {\n    id\n    txHash\n    blockHeight\n    timestamp\n    userAddress\n    action\n    amount\n    scaledAmount\n    recipient\n    liquidator\n    borrower\n    debtRepaid\n    collateralSeized\n    protocolFee\n    totalSupply\n    totalDebt\n    totalCollateral\n    utilization\n    market {\n      id\n      marketAddress\n      collateralDenom\n      debtDenom\n    }\n  }\n"): (typeof documents)["\n  fragment TransactionFields on Transaction {\n    id\n    txHash\n    blockHeight\n    timestamp\n    userAddress\n    action\n    amount\n    scaledAmount\n    recipient\n    liquidator\n    borrower\n    debtRepaid\n    collateralSeized\n    protocolFee\n    totalSupply\n    totalDebt\n    totalCollateral\n    utilization\n    market {\n      id\n      marketAddress\n      collateralDenom\n      debtDenom\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  \n  query GetMarkets(\n    $limit: Int\n    $offset: Int\n    $curator: String\n    $collateralDenom: String\n    $debtDenom: String\n    $enabledOnly: Boolean\n  ) {\n    markets(\n      limit: $limit\n      offset: $offset\n      curator: $curator\n      collateralDenom: $collateralDenom\n      debtDenom: $debtDenom\n      enabledOnly: $enabledOnly\n    ) {\n      ...MarketSummaryFields\n    }\n  }\n"): (typeof documents)["\n  \n  query GetMarkets(\n    $limit: Int\n    $offset: Int\n    $curator: String\n    $collateralDenom: String\n    $debtDenom: String\n    $enabledOnly: Boolean\n  ) {\n    markets(\n      limit: $limit\n      offset: $offset\n      curator: $curator\n      collateralDenom: $collateralDenom\n      debtDenom: $debtDenom\n      enabledOnly: $enabledOnly\n    ) {\n      ...MarketSummaryFields\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  \n  query GetMarket($id: ID!) {\n    market(id: $id) {\n      ...MarketFields\n    }\n  }\n"): (typeof documents)["\n  \n  query GetMarket($id: ID!) {\n    market(id: $id) {\n      ...MarketFields\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  \n  query GetMarketByAddress($address: String!) {\n    marketByAddress(address: $address) {\n      ...MarketFields\n    }\n  }\n"): (typeof documents)["\n  \n  query GetMarketByAddress($address: String!) {\n    marketByAddress(address: $address) {\n      ...MarketFields\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query GetMarketCount {\n    marketCount\n  }\n"): (typeof documents)["\n  query GetMarketCount {\n    marketCount\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  \n  query GetUserPosition($marketId: ID!, $userAddress: String!) {\n    userPosition(marketId: $marketId, userAddress: $userAddress) {\n      ...PositionFields\n    }\n  }\n"): (typeof documents)["\n  \n  query GetUserPosition($marketId: ID!, $userAddress: String!) {\n    userPosition(marketId: $marketId, userAddress: $userAddress) {\n      ...PositionFields\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  \n  query GetUserPositions($userAddress: String!, $hasDebt: Boolean) {\n    userPositions(userAddress: $userAddress, hasDebt: $hasDebt) {\n      ...PositionFields\n    }\n  }\n"): (typeof documents)["\n  \n  query GetUserPositions($userAddress: String!, $hasDebt: Boolean) {\n    userPositions(userAddress: $userAddress, hasDebt: $hasDebt) {\n      ...PositionFields\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  \n  query GetLiquidatablePositions($limit: Int, $offset: Int) {\n    liquidatablePositions(limit: $limit, offset: $offset) {\n      ...PositionFields\n    }\n  }\n"): (typeof documents)["\n  \n  query GetLiquidatablePositions($limit: Int, $offset: Int) {\n    liquidatablePositions(limit: $limit, offset: $offset) {\n      ...PositionFields\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  \n  query GetTransactions(\n    $limit: Int\n    $offset: Int\n    $marketId: ID\n    $userAddress: String\n    $action: TransactionAction\n  ) {\n    transactions(\n      limit: $limit\n      offset: $offset\n      marketId: $marketId\n      userAddress: $userAddress\n      action: $action\n    ) {\n      ...TransactionFields\n    }\n  }\n"): (typeof documents)["\n  \n  query GetTransactions(\n    $limit: Int\n    $offset: Int\n    $marketId: ID\n    $userAddress: String\n    $action: TransactionAction\n  ) {\n    transactions(\n      limit: $limit\n      offset: $offset\n      marketId: $marketId\n      userAddress: $userAddress\n      action: $action\n    ) {\n      ...TransactionFields\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  \n  query GetTransaction($id: ID!) {\n    transaction(id: $id) {\n      ...TransactionFields\n    }\n  }\n"): (typeof documents)["\n  \n  query GetTransaction($id: ID!) {\n    transaction(id: $id) {\n      ...TransactionFields\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query GetMarketSnapshots(\n    $marketId: ID!\n    $fromTime: DateTime\n    $toTime: DateTime\n    $limit: Int\n  ) {\n    marketSnapshots(\n      marketId: $marketId\n      fromTime: $fromTime\n      toTime: $toTime\n      limit: $limit\n    ) {\n      id\n      timestamp\n      blockHeight\n      borrowIndex\n      liquidityIndex\n      borrowRate\n      liquidityRate\n      totalSupply\n      totalDebt\n      totalCollateral\n      utilization\n      loanToValue\n      liquidationThreshold\n      enabled\n    }\n  }\n"): (typeof documents)["\n  query GetMarketSnapshots(\n    $marketId: ID!\n    $fromTime: DateTime\n    $toTime: DateTime\n    $limit: Int\n  ) {\n    marketSnapshots(\n      marketId: $marketId\n      fromTime: $fromTime\n      toTime: $toTime\n      limit: $limit\n    ) {\n      id\n      timestamp\n      blockHeight\n      borrowIndex\n      liquidityIndex\n      borrowRate\n      liquidityRate\n      totalSupply\n      totalDebt\n      totalCollateral\n      utilization\n      loanToValue\n      liquidationThreshold\n      enabled\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query GetInterestAccrualEvents(\n    $marketId: ID!\n    $fromTime: DateTime\n    $toTime: DateTime\n    $limit: Int\n  ) {\n    interestAccrualEvents(\n      marketId: $marketId\n      fromTime: $fromTime\n      toTime: $toTime\n      limit: $limit\n    ) {\n      id\n      txHash\n      timestamp\n      blockHeight\n      borrowIndex\n      liquidityIndex\n      borrowRate\n      liquidityRate\n    }\n  }\n"): (typeof documents)["\n  query GetInterestAccrualEvents(\n    $marketId: ID!\n    $fromTime: DateTime\n    $toTime: DateTime\n    $limit: Int\n  ) {\n    interestAccrualEvents(\n      marketId: $marketId\n      fromTime: $fromTime\n      toTime: $toTime\n      limit: $limit\n    ) {\n      id\n      txHash\n      timestamp\n      blockHeight\n      borrowIndex\n      liquidityIndex\n      borrowRate\n      liquidityRate\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  \n  subscription OnMarketUpdated($marketId: ID!) {\n    marketUpdated(marketId: $marketId) {\n      ...MarketFields\n    }\n  }\n"): (typeof documents)["\n  \n  subscription OnMarketUpdated($marketId: ID!) {\n    marketUpdated(marketId: $marketId) {\n      ...MarketFields\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  \n  subscription OnNewTransaction($marketId: ID) {\n    newTransaction(marketId: $marketId) {\n      ...TransactionFields\n    }\n  }\n"): (typeof documents)["\n  \n  subscription OnNewTransaction($marketId: ID) {\n    newTransaction(marketId: $marketId) {\n      ...TransactionFields\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  \n  subscription OnPositionUpdated($userAddress: String!) {\n    positionUpdated(userAddress: $userAddress) {\n      ...PositionFields\n    }\n  }\n"): (typeof documents)["\n  \n  subscription OnPositionUpdated($userAddress: String!) {\n    positionUpdated(userAddress: $userAddress) {\n      ...PositionFields\n    }\n  }\n"];

export function gql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;