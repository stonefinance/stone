import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { ExecuteInstruction, ExecuteResult } from '@cosmjs/cosmwasm-stargate';
import { Coin } from '@cosmjs/amino';
import { buildPythUpdateMessages, PythUpdateConfig } from './messages';
import { getFeedIdsForDenoms } from './config';

/**
 * Extended ExecuteInstruction that includes optional funds
 * This matches the interface expected by SigningCosmWasmClient
 */
interface ExtendedExecuteInstruction extends ExecuteInstruction {
  funds?: readonly Coin[];
}

/**
 * Execute a transaction with Pyth price updates bundled
 * 
 * This function:
 * 1. Builds price update messages for the relevant denoms
 * 2. Prepends them to the user's transaction messages
 * 3. Executes all messages atomically as a multi-msg transaction
 * 
 * @param client - The SigningCosmWasmClient instance
 * @param senderAddress - The address sending the transaction
 * @param messages - The user's actual transaction messages
 * @param relevantDenoms - Token denoms that need fresh prices
 * @param pythConfig - Pyth configuration
 * @returns The transaction result
 */
export async function executeWithPriceUpdate(
  client: SigningCosmWasmClient,
  senderAddress: string,
  messages: ExtendedExecuteInstruction[],
  relevantDenoms: string[],
  pythConfig: PythUpdateConfig,
): Promise<ExecuteResult> {
  // Build price update messages for relevant denoms
  const priceUpdateMessages = await buildPythUpdateMessages(
    senderAddress,
    relevantDenoms,
    pythConfig
  );

  // Convert price update messages to ExecuteInstruction format
  const priceUpdateInstructions: ExtendedExecuteInstruction[] = priceUpdateMessages.map(
    (msg) => ({
      contractAddress: msg.contract,
      msg: JSON.parse(Buffer.from(msg.msg).toString()).update_price_feeds,
      funds: msg.funds as Coin[],
    })
  );

  // Prepend price updates to the user's messages
  const allMessages: ExtendedExecuteInstruction[] = [
    ...priceUpdateInstructions,
    ...messages,
  ];

  if (priceUpdateMessages.length > 0) {
    console.log('[Pyth] Bundling', priceUpdateMessages.length, 'price update(s) with transaction');
  }

  // Execute as multi-msg transaction
  // Note: executeMultiple is available in @cosmjs/cosmwasm-stargate
  return client.executeMultiple(senderAddress, allMessages, 'auto');
}

/**
 * Execute a single message with Pyth price updates
 * Convenience wrapper for the common case of a single transaction
 */
export async function executeSingleWithPriceUpdate(
  client: SigningCosmWasmClient,
  senderAddress: string,
  contractAddress: string,
  msg: Record<string, unknown>,
  funds: readonly Coin[] | undefined,
  relevantDenoms: string[],
  pythConfig: PythUpdateConfig,
): Promise<ExecuteResult> {
  const instruction: ExtendedExecuteInstruction = {
    contractAddress,
    msg,
    funds: funds as Coin[] | undefined,
  };

  return executeWithPriceUpdate(
    client,
    senderAddress,
    [instruction],
    relevantDenoms,
    pythConfig
  );
}

/**
 * Get relevant denoms for a market operation
 * For most operations, both collateral and debt prices are needed
 * because health factor calculations require both
 * 
 * @param operation - The operation type (supply, withdraw, borrow, repay, liquidate)
 * @param collateralDenom - The collateral token denom
 * @param debtDenom - The debt token denom
 * @returns Array of denoms that need fresh prices
 */
export function getRelevantDenoms(
  operation: string,
  collateralDenom: string,
  debtDenom: string
): string[] {
  // All operations need both prices for health factor calculations
  // Supply/withdraw affect collateral value
  // Borrow/repay affect debt value
  // Both are needed for accurate health factor
  const denoms = new Set<string>([collateralDenom, debtDenom]);
  
  return Array.from(denoms).filter(Boolean);
}

/**
 * Check if price updates should be attempted for the given denoms
 */
export function shouldAttemptPriceUpdates(
  denoms: string[],
  pythConfig: PythUpdateConfig
): boolean {
  if (pythConfig.mode === 'mock') {
    return false;
  }

  const feedIds = getFeedIdsForDenoms(denoms);
  return feedIds.length > 0;
}
