'use client';

import { useEffect } from 'react';
import {
  useGetTransactionsQuery,
  TransactionAction,
  TransactionFieldsFragment,
  OnNewTransactionDocument,
  OnNewTransactionSubscription,
  OnNewTransactionSubscriptionVariables,
  GetTransactionsQuery,
} from '@/lib/graphql/generated/hooks';

export interface Transaction {
  id: string;
  txHash: string;
  blockHeight: number;
  timestamp: string;
  marketId: string;
  marketAddress: string;
  collateralDenom: string;
  debtDenom: string;
  userAddress: string;
  action: TransactionAction;
  amount: string | null;
}

function transformTransaction(tx: TransactionFieldsFragment): Transaction {
  return {
    id: tx.id,
    txHash: tx.txHash,
    blockHeight: tx.blockHeight,
    timestamp: tx.timestamp,
    marketId: tx.market.id,
    marketAddress: tx.market.marketAddress,
    collateralDenom: tx.market.collateralDenom,
    debtDenom: tx.market.debtDenom,
    userAddress: tx.userAddress,
    action: tx.action,
    amount: tx.amount ?? null,
  };
}

interface UseTransactionsOptions {
  marketId?: string;
  userAddress?: string;
  action?: TransactionAction;
  limit?: number;
  offset?: number;
}

export function useTransactions(options: UseTransactionsOptions = {}) {
  const { marketId, userAddress, action, limit = 20, offset = 0 } = options;

  const { data, loading, error, refetch, fetchMore, subscribeToMore } =
    useGetTransactionsQuery({
      variables: {
        marketId,
        userAddress,
        action,
        limit,
        offset,
      },
    });

  // Subscribe to real-time new transactions
  useEffect(() => {
    const unsubscribe = subscribeToMore<
      OnNewTransactionSubscription,
      OnNewTransactionSubscriptionVariables
    >({
      document: OnNewTransactionDocument,
      variables: { marketId },
      updateQuery: (prev, { subscriptionData }): GetTransactionsQuery => {
        if (!subscriptionData.data) return prev as GetTransactionsQuery;

        const newTx = subscriptionData.data.newTransaction;
        const existingTxs = prev.transactions ?? [];

        if (existingTxs.some((tx) => tx.id === newTx.id)) return prev as GetTransactionsQuery;

        const updatedTransactions = [newTx, ...existingTxs].slice(0, limit) as GetTransactionsQuery['transactions'];

        return {
          __typename: 'Query',
          transactions: updatedTransactions,
        };
      },
    });

    return () => unsubscribe();
  }, [marketId, limit, subscribeToMore]);

  return {
    data: data?.transactions.map(transformTransaction) ?? [],
    isLoading: loading,
    error: error ? new Error(error.message) : undefined,
    refetch,
    fetchMore,
  };
}

export { TransactionAction };
