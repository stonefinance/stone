// Event types emitted by Factory and Market contracts

export interface BlockchainEvent {
  type: string;
  attributes: Record<string, string>;
  txHash: string;
  blockHeight: number;
  timestamp: number;
  logIndex: number;
}

// ============================================================================
// Factory Events
// ============================================================================

export interface MarketCreatedEvent {
  action: 'market_instantiated';
  marketId: string;
  marketAddress: string;
  curator: string;
  collateralDenom: string;
  debtDenom: string;
  oracle: string;
  txHash: string;
  blockHeight: number;
  timestamp: number;
  logIndex: number;
}

// ============================================================================
// Market Events
// ============================================================================

export interface SupplyEvent {
  action: 'supply';
  supplier: string;
  recipient: string;
  amount: string;
  scaledAmount: string;
  totalSupply: string;
  totalDebt: string;
  utilization: string;
  marketAddress: string;
  txHash: string;
  blockHeight: number;
  timestamp: number;
  logIndex: number;
}

export interface WithdrawEvent {
  action: 'withdraw';
  withdrawer: string;
  recipient: string;
  amount: string;
  scaledDecrease: string;
  totalSupply: string;
  totalDebt: string;
  utilization: string;
  marketAddress: string;
  txHash: string;
  blockHeight: number;
  timestamp: number;
  logIndex: number;
}

export interface SupplyCollateralEvent {
  action: 'supply_collateral';
  supplier: string;
  recipient: string;
  amount: string;
  totalCollateral: string;
  marketAddress: string;
  txHash: string;
  blockHeight: number;
  timestamp: number;
  logIndex: number;
}

export interface WithdrawCollateralEvent {
  action: 'withdraw_collateral';
  withdrawer: string;
  recipient: string;
  amount: string;
  totalCollateral: string;
  marketAddress: string;
  txHash: string;
  blockHeight: number;
  timestamp: number;
  logIndex: number;
}

export interface BorrowEvent {
  action: 'borrow';
  borrower: string;
  recipient: string;
  amount: string;
  scaledAmount: string;
  totalSupply: string;
  totalDebt: string;
  utilization: string;
  marketAddress: string;
  txHash: string;
  blockHeight: number;
  timestamp: number;
  logIndex: number;
}

export interface RepayEvent {
  action: 'repay';
  repayer: string;
  borrower: string;
  amount: string;
  scaledDecrease: string;
  totalSupply: string;
  totalDebt: string;
  utilization: string;
  marketAddress: string;
  txHash: string;
  blockHeight: number;
  timestamp: number;
  logIndex: number;
}

export interface LiquidateEvent {
  action: 'liquidate';
  liquidator: string;
  borrower: string;
  debtRepaid: string;
  collateralSeized: string;
  protocolFee: string;
  scaledDebtDecrease: string;
  totalSupply: string;
  totalDebt: string;
  totalCollateral: string;
  utilization: string;
  marketAddress: string;
  txHash: string;
  blockHeight: number;
  timestamp: number;
  logIndex: number;
}

export interface AccrueInterestEvent {
  action: 'accrue_interest';
  borrowIndex: string;
  liquidityIndex: string;
  borrowRate: string;
  liquidityRate: string;
  lastUpdate: string;
  marketAddress: string;
  txHash: string;
  blockHeight: number;
  timestamp: number;
  logIndex: number;
}

export interface UpdateParamsEvent {
  action: 'update_params';
  marketAddress: string;
  finalLtv: string;
  finalLiquidationThreshold: string;
  finalLiquidationBonus: string;
  finalLiquidationProtocolFee: string;
  finalCloseFactor: string;
  finalProtocolFee: string;
  finalCuratorFee: string;
  finalSupplyCap?: string;
  finalBorrowCap?: string;
  finalEnabled: string;
  finalIsMutable: string;
  txHash: string;
  blockHeight: number;
  timestamp: number;
  logIndex: number;
}

export type MarketEvent =
  | SupplyEvent
  | WithdrawEvent
  | SupplyCollateralEvent
  | WithdrawCollateralEvent
  | BorrowEvent
  | RepayEvent
  | LiquidateEvent
  | AccrueInterestEvent
  | UpdateParamsEvent;

export type IndexerEvent = MarketCreatedEvent | MarketEvent;
