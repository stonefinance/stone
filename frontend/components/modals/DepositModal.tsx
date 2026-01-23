'use client';

import { useState, useMemo } from 'react';
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
import { Slider } from '@/components/ui/slider';
import { useWallet } from '@/lib/cosmjs/wallet';
import { useBalance } from '@/hooks/useBalance';
import { baseToMicro, microToBase, formatDisplayAmount } from '@/lib/utils/format';

interface DepositModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marketAddress: string;
  denom: string; // Minimal denom for transactions (e.g., "uosmo")
  displayDenom?: string; // Display denom for UI (e.g., "OSMO")
  type: 'supply' | 'collateral';
}

export function DepositModal({
  open,
  onOpenChange,
  marketAddress,
  denom,
  displayDenom,
  type,
}: DepositModalProps) {
  const { signingClient, isConnected } = useWallet();
  const { balance, isLoading: balanceLoading } = useBalance(open ? denom : undefined);
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const balanceBase = useMemo(() => {
    if (!balance) return '0';
    return microToBase(balance);
  }, [balance]);

  const balanceNumber = parseFloat(balanceBase);

  const sliderValue = useMemo(() => {
    if (!amount || balanceNumber === 0) return 0;
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum)) return 0;
    return Math.min((amountNum / balanceNumber) * 100, 100);
  }, [amount, balanceNumber]);

  const handleSliderChange = (percentage: number) => {
    if (balanceNumber === 0) return;
    const newAmount = (percentage / 100) * balanceNumber;
    setAmount(percentage === 100 ? balanceBase : newAmount.toFixed(6));
  };

  const handleMaxClick = () => {
    setAmount(balanceBase);
  };

  const handleDeposit = async () => {
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

    try {
      const microAmount = baseToMicro(amount);
      const coin = { denom, amount: microAmount };

      if (type === 'supply') {
        await signingClient.supply(marketAddress, coin);
      } else {
        await signingClient.supplyCollateral(marketAddress, coin);
      }

      setAmount('');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction failed');
    } finally {
      setIsLoading(false);
    }
  };

  const title = type === 'supply' ? 'Supply' : 'Supply Collateral';
  const description =
    type === 'supply'
      ? 'Supply assets to earn interest'
      : 'Supply collateral to enable borrowing';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="amount">Amount ({displayDenom || denom})</Label>
              <div className="text-sm text-muted-foreground">
                Balance:{' '}
                {balanceLoading ? (
                  <span className="animate-pulse">...</span>
                ) : (
                  <button
                    type="button"
                    onClick={handleMaxClick}
                    className="font-medium text-primary hover:underline"
                  >
                    {formatDisplayAmount(balanceBase, 6)} {displayDenom || denom}
                  </button>
                )}
              </div>
            </div>
            <Input
              id="amount"
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <Slider
            value={sliderValue}
            onChange={handleSliderChange}
            disabled={isLoading || balanceNumber === 0}
          />

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
              onClick={handleDeposit}
              className="flex-1"
              disabled={isLoading || !isConnected}
            >
              {isLoading ? 'Processing...' : 'Deposit'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
