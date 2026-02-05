// Faucet configuration — only used on local devnet (stone-local-1)

export interface FaucetToken {
  denom: string;
  display: string;
  amount: string; // micro-denom amount to dispense
  decimals: number;
}

export const FAUCET_TOKENS: FaucetToken[] = [
  { denom: 'uusdc', display: 'USDC', amount: '10000000000', decimals: 6 }, // 10,000 USDC
  { denom: 'uatom', display: 'ATOM', amount: '10000000000', decimals: 6 }, // 10,000 ATOM
  { denom: 'ustone', display: 'STONE', amount: '10000000000', decimals: 6 }, // 10,000 STONE
];

export const FAUCET_ALLOWED_DENOMS = FAUCET_TOKENS.map((t) => t.denom);

// Cooldown between faucet requests per address+denom (milliseconds)
export const FAUCET_COOLDOWN_MS = 60_000; // 1 minute
