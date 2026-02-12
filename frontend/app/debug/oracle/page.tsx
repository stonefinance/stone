'use client';

import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useMultipleOracleQueries,
  OracleState,
  getPriceStatus,
  getStatusEmoji,
  STALENESS_STALE_THRESHOLD,
} from '@/hooks/useOracleQuery';
import { useGetMarketsQuery } from '@/lib/graphql/generated/hooks';
import { getDisplaySymbol } from '@/lib/utils/denom-registry';
import { RPC_ENDPOINT, CHAIN_ID } from '@/lib/constants';
import { AlertTriangle, CheckCircle, RefreshCw, ExternalLink, Copy, Database } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';

// Helper to generate explorer URL for contract addresses
function getExplorerUrl(address: string): string {
  // Determine explorer based on chain ID prefix
  if (CHAIN_ID.includes('neutron')) {
    return `https://neutron.celat.one/neutron-1/contracts/${address}`;
  } else if (CHAIN_ID.includes('osmo')) {
    return `https://celatone.osmosis.zone/osmo-test-5/contracts/${address}`;
  } else if (CHAIN_ID.includes('pion')) {
    return `https://neutron.celat.one/pion-1/contracts/${address}`;
  }
  // Default fallback for local chains - just show the address
  return `#`;
}

function formatTimestamp(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString();
}

function formatAge(unixSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const ageSeconds = now - unixSeconds;

  if (ageSeconds < 0) return 'future?';
  if (ageSeconds < 60) return `${ageSeconds}s ago`;
  if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)}m ${ageSeconds % 60}s ago`;
  if (ageSeconds < 86400) return `${Math.floor(ageSeconds / 3600)}h ${Math.floor((ageSeconds % 3600) / 60)}m ago`;
  return `${Math.floor(ageSeconds / 86400)}d ago`;
}

function shortenAddress(address: string, chars: number = 8): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

function shortenFeedId(feedId: string): string {
  if (feedId.length <= 16) return feedId;
  return `${feedId.slice(0, 10)}...${feedId.slice(-6)}`;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

// Parse price from string (handle scientific notation and decimal formats)
function parsePrice(priceStr: string): number {
  // Oracle returns prices in a specific format, typically as a decimal string
  const parsed = parseFloat(priceStr);
  if (isNaN(parsed)) return 0;
  return parsed;
}

function formatPrice(price: number): string {
  if (price === 0) return '$0.00';
  if (price < 0.0001) return `$${price.toExponential(4)}`;
  if (price < 1) return `$${price.toFixed(6)}`;
  if (price < 100) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(2)}`;
}

// Format max confidence ratio (stored as decimal like "0.01" for 1%)
function formatConfidenceRatio(ratio: string): string {
  const parsed = parseFloat(ratio);
  if (isNaN(parsed)) return ratio;
  return `${(parsed * 100).toFixed(2)}%`;
}

interface OracleCardProps {
  oracleAddress: string;
  state: OracleState;
  markets: Array<{
    id: string;
    address: string;
    collateralDenom: string;
    debtDenom: string;
  }>;
  now: number;
}

