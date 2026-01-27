import { Event as TendermintEvent } from '@cosmjs/tendermint-rpc/build/tendermint37/responses';
import { Event as StargateEvent } from '@cosmjs/stargate';
import { MarketEvent, BlockchainEvent } from './types';
import { logger } from '../utils/logger';

/**
 * Parse event attributes from Tendermint RPC events (tendermint37 has string keys/values)
 */
export function parseEventAttributes(event: TendermintEvent): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const attr of event.attributes) {
    attributes[attr.key] = attr.value;
  }
  return attributes;
}

/**
 * Parse event attributes from Stargate events (string keys/values)
 */
export function parseEventAttributesFromStargate(event: StargateEvent): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const attr of event.attributes) {
    attributes[attr.key] = attr.value;
  }
  return attributes;
}

/**
 * Partial market created event with only the info from the factory reply.
 * The handler will need to query the market contract for additional details.
 */
export interface PartialMarketCreatedEvent {
  action: 'market_instantiated';
  marketId: string;
  marketAddress: string;
  txHash: string;
  blockHeight: number;
  timestamp: number;
  logIndex: number;
}

export function parseMarketCreatedEvent(
  attributes: Record<string, string>,
  txHash: string,
  blockHeight: number,
  timestamp: number,
  logIndex: number
): PartialMarketCreatedEvent | null {
  if (attributes.action !== 'market_instantiated') {
    return null;
  }

  // Only require market_id and market_address (emitted by factory reply)
  // Other fields will be fetched from the market contract
  if (!attributes.market_id || !attributes.market_address) {
    logger.warn('Incomplete market_instantiated event', { attributes });
    return null;
  }

  return {
    action: 'market_instantiated',
    marketId: attributes.market_id,
    marketAddress: attributes.market_address,
    txHash,
    blockHeight,
    timestamp,
    logIndex,
  };
}

export function parseMarketEvent(
  attributes: Record<string, string>,
  marketAddress: string,
  txHash: string,
  blockHeight: number,
  timestamp: number,
  logIndex: number
): MarketEvent | null {
  const action = attributes.action;

  switch (action) {
    case 'supply':
      return {
        action: 'supply',
        supplier: attributes.supplier,
        recipient: attributes.recipient,
        amount: attributes.amount,
        scaledAmount: attributes.scaled_amount,
        borrowIndex: attributes.borrow_index,
        liquidityIndex: attributes.liquidity_index,
        totalSupply: attributes.total_supply,
        totalDebt: attributes.total_debt,
        utilization: attributes.utilization,
        marketAddress,
        txHash,
        blockHeight,
        timestamp,
        logIndex,
      };

    case 'withdraw':
      return {
        action: 'withdraw',
        withdrawer: attributes.withdrawer,
        recipient: attributes.recipient,
        amount: attributes.amount,
        scaledDecrease: attributes.scaled_decrease,
        borrowIndex: attributes.borrow_index,
        liquidityIndex: attributes.liquidity_index,
        totalSupply: attributes.total_supply,
        totalDebt: attributes.total_debt,
        utilization: attributes.utilization,
        marketAddress,
        txHash,
        blockHeight,
        timestamp,
        logIndex,
      };

    case 'supply_collateral':
      return {
        action: 'supply_collateral',
        supplier: attributes.supplier,
        recipient: attributes.recipient,
        amount: attributes.amount,
        marketAddress,
        txHash,
        blockHeight,
        timestamp,
        logIndex,
      };

    case 'withdraw_collateral':
      return {
        action: 'withdraw_collateral',
        withdrawer: attributes.withdrawer,
        recipient: attributes.recipient,
        amount: attributes.amount,
        marketAddress,
        txHash,
        blockHeight,
        timestamp,
        logIndex,
      };

    case 'borrow':
      return {
        action: 'borrow',
        borrower: attributes.borrower,
        recipient: attributes.recipient,
        amount: attributes.amount,
        scaledAmount: attributes.scaled_amount,
        borrowIndex: attributes.borrow_index,
        liquidityIndex: attributes.liquidity_index,
        totalSupply: attributes.total_supply,
        totalDebt: attributes.total_debt,
        utilization: attributes.utilization,
        marketAddress,
        txHash,
        blockHeight,
        timestamp,
        logIndex,
      };

    case 'repay':
      return {
        action: 'repay',
        repayer: attributes.repayer,
        borrower: attributes.borrower,
        amount: attributes.amount,
        scaledDecrease: attributes.scaled_decrease,
        borrowIndex: attributes.borrow_index,
        liquidityIndex: attributes.liquidity_index,
        totalSupply: attributes.total_supply,
        totalDebt: attributes.total_debt,
        utilization: attributes.utilization,
        marketAddress,
        txHash,
        blockHeight,
        timestamp,
        logIndex,
      };

    case 'liquidate':
      return {
        action: 'liquidate',
        liquidator: attributes.liquidator,
        borrower: attributes.borrower,
        debtRepaid: attributes.debt_repaid,
        collateralSeized: attributes.collateral_seized,
        protocolFee: attributes.protocol_fee,
        scaledDebtDecrease: attributes.scaled_debt_decrease,
        borrowIndex: attributes.borrow_index,
        liquidityIndex: attributes.liquidity_index,
        totalSupply: attributes.total_supply,
        totalDebt: attributes.total_debt,
        totalCollateral: attributes.total_collateral,
        utilization: attributes.utilization,
        marketAddress,
        txHash,
        blockHeight,
        timestamp,
        logIndex,
      };

    case 'accrue_interest':
      return {
        action: 'accrue_interest',
        borrowIndex: attributes.borrow_index,
        liquidityIndex: attributes.liquidity_index,
        borrowRate: attributes.borrow_rate,
        liquidityRate: attributes.liquidity_rate,
        lastUpdate: attributes.last_update,
        marketAddress,
        txHash,
        blockHeight,
        timestamp,
        logIndex,
      };

    case 'update_params':
      return {
        action: 'update_params',
        marketAddress,
        finalLtv: attributes.final_ltv,
        finalLiquidationThreshold: attributes.final_liquidation_threshold,
        finalLiquidationBonus: attributes.final_liquidation_bonus,
        finalLiquidationProtocolFee: attributes.final_liquidation_protocol_fee,
        finalCloseFactor: attributes.final_close_factor,
        finalProtocolFee: attributes.final_protocol_fee,
        finalCuratorFee: attributes.final_curator_fee,
        finalSupplyCap: attributes.final_supply_cap,
        finalBorrowCap: attributes.final_borrow_cap,
        finalEnabled: attributes.final_enabled,
        finalIsMutable: attributes.final_is_mutable,
        txHash,
        blockHeight,
        timestamp,
        logIndex,
      };

    default:
      return null;
  }
}

export function parseBlockchainEvent(
  event: TendermintEvent,
  txHash: string,
  blockHeight: number,
  timestamp: number,
  logIndex: number
): BlockchainEvent {
  const attributes = parseEventAttributes(event);
  return {
    type: event.type,
    attributes,
    txHash,
    blockHeight,
    timestamp,
    logIndex,
  };
}
