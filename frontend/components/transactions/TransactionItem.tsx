'use client';

import { Loader2, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { TransactionAction } from '@/lib/graphql/generated/hooks';
import { TransactionStatus } from '@/lib/contexts/TransactionContext';
import { formatDisplayAmount, formatDenom, microToBase } from '@/lib/utils/format';

const ACTION_LABELS: Record<TransactionAction, string> = {
  [TransactionAction.Supply]: 'Supply',
  [TransactionAction.Withdraw]: 'Withdraw',
  [TransactionAction.SupplyCollateral]: 'Supply Collateral',
  [TransactionAction.WithdrawCollateral]: 'Withdraw Collateral',
  [TransactionAction.Borrow]: 'Borrow',
  [TransactionAction.Repay]: 'Repay',
  [TransactionAction.Liquidate]: 'Liquidate',
};

export interface TransactionItemProps {
  action: TransactionAction;
  amount: string;
  denom: string;
  status: TransactionStatus;
  timestamp: number | string;
  txHash?: string;
  error?: string;
}

function formatRelativeTime(timestamp: number | string): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function StatusIcon({ status }: { status: TransactionStatus }) {
  switch (status) {
    case 'pending':
      return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-destructive" />;
  }
}

export function TransactionItem({
  action,
  amount,
  denom,
  status,
  timestamp,
  txHash,
  error,
}: TransactionItemProps) {
  const displayAmount = amount.length > 10
    ? formatDisplayAmount(microToBase(amount), 4)
    : formatDisplayAmount(amount, 4);
  const displayDenom = formatDenom(denom);

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors">
      <StatusIcon status={status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium truncate">
            {ACTION_LABELS[action]}
          </span>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatRelativeTime(timestamp)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground truncate">
            {displayAmount} {displayDenom}
          </span>
          {txHash && (
            <a
              href={`https://www.mintscan.io/osmosis/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        {status === 'failed' && error && (
          <p className="text-xs text-destructive mt-1 truncate" title={error}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
