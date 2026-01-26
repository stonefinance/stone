'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { TransactionAction } from '@/lib/graphql/generated/hooks';

export type TransactionStatus = 'pending' | 'completed' | 'failed';

export interface PendingTransaction {
  id: string;
  txHash?: string;
  action: TransactionAction;
  amount: string;
  denom: string;
  marketAddress: string;
  status: TransactionStatus;
  timestamp: number;
  error?: string;
}

interface TransactionContextType {
  pendingTransactions: PendingTransaction[];
  addPendingTransaction: (tx: Omit<PendingTransaction, 'id' | 'status' | 'timestamp'>) => string;
  markCompleted: (id: string, txHash: string) => void;
  markFailed: (id: string, error: string) => void;
  clearTransaction: (id: string) => void;
  clearAllCompleted: () => void;
}

const TransactionContext = createContext<TransactionContextType | undefined>(undefined);

let transactionIdCounter = 0;

function generateTransactionId(): string {
  transactionIdCounter += 1;
  return `tx-${Date.now()}-${transactionIdCounter}`;
}

export function TransactionProvider({ children }: { children: ReactNode }) {
  const [pendingTransactions, setPendingTransactions] = useState<PendingTransaction[]>([]);

  const addPendingTransaction = useCallback(
    (tx: Omit<PendingTransaction, 'id' | 'status' | 'timestamp'>): string => {
      const id = generateTransactionId();
      const newTransaction: PendingTransaction = {
        ...tx,
        id,
        status: 'pending',
        timestamp: Date.now(),
      };

      setPendingTransactions((prev) => [newTransaction, ...prev].slice(0, 50));
      return id;
    },
    []
  );

  const markCompleted = useCallback((id: string, txHash: string) => {
    setPendingTransactions((prev) =>
      prev.map((tx) =>
        tx.id === id ? { ...tx, status: 'completed' as const, txHash } : tx
      )
    );
  }, []);

  const markFailed = useCallback((id: string, error: string) => {
    setPendingTransactions((prev) =>
      prev.map((tx) =>
        tx.id === id ? { ...tx, status: 'failed' as const, error } : tx
      )
    );
  }, []);

  const clearTransaction = useCallback((id: string) => {
    setPendingTransactions((prev) => prev.filter((tx) => tx.id !== id));
  }, []);

  const clearAllCompleted = useCallback(() => {
    setPendingTransactions((prev) =>
      prev.filter((tx) => tx.status === 'pending')
    );
  }, []);

  return (
    <TransactionContext.Provider
      value={{
        pendingTransactions,
        addPendingTransaction,
        markCompleted,
        markFailed,
        clearTransaction,
        clearAllCompleted,
      }}
    >
      {children}
    </TransactionContext.Provider>
  );
}

export function usePendingTransactions() {
  const context = useContext(TransactionContext);
  if (context === undefined) {
    throw new Error('usePendingTransactions must be used within a TransactionProvider');
  }
  return context;
}

export { TransactionAction };
