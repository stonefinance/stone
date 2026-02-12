import { test, expect } from '@playwright/test';
import { ChainClient } from '../../utils/chain-client';
import { GraphQLTestClient } from '../../utils/graphql-client';
import { TEST_USER_1_MNEMONIC, TEST_ACCOUNTS } from '../../fixtures/test-accounts';
import { waitForIndexerSync } from '../../utils/assertions';

test.describe('Full Lending Flow @integration', () => {
  let chainClient: ChainClient;
  let graphqlClient: GraphQLTestClient;

  test.beforeAll(async () => {
    chainClient = await ChainClient.connect(TEST_USER_1_MNEMONIC);
    graphqlClient = new GraphQLTestClient();
  });

  test('complete supply -> borrow -> repay -> withdraw flow via chain', async () => {
    // Get markets from GraphQL
    const markets = await graphqlClient.getMarkets();
    expect(markets.length).toBeGreaterThan(0);

    const market = markets[0];
    const marketAddress = market.marketAddress;

    // 1. Check initial balances
    const initialAtomBalance = await chainClient.getBalance('uatom');
    const initialStoneBalance = await chainClient.getBalance('ustone');
    console.log(`Initial ATOM balance: ${initialAtomBalance.amount}`);
    console.log(`Initial STONE balance: ${initialStoneBalance.amount}`);

    // 2. Supply liquidity (STONE) so we can borrow later
    const supplyAmount = '1000000000'; // 1000 STONE
    console.log('Supplying STONE liquidity...');
    const supplyTx = await chainClient.supply(marketAddress, supplyAmount, 'ustone');
    console.log(`Supply tx: ${supplyTx}`);

    // 3. Supply collateral (ATOM)
    const collateralAmount = '100000000'; // 100 ATOM
    console.log('Supplying ATOM collateral...');
    const collateralTx = await chainClient.supplyCollateral(marketAddress, collateralAmount, 'uatom');
    console.log(`Collateral tx: ${collateralTx}`);

    // Wait for indexer to catch up
    await waitForIndexerSync(graphqlClient, async () => {
      const positions = await graphqlClient.getUserPositions(TEST_ACCOUNTS.user1.address);
      return positions.some(p => p.market.id === market.id && BigInt(p.collateral) > 0);
    });

    // 4. Verify position via chain query
    const positionAfterCollateral = await chainClient.getPosition(marketAddress);
    expect(BigInt(positionAfterCollateral.collateral_amount)).toBe(BigInt(collateralAmount));
    console.log(`Position after collateral: ${JSON.stringify(positionAfterCollateral)}`);

    // 5. Borrow (STONE) - borrow 50% of max to stay safe
    const borrowAmount = '50000000'; // 50 STONE
    console.log('Borrowing STONE...');
    const borrowTx = await chainClient.borrow(marketAddress, borrowAmount);
    console.log(`Borrow tx: ${borrowTx}`);

    // 6. Verify debt position
    const positionAfterBorrow = await chainClient.getPosition(marketAddress);
    expect(BigInt(positionAfterBorrow.debt_amount)).toBeGreaterThanOrEqual(BigInt(borrowAmount));
    console.log(`Position after borrow: ${JSON.stringify(positionAfterBorrow)}`);

    // 7. Repay debt
    console.log('Repaying debt...');
    const repayTx = await chainClient.repay(marketAddress, borrowAmount, 'ustone');
    console.log(`Repay tx: ${repayTx}`);

    // 8. Verify debt is cleared (or minimal due to interest)
    const positionAfterRepay = await chainClient.getPosition(marketAddress);
    console.log(`Position after repay: ${JSON.stringify(positionAfterRepay)}`);
    // Debt should be very small (just accumulated interest)
    expect(BigInt(positionAfterRepay.debt_amount)).toBeLessThan(BigInt('1000000')); // Less than 1 STONE

    // 9. Withdraw collateral
    console.log('Withdrawing collateral...');
    const withdrawTx = await chainClient.withdrawCollateral(marketAddress, collateralAmount);
    console.log(`Withdraw tx: ${withdrawTx}`);

    // 10. Verify clean position
    const finalPosition = await chainClient.getPosition(marketAddress);
    console.log(`Final position: ${JSON.stringify(finalPosition)}`);
    expect(BigInt(finalPosition.collateral_amount)).toBe(BigInt(0));
  });

  test('complete supply -> borrow -> repay -> withdraw flow via UI', async ({ page }) => {
    // Skip if UI not ready for this flow
    test.skip(true, 'UI integration test - requires frontend wallet connection implementation');

    // 1. Navigate to markets
    await page.goto('/markets');

    // 2. Select ATOM/STONE market
    await page.getByTestId('market-card-atom-stone').click();
    await expect(page).toHaveURL(/\/markets\/\d+/);

    // 3. Supply collateral (ATOM)
    await page.getByRole('button', { name: /Supply Collateral/i }).click();
    await page.getByTestId('amount-input').fill('100');
    await page.getByRole('button', { name: /Confirm/i }).click();

    // Wait for transaction
    await expect(page.getByText(/Transaction successful/i)).toBeVisible({ timeout: 30000 });

    // 4. Borrow (STONE)
    await page.getByRole('button', { name: /Borrow/i }).click();
    await page.getByTestId('amount-input').fill('50');
    await page.getByRole('button', { name: /Confirm/i }).click();

    await expect(page.getByText(/Transaction successful/i)).toBeVisible({ timeout: 30000 });

    // 5. Verify position
    await page.goto('/dashboard');
    await expect(page.getByTestId('collateral-balance')).toContainText('100');
    await expect(page.getByTestId('debt-balance')).toContainText('50');

    // 6. Repay debt
    await page.getByRole('button', { name: /Repay/i }).click();
    await page.getByTestId('amount-input').fill('50');
    await page.getByRole('button', { name: /Confirm/i }).click();

    await expect(page.getByText(/Transaction successful/i)).toBeVisible({ timeout: 30000 });

    // 7. Withdraw collateral
    await page.getByRole('button', { name: /Withdraw Collateral/i }).click();
    await page.getByTestId('amount-input').fill('100');
    await page.getByRole('button', { name: /Confirm/i }).click();

    await expect(page.getByText(/Transaction successful/i)).toBeVisible({ timeout: 30000 });

    // 8. Verify clean position
    await page.reload();
    await expect(page.getByTestId('collateral-balance')).toContainText('0');
    await expect(page.getByTestId('debt-balance')).toContainText('0');
  });
});
