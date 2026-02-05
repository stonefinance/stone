'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { TransactionHistoryDropdown } from '@/components/transactions/TransactionHistoryDropdown';
import { useWallet } from '@/lib/cosmjs/wallet';
import { shortenAddress } from '@/lib/utils/format';
import { isLocal } from '@/lib/constants/contracts';

export function Header() {
  const { address, isConnected, connect, disconnect, isLoading } = useWallet();

  return (
    <header className="border-b border-border bg-background">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo and Navigation */}
          <div className="flex items-center gap-8">
            <Link href="/" className="text-2xl font-bold">
              Stone Finance
            </Link>
            <nav className="hidden md:flex gap-6">
              <Link
                href="/markets"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Markets
              </Link>
              <Link
                href="/dashboard"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Dashboard
              </Link>
              {isLocal && (
                <Link
                  href="/faucet"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Faucet
                </Link>
              )}
            </nav>
          </div>

          {/* Wallet Connection */}
          <div>
            {isConnected ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:block text-sm text-muted-foreground">
                  {shortenAddress(address!)}
                </div>
                <TransactionHistoryDropdown />
                <Button variant="outline" onClick={disconnect} size="sm">
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button onClick={connect} disabled={isLoading} size="sm">
                {isLoading ? 'Connecting...' : 'Connect Wallet'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
