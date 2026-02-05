import { PYTH_HERMES_URL, PYTH_FEED_ID_TO_DENOM } from './config';

export interface PythPrice {
  price: number;      // USD price
  confidence: number; // confidence interval
  expo: number;       // exponent
  publishTime: number;
}

interface PythPriceResponse {
  parsed: Array<{
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
  binary?: {
    data: string[];
    encoding: string;
  };
}

/**
 * Fetch latest prices from Pyth Hermes API
 * @param feedIds Array of Pyth feed IDs to fetch
 * @returns Map of feedId -> PythPrice
 */
export async function fetchPythPrices(feedIds: string[]): Promise<Map<string, PythPrice>> {
  if (feedIds.length === 0) {
    return new Map();
  }

  const params = feedIds.map((id) => `ids[]=${encodeURIComponent(id)}`).join('&');
  const url = `${PYTH_HERMES_URL}/v2/updates/price/latest?${params}`;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Pyth API error: ${response.status} ${response.statusText}`);
  }

  const data: PythPriceResponse = await response.json();
  const prices = new Map<string, PythPrice>();

  for (const entry of data.parsed || []) {
    const priceData = entry.price;
    
    // Convert: actualPrice = price * 10^expo
    const rawPrice = BigInt(priceData.price);
    const expo = priceData.expo;
    const confidence = BigInt(priceData.conf);
    
    // Calculate actual price: rawPrice * 10^expo
    const actualPrice = Number(rawPrice) * Math.pow(10, expo);
    const actualConfidence = Number(confidence) * Math.pow(10, expo);

    prices.set(entry.id, {
      price: actualPrice,
      confidence: actualConfidence,
      expo: expo,
      publishTime: priceData.publish_time,
    });
  }

  return prices;
}

/**
 * Get price by denom instead of feed ID
 * @param denoms Array of token denoms (e.g., 'uatom', 'uusdc')
 * @returns Map of denom -> PythPrice
 */
export async function fetchPythPricesByDenom(
  denoms: string[],
  feedIdMap: Record<string, string>
): Promise<Map<string, PythPrice>> {
  const feedIds = denoms
    .map((denom) => feedIdMap[denom])
    .filter(Boolean);

  const pricesByFeedId = await fetchPythPrices(feedIds);
  
  // Convert feed IDs back to denoms
  const pricesByDenom = new Map<string, PythPrice>();
  for (const [feedId, price] of pricesByFeedId.entries()) {
    const denom = PYTH_FEED_ID_TO_DENOM[feedId];
    if (denom) {
      pricesByDenom.set(denom, price);
    }
  }

  return pricesByDenom;
}

/**
 * Format a Pyth price with confidence interval
 * @param price PythPrice object
 * @param decimals Number of decimal places to show
 * @returns Formatted price string with confidence
 */
export function formatPriceWithConfidence(
  price: PythPrice,
  decimals: number = 4
): string {
  const lower = price.price - price.confidence;
  const upper = price.price + price.confidence;
  
  return `$${price.price.toFixed(decimals)} (${lower.toFixed(decimals)} - ${upper.toFixed(decimals)})`;
}

/**
 * Format timestamp to relative time string
 * @param timestamp Unix timestamp in seconds
 * @returns Relative time string (e.g., "2 mins ago")
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) {
    return 'just now';
  } else if (diff < 3600) {
    const mins = Math.floor(diff / 60);
    return `${mins} min${mins > 1 ? 's' : ''} ago`;
  } else if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else {
    const days = Math.floor(diff / 86400);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
}
