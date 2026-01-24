'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatDisplayAmount } from '@/lib/utils/format';
import {
  calculateCollateralAtRisk,
  convertCollateralRiskToUSD,
  generatePriceDropRange,
  Position,
} from '@/lib/utils/collateral-risk';

export interface CollateralAtRiskProps {
  // TODO: Replace with data from GET_LIQUIDATABLE_POSITIONS query
  // See advanced-tab-data-analysis.md - Section 5: Collateral at Risk Chart
  positions: Position[];
  currentPrice: number;
  liquidationThreshold: number; // As decimal (e.g., 0.86)
  collateralDenom: string;
}

type DisplayUnit = 'usd' | 'collateral';

export function CollateralAtRisk({
  positions,
  currentPrice,
  liquidationThreshold,
  collateralDenom,
}: CollateralAtRiskProps) {
  const [displayUnit, setDisplayUnit] = useState<DisplayUnit>('usd');

  // Calculate collateral at risk for each price drop percentage
  const priceDropRange = useMemo(() => generatePriceDropRange(-90, 0, 5), []);

  const riskDataCollateral = useMemo(
    () => calculateCollateralAtRisk(positions, currentPrice, liquidationThreshold, priceDropRange),
    [positions, currentPrice, liquidationThreshold, priceDropRange]
  );

  const riskDataUSD = useMemo(
    () => convertCollateralRiskToUSD(riskDataCollateral, currentPrice),
    [riskDataCollateral, currentPrice]
  );

  // Format data for chart
  const chartData = useMemo(() => {
    const data = displayUnit === 'usd' ? riskDataUSD : riskDataCollateral;
    return data.map((point) => ({
      priceChange: `${point.priceDropPercent}%`,
      priceDropPercent: point.priceDropPercent,
      collateralAtRisk: point.collateralAtRisk,
    }));
  }, [riskDataUSD, riskDataCollateral, displayUnit]);

  // Format values for display
  const formatValue = (value: number) => {
    if (displayUnit === 'usd') {
      if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
      if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
      if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
      return `$${value.toFixed(2)}`;
    } else {
      if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
      if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
      return formatDisplayAmount(value, 2);
    }
  };

  const formatYAxis = (value: number) => {
    if (displayUnit === 'usd') {
      if (value >= 1e9) return `$${(value / 1e9).toFixed(0)}B`;
      if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
      if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
      return `$${value.toFixed(0)}`;
    } else {
      if (value >= 1e3) return `${(value / 1e3).toFixed(0)}k`;
      return value.toFixed(0);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">Collateral at risk</CardTitle>
          <div className="flex bg-muted rounded-lg p-1">
            <button
              onClick={() => setDisplayUnit('usd')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                displayUnit === 'usd'
                  ? 'bg-background shadow text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              USD
            </button>
            <button
              onClick={() => setDisplayUnit('collateral')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                displayUnit === 'collateral'
                  ? 'bg-background shadow text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {collateralDenom}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="collateralRiskGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="priceChange"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#888', fontSize: 10 }}
                interval={1}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#888', fontSize: 10 }}
                tickFormatter={formatYAxis}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--background)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value) => [
                  displayUnit === 'usd'
                    ? formatValue(value as number)
                    : `${formatDisplayAmount(value as number, 4)} ${collateralDenom}`,
                  'At Risk',
                ]}
                labelFormatter={(label) => `Oracle price change: ${label}`}
              />
              <Area
                type="monotone"
                dataKey="collateralAtRisk"
                stroke="#6366f1"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#collateralRiskGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="text-center mt-2">
          <span className="text-xs text-muted-foreground">Oracle price change</span>
        </div>
      </CardContent>
    </Card>
  );
}
