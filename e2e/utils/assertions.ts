import { expect, Page } from '@playwright/test';
import { ChainClient } from './chain-client';
import { GraphQLTestClient, Market, UserPosition } from './graphql-client';

// Custom assertions for E2E tests

export async function assertMarketExists(
  graphqlClient: GraphQLTestClient,
  marketId: string
): Promise<Market> {
  const market = await graphqlClient.getMarket(marketId);
  expect(market, `Market ${marketId} should exist`).not.toBeNull();
  return market!;
}

export async function assertUserHasPosition(
  graphqlClient: GraphQLTestClient,
  userAddress: string,
  marketId: string
): Promise<UserPosition> {
  const positions = await graphqlClient.getUserPositions(userAddress);
  const position = positions.find(p => p.market.id === marketId);
  expect(position, `User ${userAddress} should have position in market ${marketId}`).toBeDefined();
  return position!;
}

export async function assertBalanceGreaterThan(
  chainClient: ChainClient,
  denom: string,
  minAmount: string
): Promise<void> {
  const balance = await chainClient.getBalance(denom);
  expect(
    BigInt(balance.amount) >= BigInt(minAmount),
    `Balance of ${denom} should be >= ${minAmount}, got ${balance.amount}`
  ).toBe(true);
}

export async function assertBalanceEquals(
  chainClient: ChainClient,
  denom: string,
  expectedAmount: string,
  tolerance: string = '0'
): Promise<void> {
  const balance = await chainClient.getBalance(denom);
  const actual = BigInt(balance.amount);
  const expected = BigInt(expectedAmount);
  const tol = BigInt(tolerance);

  const diff = actual > expected ? actual - expected : expected - actual;
  expect(
    diff <= tol,
    `Balance of ${denom} should be ${expectedAmount} (±${tolerance}), got ${balance.amount}`
  ).toBe(true);
}

export async function assertHealthFactorAbove(
  chainClient: ChainClient,
  marketAddress: string,
  minHealthFactor: number
): Promise<void> {
  const position = await chainClient.getPosition(marketAddress);
  const healthFactor = Number(position.health_factor) / 1_000_000; // Convert from 6 decimals
  expect(
    healthFactor >= minHealthFactor,
    `Health factor should be >= ${minHealthFactor}, got ${healthFactor}`
  ).toBe(true);
}

export async function assertHealthFactorBelow(
  chainClient: ChainClient,
  marketAddress: string,
  maxHealthFactor: number
): Promise<void> {
  const position = await chainClient.getPosition(marketAddress);
  const healthFactor = Number(position.health_factor) / 1_000_000;
  expect(
    healthFactor < maxHealthFactor,
    `Health factor should be < ${maxHealthFactor}, got ${healthFactor}`
  ).toBe(true);
}

export async function assertTransactionSuccessful(page: Page): Promise<void> {
  // Wait for success message - adjust selector to match your UI
  await expect(
    page.getByText(/transaction successful|success/i)
  ).toBeVisible({ timeout: 30000 });
}

export async function assertTransactionFailed(page: Page, errorMessage?: string): Promise<void> {
  // Wait for error message - adjust selector to match your UI
  const errorLocator = errorMessage
    ? page.getByText(new RegExp(errorMessage, 'i'))
    : page.getByText(/error|failed|rejected/i);

  await expect(errorLocator).toBeVisible({ timeout: 10000 });
}

export async function assertPageLoaded(page: Page): Promise<void> {
  // Wait for page to be fully loaded
  await page.waitForLoadState('networkidle');

  // Check for common error indicators
  const hasError = await page.getByText(/error|500|404|not found/i).isVisible().catch(() => false);
  expect(hasError, 'Page should not show errors').toBe(false);
}

export async function assertMarketsDisplayed(page: Page, minCount: number = 1): Promise<void> {
  // Wait for market cards to be visible - adjust selector to match your UI
  const marketCards = page.locator('[data-testid^="market-card"]');
  await expect(marketCards).toHaveCount({ min: minCount }, { timeout: 10000 });
}

// Helper to wait for indexer to catch up
export async function waitForIndexerSync(
  graphqlClient: GraphQLTestClient,
  expectedCondition: () => Promise<boolean>,
  maxWaitMs: number = 30000,
  pollIntervalMs: number = 1000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    try {
      if (await expectedCondition()) {
        return;
      }
    } catch {
      // Condition check failed, continue polling
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Indexer did not sync within ${maxWaitMs}ms`);
}
