'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDisplayAmount, formatPercentage } from '@/lib/utils/format';

interface DebtBlockerProps {
  debtAmount: number;
  debtDenom: string;
  borrowApy: number;
  onRepayClick: () => void;
}

export function DebtBlocker({ debtAmount, debtDenom, borrowApy, onRepayClick }: DebtBlockerProps) {
  return (
    <div className="space-y-4">
      {/* Warning Banner */}
      <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg space-y-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-500" />
          <h3 className="font-semibold text-yellow-600 dark:text-yellow-500">Active Debt</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          You have outstanding debt of <strong>{formatDisplayAmount(debtAmount)} {debtDenom}</strong>.
          You must repay your debt before supplying liquidity.
        </p>
      </div>

      {/* Debt Info */}
      <div className="space-y-3 pt-2 border-t">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Current Debt</span>
          <span className="font-medium">{formatDisplayAmount(debtAmount)} {debtDenom}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Borrow APY</span>
          <span className="font-medium text-red-600">{formatPercentage(borrowApy)}</span>
        </div>
      </div>

      {/* Repay Button */}
      <Button className="w-full h-12 text-base" onClick={onRepayClick}>
        Repay Debt
      </Button>
    </div>
  );
}
