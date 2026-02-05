'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TokenIcon } from '@/components/ui/token-icon';
import { formatDisplayAmount } from '@/lib/utils/format';
import { useBalance } from '@/hooks/useBalance';
import { FAUCET_COOLDOWN_MS, type FaucetToken } from '@/lib/constants/faucet';

interface FaucetCardProps {
  token: FaucetToken;
  walletAddress: string | null;
  isConnected: boolean;
}

type RequestStatus = 'idle' | 'loading' | 'success' | 'error';

export function FaucetCard({ token, walletAddress, isConnected }: FaucetCardProps) {
  const [status, setStatus] = useState<RequestStatus>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cooldownEnd, setCooldownEnd] = useState<number | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  const { balance, refetch: refetchBalance } = useBalance(
    isConnected ? token.denom : undefined
  );

  // Cooldown countdown timer
  useEffect(() => {
    if (!cooldownEnd) {
      setCooldownRemaining(0);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, cooldownEnd - Date.now());
      setCooldownRemaining(remaining);
      if (remaining <= 0) {
        setCooldownEnd(null);
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [cooldownEnd]);

  const requestTokens = useCallback(async () => {
    if (!walletAddress) return;

    setStatus('loading');
    setTxHash(null);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress, denom: token.denom }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setStatus('success');
      setTxHash(data.txHash);
      setCooldownEnd(Date.now() + FAUCET_COOLDOWN_MS);

      // Refresh balance after a short delay for chain confirmation
      setTimeout(() => refetchBalance(), 2000);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Request failed');
    }
  }, [walletAddress, token.denom, refetchBalance]);

  const displayAmount = formatDisplayAmount(
    Number(token.amount) / Math.pow(10, token.decimals),
    0
  );

  const currentBalance = balance
    ? formatDisplayAmount(Number(balance) / Math.pow(10, token.decimals), 2)
    : '—';

  const isOnCooldown = cooldownRemaining > 0;
  const cooldownSeconds = Math.ceil(cooldownRemaining / 1000);
  const isDisabled = !isConnected || status === 'loading' || isOnCooldown;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        {/* Token header */}
        <div className="flex items-center gap-3">
          <TokenIcon symbol={token.display} size="lg" />
          <div>
            <div className="font-semibold text-lg">{token.display}</div>
            <div className="text-sm text-muted-foreground">
              {displayAmount} per request
            </div>
          </div>
        </div>

        {/* Current balance */}
        {isConnected && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Your balance</span>
            <span className="font-mono">
              {currentBalance} {token.display}
            </span>
          </div>
        )}

        {/* Request button */}
        <Button
          onClick={requestTokens}
          disabled={isDisabled}
          className="w-full"
          size="lg"
        >
          {status === 'loading'
            ? 'Sending...'
            : isOnCooldown
              ? `Cooldown (${cooldownSeconds}s)`
              : `Request ${displayAmount} ${token.display}`}
        </Button>

        {/* Status messages */}
        {status === 'success' && txHash && (
          <div className="text-sm text-green-600 bg-green-50 dark:bg-green-950/30 rounded-md p-3">
            <div className="font-medium">Tokens sent!</div>
            <div className="font-mono text-xs mt-1 break-all opacity-80">
              tx: {txHash}
            </div>
          </div>
        )}

        {status === 'error' && errorMsg && (
          <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-md p-3">
            <div className="font-medium">Request failed</div>
            <div className="text-xs mt-1 opacity-80">{errorMsg}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
