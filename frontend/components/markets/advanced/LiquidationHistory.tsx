'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExternalLink } from 'lucide-react';
import { formatDisplayAmount, shortenAddress } from '@/lib/utils/format';

export interface LiquidationEvent {
  timestamp: number;
  borrower: string;
  collateralSeized: number;
  debtRepaid: number;
  // TODO: Bad debt tracking not yet implemented in schema
  realizedBadDebt?: number;
  txHash?: string;
}

export interface LiquidationHistoryProps {
  // TODO: Replace with data from GET_TRANSACTIONS query with action: 'LIQUIDATE'
  // See advanced-tab-data-analysis.md - Section 6: Liquidation History Table
  liquidations: LiquidationEvent[];
  collateralDenom: string;
  debtDenom: string;
}

export function LiquidationHistory({
  liquidations,
  collateralDenom,
  debtDenom,
}: LiquidationHistoryProps) {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toISOString().replace('T', ' ').slice(0, 19);
  };

  const formatCollateral = (amount: number) => {
    if (amount < 0.0001) return `< 0.0001`;
    return formatDisplayAmount(amount, 6);
  };

  const formatDebt = (amount: number) => {
    return formatDisplayAmount(amount, 2);
  };

  // Calculate price from seized/repaid for display
  const calculatePrice = (collateral: number, debt: number) => {
    if (collateral === 0) return 0;
    return debt / collateral;
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-medium">Liquidation History</CardTitle>
      </CardHeader>
      <CardContent>
        {liquidations.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">No liquidations found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-medium text-muted-foreground">
                    Date & Time
                  </th>
                  <th className="text-left py-3 px-2 font-medium text-muted-foreground">
                    Liquidated Wallet
                  </th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">
                    Collateral Seized ({collateralDenom})
                  </th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">
                    Loan Repaid ({debtDenom})
                  </th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">
                    Realized Bad Debt
                  </th>
                </tr>
              </thead>
              <tbody>
                {liquidations.map((liquidation, index) => {
                  const price = calculatePrice(
                    liquidation.collateralSeized,
                    liquidation.debtRepaid
                  );

                  return (
                    <tr key={index} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 px-2 font-mono text-xs">
                        {formatDate(liquidation.timestamp)}
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs">
                            {liquidation.borrower.slice(2, 4).toUpperCase()}
                          </div>
                          <span className="font-mono">
                            {shortenAddress(liquidation.borrower, 4)}
                          </span>
                          {liquidation.txHash && (
                            <a
                              href={`https://www.mintscan.io/osmosis/tx/${liquidation.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <div>
                          <span className="font-medium">
                            {formatCollateral(liquidation.collateralSeized)}
                          </span>
                          <span className="text-muted-foreground ml-2 text-xs">
                            ${formatDisplayAmount(liquidation.collateralSeized * price, 2)}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <div>
                          <span className="font-medium">
                            {formatDebt(liquidation.debtRepaid)} {debtDenom}
                          </span>
                          <span className="text-muted-foreground ml-2 text-xs">
                            ${formatDisplayAmount(liquidation.debtRepaid, 2)}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <span
                          className={
                            liquidation.realizedBadDebt && liquidation.realizedBadDebt > 0
                              ? 'text-red-500'
                              : 'text-green-500'
                          }
                        >
                          {liquidation.realizedBadDebt !== undefined
                            ? liquidation.realizedBadDebt > 0
                              ? `${formatDisplayAmount(liquidation.realizedBadDebt, 2)} ${debtDenom}`
                              : `0.00 ${debtDenom}`
                            : 'N/A'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
