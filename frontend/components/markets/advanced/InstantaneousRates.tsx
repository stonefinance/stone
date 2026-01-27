'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Info } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { formatPercentage } from '@/lib/utils/format';
import { calculateRateAtTarget, IRMParams } from '@/lib/utils/irm';

export interface InstantaneousRatesProps {
  borrowRate: number; // Current borrow rate as decimal (e.g., 0.0485 for 4.85%)
  liquidityRate: number; // Current supply/liquidity rate as decimal
  irmParams?: IRMParams; // IRM parameters for calculating rate at target
  // TODO: Replace with real historical data from GET_MARKET_SNAPSHOTS query
  rateHistory?: { timestamp: number; borrowRate: number; liquidityRate: number }[];
}

type RateType = 'borrow' | 'supply' | 'target';

export function InstantaneousRates({
  borrowRate,
  liquidityRate,
  irmParams,
  rateHistory,
}: InstantaneousRatesProps) {
  const [selectedRateType, setSelectedRateType] = useState<RateType>('borrow');

  // Only use real historical data — never generate fake/mock data
  const chartData = useMemo(() => {
    const history = rateHistory ?? [];

    return history.map((point) => ({
      timestamp: point.timestamp,
      date: new Date(point.timestamp).toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
      }),
      time: new Date(point.timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      borrowRate: point.borrowRate * 100,
      liquidityRate: point.liquidityRate * 100,
    }));
  }, [rateHistory]);

  const MIN_DATA_POINTS_FOR_CHART = 2;
  const hasEnoughData = chartData.length >= MIN_DATA_POINTS_FOR_CHART;

  // Calculate rate at target if IRM params provided
  const rateAtTarget = useMemo(() => {
    if (!irmParams) return null;
    return calculateRateAtTarget(irmParams) * 100; // Convert to percentage
  }, [irmParams]);

  // Get current displayed rate
  const currentRate = useMemo(() => {
    switch (selectedRateType) {
      case 'borrow':
        return borrowRate * 100;
      case 'supply':
        return liquidityRate * 100;
      case 'target':
        return rateAtTarget || borrowRate * 100;
    }
  }, [selectedRateType, borrowRate, liquidityRate, rateAtTarget]);

  // Get data key for chart
  const dataKey = selectedRateType === 'supply' ? 'liquidityRate' : 'borrowRate';

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base font-medium">Instantaneous Rates</CardTitle>
          <Info className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Rate Display and Toggle */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Instantaneous Rate</p>
              <p className="text-4xl font-bold">{formatPercentage(currentRate)}</p>
            </div>
            <div className="flex bg-muted rounded-lg p-1">
              <button
                onClick={() => setSelectedRateType('borrow')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  selectedRateType === 'borrow'
                    ? 'bg-background shadow text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Borrow
              </button>
              <button
                onClick={() => setSelectedRateType('supply')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  selectedRateType === 'supply'
                    ? 'bg-background shadow text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Supply
              </button>
              {rateAtTarget !== null && (
                <button
                  onClick={() => setSelectedRateType('target')}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    selectedRateType === 'target'
                      ? 'bg-background shadow text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Rate at target
                </button>
              )}
            </div>
          </div>

          {/* Historical Chart */}
          <div className="h-48 mt-4">
            {hasEnoughData ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="rateGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#888', fontSize: 11 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#888', fontSize: 11 }}
                    tickFormatter={(value) => `${value.toFixed(1)}%`}
                    domain={['dataMin - 0.5', 'dataMax + 0.5']}
                    width={45}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--background)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value) => [`${(value as number).toFixed(2)}%`, selectedRateType === 'supply' ? 'Supply Rate' : 'Borrow Rate']}
                    labelFormatter={(_, payload) => {
                      if (payload && payload[0]) {
                        const data = payload[0].payload;
                        return `${data.date} ${data.time}`;
                      }
                      return '';
                    }}
                  />
                  {/* Reference line for rate at target when viewing borrow rate */}
                  {selectedRateType !== 'supply' && rateAtTarget !== null && (
                    <ReferenceLine
                      y={rateAtTarget}
                      stroke="#94a3b8"
                      strokeDasharray="3 3"
                      label={{
                        value: 'Target',
                        position: 'right',
                        fill: '#94a3b8',
                        fontSize: 10,
                      }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey={dataKey}
                    stroke="#6366f1"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#rateGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                <p>Not enough historical data to display chart. Rate data will appear as snapshots are collected.</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