function OracleCard({ oracleAddress, state, markets, now }: OracleCardProps) {
  const explorerUrl = getExplorerUrl(oracleAddress);
  const isLocalChain = explorerUrl === '#';

  // Get unique denoms for this oracle across all markets
  const relevantDenoms = useMemo(() => {
    const denoms = new Set<string>();
    markets.forEach(m => {
      denoms.add(m.collateralDenom);
      denoms.add(m.debtDenom);
    });
    return Array.from(denoms);
  }, [markets]);

  // Check if any prices are stale
  const hasStalePrice = useMemo(() => {
    for (const denom of relevantDenoms) {
      const price = state.prices.get(denom);
      if (price) {
        const age = now - price.updated_at;
        if (age > STALENESS_STALE_THRESHOLD) return true;
      }
      if (state.priceErrors.has(denom)) return true;
    }
    return false;
  }, [relevantDenoms, state.prices, state.priceErrors, now]);

  return (
    <Card className={hasStalePrice ? 'border-yellow-500/50' : ''}>
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Database className="h-4 w-4" />
          Oracle Contract
          {state.isLoading && <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />}
          {hasStalePrice && !state.isLoading && (
            <span className="text-yellow-500 text-sm font-normal flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Issues detected
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Oracle Address */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Address:</span>
          <code className="font-mono bg-muted px-2 py-0.5 rounded">
            {shortenAddress(oracleAddress, 12)}
          </code>
          <button
            onClick={() => copyToClipboard(oracleAddress)}
            className="text-muted-foreground hover:text-foreground p-1"
            title="Copy address"
          >
            <Copy className="h-3 w-3" />
          </button>
          {!isLocalChain && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-400 p-1"
              title="View on explorer"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {/* Config Section */}
        <div>
          <h4 className="text-sm font-medium mb-2">Configuration</h4>
          {state.configError ? (
            <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/30 rounded p-2">
              Failed to load config: {state.configError}
            </div>
          ) : state.config ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Pyth Contract:</span>{' '}
                <code className="font-mono text-xs">{shortenAddress(state.config.pyth_contract_addr, 10)}</code>
              </div>
              <div>
                <span className="text-muted-foreground">Max Confidence Ratio:</span>{' '}
                <span className="font-mono">{formatConfidenceRatio(state.config.max_confidence_ratio)}</span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Loading...</div>
          )}
        </div>

        {/* Markets using this oracle */}
        <div>
          <h4 className="text-sm font-medium mb-2">Markets Using This Oracle</h4>
          <div className="flex flex-wrap gap-2">
            {markets.map(m => (
              <span
                key={m.id}
                className="text-xs bg-muted px-2 py-1 rounded font-mono"
              >
                {getDisplaySymbol(m.collateralDenom)}/{getDisplaySymbol(m.debtDenom)}
              </span>
            ))}
          </div>
        </div>

        {/* Configured Feeds */}
        <div>
          <h4 className="text-sm font-medium mb-2">Configured Price Feeds</h4>
          {state.priceFeedsError ? (
            <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/30 rounded p-2">
              Failed to load feeds: {state.priceFeedsError}
            </div>
          ) : state.priceFeeds.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Denom</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Pyth Feed ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.priceFeeds.map((feed) => (
                    <TableRow key={feed.denom}>
                      <TableCell className="font-mono text-xs">{shortenAddress(feed.denom, 10)}</TableCell>
                      <TableCell>{getDisplaySymbol(feed.denom)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <code className="text-xs text-muted-foreground">
                            {shortenFeedId(feed.feed_id)}
                          </code>
                          <button
                            onClick={() => copyToClipboard(feed.feed_id)}
                            className="text-muted-foreground hover:text-foreground p-1"
                            title="Copy feed ID"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No price feeds configured</div>
          )}
        </div>

        {/* Live Prices */}
        <div>
          <h4 className="text-sm font-medium mb-2">Live Prices (What Markets See)</h4>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Denom</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead className="text-right">Price (USD)</TableHead>
                  <TableHead>Updated At</TableHead>
                  <TableHead>Staleness</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {relevantDenoms.map((denom) => {
                  const price = state.prices.get(denom);
                  const error = state.priceErrors.get(denom);
                  const status = getPriceStatus(
                    price?.updated_at ?? null,
                    !!error
                  );
                  const ageSeconds = price ? now - price.updated_at : null;

                  return (
                    <TableRow 
                      key={denom}
                      className={status === 'stale' || status === 'error' ? 'bg-red-500/5' : status === 'warning' ? 'bg-yellow-500/5' : ''}
                    >
                      <TableCell>
                        <span title={status} className="text-lg">
                          {getStatusEmoji(status)}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {denom.startsWith('ibc/') ? shortenAddress(denom, 8) : denom}
                      </TableCell>
                      <TableCell className="font-medium">{getDisplaySymbol(denom)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {price ? (
                          formatPrice(parsePrice(price.price))
                        ) : error ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="text-muted-foreground">Loading...</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {price ? formatTimestamp(price.updated_at) : '—'}
                      </TableCell>
                      <TableCell className="font-mono">
                        {ageSeconds !== null ? (
                          <span className={status === 'stale' ? 'text-red-500 font-medium' : status === 'warning' ? 'text-yellow-500' : ''}>
                            {formatAge(price!.updated_at)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {error ? (
                          <span className="text-xs text-red-500 bg-red-500/10 px-2 py-0.5 rounded">
                            {error}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OracleDebugPage() {
  // Fetch markets from GraphQL
  const { data: marketsData, loading: marketsLoading, error: marketsError } = useGetMarketsQuery({
    variables: {
      limit: 100,
      enabledOnly: false,
    },
  });

  // Build oracle configs from markets
  const oracleConfigs = useMemo(() => {
    if (!marketsData?.markets) return [];

    // Group markets by oracle address
    const oracleMap = new Map<string, string[]>();
    marketsData.markets.forEach(market => {
      const existing = oracleMap.get(market.oracle) || [];
      oracleMap.set(market.oracle, [
        ...existing,
        market.collateralDenom,
        market.debtDenom,
      ]);
    });

    return Array.from(oracleMap.entries()).map(([address, denoms]) => ({
      address,
      denoms: [...new Set(denoms)],
    }));
  }, [marketsData?.markets]);

  // Query all oracles
  const { oracles, isLoading: oraclesLoading, lastUpdated } = useMultipleOracleQueries(
    oracleConfigs,
    10000 // Refresh every 10 seconds
  );

  // Keep track of current time for staleness calculations
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Group markets by oracle
  const marketsByOracle = useMemo(() => {
    const markets = marketsData?.markets;
    if (!markets) return new Map<string, typeof markets>();

    const map = new Map<string, typeof markets>();
    markets.forEach(market => {
      const existing = map.get(market.oracle) || [];
      map.set(market.oracle, [...existing, market]);
    });
    return map;
  }, [marketsData]);

  // Count issues
  const issueCount = useMemo(() => {
    let count = 0;
    oracles.forEach(state => {
      if (state.configError) count++;
      if (state.priceFeedsError) count++;
      state.priceErrors.forEach(() => count++);
      state.prices.forEach(price => {
        const age = now - price.updated_at;
        if (age > STALENESS_STALE_THRESHOLD) count++;
      });
    });
    return count;
  }, [oracles, now]);

  const isLoading = marketsLoading || oraclesLoading;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">🔮 Oracle Debug Dashboard</h1>
          <p className="text-muted-foreground">
            Live oracle contract state — what the market contracts actually see
          </p>
        </div>

        {/* Status Card */}
        <Card className="mb-6">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              Status
              {isLoading && <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-6 text-sm">
              <div className="flex items-center gap-2">
                {marketsError ? (
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                ) : (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                )}
                <span>
                  {marketsError ? 'Error loading markets' : 'Connected'}
                </span>
              </div>

              <div>
                <span className="text-muted-foreground">RPC:</span>{' '}
                <span className="font-mono text-xs">{RPC_ENDPOINT}</span>
              </div>

              <div>
                <span className="text-muted-foreground">Chain:</span>{' '}
                <span className="font-mono">{CHAIN_ID}</span>
              </div>

              <div>
                <span className="text-muted-foreground">Markets:</span>{' '}
                <span className="font-mono">{marketsData?.markets?.length ?? 0}</span>
              </div>

              <div>
                <span className="text-muted-foreground">Oracles:</span>{' '}
                <span className="font-mono">{oracles.size}</span>
              </div>

              <div>
                <span className="text-muted-foreground">Last refresh:</span>{' '}
                <span className="font-mono">
                  {lastUpdated ? formatAge(Math.floor(lastUpdated.getTime() / 1000)) : 'Never'}
                </span>
              </div>

              {issueCount > 0 && (
                <div className="flex items-center gap-2 text-yellow-600">
                  <AlertTriangle className="h-4 w-4" />
                  <span>{issueCount} issue{issueCount > 1 ? 's' : ''} detected</span>
                </div>
              )}
            </div>

            {marketsError && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded text-red-600 text-sm">
                <strong>Error:</strong> {marketsError.message}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Legend Card */}
        <Card className="mb-6">
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span>🟢</span>
                <span className="text-muted-foreground">Fresh (&lt;60s)</span>
              </div>
              <div className="flex items-center gap-2">
                <span>🟡</span>
                <span className="text-muted-foreground">Warning (60-180s)</span>
              </div>
              <div className="flex items-center gap-2">
                <span>🔴</span>
                <span className="text-muted-foreground">Stale (&gt;300s)</span>
              </div>
              <div className="flex items-center gap-2">
                <span>❌</span>
                <span className="text-muted-foreground">Error</span>
              </div>
              <div className="flex items-center gap-2">
                <span>⏳</span>
                <span className="text-muted-foreground">Loading</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Oracle Cards */}
        {isLoading && oracles.size === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p>Loading oracle data...</p>
            </CardContent>
          </Card>
        ) : oracles.size === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Database className="h-8 w-8 mx-auto mb-4 opacity-50" />
              <p>No oracles found. Are there any markets deployed?</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Array.from(oracles.entries()).map(([address, state]) => (
              <OracleCard
                key={address}
                oracleAddress={address}
                state={state}
                markets={marketsByOracle.get(address)?.map(m => ({
                  id: m.id,
                  address: m.marketAddress,
                  collateralDenom: m.collateralDenom,
                  debtDenom: m.debtDenom,
                })) ?? []}
                now={now}
              />
            ))}
          </div>
        )}

        {/* Raw Data Section */}
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground mb-2">
            Show raw oracle data (JSON)
          </summary>
          <Card>
            <CardContent className="pt-4">
              <pre className="text-xs overflow-auto max-h-96 p-4 bg-muted rounded">
                {JSON.stringify(
                  {
                    rpcEndpoint: RPC_ENDPOINT,
                    chainId: CHAIN_ID,
                    markets: marketsData?.markets?.map(m => ({
                      id: m.id,
                      address: m.marketAddress,
                      collateralDenom: m.collateralDenom,
                      debtDenom: m.debtDenom,
                      oracle: m.oracle,
                    })),
                    oracles: Array.from(oracles.entries()).map(([addr, state]) => ({
                      address: addr,
                      config: state.config,
                      configError: state.configError,
                      priceFeeds: state.priceFeeds,
                      priceFeedsError: state.priceFeedsError,
                      prices: Object.fromEntries(state.prices),
                      priceErrors: Object.fromEntries(state.priceErrors),
                    })),
                  },
                  null,
                  2
                )}
              </pre>
            </CardContent>
          </Card>
        </details>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>
            This dashboard queries the oracle contracts directly via CosmJS.
            Prices refresh every 10 seconds automatically.
          </p>
        </div>
      </main>
    </div>
  );
}
