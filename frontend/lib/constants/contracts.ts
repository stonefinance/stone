// Contract Addresses - Update these after deployment
export const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS || '';

// Network Configuration
export const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || 'osmo-test-5';
export const RPC_ENDPOINT = process.env.NEXT_PUBLIC_RPC_ENDPOINT || 'https://rpc.testnet.osmosis.zone';
export const REST_ENDPOINT = process.env.NEXT_PUBLIC_REST_ENDPOINT || 'https://lcd.testnet.osmosis.zone';

// Chain Info for Keplr
export const CHAIN_INFO = {
  chainId: CHAIN_ID,
  chainName: 'Osmosis Testnet',
  rpc: RPC_ENDPOINT,
  rest: REST_ENDPOINT,
  bip44: {
    coinType: 118,
  },
  bech32Config: {
    bech32PrefixAccAddr: 'osmo',
    bech32PrefixAccPub: 'osmopub',
    bech32PrefixValAddr: 'osmovaloper',
    bech32PrefixValPub: 'osmovaloperpub',
    bech32PrefixConsAddr: 'osmovalcons',
    bech32PrefixConsPub: 'osmovalconspub',
  },
  currencies: [
    {
      coinDenom: 'OSMO',
      coinMinimalDenom: 'uosmo',
      coinDecimals: 6,
      coinGeckoId: 'osmosis',
    },
  ],
  feeCurrencies: [
    {
      coinDenom: 'OSMO',
      coinMinimalDenom: 'uosmo',
      coinDecimals: 6,
      coinGeckoId: 'osmosis',
      gasPriceStep: {
        low: 0.0025,
        average: 0.025,
        high: 0.04,
      },
    },
  ],
  stakeCurrency: {
    coinDenom: 'OSMO',
    coinMinimalDenom: 'uosmo',
    coinDecimals: 6,
    coinGeckoId: 'osmosis',
  },
};

// Gas limits
export const GAS_LIMITS = {
  SUPPLY: 200_000,
  WITHDRAW: 200_000,
  SUPPLY_COLLATERAL: 200_000,
  WITHDRAW_COLLATERAL: 200_000,
  BORROW: 250_000,
  REPAY: 200_000,
  LIQUIDATE: 300_000,
};
