import { MsgExecuteContract } from 'cosmjs-types/cosmwasm/wasm/v1/tx';
import { getFeedIdsForDenoms, getHermesUrl } from './config';

export interface PythUpdateConfig {
  pythContractAddress: string;
  mode: 'mock' | 'live';
}

/**
 * Hermes API response for price updates
 */
interface HermesPriceUpdateResponse {
  binary: {
    data: string[];
  };
  parsed?: Array<{
    id: string;
    price: {
      price: string;
      conf: string;
      expo: number;
      publish_time: number;
    };
    ema_price?: {
      price: string;
      conf: string;
      expo: number;
      publish_time: number;
    };
  }>;
}

/**
 * Build Pyth price update messages for the given denoms
 * 
 * In mock mode: returns empty array (no price updates needed)
 * In live mode: fetches fresh VAA data from Hermes and builds update messages
 * 
 * @param senderAddress - The address sending the transaction
 * @param denoms - List of token denoms that need fresh prices
 * @param config - Pyth configuration (contract address and mode)
 * @returns Array of execute messages for updating Pyth price feeds
 */
export async function buildPythUpdateMessages(
  senderAddress: string,
  denoms: string[],
  config: PythUpdateConfig
): Promise<MsgExecuteContract[]> {
  // Mock mode: no price updates needed
  if (config.mode === 'mock') {
    return [];
  }

  // Get feed IDs for the denoms
  const feedIds = getFeedIdsForDenoms(denoms);
  
  if (feedIds.length === 0) {
    console.warn('[Pyth] No price feed IDs found for denoms:', denoms);
    return [];
  }

  try {
    // Fetch price updates from Hermes
    const hermesUrl = getHermesUrl();
    const feedIdParams = feedIds.map(id => `ids[]=${encodeURIComponent(id)}`).join('&');
    const url = `${hermesUrl}/v2/updates/price/latest?${feedIdParams}`;

    console.log('[Pyth] Fetching price updates from:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Hermes API error: ${response.status} ${errorText}`);
    }

    const data: HermesPriceUpdateResponse = await response.json();

    // Validate response
    if (!data.binary?.data || data.binary.data.length === 0) {
      console.warn('[Pyth] No price update data received from Hermes');
      return [];
    }

    console.log('[Pyth] Received price updates for', data.parsed?.length || 0, 'feeds');

    // Build the update_price_feeds message
    // The message format follows the Pyth contract interface
    const msg: MsgExecuteContract = {
      sender: senderAddress,
      contract: config.pythContractAddress,
      msg: Buffer.from(
        JSON.stringify({
          update_price_feeds: {
            data: data.binary.data,
          },
        })
      ),
      funds: [
        {
          denom: 'untrn', // Pyth update fee denom (Neutron)
          amount: '1',    // Minimum fee for price updates
        },
      ],
    };

    return [msg];
  } catch (error) {
    console.error('[Pyth] Failed to fetch price updates:', error);
    
    // In case of Hermes failure, we warn but don't block the transaction
    // The on-chain prices may be stale but the transaction can still proceed
    console.warn('[Pyth] Proceeding without price updates - prices may be stale');
    return [];
  }
}

/**
 * Check if price updates are needed for the given denoms
 * Returns true if any denom has a configured Pyth feed
 */
export function hasPythFeeds(denoms: string[]): boolean {
  const feedIds = getFeedIdsForDenoms(denoms);
  return feedIds.length > 0;
}

/**
 * Get price update info without building messages
 * Useful for debugging and logging
 */
export async function getPriceUpdateInfo(
  denoms: string[],
  config: PythUpdateConfig
): Promise<{
  feedIds: string[];
  needsUpdate: boolean;
  hermesUrl: string;
}> {
  if (config.mode === 'mock') {
    return {
      feedIds: [],
      needsUpdate: false,
      hermesUrl: '',
    };
  }

  const feedIds = getFeedIdsForDenoms(denoms);
  return {
    feedIds,
    needsUpdate: feedIds.length > 0,
    hermesUrl: getHermesUrl(),
  };
}
