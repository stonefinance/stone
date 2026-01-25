import { ADDRESSES, DECIMALS, generateTxHash } from './fixtures';
import type {
  SupplyEvent,
  WithdrawEvent,
  SupplyCollateralEvent,
  WithdrawCollateralEvent,
  BorrowEvent,
  RepayEvent,
  LiquidateEvent,
  AccrueInterestEvent,
  UpdateParamsEvent,
} from '../../src/events/types';
import type { PartialMarketCreatedEvent } from '../../src/events/parser';

// Base event metadata
export interface EventMetadata {
  txHash?: string;
  blockHeight?: number;
  timestamp?: number;
  logIndex?: number;
}

function getMetadata(overrides: EventMetadata = {}) {
  return {
    txHash: overrides.txHash ?? generateTxHash(),
    blockHeight: overrides.blockHeight ?? 12345,
    timestamp: overrides.timestamp ?? Math.floor(Date.now() / 1000),
    logIndex: overrides.logIndex ?? 0,
  };
}

// Create a market created event
export function createMarketCreatedEvent(
  overrides: Partial<PartialMarketCreatedEvent> & EventMetadata = {}
): PartialMarketCreatedEvent {
  const meta = getMetadata(overrides);
  return {
    action: 'market_instantiated',
    marketId: overrides.marketId ?? '1',
    marketAddress: overrides.marketAddress ?? ADDRESSES.market1,
    ...meta,
  };
}

// Create a supply event
export function createSupplyEvent(
  overrides: Partial<Omit<SupplyEvent, 'action'>> & EventMetadata = {}
): SupplyEvent {
  const meta = getMetadata(overrides);
  return {
    action: 'supply',
    supplier: overrides.supplier ?? ADDRESSES.userA,
    recipient: overrides.recipient ?? overrides.supplier ?? ADDRESSES.userA,
    amount: overrides.amount ?? DECIMALS.oneToken,
    scaledAmount: overrides.scaledAmount ?? DECIMALS.oneToken,
    totalSupply: overrides.totalSupply ?? DECIMALS.oneToken,
    totalDebt: overrides.totalDebt ?? DECIMALS.zero,
    utilization: overrides.utilization ?? DECIMALS.zeroUtilization,
    marketAddress: overrides.marketAddress ?? ADDRESSES.market1,
    ...meta,
  };
}

// Create a withdraw event
export function createWithdrawEvent(
  overrides: Partial<Omit<WithdrawEvent, 'action'>> & EventMetadata = {}
): WithdrawEvent {
  const meta = getMetadata(overrides);
  return {
    action: 'withdraw',
    withdrawer: overrides.withdrawer ?? ADDRESSES.userA,
    recipient: overrides.recipient ?? overrides.withdrawer ?? ADDRESSES.userA,
    amount: overrides.amount ?? DECIMALS.oneToken,
    scaledDecrease: overrides.scaledDecrease ?? DECIMALS.oneToken,
    totalSupply: overrides.totalSupply ?? DECIMALS.zero,
    totalDebt: overrides.totalDebt ?? DECIMALS.zero,
    utilization: overrides.utilization ?? DECIMALS.zeroUtilization,
    marketAddress: overrides.marketAddress ?? ADDRESSES.market1,
    ...meta,
  };
}

// Create a supply collateral event
export function createSupplyCollateralEvent(
  overrides: Partial<Omit<SupplyCollateralEvent, 'action'>> & EventMetadata = {}
): SupplyCollateralEvent {
  const meta = getMetadata(overrides);
  return {
    action: 'supply_collateral',
    supplier: overrides.supplier ?? ADDRESSES.userA,
    recipient: overrides.recipient ?? overrides.supplier ?? ADDRESSES.userA,
    amount: overrides.amount ?? DECIMALS.oneToken,
    marketAddress: overrides.marketAddress ?? ADDRESSES.market1,
    ...meta,
  };
}

// Create a withdraw collateral event
export function createWithdrawCollateralEvent(
  overrides: Partial<Omit<WithdrawCollateralEvent, 'action'>> & EventMetadata = {}
): WithdrawCollateralEvent {
  const meta = getMetadata(overrides);
  return {
    action: 'withdraw_collateral',
    withdrawer: overrides.withdrawer ?? ADDRESSES.userA,
    recipient: overrides.recipient ?? overrides.withdrawer ?? ADDRESSES.userA,
    amount: overrides.amount ?? DECIMALS.oneToken,
    marketAddress: overrides.marketAddress ?? ADDRESSES.market1,
    ...meta,
  };
}

// Create a borrow event
export function createBorrowEvent(
  overrides: Partial<Omit<BorrowEvent, 'action'>> & EventMetadata = {}
): BorrowEvent {
  const meta = getMetadata(overrides);
  return {
    action: 'borrow',
    borrower: overrides.borrower ?? ADDRESSES.userA,
    recipient: overrides.recipient ?? overrides.borrower ?? ADDRESSES.userA,
    amount: overrides.amount ?? DECIMALS.oneToken,
    scaledAmount: overrides.scaledAmount ?? DECIMALS.oneToken,
    totalSupply: overrides.totalSupply ?? DECIMALS.thousand,
    totalDebt: overrides.totalDebt ?? DECIMALS.oneToken,
    utilization: overrides.utilization ?? DECIMALS.tenPercentUtilization,
    marketAddress: overrides.marketAddress ?? ADDRESSES.market1,
    ...meta,
  };
}

