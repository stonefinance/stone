'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWallet } from '@/lib/cosmjs/wallet';
import { usePendingTransactions, TransactionAction } from '@/lib/contexts/TransactionContext';
import { baseToMicro, formatUSD } from '@/lib/utils/format';

interface BorrowModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marketAddress: string;
  denom: string; // Minimal denom for transactions (e.g., "ustone")
  displayDenom?: string; // Display denom for UI (e.g., "STONE")
  maxBorrowValue?: number;
  // Pyth price update configuration
  collateralDenom?: string;
  debtDenom?: string;
}

export function BorrowModal({
  open,
  onOpenChange,
  marketAddress,
  denom,
  displayDenom,
  maxBorrowValue,
  collateralDenom,
  debtDenom,
}: BorrowModalProps) {
  const { signingClient, isConnected } = useWallet();
  const { addPendingTransaction, markCompleted, markFailed } = usePendingTransactions();
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBorrow = async () => {
    if (!signingClient || !isConnected) {
      setError('Please connect your wallet');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setIsLoading(true);
    setError(null);

    const txId = addPendingTransaction({
      action: TransactionAction.Borrow,
      amount: amount,
      denom: displayDenom || denom,
      marketAddress,
    });

    try {
      const microAmount = baseToMicro(amount);
      const result = collateralDenom && debtDenom
        ? await signingClient.borrowWithPriceUpdate(marketAddress, microAmount, collateralDenom, debtDenom)
        : await signingClient.borrow(marketAddress, microAmount);

      markCompleted(txId, result.transactionHash);
      setAmount('');
      onOpenChange(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      markFailed(txId, errorMessage);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Borrow</DialogTitle>
          <DialogDescription>
            Borrow assets against your collateral
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {maxBorrowValue !== undefined && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Available to borrow</p>
              <p className="text-lg font-semibold">{formatUSD(maxBorrowValue)}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="borrow-amount">Amount ({displayDenom || denom})</Label>
            <Input
              id="borrow-amount"
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isLoading}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBorrow}
              className="flex-1"
              disabled={isLoading || !isConnected}
            >
              {isLoading ? 'Processing...' : 'Borrow'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
