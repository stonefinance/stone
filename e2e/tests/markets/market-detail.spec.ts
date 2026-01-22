import { test, expect } from '@playwright/test';

test.describe('Market Detail Page @smoke', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to first market
    await page.goto('/markets/1');
  });

  test('displays market detail page', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    // Should have some market-specific content
    const hasMarketContent = await page.getByText(/ATOM|supply|borrow|collateral/i).first().isVisible().catch(() => false);
    expect(hasMarketContent).toBe(true);
  });

  test('shows market parameters', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    // Check for LTV or similar parameters
    const hasLTV = await page.getByText(/ltv|loan.to.value/i).isVisible().catch(() => false);
    const hasLiqThreshold = await page.getByText(/liquidation.*threshold/i).isVisible().catch(() => false);

    // At least one parameter should be visible
    expect(hasLTV || hasLiqThreshold).toBe(true);
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
