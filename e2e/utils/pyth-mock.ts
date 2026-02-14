/**
 * Mock Pyth client for E2E testing.
 *
 * Provides a convenient TypeScript interface for interacting with the
 * mock-pyth contract, allowing tests to simulate price updates without
 * needing real Pyth VAAs or Wormhole integration.
 */

import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';

/**
 * Standard Pyth feed IDs for common assets.
 * Source: https://pyth.network/price-feed-ids
 */
export const FEED_IDS = {
  /** ATOM/USD price feed */
  ATOM_USD: 'b00b60f88b03a6a625a8d1c048c3f66653edf217439983d037e7222c4e612819',
  /** USDC/USD price feed */
  USDC_USD: 'eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
  /** STONE/USD price feed (using AKT feed as proxy) */
  STONE_USD: '4ea5bb4d2f5900cc2e97ba534240950740b4d3b89fe712a94a7304fd2fd92702',
} as const;

/**
 * Type for known feed IDs.
 */
export type KnownFeedId = typeof FEED_IDS[keyof typeof FEED_IDS];

/**
 * Price feed update for batch operations.
 */
export interface PriceFeedUpdate {
  /** 64-character hex feed ID */
  id: string;
  /** Price value (integer, scaled by 10^expo) */
  price: number;
  /** Confidence interval */
  conf: number;
  /** Exponent (typically negative, e.g., -8) */
  expo: number;
  /** Unix timestamp when this price was published */
  publish_time: number;
  /** EMA price (optional) */
  ema_price?: number;
  /** EMA confidence (optional) */
  ema_conf?: number;
}

/**
 * Response from Pyth price feed query.
 */
export interface PriceFeedResponse {
  price_feed: {
    id: string;
    price: {
      price: string;
      conf: string;
      expo: number;
      publish_time: number;
    };
    ema_price: {
      price: string;
      conf: string;
      expo: number;
      publish_time: number;
    };
  };
}

/**
 * Default exponent for prices (-8 = 8 decimal places).
 */
const DEFAULT_EXPO = -8;

/**
 * Default confidence value (0.1% of typical price).
 */
const DEFAULT_CONF = 1_000_000;

/**
 * Client for interacting with the mock-pyth contract.
 *
 * @example
 * ```typescript
 * const pyth = new MockPythClient(client, senderAddress, pythContractAddress);
 *
 * // Set ATOM price to $10.52
 * await pyth.setPrice(FEED_IDS.ATOM_USD, 10.52);
 *
 * // Batch update multiple prices
 * await pyth.updatePriceFeeds([
 *   { id: FEED_IDS.ATOM_USD, price: 1052000000, conf: 1000000, expo: -8, publish_time: now() },
 *   { id: FEED_IDS.USDC_USD, price: 100000000, conf: 100000, expo: -8, publish_time: now() },
 * ]);
 * ```
 */
export class MockPythClient {
  /**
   * Create a new MockPythClient.
   *
   * @param client - CosmWasm signing client
   * @param senderAddress - Address to send transactions from
   * @param pythContractAddress - Address of the mock-pyth contract
   */
  constructor(
    private readonly client: SigningCosmWasmClient,
    private readonly senderAddress: string,
    private readonly pythContractAddress: string
  ) {}

  /**
   * Update a single price feed.
   *
   * This uses the UpdateFeed message which requires the feed to already exist.
   * For creating new feeds or updating multiple feeds, use updatePriceFeeds().
   *
   * @param feedId - 64-character hex feed ID
   * @param price - Price value (integer, scaled by 10^expo)
   * @param conf - Confidence interval (optional, defaults to 1_000_000)
   * @param publishTime - Unix timestamp (optional, defaults to current time)
   * @returns Transaction hash
   */
  async updatePrice(
    feedId: string,
    price: number,
    conf: number = DEFAULT_CONF,
    publishTime: number = Math.floor(Date.now() / 1000)
  ): Promise<string> {
    const result = await this.client.execute(
      this.senderAddress,
      this.pythContractAddress,
      {
        update_feed: {
          id: feedId,
          price,
          conf,
          publish_time: publishTime,
        },
      },
      'auto'
    );
    return result.transactionHash;
  }

  /**
   * Batch update multiple price feeds.
   *
   * This uses the UpdatePriceFeeds message which can both create and update feeds.
   * Simulates the real Pyth UpdatePriceFeeds flow.
   *
   * @param feeds - Array of price feed updates
   * @returns Transaction hash
   */
  async updatePriceFeeds(feeds: PriceFeedUpdate[]): Promise<string> {
    const result = await this.client.execute(
      this.senderAddress,
      this.pythContractAddress,
      {
        update_price_feeds: {
          feeds: feeds.map((f) => ({
            id: f.id,
            price: f.price,
            conf: f.conf,
            expo: f.expo,
            publish_time: f.publish_time,
            ema_price: f.ema_price,
            ema_conf: f.ema_conf,
          })),
        },
      },
      'auto'
    );
    return result.transactionHash;
  }

