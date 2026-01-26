'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TransactionItem } from './TransactionItem';
import { usePendingTransactions } from '@/lib/contexts/TransactionContext';
import { useTransactions } from '@/hooks/useTransactions';
import { useWallet } from '@/lib/cosmjs/wallet';

export function TransactionHistoryDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { address } = useWallet();
  const { pendingTransactions, clearAllCompleted } = usePendingTransactions();
  const { data: indexedTransactions } = useTransactions({
    userAddress: address ?? undefined,
    limit: 20,
  });

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  // Merge pending and indexed transactions, deduplicate by txHash
  const allTransactions = useMemo(() => {
    const pendingTxHashes = new Set(
      pendingTransactions.filter((tx) => tx.txHash).map((tx) => tx.txHash)
    );

    // Filter indexed transactions that aren't already tracked as pending
    const filteredIndexed = indexedTransactions.filter(
      (tx) => !pendingTxHashes.has(tx.txHash)
    );

    // Convert indexed transactions to display format
    const indexedForDisplay = filteredIndexed.map((tx) => ({
      id: tx.id,
      action: tx.action,
      amount: tx.amount ?? '0',
      denom: tx.debtDenom || tx.collateralDenom,
      status: 'completed' as const,
      timestamp: tx.timestamp,
      txHash: tx.txHash,
      error: undefined as string | undefined,
    }));

    // Convert pending transactions to display format
    const pendingForDisplay = pendingTransactions.map((tx) => ({
      id: tx.id,
      action: tx.action,
      amount: tx.amount,
      denom: tx.denom,
      status: tx.status,
      timestamp: tx.timestamp,
      txHash: tx.txHash,
      error: tx.error,
    }));

    // Combine and sort by timestamp (newest first)
    return [...pendingForDisplay, ...indexedForDisplay]
      .sort((a, b) => {
        const timeA = typeof a.timestamp === 'string' ? new Date(a.timestamp).getTime() : a.timestamp;
        const timeB = typeof b.timestamp === 'string' ? new Date(b.timestamp).getTime() : b.timestamp;
        return timeB - timeA;
      })
      .slice(0, 20);
  }, [pendingTransactions, indexedTransactions]);

  const pendingCount = pendingTransactions.filter((tx) => tx.status === 'pending').length;
  const hasCompletedOrFailed = pendingTransactions.some((tx) => tx.status !== 'pending');

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className="relative"
        aria-label="Transaction history"
      >
        <History className="h-4 w-4" />
        {pendingCount > 0 && (
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] font-medium text-primary-foreground flex items-center justify-center">
            {pendingCount > 9 ? '9+' : pendingCount}
          </span>
        )}
      </Button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-background border border-border rounded-lg shadow-lg z-50">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <h3 className="text-sm font-medium">Recent Transactions</h3>
            {hasCompletedOrFailed && (
              <button
                onClick={clearAllCompleted}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {allTransactions.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">No transactions yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {allTransactions.map((tx) => (
                  <TransactionItem
                    key={tx.id}
                    action={tx.action}
                    amount={tx.amount}
                    denom={tx.denom}
                    status={tx.status}
                    timestamp={tx.timestamp}
                    txHash={tx.txHash}
                    error={tx.error}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
