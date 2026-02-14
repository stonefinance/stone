export const VALIDATOR_MNEMONIC =
  'satisfy adjust timber high purchase tuition stool faith fine install that you unaware feed domain license impose boss human eager hat rent enjoy dawn';

export const TEST_USER_1_MNEMONIC =
  'notice oak worry limit wrap speak medal online prefer cluster roof addict wrist behave treat actual wasp year salad speed social layer crew genius';

export const TEST_USER_2_MNEMONIC =
  'quality vacuum hard canal turtle phrase inflict attract muscle sketch jelly eager over ten income page nation favorite captain economy dignity spend nephew exhale';

export const TEST_ACCOUNTS = {
  validator: {
    mnemonic: VALIDATOR_MNEMONIC,
    // Address derived from mnemonic with 'wasm' prefix (via CosmJS)
    address: 'wasm1phaxpevm5wecex2jyaqty2a4v02qj7qmauqnty',
  },
  user1: {
    mnemonic: TEST_USER_1_MNEMONIC,
    // This is the funded test account with stake, ustone, uatom, uusdc
    address: 'wasm1cyyzpxplxdzkeea7kwsydadg87357qna465cff',
  },
  user2: {
    mnemonic: TEST_USER_2_MNEMONIC,
    address: 'wasm1qnk2n4nlkpw9xfqntladh74w6ujtulwnmxnh3k',
  },
};

// Chain configuration
// Note: Local wasmd uses 'stake' (not 'ustake') as the staking/fee denom
export const CHAIN_CONFIG = {
  chainId: 'stone-local-1',
  rpcEndpoint: 'http://localhost:26657',
  restEndpoint: 'http://localhost:1317',
  prefix: 'wasm',
  stakeDenom: 'stake',
  feeDenom: 'stake',
  gasPrice: '0.025stake',
  // Deployer account (same as validator for local dev)
  deployer: {
    mnemonic: VALIDATOR_MNEMONIC,
    address: 'wasm1phaxpevm5wecex2jyaqty2a4v02qj7qmauqnty',
  },
};
