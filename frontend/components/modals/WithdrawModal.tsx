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

interface WithdrawModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marketAddress: string;
  displayDenom?: string;
  currentSupply?: string;
  onSuccess?: () => void;
  // Pyth price update configuration
  collateralDenom?: string;
  debtDenom?: string;
}

export function WithdrawModal({
  open,
  onOpenChange,
  marketAddress,
  displayDenom,
  currentSupply,
  onSuccess,
  collateralDenom,
  debtDenom,
}: WithdrawModalProps) {
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
      action: TransactionAction.Withdraw,
      amount: amount,
      denom: displayDenom || 'TOKEN',
      marketAddress,
    });

    try {
      const microAmount = baseToMicro(amount);
      
      const result = await signingClient.withdraw(marketAddress, microAmount);

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
    if (currentSupply) {
      const supplyInBase = microToBase(currentSupply);
      setAmount(supplyInBase);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdraw Supply</DialogTitle>
          <DialogDescription>
            Withdraw your supplied liquidity
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {currentSupply && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Your supply</p>
              <p className="text-lg font-semibold">
                {formatDisplayAmount(microToBase(currentSupply))} {displayDenom}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="withdraw-amount">Amount ({displayDenom})</Label>
              {currentSupply && (
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
              id="withdraw-amount"
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
