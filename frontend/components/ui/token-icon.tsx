import { cn } from '@/lib/utils';

// Color palette for token icons based on first letter
const tokenColors: Record<string, string> = {
  A: 'bg-purple-500',
  B: 'bg-blue-500',
  C: 'bg-cyan-500',
  D: 'bg-emerald-500',
  E: 'bg-green-500',
  F: 'bg-lime-500',
  G: 'bg-yellow-500',
  H: 'bg-amber-500',
  I: 'bg-orange-500',
  J: 'bg-red-500',
  K: 'bg-pink-500',
  L: 'bg-rose-500',
  M: 'bg-fuchsia-500',
  N: 'bg-violet-500',
  O: 'bg-indigo-500',
  P: 'bg-blue-600',
  Q: 'bg-sky-500',
  R: 'bg-teal-500',
  S: 'bg-emerald-600',
  T: 'bg-green-600',
  U: 'bg-lime-600',
  V: 'bg-yellow-600',
  W: 'bg-amber-600',
  X: 'bg-orange-600',
  Y: 'bg-red-600',
  Z: 'bg-pink-600',
};

interface TokenIconProps {
  symbol: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-5 w-5 text-[10px]',
  md: 'h-6 w-6 text-xs',
  lg: 'h-8 w-8 text-sm',
};

export function TokenIcon({ symbol, size = 'md', className }: TokenIconProps) {
  const firstLetter = symbol.charAt(0).toUpperCase();
  const colorClass = tokenColors[firstLetter] || 'bg-gray-500';

  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-full text-white font-semibold',
        colorClass,
        sizeClasses[size],
        className
      )}
    >
      {firstLetter}
    </div>
  );
}
