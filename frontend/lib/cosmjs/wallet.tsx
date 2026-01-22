'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { GasPrice, Coin } from '@cosmjs/stargate';
import type { OfflineSigner } from '@cosmjs/proto-signing';

// Default chain config - can be overridden via environment variables
const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || 'osmosis-1';
const RPC_ENDPOINT = process.env.NEXT_PUBLIC_RPC_ENDPOINT || 'https://rpc.osmosis.zone';
const GAS_PRICE = process.env.NEXT_PUBLIC_GAS_PRICE || '0.025uosmo';
const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS || '';

interface SigningClientWrapper {
  client: SigningCosmWasmClient;
  address: string;
  supply: (marketAddress: string, coin: Coin) => Promise<string>;
  supplyCollateral: (marketAddress: string, coin: Coin) => Promise<string>;
  borrow: (marketAddress: string, amount: string) => Promise<string>;
  repay: (marketAddress: string, coin: Coin) => Promise<string>;
  withdraw: (marketAddress: string, amount: string) => Promise<string>;
  withdrawCollateral: (marketAddress: string, amount: string) => Promise<string>;
}

interface WalletContextType {
  address: string | null;
  isConnected: boolean;
  isLoading: boolean;
  signingClient: SigningClientWrapper | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  error: string | null;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [signingClient, setSigningClient] = useState<SigningClientWrapper | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createSigningClientWrapper = useCallback(
    (client: SigningCosmWasmClient, userAddress: string): SigningClientWrapper => {
      return {
        client,
        address: userAddress,

        supply: async (marketAddress: string, coin: Coin) => {
          const result = await client.execute(
            userAddress,
            marketAddress,
            { supply: {} },
            'auto',
            undefined,
            [coin]
          );
          return result.transactionHash;
        },

        supplyCollateral: async (marketAddress: string, coin: Coin) => {
          const result = await client.execute(
            userAddress,
            marketAddress,
            { supply_collateral: {} },
            'auto',
            undefined,
            [coin]
          );
          return result.transactionHash;
        },

        borrow: async (marketAddress: string, amount: string) => {
          const result = await client.execute(
            userAddress,
            marketAddress,
            { borrow: { amount } },
            'auto'
          );
          return result.transactionHash;
        },

        repay: async (marketAddress: string, coin: Coin) => {
          const result = await client.execute(
            userAddress,
            marketAddress,
            { repay: {} },
            'auto',
            undefined,
            [coin]
          );
          return result.transactionHash;
        },

        withdraw: async (marketAddress: string, amount: string) => {
          const result = await client.execute(
            userAddress,
            marketAddress,
            { withdraw: { amount } },
            'auto'
          );
          return result.transactionHash;
        },

        withdrawCollateral: async (marketAddress: string, amount: string) => {
          const result = await client.execute(
            userAddress,
            marketAddress,
            { withdraw_collateral: { amount } },
            'auto'
          );
          return result.transactionHash;
        },
      };
    },
    []
  );

  const connect = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Check if Keplr is installed
      if (!window.keplr) {
        throw new Error('Please install Keplr wallet extension');
      }

      // Enable the chain in Keplr
      await window.keplr.enable(CHAIN_ID);

      // Get the offline signer - cast to OfflineSigner for cosmjs compatibility
      // Keplr's signer type doesn't exactly match cosmjs types but is compatible at runtime
      const offlineSigner = window.keplr.getOfflineSigner(CHAIN_ID) as unknown as OfflineSigner;

      // Get the user's accounts
      const accounts = await offlineSigner.getAccounts();
      if (accounts.length === 0) {
        throw new Error('No accounts found in Keplr');
      }

      const userAddress = accounts[0].address;

      // Create a signing client
      const client = await SigningCosmWasmClient.connectWithSigner(
        RPC_ENDPOINT,
        offlineSigner,
        { gasPrice: GasPrice.fromString(GAS_PRICE) }
      );

      const wrapper = createSigningClientWrapper(client, userAddress);

      setAddress(userAddress);
      setSigningClient(wrapper);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect wallet';
      setError(message);
      console.error('Wallet connection error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [createSigningClientWrapper]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setSigningClient(null);
    setError(null);
  }, []);

  // Try to reconnect on mount if Keplr was previously connected
  useEffect(() => {
    const tryReconnect = async () => {
      if (typeof window !== 'undefined' && window.keplr) {
        try {
          const key = await window.keplr.getKey(CHAIN_ID);
          if (key) {
            // User was previously connected, try to reconnect
            connect();
          }
        } catch {
          // User not connected to this chain, that's fine
        }
      }
    };

    tryReconnect();
  }, [connect]);

  // Listen for Keplr account changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
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
    }
  }, [address, connect]);

  return (
    <WalletContext.Provider
      value={{
        address,
        isConnected: !!address,
        isLoading,
        signingClient,
        connect,
        disconnect,
        error,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextType {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}

// Extend Window interface for Keplr
declare global {
  interface Window {
    keplr?: {
      enable: (chainId: string) => Promise<void>;
      getOfflineSigner: (chainId: string) => {
        getAccounts: () => Promise<{ address: string; pubkey: Uint8Array }[]>;
        signDirect: (signerAddress: string, signDoc: unknown) => Promise<unknown>;
        signAmino: (signerAddress: string, signDoc: unknown) => Promise<unknown>;
      };
      getKey: (chainId: string) => Promise<{
        name: string;
        algo: string;
        pubKey: Uint8Array;
        address: Uint8Array;
        bech32Address: string;
      }>;
    };
  }
}

export { FACTORY_ADDRESS };
