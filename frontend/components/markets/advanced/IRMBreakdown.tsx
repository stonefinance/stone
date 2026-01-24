'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Copy, ExternalLink } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
} from 'recharts';
import { formatPercentage, formatDisplayAmount, shortenAddress } from '@/lib/utils/format';
import {
  IRMParams,
  generateIRMCurvePoints,
  calculateBorrowToTarget,
} from '@/lib/utils/irm';

export interface IRMBreakdownProps {
  irmParams: IRMParams;
  currentUtilization: number; // As decimal (e.g., 0.7995 for 79.95%)
  totalSupply: number; // Total supply in base units
  // TODO: Price requires oracle integration for USD value
  price?: number;
  // TODO: IRM contract address may need separate field in schema
  irmAddress?: string;
}

export function IRMBreakdown({
  irmParams,
  currentUtilization,
  totalSupply,
  price = 1,
  irmAddress,
}: IRMBreakdownProps) {
  // Generate curve points
  const curvePoints = useMemo(
    () => generateIRMCurvePoints(irmParams, 101),
    [irmParams]
  );

  // Calculate key values
  const targetUtilization = parseFloat(irmParams.optimal_utilization);
  const borrowToTarget = calculateBorrowToTarget(
    currentUtilization,
    targetUtilization,
    totalSupply,
    price
  );

  // Find current rate on curve
  const currentPoint = useMemo(() => {
    const utilPercent = currentUtilization * 100;
    const nearestPoint = curvePoints.reduce((prev, curr) =>
      Math.abs(curr.utilization - utilPercent) < Math.abs(prev.utilization - utilPercent)
        ? curr
        : prev
    );
    return nearestPoint;
  }, [curvePoints, currentUtilization]);

  // Find target point on curve
  const targetPoint = useMemo(() => {
    const targetPercent = targetUtilization * 100;
    const nearestPoint = curvePoints.reduce((prev, curr) =>
      Math.abs(curr.utilization - targetPercent) < Math.abs(prev.utilization - targetPercent)
        ? curr
        : prev
    );
    return nearestPoint;
  }, [curvePoints, targetUtilization]);

  const handleCopyAddress = () => {
    if (irmAddress) {
      navigator.clipboard.writeText(irmAddress);
    }
  };

  const formatLargeUSD = (value: number) => {
    const absValue = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (absValue >= 1e9) return `${sign}$${(absValue / 1e9).toFixed(2)}B`;
    if (absValue >= 1e6) return `${sign}$${(absValue / 1e6).toFixed(2)}M`;
    if (absValue >= 1e3) return `${sign}$${(absValue / 1e3).toFixed(2)}K`;
    return `${sign}$${absValue.toFixed(2)}`;
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-medium">IRM Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-8">
          {/* Left Column - Metrics */}
          <div className="space-y-4">
            {/* Target Utilization */}
            <div className="flex items-center justify-between py-3 border-b">
              <span className="text-sm text-muted-foreground">Target utilization</span>
              <span className="text-sm font-medium">
                {formatPercentage(targetUtilization * 100)}
              </span>
            </div>

            {/* Current Utilization */}
            <div className="flex items-center justify-between py-3 border-b">
              <span className="text-sm text-muted-foreground">Current utilization</span>
              <span className="text-sm font-medium">
                {formatPercentage(currentUtilization * 100)}
              </span>
            </div>

            {/* Borrow Amount to Target */}
            <div className="flex items-center justify-between py-3 border-b">
              <span className="text-sm text-muted-foreground">
                Borrow amount to target utilization
              </span>
              <span className="text-sm font-medium">{formatLargeUSD(borrowToTarget)}</span>
            </div>

            {/* Interest Rate Model Address */}
            {irmAddress && (
              <div className="flex items-center justify-between py-3">
                <span className="text-sm text-muted-foreground">Interest rate model</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">{shortenAddress(irmAddress, 4)}</span>
                  <button
                    onClick={handleCopyAddress}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="Copy address"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <a
                    href={`https://www.mintscan.io/osmosis/address/${irmAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="View on explorer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - IRM Curve Chart */}
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curvePoints} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="utilization"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#888', fontSize: 10 }}
                  tickFormatter={(value) => `${value}%`}
                  domain={[0, 100]}
                  ticks={[0, 90, 100]}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#888', fontSize: 10 }}
                  tickFormatter={(value) => `${value.toFixed(0)}%`}
                  width={35}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--background)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(value) => [`${(value as number).toFixed(2)}%`, 'Rate']}
                  labelFormatter={(value) => `Utilization: ${value}%`}
                />
                {/* Reference line at target utilization */}
                <ReferenceLine
                  x={targetUtilization * 100}
                  stroke="#94a3b8"
                  strokeDasharray="3 3"
                />
                {/* Curve line */}
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                />
                {/* Current position dot */}
                <ReferenceDot
                  x={currentPoint.utilization}
                  y={currentPoint.rate}
                  r={6}
                  fill="#6366f1"
                  stroke="#fff"
                  strokeWidth={2}
                  label={{
                    value: 'Current',
                    position: 'top',
                    fill: '#888',
                    fontSize: 10,
                  }}
                />
                {/* Target position dot */}
                <ReferenceDot
                  x={targetPoint.utilization}
                  y={targetPoint.rate}
                  r={4}
                  fill="#94a3b8"
                  stroke="#fff"
                  strokeWidth={2}
                  label={{
                    value: 'Target',
                    position: 'top',
                    fill: '#888',
                    fontSize: 10,
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
