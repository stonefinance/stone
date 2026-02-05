import 'server-only';

import { FAUCET_TOKENS, FAUCET_ALLOWED_DENOMS, FAUCET_COOLDOWN_MS } from './faucetClient';

// Dev validator mnemonic — same as e2e/scripts/init-chain.sh
// This account is funded with 1,000,000 of each token at genesis.
// NEVER use this mnemonic outside of local development.
export const DEV_FAUCET_MNEMONIC = process.env.FAUCET_MNEMONIC || '';

export { FAUCET_TOKENS, FAUCET_ALLOWED_DENOMS, FAUCET_COOLDOWN_MS };
