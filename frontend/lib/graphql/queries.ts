import { gql } from '@apollo/client';

// ============================================================================
// Market Fragments
// ============================================================================

export const MARKET_FIELDS = gql`
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

export const MARKET_SUMMARY_FIELDS = gql`
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

// ============================================================================
// Position Fragments
// ============================================================================

export const POSITION_FIELDS = gql`
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

// ============================================================================
// Transaction Fragments
// ============================================================================

export const TRANSACTION_FIELDS = gql`
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

// ============================================================================
// Market Queries
// ============================================================================

export const GET_MARKETS = gql`
  ${MARKET_SUMMARY_FIELDS}
  query GetMarkets(
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
      ...MarketSummaryFields
    }
  }
`;

export const GET_MARKET = gql`
  ${MARKET_FIELDS}
  query GetMarket($id: ID!) {
    market(id: $id) {
      ...MarketFields
    }
  }
`;

export const GET_MARKET_BY_ADDRESS = gql`
  ${MARKET_FIELDS}
  query GetMarketByAddress($address: String!) {
    marketByAddress(address: $address) {
      ...MarketFields
    }
  }
`;

export const GET_MARKET_COUNT = gql`
  query GetMarketCount {
    marketCount
  }
`;

// ============================================================================
// User Position Queries
// ============================================================================

export const GET_USER_POSITION = gql`
  ${POSITION_FIELDS}
  query GetUserPosition($marketId: ID!, $userAddress: String!) {
    userPosition(marketId: $marketId, userAddress: $userAddress) {
      ...PositionFields
    }
  }
`;

export const GET_USER_POSITIONS = gql`
  ${POSITION_FIELDS}
  query GetUserPositions($userAddress: String!, $hasDebt: Boolean) {
    userPositions(userAddress: $userAddress, hasDebt: $hasDebt) {
      ...PositionFields
    }
  }
`;

export const GET_LIQUIDATABLE_POSITIONS = gql`
  ${POSITION_FIELDS}
  query GetLiquidatablePositions($limit: Int, $offset: Int) {
    liquidatablePositions(limit: $limit, offset: $offset) {
      ...PositionFields
    }
  }
`;

// ============================================================================
// Transaction Queries
// ============================================================================

export const GET_TRANSACTIONS = gql`
  ${TRANSACTION_FIELDS}
  query GetTransactions(
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
      ...TransactionFields
    }
  }
`;

export const GET_TRANSACTION = gql`
  ${TRANSACTION_FIELDS}
  query GetTransaction($id: ID!) {
    transaction(id: $id) {
      ...TransactionFields
    }
  }
`;

// ============================================================================
// Historical Data Queries
// ============================================================================

export const GET_MARKET_SNAPSHOTS = gql`
  query GetMarketSnapshots(
    $marketId: ID!
    $fromTime: DateTime
    $toTime: DateTime
    $limit: Int
  ) {
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

export const GET_INTEREST_ACCRUAL_EVENTS = gql`
  query GetInterestAccrualEvents(
    $marketId: ID!
    $fromTime: DateTime
    $toTime: DateTime
    $limit: Int
  ) {
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

// ============================================================================
// Subscriptions
// ============================================================================

export const MARKET_UPDATED_SUBSCRIPTION = gql`
  ${MARKET_FIELDS}
  subscription OnMarketUpdated($marketId: ID!) {
    marketUpdated(marketId: $marketId) {
      ...MarketFields
    }
  }
`;

export const NEW_TRANSACTION_SUBSCRIPTION = gql`
  ${TRANSACTION_FIELDS}
  subscription OnNewTransaction($marketId: ID) {
    newTransaction(marketId: $marketId) {
      ...TransactionFields
    }
  }
`;

export const POSITION_UPDATED_SUBSCRIPTION = gql`
  ${POSITION_FIELDS}
  subscription OnPositionUpdated($userAddress: String!) {
    positionUpdated(userAddress: $userAddress) {
      ...PositionFields
    }
  }
`;
