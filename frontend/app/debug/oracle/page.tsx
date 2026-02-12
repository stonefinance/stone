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
import { usePythPrices } from '@/hooks/usePythPrices';
import {
  DEFAULT_PYTH_FEEDS,
  PYTH_HERMES_URL,
  PYTH_CONTRACT_ADDRESS,
  PYTH_MODE,
  PYTH_STALENESS_THRESHOLD_SECONDS,
} from '@/lib/pyth/config';
import { AlertTriangle, CheckCircle, RefreshCw, ExternalLink, Copy } from 'lucide-react';
import { useState, useEffect } from 'react';

// All denoms configured in the Pyth feeds
const ALL_DENOMS = Object.keys(DEFAULT_PYTH_FEEDS);

function formatTimestamp(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString();
}

function formatAge(unixSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const ageSeconds = now - unixSeconds;

  if (ageSeconds < 60) return `${ageSeconds}s ago`;
  if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)}m ${ageSeconds % 60}s ago`;
  if (ageSeconds < 86400) return `${Math.floor(ageSeconds / 3600)}h ${Math.floor((ageSeconds % 3600) / 60)}m ago`;
  return `${Math.floor(ageSeconds / 86400)}d ago`;
}

function shortenFeedId(feedId: string): string {
  if (feedId.length <= 16) return feedId;
  return `${feedId.slice(0, 10)}...${feedId.slice(-6)}`;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

export default function OracleDebugPage() {
  const { prices, rawPrices, isLoading, error, lastUpdated, isStale } = usePythPrices(
    ALL_DENOMS,
    10000 // Refresh every 10 seconds for debug view
  );

  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  // Update "now" every second to keep age display accurate
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">🔮 Oracle Debug Dashboard</h1>
          <p className="text-muted-foreground">
            Real-time Pyth oracle prices used by the Stone protocol
          </p>
        </div>

        {/* Configuration Card */}
        <Card className="mb-6">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-medium">Pyth Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Mode:</span>{' '}
                <span className={`font-mono ${PYTH_MODE === 'live' ? 'text-green-600' : 'text-yellow-600'}`}>
                  {PYTH_MODE}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Hermes URL:</span>{' '}
                <a
                  href={PYTH_HERMES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-blue-600 hover:underline"
                >
                  {PYTH_HERMES_URL.replace('https://', '')}
                </a>
              </div>
              <div>
                <span className="text-muted-foreground">Contract:</span>{' '}
                <span className="font-mono">
                  {PYTH_CONTRACT_ADDRESS ? shortenFeedId(PYTH_CONTRACT_ADDRESS) : 'Not configured'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Staleness threshold:</span>{' '}
                <span className="font-mono">{PYTH_STALENESS_THRESHOLD_SECONDS}s</span>
              </div>
            </div>
          </CardContent>
        </Card>

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
                {error ? (
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                ) : (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                )}
                <span>
                  {error ? 'Error fetching prices' : 'Connected to Pyth'}
                </span>
              </div>

              {isStale && (
                <div className="flex items-center gap-2 text-yellow-600">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Some prices are stale</span>
                </div>
              )}

              <div>
                <span className="text-muted-foreground">Last fetch:</span>{' '}
                <span className="font-mono">
                  {lastUpdated ? formatAge(Math.floor(lastUpdated.getTime() / 1000)) : 'Never'}
                </span>
              </div>

              <div>
                <span className="text-muted-foreground">Feeds configured:</span>{' '}
                <span className="font-mono">{ALL_DENOMS.length}</span>
              </div>

              <div>
                <span className="text-muted-foreground">Prices loaded:</span>{' '}
                <span className="font-mono">{Object.keys(prices).length}</span>
              </div>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded text-red-600 text-sm">
                <strong>Error:</strong> {error.message}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Prices Table */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-medium">Oracle Prices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead className="text-right">Price (USD)</TableHead>
                    <TableHead className="text-right">Confidence</TableHead>
                    <TableHead className="text-right">Conf %</TableHead>
                    <TableHead>Publish Time</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Feed ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ALL_DENOMS.map((denom) => {
                    const feed = DEFAULT_PYTH_FEEDS[denom];
                    const price = prices[denom];
                    const rawPrice = rawPrices[denom];

                    const ageSeconds = rawPrice ? now - rawPrice.publishTime : null;
                    const isStalePrice = ageSeconds !== null && ageSeconds > PYTH_STALENESS_THRESHOLD_SECONDS;
                    const confidencePercent = rawPrice && rawPrice.price
                      ? (rawPrice.confidence / rawPrice.price) * 100
                      : null;

                    return (
                      <TableRow key={denom} className={isStalePrice ? 'bg-yellow-500/5' : ''}>
                        <TableCell className="font-mono font-medium">{denom}</TableCell>
                        <TableCell className="text-muted-foreground">{feed.symbol}</TableCell>
                        <TableCell className="text-right font-mono">
                          {price !== undefined ? (
                            <span className={isStalePrice ? 'text-yellow-600' : ''}>
                              ${price.toFixed(price < 1 ? 6 : 4)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {rawPrice ? (
                            <span className="text-muted-foreground">
                              ±${rawPrice.confidence.toFixed(rawPrice.confidence < 0.01 ? 6 : 4)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {confidencePercent !== null ? (
                            <span className={confidencePercent > 1 ? 'text-yellow-600' : 'text-muted-foreground'}>
                              {confidencePercent.toFixed(3)}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {rawPrice ? formatTimestamp(rawPrice.publishTime) : '—'}
                        </TableCell>
                        <TableCell className="font-mono">
                          {ageSeconds !== null ? (
                            <span className={isStalePrice ? 'text-yellow-600 font-medium' : ''}>
                              {formatAge(rawPrice!.publishTime)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {rawPrice ? (
                            isStalePrice ? (
                              <span className="inline-flex items-center gap-1 text-yellow-600">
                                <AlertTriangle className="h-3 w-3" />
                                Stale
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-green-600">
                                <CheckCircle className="h-3 w-3" />
                                Fresh
                              </span>
                            )
                          ) : (
                            <span className="text-muted-foreground">No data</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <code className="text-xs text-muted-foreground">
                              {shortenFeedId(feed.feedId)}
                            </code>
                            <button
                              onClick={() => copyToClipboard(feed.feedId)}
                              className="text-muted-foreground hover:text-foreground p-1"
                              title="Copy feed ID"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                            <a
                              href={`https://www.pyth.network/price-feeds/${feed.symbol.toLowerCase().replace('/', '-')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground p-1"
                              title="View on Pyth"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Raw Data Card (collapsible) */}
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground mb-2">
            Show raw price data (JSON)
          </summary>
          <Card>
            <CardContent className="pt-4">
              <pre className="text-xs overflow-auto max-h-96 p-4 bg-muted rounded">
                {JSON.stringify(
                  {
                    config: {
                      hermesUrl: PYTH_HERMES_URL,
                      mode: PYTH_MODE,
                      contractAddress: PYTH_CONTRACT_ADDRESS,
                      stalenessThreshold: PYTH_STALENESS_THRESHOLD_SECONDS,
                    },
                    feeds: DEFAULT_PYTH_FEEDS,
                    currentPrices: rawPrices,
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
            This is a debug page for development purposes.
            Prices refresh every 10 seconds automatically.
          </p>
        </div>
      </main>
    </div>
  );
}
