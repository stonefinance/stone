'use client';

import { useMemo } from 'react';
import { InstantaneousRates } from './InstantaneousRates';
import { OracleAttributes } from './OracleAttributes';
import { IRMBreakdown } from './IRMBreakdown';
import { Liquidations } from './Liquidations';
import { CollateralAtRisk } from './CollateralAtRisk';
import { LiquidationHistory, LiquidationEvent } from './LiquidationHistory';
import { parseIRMParams, IRMParams } from '@/lib/utils/irm';
import { Position } from '@/lib/utils/collateral-risk';
import {
  MOCK_ADVANCED_MARKET_DATA,
  MOCK_IRM_PARAMS,
  MOCK_POSITIONS,
  MOCK_LIQUIDATION_HISTORY,
} from '@/lib/mock/advanced-tab-data';

interface MarketData {
  oracle?: string;
  collateralDenom: string;
  debtDenom: string;
  borrowRate?: number;
  liquidityRate?: number;
  utilization?: number;
  totalSupplied?: string;
  totalCollateral?: string;
  params?: {
    liquidation_threshold?: string;
    liquidation_bonus?: string;
    interest_rate_model?: Record<string, unknown>;
  };
}

export interface AdvancedTabProps {
  market: MarketData;
}

export function AdvancedTab({ market }: AdvancedTabProps) {
  const interestRateModel = market.params?.interest_rate_model;

  // Parse IRM params from market data or use mock
  const irmParams: IRMParams = useMemo(() => {
    if (interestRateModel) {
      return parseIRMParams(interestRateModel);
    }
    return MOCK_IRM_PARAMS;
  }, [interestRateModel]);

  // Get rates (use market data or mock)
  const borrowRate = market.borrowRate ?? MOCK_ADVANCED_MARKET_DATA.borrowRate;
  const liquidityRate = market.liquidityRate ?? MOCK_ADVANCED_MARKET_DATA.liquidityRate;
  const utilization = market.utilization ?? MOCK_ADVANCED_MARKET_DATA.utilization;

  // Get liquidation params (use market data or mock)
  const liquidationThreshold = market.params?.liquidation_threshold
    ? parseFloat(market.params.liquidation_threshold)
    : MOCK_ADVANCED_MARKET_DATA.liquidationThreshold;
  const liquidationBonus = market.params?.liquidation_bonus
    ? parseFloat(market.params.liquidation_bonus)
    : MOCK_ADVANCED_MARKET_DATA.liquidationBonus;

  // Oracle data (mostly mock for now)
  const oracleAddress = market.oracle ?? MOCK_ADVANCED_MARKET_DATA.oracleAddress;

  // Total supply for calculations
  const totalSupply = market.totalSupplied
    ? parseFloat(market.totalSupplied)
    : MOCK_ADVANCED_MARKET_DATA.totalSupply;

  // TODO: These values require additional data sources
  // See advanced-tab-data-analysis.md for implementation details
  const oraclePrice = MOCK_ADVANCED_MARKET_DATA.oraclePrice;
  const referencePrice = MOCK_ADVANCED_MARKET_DATA.referencePrice;
  const totalCollateral = market.totalCollateral
    ? parseFloat(market.totalCollateral)
    : totalSupply / oraclePrice; // Estimate
  const valueSecured = totalCollateral * oraclePrice;

  // TODO: Replace with real position data from GET_LIQUIDATABLE_POSITIONS query
  const positions: Position[] = MOCK_POSITIONS;

  // TODO: Replace with real liquidation data from GET_TRANSACTIONS query with action: 'LIQUIDATE'
  const liquidations: LiquidationEvent[] = MOCK_LIQUIDATION_HISTORY;

  return (
    <div className="space-y-6">
      {/* Section 1: Instantaneous Rates */}
      <InstantaneousRates
        borrowRate={borrowRate}
        liquidityRate={liquidityRate}
        irmParams={irmParams}
      />

      {/* Section 2: Oracle Attributes */}
      <OracleAttributes
        oracleAddress={oracleAddress}
        collateralDenom={market.collateralDenom}
        debtDenom={market.debtDenom}
        oraclePrice={oraclePrice}
        referencePrice={referencePrice}
        valueSecured={valueSecured}
      />

      {/* Section 3: IRM Breakdown */}
      <IRMBreakdown
        irmParams={irmParams}
        currentUtilization={utilization}
        totalSupply={totalSupply}
        price={1} // TODO: Get actual price for USD conversion
        irmAddress={MOCK_ADVANCED_MARKET_DATA.irmAddress}
      />

      {/* Section 4: Liquidations */}
      <Liquidations
        liquidationThreshold={liquidationThreshold}
        liquidationBonus={liquidationBonus}
        debtDenom={market.debtDenom}
        realizedBadDebt={0.001} // TODO: Implement bad debt tracking
        unrealizedBadDebt={0} // TODO: Implement bad debt tracking
      />

      {/* Section 5: Collateral at Risk */}
      <CollateralAtRisk
        positions={positions}
        currentPrice={oraclePrice}
        liquidationThreshold={liquidationThreshold}
        collateralDenom={market.collateralDenom}
      />

      {/* Section 6: Liquidation History */}
      <LiquidationHistory
        liquidations={liquidations}
        collateralDenom={market.collateralDenom}
        debtDenom={market.debtDenom}
      />
    </div>
  );
}
