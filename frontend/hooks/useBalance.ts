'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@/lib/cosmjs/wallet';
import { queryClient } from '@/lib/cosmjs/client';

interface UseBalanceResult {
  balance: string | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useBalance(denom: string | undefined): UseBalanceResult {
  const { address, isConnected } = useWallet();
  const [balance, setBalance] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchBalance = async () => {
    if (!address || !denom || !isConnected) {
      setBalance(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await queryClient.getBalance(address, denom);
      setBalance(result.amount);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch balance'));
      setBalance(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBalance();
  }, [address, denom, isConnected]);

  return {
    balance,
    isLoading,
    error,
    refetch: fetchBalance,
  };
}
