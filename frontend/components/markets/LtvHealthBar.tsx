'use client';

interface LtvHealthBarProps {
  currentLtv: number;      // 0 to 1 (debt/collateral ratio)
  liquidationLtv: number;  // 0 to 1 (e.g. 0.86)
}

function getBarColor(currentLtv: number, liquidationLtv: number): string {
  if (liquidationLtv <= 0) return '#22c55e';
  const ratio = currentLtv / liquidationLtv;
  if (ratio <= 0.4) return '#22c55e';   // Green
  if (ratio <= 0.65) return '#eab308';  // Yellow
  if (ratio <= 0.85) return '#f97316';  // Orange
  return '#ef4444';                      // Red
}

export function LtvHealthBar({ currentLtv, liquidationLtv }: LtvHealthBarProps) {
  const hasPosition = currentLtv > 0;
  const barColor = getBarColor(currentLtv, liquidationLtv);

  // Fill percentage relative to the full bar (which represents 0 to liquidationLtv)
  const fillPercent = liquidationLtv > 0
    ? Math.min((currentLtv / liquidationLtv) * 100, 100)
    : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">LTV</span>
        <span className="text-muted-foreground">
          Liquidation: {(liquidationLtv * 100).toFixed(0)}%
        </span>
      </div>

      <div className="relative">
        {/* Track */}
        <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
          {hasPosition ? (
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${fillPercent}%`,
                backgroundColor: barColor,
              }}
            />
          ) : null}
        </div>

        {/* Liquidation threshold marker */}
        <div
          className="absolute top-0 h-3 w-0.5 bg-red-500/60"
          style={{ left: '100%', transform: 'translateX(-2px)' }}
          title={`Liquidation at ${(liquidationLtv * 100).toFixed(0)}%`}
        />
      </div>

      {/* Labels */}
      <div className="flex items-center justify-between text-sm">
        {hasPosition ? (
          <>
            <span className="font-medium" style={{ color: barColor }}>
              {(currentLtv * 100).toFixed(1)}%
            </span>
            <span className="text-muted-foreground text-xs">
              {((1 - currentLtv / liquidationLtv) * 100).toFixed(0)}% buffer to liquidation
            </span>
          </>
        ) : (
          <span className="text-muted-foreground text-xs">No active position</span>
        )}
      </div>
    </div>
  );
}
