// Contract Addresses - Update these after deployment
export const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS || '';

// Determine if we're using local chain
const isLocal = process.env.NEXT_PUBLIC_CHAIN_ID === 'stone-local-1' ||
                process.env.NEXT_PUBLIC_RPC_ENDPOINT?.includes('localhost');

// Network Configuration
export const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || (isLocal ? 'stone-local-1' : 'osmo-test-5');
export const RPC_ENDPOINT = process.env.NEXT_PUBLIC_RPC_ENDPOINT || (isLocal ? 'http://localhost:26657' : 'https://rpc.testnet.osmosis.zone');
export const REST_ENDPOINT = process.env.NEXT_PUBLIC_REST_ENDPOINT || (isLocal ? 'http://localhost:1317' : 'https://lcd.testnet.osmosis.zone');

// Gas price configuration
// Note: Local chain uses 'stake' (not 'ustake') as the fee denom
export const GAS_PRICE = isLocal ? '0.025stake' : '0.025uosmo';

// Local chain configuration
// Note: The local wasmd chain uses 'stake' without the 'u' prefix
const LOCAL_CHAIN_INFO = {
  chainId: CHAIN_ID,
  chainName: 'Stone Local',
  rpc: RPC_ENDPOINT,
  rest: REST_ENDPOINT,
  bip44: {
    coinType: 118,
  },
  bech32Config: {
    bech32PrefixAccAddr: 'wasm',
    bech32PrefixAccPub: 'wasmpub',
    bech32PrefixValAddr: 'wasmvaloper',
    bech32PrefixValPub: 'wasmvaloperpub',
    bech32PrefixConsAddr: 'wasmvalcons',
    bech32PrefixConsPub: 'wasmvalconspub',
  },
  currencies: [
    {
      coinDenom: 'STAKE',
      coinMinimalDenom: 'stake',
      coinDecimals: 6,
    },
    {
      coinDenom: 'STONE',
      coinMinimalDenom: 'ustone',
      coinDecimals: 6,
    },
    {
      coinDenom: 'OSMO',
      coinMinimalDenom: 'uosmo',
      coinDecimals: 6,
    },
    {
      coinDenom: 'ATOM',
      coinMinimalDenom: 'uatom',
      coinDecimals: 6,
    },
    {
      coinDenom: 'USDC',
      coinMinimalDenom: 'uusdc',
      coinDecimals: 6,
    },
  ],
  feeCurrencies: [
    {
      coinDenom: 'STAKE',
      coinMinimalDenom: 'stake',
      coinDecimals: 6,
      gasPriceStep: {
        low: 0.0025,
        average: 0.025,
        high: 0.04,
      },
    },
  ],
  stakeCurrency: {
    coinDenom: 'STAKE',
    coinMinimalDenom: 'stake',
    coinDecimals: 6,
  },
};

// Osmosis testnet configuration
const OSMOSIS_CHAIN_INFO = {
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

// Chain Info for Keplr - select based on environment
export const CHAIN_INFO = isLocal ? LOCAL_CHAIN_INFO : OSMOSIS_CHAIN_INFO;

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
