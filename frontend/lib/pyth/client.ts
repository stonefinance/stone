import { PYTH_HERMES_URL, PYTH_FEED_ID_TO_DENOM } from './config';

export interface PythPrice {
  /** USD price (human-readable, e.g. 10.52) */
  price: number;
  /** Confidence interval in same units as price */
  confidence: number;
  /** Original exponent from the feed */
  expo: number;
  /** Unix timestamp (seconds) when the price was published */
  publishTime: number;
}

interface HermesParsedEntry {
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
}

interface HermesResponse {
  parsed: HermesParsedEntry[];
  binary?: {
    data: string[];
    encoding: string;
  };
}

/** Default timeout for Hermes fetch calls (10 seconds). */
const HERMES_FETCH_TIMEOUT_MS = 10_000;

/**
 * Fetch latest prices from the Pyth Hermes REST API.
 *
 * @param feedIds - Array of hex feed IDs (without 0x prefix)
 * @returns Map of feedId → PythPrice
 */
export async function fetchPythPrices(
  feedIds: string[],
): Promise<Map<string, PythPrice>> {
  if (feedIds.length === 0) {
    return new Map();
  }

  const params = feedIds
    .map((id) => `ids[]=${encodeURIComponent(id)}`)
    .join('&');
  const url = `${PYTH_HERMES_URL}/v2/updates/price/latest?${params}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HERMES_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Pyth Hermes error: ${response.status} ${response.statusText}`);
    }

    const data: HermesResponse = await response.json();
    const prices = new Map<string, PythPrice>();

    for (const entry of data.parsed ?? []) {
      const { price: rawPrice, conf, expo, publish_time } = entry.price;

      // actualPrice = parseInt(price) * 10^expo
      const actualPrice = Number(rawPrice) * Math.pow(10, expo);
      const actualConfidence = Number(conf) * Math.pow(10, expo);

      prices.set(entry.id, {
        price: actualPrice,
        confidence: actualConfidence,
        expo,
        publishTime: publish_time,
      });
    }

    return prices;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch prices keyed by denom instead of feed ID.
 */
export async function fetchPythPricesByDenom(
  denoms: string[],
  feedIdMap: Record<string, string>,
): Promise<Map<string, PythPrice>> {
  const feedIds = denoms.map((d) => feedIdMap[d]).filter(Boolean);
  const byFeedId = await fetchPythPrices(feedIds);

  const byDenom = new Map<string, PythPrice>();
  for (const [feedId, price] of byFeedId.entries()) {
    const denom = PYTH_FEED_ID_TO_DENOM[feedId];
    if (denom) {
      byDenom.set(denom, price);
    }
  }
  return byDenom;
}

/**
 * Format a Pyth price with confidence interval.
 */
export function formatPriceWithConfidence(
  price: PythPrice,
  decimals: number = 4,
): string {
  const lower = price.price - price.confidence;
  const upper = price.price + price.confidence;

  return `$${price.price.toFixed(decimals)} (${lower.toFixed(decimals)} - ${upper.toFixed(decimals)})`;
}
