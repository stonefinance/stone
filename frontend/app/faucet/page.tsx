'use client';

import { Header } from '@/components/layout/Header';
import { FaucetCard } from '@/components/faucet/FaucetCard';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/lib/cosmjs/wallet';
import { FAUCET_TOKENS } from '@/lib/constants/faucet';
import { isLocal } from '@/lib/constants/contracts';
import { redirect } from 'next/navigation';

export default function FaucetPage() {
  // Redirect to markets if not on devnet
  if (!isLocal) {
    redirect('/markets');
  }

  const { address, isConnected, connect, isLoading } = useWallet();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Devnet Faucet</h1>
          <p className="text-muted-foreground">
            Get test tokens for the Stone Finance development environment.
            Each request sends tokens directly to your connected wallet.
          </p>
        </div>

        {/* Connect wallet prompt */}
        {!isConnected && (
          <div className="rounded-xl border bg-card p-8 text-center mb-8">
            <p className="text-muted-foreground mb-4">
              Connect your wallet to request test tokens
            </p>
            <Button onClick={connect} disabled={isLoading} size="lg">
              {isLoading ? 'Connecting...' : 'Connect Wallet'}
            </Button>
          </div>
        )}

        {/* Token cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {FAUCET_TOKENS.map((token) => (
            <FaucetCard
              key={token.denom}
              token={token}
              walletAddress={address}
              isConnected={isConnected}
            />
          ))}
        </div>

        {/* Info footer */}
        <div className="mt-8 text-sm text-muted-foreground space-y-1">
          <p>• Tokens are sent from the dev validator account</p>
          <p>• Rate limited to one request per token per minute</p>
          <p>• This page is only available on the local devnet</p>
        </div>
      </main>
    </div>
  );
}