// Create a repay event
export function createRepayEvent(
  overrides: Partial<Omit<RepayEvent, 'action'>> & EventMetadata = {}
): RepayEvent {
  const meta = getMetadata(overrides);
  return {
    action: 'repay',
    repayer: overrides.repayer ?? ADDRESSES.userA,
    borrower: overrides.borrower ?? overrides.repayer ?? ADDRESSES.userA,
    amount: overrides.amount ?? DECIMALS.oneToken,
    scaledDecrease: overrides.scaledDecrease ?? DECIMALS.oneToken,
    totalSupply: overrides.totalSupply ?? DECIMALS.thousand,
    totalDebt: overrides.totalDebt ?? DECIMALS.zero,
    utilization: overrides.utilization ?? DECIMALS.zeroUtilization,
    marketAddress: overrides.marketAddress ?? ADDRESSES.market1,
    ...meta,
  };
}

// Create a liquidate event
export function createLiquidateEvent(
  overrides: Partial<Omit<LiquidateEvent, 'action'>> & EventMetadata = {}
): LiquidateEvent {
  const meta = getMetadata(overrides);
  return {
    action: 'liquidate',
    liquidator: overrides.liquidator ?? ADDRESSES.liquidator,
    borrower: overrides.borrower ?? ADDRESSES.userA,
    debtRepaid: overrides.debtRepaid ?? DECIMALS.oneToken,
    collateralSeized: overrides.collateralSeized ?? DECIMALS.oneToken,
    protocolFee: overrides.protocolFee ?? DECIMALS.dust,
    scaledDebtDecrease: overrides.scaledDebtDecrease ?? DECIMALS.oneToken,
    totalSupply: overrides.totalSupply ?? DECIMALS.thousand,
    totalDebt: overrides.totalDebt ?? DECIMALS.zero,
    totalCollateral: overrides.totalCollateral ?? DECIMALS.zero,
    utilization: overrides.utilization ?? DECIMALS.zeroUtilization,
    marketAddress: overrides.marketAddress ?? ADDRESSES.market1,
    ...meta,
  };
}

// Create an accrue interest event
export function createAccrueInterestEvent(
  overrides: Partial<Omit<AccrueInterestEvent, 'action'>> & EventMetadata = {}
): AccrueInterestEvent {
  const meta = getMetadata(overrides);
  return {
    action: 'accrue_interest',
    borrowIndex: overrides.borrowIndex ?? '1.05',
    liquidityIndex: overrides.liquidityIndex ?? '1.03',
    borrowRate: overrides.borrowRate ?? '0.05',
    liquidityRate: overrides.liquidityRate ?? '0.03',
    lastUpdate: overrides.lastUpdate ?? String(meta.timestamp),
    marketAddress: overrides.marketAddress ?? ADDRESSES.market1,
    ...meta,
  };
}

// Create an update params event
export function createUpdateParamsEvent(
  overrides: Partial<Omit<UpdateParamsEvent, 'action'>> & EventMetadata = {}
): UpdateParamsEvent {
  const meta = getMetadata(overrides);
  return {
    action: 'update_params',
    marketAddress: overrides.marketAddress ?? ADDRESSES.market1,
    finalLtv: overrides.finalLtv ?? '0.8',
    finalLiquidationThreshold: overrides.finalLiquidationThreshold ?? '0.85',
    finalLiquidationBonus: overrides.finalLiquidationBonus ?? '0.05',
    finalLiquidationProtocolFee: overrides.finalLiquidationProtocolFee ?? '0.1',
    finalCloseFactor: overrides.finalCloseFactor ?? '0.5',
    finalProtocolFee: overrides.finalProtocolFee ?? '0.1',
    finalCuratorFee: overrides.finalCuratorFee ?? '0.05',
    finalSupplyCap: overrides.finalSupplyCap,
    finalBorrowCap: overrides.finalBorrowCap,
    finalEnabled: overrides.finalEnabled ?? 'true',
    finalIsMutable: overrides.finalIsMutable ?? 'true',
    ...meta,
  };
}

// Convert event to raw attributes (as would come from blockchain)
export function eventToRawAttributes(
  event: SupplyEvent | WithdrawEvent | BorrowEvent | RepayEvent | LiquidateEvent
): Record<string, string> {
  const attrs: Record<string, string> = {
    action: event.action,
  };

  if ('supplier' in event) {
    attrs.supplier = event.supplier;
    attrs.recipient = event.recipient;
  }
  if ('withdrawer' in event) {
    attrs.withdrawer = event.withdrawer;
    attrs.recipient = event.recipient;
  }
  if ('borrower' in event && 'repayer' in event) {
    attrs.repayer = event.repayer;
    attrs.borrower = event.borrower;
  } else if ('borrower' in event && !('liquidator' in event)) {
    attrs.borrower = event.borrower;
    attrs.recipient = event.recipient;
  }
  if ('liquidator' in event) {
    attrs.liquidator = event.liquidator;
    attrs.borrower = event.borrower;
    attrs.debt_repaid = event.debtRepaid;
    attrs.collateral_seized = event.collateralSeized;
    attrs.protocol_fee = event.protocolFee;
    attrs.scaled_debt_decrease = event.scaledDebtDecrease;
    attrs.total_collateral = event.totalCollateral;
  }
  if ('amount' in event) {
    attrs.amount = event.amount;
  }
  if ('scaledAmount' in event) {
    attrs.scaled_amount = event.scaledAmount;
  }
  if ('scaledDecrease' in event) {
    attrs.scaled_decrease = event.scaledDecrease;
  }
  if ('totalSupply' in event) {
    attrs.total_supply = event.totalSupply;
  }
  if ('totalDebt' in event) {
    attrs.total_debt = event.totalDebt;
  }
  if ('utilization' in event) {
    attrs.utilization = event.utilization;
  }

  return attrs;
}
