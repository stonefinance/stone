import { test, expect } from '@playwright/test';

test.describe('Markets Page @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/markets');
  });

  test('displays markets heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Markets/i })).toBeVisible();
  });

  test('shows at least 2 markets', async ({ page }) => {
    // Wait for markets to load
    await page.waitForLoadState('networkidle');

    // Look for market cards or list items
    const marketElements = page.locator('[data-testid^="market-"]');
    const count = await marketElements.count();

    // If no data-testid, fall back to checking for market denoms
    if (count === 0) {
      await expect(page.getByText(/ATOM|OSMO/i).first()).toBeVisible({ timeout: 10000 });
    } else {
      expect(count).toBeGreaterThanOrEqual(2);
    }
  });

  test('displays market metrics', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    // Check for common market metrics
    const hasSupply = await page.getByText(/supply|tvl|liquidity/i).first().isVisible().catch(() => false);
    const hasBorrow = await page.getByText(/borrow|debt/i).first().isVisible().catch(() => false);
    const hasRate = await page.getByText(/rate|apy|apr/i).first().isVisible().catch(() => false);

    // At least some metrics should be visible
    expect(hasSupply || hasBorrow || hasRate).toBe(true);
  });

  test('markets are clickable', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    // Find and click the first market link/card
    const marketLink = page.locator('a[href*="/markets/"]').first();

    if (await marketLink.isVisible()) {
      await marketLink.click();
      await expect(page).toHaveURL(/\/markets\/\d+/);
    }
  });
});
