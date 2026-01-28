'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Window as KeplrWindow } from '@keplr-wallet/types';
import { SigningClient } from './client';
import { CHAIN_ID, CHAIN_INFO } from '@/lib/constants';

declare global {
  interface Window extends KeplrWindow {
    keplr?: KeplrWindow['keplr'];
  }
}

interface WalletContextType {
  address: string | null;
  isConnected: boolean;
  signingClient: SigningClient | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  isLoading: boolean;
  error: string | null;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [signingClient, setSigningClient] = useState<SigningClient | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (!window.keplr) {
        throw new Error('Please install Keplr extension');
      }

      // Suggest chain to Keplr
      try {
        await window.keplr.experimentalSuggestChain(CHAIN_INFO);
      } catch (e) {
        console.error('Failed to suggest chain', e);
      }

      // Enable the chain
      await window.keplr.enable(CHAIN_ID);

      // Get offline signer
      const offlineSigner = window.keplr.getOfflineSigner(CHAIN_ID);

      // Get user address
      const accounts = await offlineSigner.getAccounts();
      const userAddress = accounts[0].address;

      // Create signing client
      const client = new SigningClient(offlineSigner, userAddress);

      setAddress(userAddress);
      setSigningClient(client);

      // Store in localStorage for persistence
      localStorage.setItem('wallet_address', userAddress);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect wallet';
      setError(errorMessage);
      console.error('Wallet connection error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const disconnect = () => {
    setAddress(null);
    setSigningClient(null);
    localStorage.removeItem('wallet_address');
  };

  // Auto-reconnect on mount if previously connected
  useEffect(() => {
    const savedAddress = localStorage.getItem('wallet_address');
    if (savedAddress && window.keplr) {
      connect();
    }
  }, []);

  // Listen for Keplr account changes
  useEffect(() => {
    if (!window.keplr) return;

    const handleAccountChange = () => {
      if (address) {
        // Reconnect with new account
        connect();
      }
    };

    window.addEventListener('keplr_keystorechange', handleAccountChange);

    return () => {
      window.removeEventListener('keplr_keystorechange', handleAccountChange);
    };
  }, [address]);

  return (
    <WalletContext.Provider
      value={{
        address,
        isConnected: !!address,
        signingClient,
        connect,
        disconnect,
        isLoading,
        error,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
