import { test, expect } from '@playwright/test';

test.describe('Smoke Tests @smoke', () => {
  test('frontend loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Stone Finance/i);
  });

  test('markets page displays', async ({ page }) => {
    await page.goto('/markets');
    await expect(page.getByRole('heading', { name: /Markets/i })).toBeVisible();
  });

  test('dashboard page displays', async ({ page }) => {
    await page.goto('/dashboard');
    // Dashboard should load without errors
    await page.waitForLoadState('networkidle');
  });

  test('GraphQL API is healthy', async ({ request }) => {
    const response = await request.get('http://localhost:4000/health');
    expect(response.ok()).toBeTruthy();
  });

  test('blockchain is running', async ({ request }) => {
    const response = await request.get('http://localhost:26657/status');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.result.node_info.network).toBe('stone-local-1');
  });

  test('blockchain is synced', async ({ request }) => {
    const response = await request.get('http://localhost:26657/status');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.result.sync_info.catching_up).toBe(false);
  });

  test('test markets are indexed', async ({ request }) => {
    const response = await request.post('http://localhost:4000/graphql', {
      data: {
        query: `
          query {
            markets {
              id
              collateralDenom
              debtDenom
            }
          }
        `,
      },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.data.markets.length).toBeGreaterThan(0);
  });

  test('GraphQL returns market details', async ({ request }) => {
    const response = await request.post('http://localhost:4000/graphql', {
      data: {
        query: `
          query {
            markets {
              id
              address
              collateralDenom
              debtDenom
              ltv
              liquidationThreshold
              totalSupply
              totalDebt
            }
          }
        `,
      },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    // Verify first market has expected structure
    const market = data.data.markets[0];
    expect(market.address).toBeTruthy();
    expect(market.collateralDenom).toBeTruthy();
    expect(market.debtDenom).toBeTruthy();
  });

  test('REST API is accessible', async ({ request }) => {
    const response = await request.get('http://localhost:1317/cosmos/base/tendermint/v1beta1/node_info');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.default_node_info.network).toBe('stone-local-1');
  });
});