  /**
   * Convenience method to set a price using human-readable format.
   *
   * Converts a human price (e.g., 10.52 for $10.52) to Pyth format
   * and updates the feed.
   *
   * @param feedId - 64-character hex feed ID
   * @param humanPrice - Human-readable price (e.g., 10.52)
   * @param expo - Exponent (optional, defaults to -8)
   * @param conf - Confidence interval (optional, defaults to 0.1% of price)
   * @returns Transaction hash
   *
   * @example
   * ```typescript
   * // Set ATOM price to $10.52
   * await pyth.setPrice(FEED_IDS.ATOM_USD, 10.52);
   *
   * // Set USDC price to $1.00
   * await pyth.setPrice(FEED_IDS.USDC_USD, 1.0);
   * ```
   */
  async setPrice(
    feedId: string,
    humanPrice: number,
    expo: number = DEFAULT_EXPO,
    conf?: number
  ): Promise<string> {
    // Convert human price to Pyth format: price * 10^(-expo)
    const scaledPrice = Math.round(humanPrice * Math.pow(10, -expo));
    const scaledConf = conf ?? Math.round(scaledPrice * 0.001); // 0.1% confidence
    const publishTime = Math.floor(Date.now() / 1000);

    return this.updatePriceFeeds([
      {
        id: feedId,
        price: scaledPrice,
        conf: scaledConf,
        expo,
        publish_time: publishTime,
      },
    ]);
  }

  /**
   * Convenience method to set multiple prices using human-readable format.
   *
   * @param prices - Map of feed ID to human-readable price
   * @param expo - Exponent for all prices (optional, defaults to -8)
   * @returns Transaction hash
   *
   * @example
   * ```typescript
   * await pyth.setPrices({
   *   [FEED_IDS.ATOM_USD]: 10.52,
   *   [FEED_IDS.USDC_USD]: 1.0,
   *   [FEED_IDS.STONE_USD]: 0.5,
   * });
   * ```
   */
  async setPrices(
    prices: Record<string, number>,
    expo: number = DEFAULT_EXPO
  ): Promise<string> {
    const publishTime = Math.floor(Date.now() / 1000);
    const feeds: PriceFeedUpdate[] = Object.entries(prices).map(
      ([feedId, humanPrice]) => {
        const scaledPrice = Math.round(humanPrice * Math.pow(10, -expo));
        return {
          id: feedId,
          price: scaledPrice,
          conf: Math.round(scaledPrice * 0.001),
          expo,
          publish_time: publishTime,
        };
      }
    );
    return this.updatePriceFeeds(feeds);
  }

  /**
   * Query the current price for a feed.
   *
   * @param feedId - 64-character hex feed ID
   * @returns Price feed response
   */
  async getPrice(feedId: string): Promise<PriceFeedResponse> {
    return this.client.queryContractSmart(this.pythContractAddress, {
      price_feed: { id: feedId },
    });
  }

  /**
   * Get the human-readable price for a feed.
   *
   * @param feedId - 64-character hex feed ID
   * @returns Human-readable price (e.g., 10.52)
   */
  async getHumanPrice(feedId: string): Promise<number> {
    const response = await this.getPrice(feedId);
    const price = Number(response.price_feed.price.price);
    const expo = response.price_feed.price.expo;
    return price * Math.pow(10, expo);
  }
}

/**
 * Helper to create PriceFeedUpdate from human-readable values.
 *
 * @param feedId - 64-character hex feed ID
 * @param humanPrice - Human-readable price
 * @param options - Optional overrides for expo, conf, and publish_time
 * @returns PriceFeedUpdate
 */
export function createPriceFeedUpdate(
  feedId: string,
  humanPrice: number,
  options: {
    expo?: number;
    conf?: number;
    publish_time?: number;
    ema_price?: number;
    ema_conf?: number;
  } = {}
): PriceFeedUpdate {
  const expo = options.expo ?? DEFAULT_EXPO;
  const scaledPrice = Math.round(humanPrice * Math.pow(10, -expo));

  return {
    id: feedId,
    price: scaledPrice,
    conf: options.conf ?? Math.round(scaledPrice * 0.001),
    expo,
    publish_time: options.publish_time ?? Math.floor(Date.now() / 1000),
    ema_price: options.ema_price,
    ema_conf: options.ema_conf,
  };
}

/**
 * Convert a Pyth price response to human-readable format.
 *
 * @param response - Price feed response from Pyth
 * @returns Human-readable price info
 */
export function parsePrice(response: PriceFeedResponse): {
  price: number;
  conf: number;
  emaPrice: number;
  publishTime: Date;
} {
  const priceData = response.price_feed.price;
  const emaData = response.price_feed.ema_price;
  const expo = priceData.expo;

  return {
    price: Number(priceData.price) * Math.pow(10, expo),
    conf: Number(priceData.conf) * Math.pow(10, expo),
    emaPrice: Number(emaData.price) * Math.pow(10, expo),
    publishTime: new Date(priceData.publish_time * 1000),
  };
}
