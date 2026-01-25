import { expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { prisma } from '../../src/db/client';

// Helper to compare decimal values properly (handles scientific notation)
export function decimalEquals(actual: Decimal | { toString: () => string } | null | undefined, expected: string): boolean {
  if (actual === null || actual === undefined) return false;
  const actualDec = new Decimal(actual.toString());
  const expectedDec = new Decimal(expected);
  return actualDec.equals(expectedDec);
}

// Assertion helper for decimal comparison - use this instead of .toBe() for decimals
export function expectDecimalEquals(actual: Decimal | { toString: () => string } | null | undefined, expected: string): void {
  const actualStr = actual?.toString() ?? 'null';
  const equals = decimalEquals(actual, expected);
  if (!equals) {
    const actualDec = actual ? new Decimal(actual.toString()) : null;
    expect.fail(`Expected decimal ${actualStr} (${actualDec?.toFixed()}) to equal ${expected}`);
  }
}

// Assert market state
export async function assertMarketState(
  marketId: string,
  expected: {
    totalSupplyScaled?: string;
    totalDebtScaled?: string;
    totalCollateral?: string;
    borrowIndex?: string;
    liquidityIndex?: string;
    borrowRate?: string;
    liquidityRate?: string;
  }
) {
  const market = await prisma.market.findUnique({ where: { id: marketId } });
  expect(market).not.toBeNull();

  if (expected.totalSupplyScaled !== undefined) {
    expect(decimalEquals(market!.totalSupplyScaled, expected.totalSupplyScaled)).toBe(true);
  }
  if (expected.totalDebtScaled !== undefined) {
    expect(decimalEquals(market!.totalDebtScaled, expected.totalDebtScaled)).toBe(true);
  }
  if (expected.totalCollateral !== undefined) {
    expect(decimalEquals(market!.totalCollateral, expected.totalCollateral)).toBe(true);
  }
  if (expected.borrowIndex !== undefined) {
    expect(decimalEquals(market!.borrowIndex, expected.borrowIndex)).toBe(true);
  }
  if (expected.liquidityIndex !== undefined) {
    expect(decimalEquals(market!.liquidityIndex, expected.liquidityIndex)).toBe(true);
  }
  if (expected.borrowRate !== undefined) {
    expect(decimalEquals(market!.borrowRate, expected.borrowRate)).toBe(true);
  }
  if (expected.liquidityRate !== undefined) {
    expect(decimalEquals(market!.liquidityRate, expected.liquidityRate)).toBe(true);
  }
}

// Assert user position state
export async function assertPositionState(
  marketId: string,
  userAddress: string,
  expected: {
    supplyScaled?: string;
    debtScaled?: string;
    collateral?: string;
    exists?: boolean;
  }
) {
  const positionId = `${marketId}:${userAddress}`;
  const position = await prisma.userPosition.findUnique({ where: { id: positionId } });

  if (expected.exists === false) {
    expect(position).toBeNull();
    return;
  }

  expect(position).not.toBeNull();

  if (expected.supplyScaled !== undefined) {
    expect(decimalEquals(position!.supplyScaled, expected.supplyScaled)).toBe(true);
  }
  if (expected.debtScaled !== undefined) {
    expect(decimalEquals(position!.debtScaled, expected.debtScaled)).toBe(true);
  }
  if (expected.collateral !== undefined) {
    expect(decimalEquals(position!.collateral, expected.collateral)).toBe(true);
  }
}

// Assert transaction was created
export async function assertTransactionCreated(
  txHash: string,
  logIndex: number,
  expected: {
    action: string;
    marketId: string;
    userAddress: string;
    amount?: string;
    scaledAmount?: string;
    recipient?: string;
    liquidator?: string;
    borrower?: string;
    debtRepaid?: string;
    collateralSeized?: string;
    protocolFee?: string;
  }
) {
  const txId = `${txHash}:${logIndex}`;
  const transaction = await prisma.transaction.findUnique({ where: { id: txId } });

  expect(transaction).not.toBeNull();
  expect(transaction!.action).toBe(expected.action);
  expect(transaction!.marketId).toBe(expected.marketId);
  expect(transaction!.userAddress).toBe(expected.userAddress);

  if (expected.amount !== undefined) {
    expect(transaction!.amount?.toString()).toBe(expected.amount);
  }
  if (expected.scaledAmount !== undefined) {
    expect(transaction!.scaledAmount?.toString()).toBe(expected.scaledAmount);
  }
  if (expected.recipient !== undefined) {
    expect(transaction!.recipient).toBe(expected.recipient);
  }
  if (expected.liquidator !== undefined) {
    expect(transaction!.liquidator).toBe(expected.liquidator);
  }
  if (expected.borrower !== undefined) {
    expect(transaction!.borrower).toBe(expected.borrower);
  }
  if (expected.debtRepaid !== undefined) {
    expect(transaction!.debtRepaid?.toString()).toBe(expected.debtRepaid);
  }
  if (expected.collateralSeized !== undefined) {
    expect(transaction!.collateralSeized?.toString()).toBe(expected.collateralSeized);
  }
  if (expected.protocolFee !== undefined) {
    expect(transaction!.protocolFee?.toString()).toBe(expected.protocolFee);
  }
}

// Assert interest accrual event was created
export async function assertInterestAccrualCreated(
  txHash: string,
  logIndex: number,
  expected: {
    marketId: string;
    borrowIndex: string;
    liquidityIndex: string;
    borrowRate: string;
    liquidityRate: string;
  }
) {
  const eventId = `${txHash}:${logIndex}`;
  const event = await prisma.interestAccrualEvent.findUnique({ where: { id: eventId } });

  expect(event).not.toBeNull();
  expect(event!.marketId).toBe(expected.marketId);
  expect(event!.borrowIndex.toString()).toBe(expected.borrowIndex);
  expect(event!.liquidityIndex.toString()).toBe(expected.liquidityIndex);
  expect(event!.borrowRate.toString()).toBe(expected.borrowRate);
  expect(event!.liquidityRate.toString()).toBe(expected.liquidityRate);
}

// Assert market snapshot was created
export async function assertMarketSnapshotCreated(
  marketId: string,
  timestamp: number,
  expected: {
    loanToValue?: string;
    liquidationThreshold?: string;
    enabled?: boolean;
  }
) {
  const snapshotId = `${marketId}:${timestamp}`;
  const snapshot = await prisma.marketSnapshot.findUnique({ where: { id: snapshotId } });

  expect(snapshot).not.toBeNull();

  if (expected.loanToValue !== undefined) {
    expect(snapshot!.loanToValue.toString()).toBe(expected.loanToValue);
  }
  if (expected.liquidationThreshold !== undefined) {
    expect(snapshot!.liquidationThreshold.toString()).toBe(expected.liquidationThreshold);
  }
  if (expected.enabled !== undefined) {
    expect(snapshot!.enabled).toBe(expected.enabled);
  }
}

// Assert no transaction exists
export async function assertNoTransaction(txHash: string, logIndex: number) {
  const txId = `${txHash}:${logIndex}`;
  const transaction = await prisma.transaction.findUnique({ where: { id: txId } });
  expect(transaction).toBeNull();
}

// Assert total count of records
export async function assertRecordCount(
  table: 'market' | 'userPosition' | 'transaction' | 'marketSnapshot' | 'interestAccrualEvent',
  expectedCount: number
) {
  let count: number;
  switch (table) {
    case 'market':
      count = await prisma.market.count();
      break;
    case 'userPosition':
      count = await prisma.userPosition.count();
      break;
    case 'transaction':
      count = await prisma.transaction.count();
      break;
    case 'marketSnapshot':
      count = await prisma.marketSnapshot.count();
      break;
    case 'interestAccrualEvent':
      count = await prisma.interestAccrualEvent.count();
      break;
  }
  expect(count).toBe(expectedCount);
}

// Compare two decimal values with tolerance
export function assertDecimalClose(
  actual: Decimal | string,
  expected: string,
  tolerance: string = '0.000000000000000001'
) {
  const actualDec = new Decimal(actual.toString());
  const expectedDec = new Decimal(expected);
  const toleranceDec = new Decimal(tolerance);

  const diff = actualDec.minus(expectedDec).abs();
  expect(diff.lte(toleranceDec)).toBe(true);
}
