export const VALIDATOR_MNEMONIC =
  'satisfy adjust timber high purchase tuition stool faith fine install that you unaware feed domain license impose boss human eager hat rent enjoy dawn';

export const TEST_USER_1_MNEMONIC =
  'notice oak worry limit wrap speak medal online prefer cluster roof addict wrist behave treat actual wasp year salad speed social layer crew genius';

export const TEST_USER_2_MNEMONIC =
  'quality vacuum hard canal turtle phrase inflict attract muscle sketch jelly eager over ten income page nation favorite captain economy dignity spend nephew exhale';

export const TEST_ACCOUNTS = {
  validator: {
    mnemonic: VALIDATOR_MNEMONIC,
    // Address derived from mnemonic with 'wasm' prefix
    address: 'wasm1cyyzpxplxdzkeea7kwsydadg87357qnahakaks',
  },
  user1: {
    mnemonic: TEST_USER_1_MNEMONIC,
    address: 'wasm18vd8fpwxzck93qlwghaj6arh4p7c5n89uzcee5',
  },
  user2: {
    mnemonic: TEST_USER_2_MNEMONIC,
    address: 'wasm1qnk2n4nlkpw9xfqntladh74w6ujtulwnmxnh3k',
  },
};

// Chain configuration
export const CHAIN_CONFIG = {
  chainId: 'stone-local-1',
  rpcEndpoint: 'http://localhost:26657',
  restEndpoint: 'http://localhost:1317',
  prefix: 'wasm',
  stakeDenom: 'ustake',
  feeDenom: 'ustone',
  gasPrice: '0.025ustake',
};
