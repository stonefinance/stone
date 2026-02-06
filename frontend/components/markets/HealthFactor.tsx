import { getHealthFactorColor, getHealthFactorStatus } from '@/lib/utils/format';

interface HealthFactorProps {
  healthFactor?: number;
  size?: 'sm' | 'md' | 'lg';
}

export function HealthFactor({ healthFactor, size = 'md' }: HealthFactorProps) {
  const color = getHealthFactorColor(healthFactor);
  const status = getHealthFactorStatus(healthFactor);

  const sizeClasses = {
    sm: 'text-2xl',
    md: 'text-4xl',
    lg: 'text-6xl',
  };

  const isFiniteHealth = Number.isFinite(healthFactor);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className={`font-bold ${sizeClasses[size]} ${color}`}>
          {healthFactor === null || healthFactor === undefined
            ? 'N/A'
            : isFiniteHealth
            ? healthFactor.toFixed(2)
            : '∞'}
        </span>
        <span className={`text-sm font-medium ${color}`}>{status}</span>
      </div>

      {isFiniteHealth && (
        <div className="space-y-1">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                healthFactor >= 2
                  ? 'bg-green-600'
                  : healthFactor >= 1.5
                  ? 'bg-yellow-600'
                  : healthFactor >= 1.2
                  ? 'bg-orange-600'
                  : 'bg-red-600'
              }`}
              style={{
                width: `${Math.min((healthFactor / 3) * 100, 100)}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
