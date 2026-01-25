import { describe, it, expect, beforeEach } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  handleSupply,
  handleBorrow,
  handleSupplyCollateral,
  handleWithdraw,
} from '../../src/events/handlers';
import { prisma } from '../../src/db/client';
import {
  ADDRESSES,
  DECIMALS,
  createTestMarket,
  createSupplyEvent,
  createBorrowEvent,
  createSupplyCollateralEvent,
  createWithdrawEvent,
  assertMarketState,
  assertPositionState,
  assertRecordCount,
} from '../helpers';

describe('Multi-Market Scenarios', () => {
  const ethUsdcMarket = '1';
  const btcUsdcMarket = '2';

  describe('Single user across multiple markets', () => {
    beforeEach(async () => {
      await createTestMarket({
        id: ethUsdcMarket,
        marketAddress: ADDRESSES.market1,
        collateralDenom: 'ueth',
        debtDenom: 'uusdc',
      });

      await createTestMarket({
        id: btcUsdcMarket,
        marketAddress: ADDRESSES.market2,
        collateralDenom: 'ubtc',
        debtDenom: 'uusdc',
      });
    });

    it('creates separate positions for same user in different markets', async () => {
      const user = ADDRESSES.userA;

      // Supply to ETH/USDC market
      await handleSupply(
        createSupplyEvent({
          supplier: user,
          recipient: user,
          amount: DECIMALS.thousand,
          scaledAmount: DECIMALS.thousand,
          marketAddress: ADDRESSES.market1,
          logIndex: 0,
        }),
        ethUsdcMarket
      );

      // Supply to BTC/USDC market
      await handleSupply(
        createSupplyEvent({
          supplier: user,
          recipient: user,
          amount: '2000000000000000000000',
          scaledAmount: '2000000000000000000000',
          marketAddress: ADDRESSES.market2,
          logIndex: 1,
        }),
        btcUsdcMarket
      );

      // Verify separate positions
      await assertPositionState(ethUsdcMarket, user, {
        supplyScaled: DECIMALS.thousand,
      });

      await assertPositionState(btcUsdcMarket, user, {
        supplyScaled: '2000000000000000000000',
      });

      // Position IDs should be different
      const positions = await prisma.userPosition.findMany({
        where: { userAddress: user },
      });

      expect(positions).toHaveLength(2);
      expect(positions.map((p) => p.id).sort()).toEqual([
        `${ethUsdcMarket}:${user}`,
        `${btcUsdcMarket}:${user}`,
      ]);

      // Markets should have independent totals
      await assertMarketState(ethUsdcMarket, {
        totalSupplyScaled: DECIMALS.thousand,
      });

      await assertMarketState(btcUsdcMarket, {
        totalSupplyScaled: '2000000000000000000000',
      });
    });

    it('handles different position types across markets', async () => {
      const user = ADDRESSES.userA;

      // Supply to ETH/USDC
      await handleSupply(
        createSupplyEvent({
          supplier: user,
          recipient: user,
          amount: DECIMALS.thousand,
          scaledAmount: DECIMALS.thousand,
          marketAddress: ADDRESSES.market1,
          logIndex: 0,
        }),
        ethUsdcMarket
      );

      // Supply collateral and borrow in BTC/USDC
      await handleSupplyCollateral(
        createSupplyCollateralEvent({
          supplier: user,
          recipient: user,
          amount: '500000000000000000000',
          marketAddress: ADDRESSES.market2,
          logIndex: 1,
        }),
        btcUsdcMarket
      );

      await handleBorrow(
        createBorrowEvent({
          borrower: user,
          recipient: user,
          amount: '200000000000000000000',
          scaledAmount: '200000000000000000000',
          marketAddress: ADDRESSES.market2,
          logIndex: 2,
        }),
        btcUsdcMarket
      );

      // ETH market: supply position
      await assertPositionState(ethUsdcMarket, user, {
        supplyScaled: DECIMALS.thousand,
        debtScaled: '0',
        collateral: '0',
      });

      // BTC market: collateral + borrow position
      await assertPositionState(btcUsdcMarket, user, {
        supplyScaled: '0',
        debtScaled: '200000000000000000000',
        collateral: '500000000000000000000',
      });
    });

    it('operations in one market do not affect another', async () => {
      const user = ADDRESSES.userA;

      // Setup: supply in both markets
      await handleSupply(
        createSupplyEvent({
          supplier: user,
          recipient: user,
          amount: DECIMALS.thousand,
          scaledAmount: DECIMALS.thousand,
          logIndex: 0,
        }),
        ethUsdcMarket
      );

      await handleSupply(
        createSupplyEvent({
          supplier: user,
          recipient: user,
          amount: DECIMALS.thousand,
          scaledAmount: DECIMALS.thousand,
          logIndex: 1,
        }),
        btcUsdcMarket
      );

      // Withdraw from ETH market only
      await handleWithdraw(
        createWithdrawEvent({
          withdrawer: user,
          recipient: user,
          amount: '500000000000000000000',
          scaledDecrease: '500000000000000000000',
          logIndex: 2,
        }),
        ethUsdcMarket
      );

      // ETH market affected
      await assertPositionState(ethUsdcMarket, user, {
        supplyScaled: '500000000000000000000',
      });

      // BTC market unchanged
      await assertPositionState(btcUsdcMarket, user, {
        supplyScaled: DECIMALS.thousand,
      });

      // Market totals independent
      await assertMarketState(ethUsdcMarket, {
        totalSupplyScaled: '500000000000000000000',
      });

      await assertMarketState(btcUsdcMarket, {
        totalSupplyScaled: DECIMALS.thousand,
      });
    });
  });

  describe('Multiple users across multiple markets', () => {
    beforeEach(async () => {
      await createTestMarket({
        id: ethUsdcMarket,
        marketAddress: ADDRESSES.market1,
      });

      await createTestMarket({
        id: btcUsdcMarket,
        marketAddress: ADDRESSES.market2,
      });
    });

    it('tracks all user positions across all markets correctly', async () => {
      // User A: supply in ETH market
      await handleSupply(
        createSupplyEvent({
          supplier: ADDRESSES.userA,
          recipient: ADDRESSES.userA,
          amount: '100000000000000000000',
          scaledAmount: '100000000000000000000',
          logIndex: 0,
        }),
        ethUsdcMarket
      );

      // User A: supply in BTC market
      await handleSupply(
        createSupplyEvent({
          supplier: ADDRESSES.userA,
          recipient: ADDRESSES.userA,
          amount: '200000000000000000000',
          scaledAmount: '200000000000000000000',
          logIndex: 1,
        }),
        btcUsdcMarket
      );

      // User B: supply in ETH market
      await handleSupply(
        createSupplyEvent({
          supplier: ADDRESSES.userB,
          recipient: ADDRESSES.userB,
          amount: '300000000000000000000',
          scaledAmount: '300000000000000000000',
          logIndex: 2,
        }),
        ethUsdcMarket
      );

      // User B: supply in BTC market
      await handleSupply(
        createSupplyEvent({
          supplier: ADDRESSES.userB,
          recipient: ADDRESSES.userB,
          amount: '400000000000000000000',
          scaledAmount: '400000000000000000000',
          logIndex: 3,
        }),
        btcUsdcMarket
      );

      // 4 total positions (2 users x 2 markets)
      await assertRecordCount('userPosition', 4);

      // Verify each position
      await assertPositionState(ethUsdcMarket, ADDRESSES.userA, {
        supplyScaled: '100000000000000000000',
      });
      await assertPositionState(btcUsdcMarket, ADDRESSES.userA, {
        supplyScaled: '200000000000000000000',
      });
      await assertPositionState(ethUsdcMarket, ADDRESSES.userB, {
        supplyScaled: '300000000000000000000',
      });
      await assertPositionState(btcUsdcMarket, ADDRESSES.userB, {
        supplyScaled: '400000000000000000000',
      });

      // Market totals
      await assertMarketState(ethUsdcMarket, {
        totalSupplyScaled: '400000000000000000000', // 100 + 300
      });
      await assertMarketState(btcUsdcMarket, {
        totalSupplyScaled: '600000000000000000000', // 200 + 400
      });
    });

    it('handles cross-market user activity correctly', async () => {
      // User A supplies to both markets
      await handleSupply(
        createSupplyEvent({
          supplier: ADDRESSES.userA,
          recipient: ADDRESSES.userA,
          amount: DECIMALS.thousand,
          scaledAmount: DECIMALS.thousand,
          logIndex: 0,
        }),
        ethUsdcMarket
      );

      await handleSupply(
        createSupplyEvent({
          supplier: ADDRESSES.userA,
          recipient: ADDRESSES.userA,
          amount: DECIMALS.thousand,
          scaledAmount: DECIMALS.thousand,
          logIndex: 1,
        }),
        btcUsdcMarket
      );

      // User B borrows from ETH market (uses A's liquidity)
      await handleSupplyCollateral(
        createSupplyCollateralEvent({
          supplier: ADDRESSES.userB,
          recipient: ADDRESSES.userB,
          amount: DECIMALS.thousand,
          logIndex: 2,
        }),
        ethUsdcMarket
      );

      await handleBorrow(
        createBorrowEvent({
          borrower: ADDRESSES.userB,
          recipient: ADDRESSES.userB,
          amount: '500000000000000000000',
          scaledAmount: '500000000000000000000',
          logIndex: 3,
        }),
        ethUsdcMarket
      );

      // User B also operates in BTC market
      await handleSupply(
        createSupplyEvent({
          supplier: ADDRESSES.userB,
          recipient: ADDRESSES.userB,
          amount: '200000000000000000000',
          scaledAmount: '200000000000000000000',
          logIndex: 4,
        }),
        btcUsdcMarket
      );

      // Final positions
      // ETH market: A supplies, B has collateral+debt
      await assertPositionState(ethUsdcMarket, ADDRESSES.userA, {
        supplyScaled: DECIMALS.thousand,
        debtScaled: '0',
        collateral: '0',
      });
      await assertPositionState(ethUsdcMarket, ADDRESSES.userB, {
        supplyScaled: '0',
        debtScaled: '500000000000000000000',
        collateral: DECIMALS.thousand,
      });

      // BTC market: A supplies, B supplies
      await assertPositionState(btcUsdcMarket, ADDRESSES.userA, {
        supplyScaled: DECIMALS.thousand,
      });
      await assertPositionState(btcUsdcMarket, ADDRESSES.userB, {
        supplyScaled: '200000000000000000000',
      });

      // Market summaries
      await assertMarketState(ethUsdcMarket, {
        totalSupplyScaled: DECIMALS.thousand,
        totalDebtScaled: '500000000000000000000',
        totalCollateral: DECIMALS.thousand,
      });

      await assertMarketState(btcUsdcMarket, {
        totalSupplyScaled: '1200000000000000000000', // 1000 + 200
        totalDebtScaled: '0',
        totalCollateral: '0',
      });
    });
  });

  describe('Transaction tracking across markets', () => {
    beforeEach(async () => {
      await createTestMarket({
        id: ethUsdcMarket,
        marketAddress: ADDRESSES.market1,
      });

      await createTestMarket({
        id: btcUsdcMarket,
        marketAddress: ADDRESSES.market2,
      });
    });

    it('transactions are correctly associated with their markets', async () => {
      await handleSupply(
        createSupplyEvent({
          supplier: ADDRESSES.userA,
          recipient: ADDRESSES.userA,
          amount: DECIMALS.oneToken,
          scaledAmount: DECIMALS.oneToken,
          txHash: 'ETH_TX_1',
          logIndex: 0,
        }),
        ethUsdcMarket
      );

      await handleSupply(
        createSupplyEvent({
          supplier: ADDRESSES.userA,
          recipient: ADDRESSES.userA,
          amount: DECIMALS.oneToken,
          scaledAmount: DECIMALS.oneToken,
          txHash: 'BTC_TX_1',
          logIndex: 0,
        }),
        btcUsdcMarket
      );

      const ethTxs = await prisma.transaction.findMany({
        where: { marketId: ethUsdcMarket },
      });

      const btcTxs = await prisma.transaction.findMany({
        where: { marketId: btcUsdcMarket },
      });

      expect(ethTxs).toHaveLength(1);
      expect(btcTxs).toHaveLength(1);
      expect(ethTxs[0].txHash).toBe('ETH_TX_1');
      expect(btcTxs[0].txHash).toBe('BTC_TX_1');
    });

    it('can query user transactions across all markets', async () => {
      const user = ADDRESSES.userA;

      await handleSupply(
        createSupplyEvent({
          supplier: user,
          recipient: user,
          logIndex: 0,
        }),
        ethUsdcMarket
      );

      await handleSupply(
        createSupplyEvent({
          supplier: user,
          recipient: user,
          logIndex: 1,
        }),
        btcUsdcMarket
      );

      await handleSupply(
        createSupplyEvent({
          supplier: user,
          recipient: user,
          logIndex: 2,
        }),
        ethUsdcMarket
      );

      // Query all transactions for user across markets
      const userTxs = await prisma.transaction.findMany({
        where: { userAddress: user },
        orderBy: { timestamp: 'asc' },
      });

      expect(userTxs).toHaveLength(3);
      expect(userTxs[0].marketId).toBe(ethUsdcMarket);
      expect(userTxs[1].marketId).toBe(btcUsdcMarket);
      expect(userTxs[2].marketId).toBe(ethUsdcMarket);
    });
  });
});
