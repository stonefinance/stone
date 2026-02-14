/**
 * E2E test for Mock Pyth oracle flow.
 *
 * Verifies that:
 * 1. Mock Pyth contract is deployed
 * 2. Price updates via MockPythClient work
 * 3. Pyth oracle adapter reflects the updated prices
 */

import { test, expect } from '@playwright/test';
import { ChainClient } from '../../utils/chain-client';
import { MockPythClient, FEED_IDS, parsePrice } from '../../utils/pyth-mock';
import { CHAIN_CONFIG } from '../../fixtures/test-accounts';
import * as fs from 'fs';

// Load deployment result
function loadDeployment(): {
  pythContractAddress?: string;
  pythAdapterAddress?: string;
  oracleAddress: string;
} {
  const paths = ['/deployment/result.json', './e2e/.env.deployment'];

  // Try to load from JSON first
  for (const path of paths) {
    if (path.endsWith('.json') && fs.existsSync(path)) {
      return JSON.parse(fs.readFileSync(path, 'utf-8'));
    }
  }

  // Fall back to environment variables
  return {
    pythContractAddress: process.env.PYTH_CONTRACT_ADDRESS,
    pythAdapterAddress: process.env.PYTH_ADAPTER_ADDRESS,
    oracleAddress: process.env.ORACLE_ADDRESS || '',
  };
}

test.describe('Mock Pyth Oracle Flow', () => {
  let chainClient: ChainClient;
  let pythClient: MockPythClient;
  let deployment: ReturnType<typeof loadDeployment>;

  test.beforeAll(async () => {
    // Skip if not running with Pyth oracle
    deployment = loadDeployment();
    if (!deployment.pythContractAddress) {
      test.skip();
      return;
    }

    chainClient = await ChainClient.connect(CHAIN_CONFIG.deployer.mnemonic);
    pythClient = new MockPythClient(
      chainClient.client,
      chainClient.address,
      deployment.pythContractAddress
    );
  });

  test('should query initial price from mock Pyth', async () => {
    if (!deployment.pythContractAddress) {
      test.skip();
      return;
    }

    // Query ATOM price
    const response = await pythClient.getPrice(FEED_IDS.ATOM_USD);

    expect(response.price_feed).toBeDefined();
    expect(response.price_feed.price).toBeDefined();
    expect(response.price_feed.price.expo).toBe(-8);

    const parsed = parsePrice(response);
    console.log(`Initial ATOM price: $${parsed.price.toFixed(2)}`);

    // Price should be positive
    expect(parsed.price).toBeGreaterThan(0);
  });

  test('should update price via batch update', async () => {
    if (!deployment.pythContractAddress) {
      test.skip();
      return;
    }

    // Get initial price
    const initialResponse = await pythClient.getPrice(FEED_IDS.ATOM_USD);
    const initialPrice = parsePrice(initialResponse).price;
    console.log(`Initial ATOM price: $${initialPrice.toFixed(2)}`);

    // Set new price (10% higher)
    const newPrice = initialPrice * 1.1;
    await pythClient.setPrice(FEED_IDS.ATOM_USD, newPrice);

    // Query updated price
    const updatedResponse = await pythClient.getPrice(FEED_IDS.ATOM_USD);
    const updatedPrice = parsePrice(updatedResponse).price;
    console.log(`Updated ATOM price: $${updatedPrice.toFixed(2)}`);

    // Verify price was updated (within 1% tolerance due to rounding)
    expect(updatedPrice).toBeCloseTo(newPrice, 1);
  });

  test('should update multiple prices in batch', async () => {
    if (!deployment.pythContractAddress) {
      test.skip();
      return;
    }

    // Set multiple prices at once
    const prices = {
      [FEED_IDS.ATOM_USD]: 12.34,
      [FEED_IDS.USDC_USD]: 1.0,
      [FEED_IDS.STONE_USD]: 0.75,
    };

    await pythClient.setPrices(prices);

    // Verify each price
    for (const [feedId, expectedPrice] of Object.entries(prices)) {
      const response = await pythClient.getPrice(feedId);
      const actualPrice = parsePrice(response).price;
      console.log(
        `${feedId.slice(0, 8)}... price: $${actualPrice.toFixed(4)} (expected: $${expectedPrice.toFixed(4)})`
      );
      expect(actualPrice).toBeCloseTo(expectedPrice, 2);
    }
  });

  test('should verify pyth adapter reflects price updates', async () => {
    if (!deployment.pythContractAddress || !deployment.pythAdapterAddress) {
      test.skip();
      return;
    }

    // Set a specific ATOM price
    const targetPrice = 15.5;
    await pythClient.setPrice(FEED_IDS.ATOM_USD, targetPrice);

    // Query price through pyth adapter
    const adapterResponse = await chainClient.queryContract<{
      price: string;
      updated_at: number;
    }>(deployment.pythAdapterAddress, {
      price: { denom: 'uatom' },
    });

    console.log(`Adapter price for uatom: ${adapterResponse.price}`);

    // Convert adapter price (Decimal string) to number
    const adapterPrice = parseFloat(adapterResponse.price);

    // Verify adapter reports the same price
    expect(adapterPrice).toBeCloseTo(targetPrice, 1);
  });

  test('should handle getHumanPrice convenience method', async () => {
    if (!deployment.pythContractAddress) {
      test.skip();
      return;
    }

    // Set a known price
    const expectedPrice = 8.88;
    await pythClient.setPrice(FEED_IDS.ATOM_USD, expectedPrice);

    // Use convenience method
    const humanPrice = await pythClient.getHumanPrice(FEED_IDS.ATOM_USD);

    expect(humanPrice).toBeCloseTo(expectedPrice, 2);
  });
});
