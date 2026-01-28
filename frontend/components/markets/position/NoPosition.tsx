'use client';

import { CardContent } from '@/components/ui/card';

export function NoPosition() {
  return (
    <CardContent className="py-12 text-center space-y-2">
      <p className="text-muted-foreground">
        You don&apos;t have a position in this market yet.
      </p>
      <div className="text-sm text-muted-foreground space-y-1">
        <p>→ Supply liquidity to earn yield</p>
        <p>→ Deposit collateral and borrow</p>
      </div>
    </CardContent>
  );
}
