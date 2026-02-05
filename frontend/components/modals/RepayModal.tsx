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
import { baseToMicro, formatDisplayAmount, microToBase } from '@/lib/utils/format';

interface RepayModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marketAddress: string;
  denom: string; // Minimal denom for transactions (e.g., "ustone")
  displayDenom?: string; // Display denom for UI (e.g., "STONE")
  currentDebt?: string;
  onSuccess?: () => void;
  onFullRepay?: () => void;
  // Pyth price update configuration
  collateralDenom?: string;
  debtDenom?: string;
}

export function RepayModal({
  open,
  onOpenChange,
  marketAddress,
  denom,
  displayDenom,
  currentDebt,
  onSuccess,
  onFullRepay,
  collateralDenom,
  debtDenom: marketDebtDenom,
}: RepayModalProps) {
  const { signingClient, isConnected } = useWallet();
  const { addPendingTransaction, markCompleted, markFailed } = usePendingTransactions();
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRepay = async () => {
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
      action: TransactionAction.Repay,
      amount: amount,
      denom: displayDenom || denom,
      marketAddress,
    });

    try {
      const microAmount = baseToMicro(amount);
      const coin = { denom, amount: microAmount };

      const result = await signingClient.repay(marketAddress, coin);

      markCompleted(txId, result.transactionHash);
      const repaidAmount = parseFloat(amount);
      const currentDebtBase = currentDebt ? parseFloat(microToBase(currentDebt)) : undefined;
      setAmount('');
      onOpenChange(false);
      onSuccess?.();
      if (currentDebtBase !== undefined && repaidAmount >= currentDebtBase) {
        onFullRepay?.();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      markFailed(txId, errorMessage);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRepayMax = () => {
    if (currentDebt) {
      const debtInBase = microToBase(currentDebt);
      setAmount(debtInBase);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Repay</DialogTitle>
          <DialogDescription>
            Repay your borrowed assets
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {currentDebt && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Current debt</p>
              <p className="text-lg font-semibold">
                {formatDisplayAmount(microToBase(currentDebt))} {displayDenom || denom}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="repay-amount">Amount ({displayDenom || denom})</Label>
              {currentDebt && (
                <Button
                  variant="link"
                  size="sm"
                  onClick={handleRepayMax}
                  className="h-auto p-0 text-xs"
                >
                  MAX
                </Button>
              )}
            </div>
            <Input
              id="repay-amount"
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
              onClick={handleRepay}
              className="flex-1"
              disabled={isLoading || !isConnected}
            >
              {isLoading ? 'Processing...' : 'Repay'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
