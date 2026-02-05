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

interface WithdrawCollateralModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marketAddress: string;
  displayDenom?: string;
  currentCollateral?: string;
  hasDebt?: boolean;
  onSuccess?: () => void;
  // Pyth price update configuration
  collateralDenom?: string;
  debtDenom?: string;
}

export function WithdrawCollateralModal({
  open,
  onOpenChange,
  marketAddress,
  displayDenom,
  currentCollateral,
  hasDebt,
  onSuccess,
  collateralDenom,
  debtDenom,
}: WithdrawCollateralModalProps) {
  const { signingClient, isConnected } = useWallet();
  const { addPendingTransaction, markCompleted, markFailed } = usePendingTransactions();
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleWithdraw = async () => {
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
      action: TransactionAction.WithdrawCollateral,
      amount: amount,
      denom: displayDenom || 'TOKEN',
      marketAddress,
    });

    try {
      const microAmount = baseToMicro(amount);

      const result = collateralDenom && debtDenom
        ? await signingClient.withdrawCollateralWithPriceUpdate(marketAddress, microAmount, collateralDenom, debtDenom)
        : await signingClient.withdrawCollateral(marketAddress, microAmount);

      markCompleted(txId, result.transactionHash);
      setAmount('');
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Transaction failed';
      markFailed(txId, errorMessage);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleWithdrawMax = () => {
    if (currentCollateral) {
      const collateralInBase = microToBase(currentCollateral);
      setAmount(collateralInBase);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdraw Collateral</DialogTitle>
          <DialogDescription>
            Withdraw your posted collateral
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {currentCollateral && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Your collateral</p>
              <p className="text-lg font-semibold">
                {formatDisplayAmount(microToBase(currentCollateral))} {displayDenom}
              </p>
            </div>
          )}

          {hasDebt && (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <p className="text-sm text-yellow-600 dark:text-yellow-500">
                You have outstanding debt. Withdrawal is limited to maintain your LTV ratio.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="withdraw-collateral-amount">Amount ({displayDenom})</Label>
              {currentCollateral && !hasDebt && (
                <Button
                  variant="link"
                  size="sm"
                  onClick={handleWithdrawMax}
                  className="h-auto p-0 text-xs"
                >
                  MAX
                </Button>
              )}
            </div>
            <Input
              id="withdraw-collateral-amount"
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
              onClick={handleWithdraw}
              className="flex-1"
              disabled={isLoading || !isConnected}
            >
              {isLoading ? 'Processing...' : 'Withdraw'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
