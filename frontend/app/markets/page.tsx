'use client';

import { Header } from '@/components/layout/Header';
import { MarketCard } from '@/components/markets/MarketCard';
import { useMarkets } from '@/hooks/useMarkets';

export default function MarketsPage() {
  const { data: markets, isLoading, error } = useMarkets();

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Markets</h1>
          <p className="text-muted-foreground">
            Supply assets to earn interest or borrow against your collateral
          </p>
        </div>

        {/* Markets Grid */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-64 bg-muted animate-pulse rounded-lg"
              />
            ))}
          </div>
        )}

        {error && (
          <div className="text-center py-12">
            <p className="text-destructive">Failed to load markets. Please try again.</p>
          </div>
        )}

        {markets && markets.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No markets available yet.</p>
          </div>
        )}

        {markets && markets.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {markets.map((market) => (
              <MarketCard key={market.id} market={market} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
