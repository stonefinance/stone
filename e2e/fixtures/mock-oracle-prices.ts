export interface OraclePrice {
  denom: string;
  price: string; // Price in micro units (6 decimals)
}

// Default oracle prices for testing
export const DEFAULT_ORACLE_PRICES: OraclePrice[] = [
  { denom: 'uatom', price: '10000000' },  // $10.00
  { denom: 'uusdc', price: '1000000' },   // $1.00
  { denom: 'ustone', price: '500000' },   // $0.50
  { denom: 'ustake', price: '100000' },   // $0.10
];

// Scenarios for testing different market conditions
export const PRICE_SCENARIOS = {
  // Normal market conditions
  normal: DEFAULT_ORACLE_PRICES,

  // ATOM price crash (for liquidation testing)
  atomCrash: [
    { denom: 'uatom', price: '5000000' },   // $5.00 (50% drop)
    { denom: 'uusdc', price: '1000000' },
    { denom: 'ustone', price: '500000' },
    { denom: 'ustake', price: '100000' },
  ],

  // ATOM price pump
  atomPump: [
    { denom: 'uatom', price: '20000000' },  // $20.00 (100% increase)
    { denom: 'uusdc', price: '1000000' },
    { denom: 'ustone', price: '500000' },
    { denom: 'ustake', price: '100000' },
  ],

  // All assets crash
  marketCrash: [
    { denom: 'uatom', price: '3000000' },   // $3.00
    { denom: 'uusdc', price: '800000' },    // $0.80
    { denom: 'ustone', price: '400000' },   // $0.40
    { denom: 'ustake', price: '50000' },    // $0.05
  ],

  // Stablecoin depeg scenario
  stoneDepeg: [
    { denom: 'uatom', price: '10000000' },
    { denom: 'uusdc', price: '1000000' },
    { denom: 'ustone', price: '450000' },   // $0.45 (10% depeg from $0.50)
    { denom: 'ustake', price: '100000' },
  ],
};

// Helper to convert price scenarios to oracle update format
export function formatPricesForOracle(prices: OraclePrice[]): { denom: string; price: string }[] {
  return prices.map(p => ({
    denom: p.denom,
    price: p.price,
  }));
}

// Helper to calculate USD value
export function calculateUsdValue(amount: string | number, denom: string, prices: OraclePrice[]): number {
  const priceInfo = prices.find(p => p.denom === denom);
  if (!priceInfo) return 0;
  return (Number(amount) * Number(priceInfo.price)) / 1_000_000_000_000; // amount in micro * price in micro / 10^12
}
