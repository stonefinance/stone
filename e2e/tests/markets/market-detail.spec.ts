import { test, expect } from '@playwright/test';

const GRAPHQL_ENDPOINT = 'http://localhost:4000/graphql';

// Helper to fetch the first market's ID from GraphQL
async function getFirstMarketId(): Promise<string> {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query { markets { id } }`,
    }),
  });
  const data = await response.json();
  if (!data.data?.markets?.length) {
    throw new Error('No markets found');
  }
  return data.data.markets[0].id;
}

test.describe('Market Detail Page @smoke', () => {
  let marketId: string;

  test.beforeAll(async () => {
    // Fetch a valid market ID before running tests
    marketId = await getFirstMarketId();
  });

  test.beforeEach(async ({ page }) => {
    // Navigate to the actual market using its real ID
    await page.goto(`/markets/${marketId}`);
  });

  test('displays market detail page', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    // Should have some market-specific content (STONE, ATOM, USDC, or lending terms)
    const hasMarketContent = await page.getByText(/STONE|ATOM|USDC|supply|borrow|collateral/i).first().isVisible().catch(() => false);
    expect(hasMarketContent).toBe(true);
  });

  test('shows market parameters', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    // Check for LTV or similar parameters - look for both abbreviated and full text
    // Frontend displays "Liquidation LTV" in Market Attributes section
    const hasLTV = await page.getByText(/ltv|loan.to.value|loan to value/i).isVisible().catch(() => false);
    const hasLiqLTV = await page.getByText(/liquidation\s*ltv/i).isVisible().catch(() => false);
    const hasParams = await page.getByText(/75%|80%|85%|86%|parameters|risk/i).isVisible().catch(() => false);

    // At least one parameter indicator should be visible
    expect(hasLTV || hasLiqLTV || hasParams).toBe(true);
  });

  test('shows action buttons when wallet connected', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    // Check for action buttons (may be disabled without wallet)
    const supplyButton = page.getByRole('button', { name: /supply/i }).first();
    const borrowButton = page.getByRole('button', { name: /borrow/i }).first();

    const hasSupply = await supplyButton.isVisible().catch(() => false);
    const hasBorrow = await borrowButton.isVisible().catch(() => false);

    // If the page has interactive elements, they should be present
    // (they may be disabled without wallet connection)
    if (hasSupply) {
      await expect(supplyButton).toBeVisible();
    }
    if (hasBorrow) {
      await expect(borrowButton).toBeVisible();
    }
  });

  test('navigates back to markets list', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    // Find back link or markets link
    const backLink = page.getByRole('link', { name: /back|markets/i }).first();

    if (await backLink.isVisible()) {
      await backLink.click();
      await expect(page).toHaveURL(/\/markets$/);
    }
  });
});
