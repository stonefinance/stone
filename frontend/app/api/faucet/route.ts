import { NextRequest, NextResponse } from 'next/server';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { SigningStargateClient, GasPrice } from '@cosmjs/stargate';
import {
  DEV_FAUCET_MNEMONIC,
  FAUCET_ALLOWED_DENOMS,
  FAUCET_TOKENS,
  FAUCET_COOLDOWN_MS,
} from '@/lib/constants/faucet';
import { CHAIN_ID, RPC_ENDPOINT, GAS_PRICE } from '@/lib/constants/contracts';

// Guard: faucet only available on local devnet
const FAUCET_ENABLED =
  CHAIN_ID === 'stone-local-1' ||
  RPC_ENDPOINT.includes('localhost');

// In-memory rate limiter: address → last request timestamp
const cooldowns = new Map<string, number>();

function isOnCooldown(address: string): boolean {
  const last = cooldowns.get(address);
  if (!last) return false;
  return Date.now() - last < FAUCET_COOLDOWN_MS;
}

function remainingCooldown(address: string): number {
  const last = cooldowns.get(address);
  if (!last) return 0;
  return Math.max(0, FAUCET_COOLDOWN_MS - (Date.now() - last));
}

interface FaucetRequest {
  address: string;
  denom: string;
}

export async function POST(request: NextRequest) {
  if (!FAUCET_ENABLED) {
    return NextResponse.json(
      { error: 'Faucet is only available on the local devnet' },
      { status: 404 }
    );
  }

  let body: FaucetRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const { address, denom } = body;

  // Validate address
  if (!address || typeof address !== 'string' || !address.startsWith('wasm1')) {
    return NextResponse.json(
      { error: 'Invalid address — must be a wasm1... address' },
      { status: 400 }
    );
  }

  // Validate denom
  if (!denom || !FAUCET_ALLOWED_DENOMS.includes(denom)) {
    return NextResponse.json(
      { error: `Invalid denom — allowed: ${FAUCET_ALLOWED_DENOMS.join(', ')}` },
      { status: 400 }
    );
  }

  // Rate limit
  if (isOnCooldown(address)) {
    const remaining = Math.ceil(remainingCooldown(address) / 1000);
    return NextResponse.json(
      { error: `Rate limited — try again in ${remaining}s` },
      { status: 429 }
    );
  }

  // Find the token config
  const token = FAUCET_TOKENS.find((t) => t.denom === denom);
  if (!token) {
    return NextResponse.json(
      { error: 'Token configuration not found' },
      { status: 500 }
    );
  }

  try {
    // Create wallet from dev mnemonic
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(DEV_FAUCET_MNEMONIC, {
      prefix: 'wasm',
    });

    const [faucetAccount] = await wallet.getAccounts();

    // Connect signing client
    const client = await SigningStargateClient.connectWithSigner(RPC_ENDPOINT, wallet, {
      gasPrice: GasPrice.fromString(GAS_PRICE),
    });

    // Send tokens
    const result = await client.sendTokens(
      faucetAccount.address,
      address,
      [{ denom: token.denom, amount: token.amount }],
      'auto',
      `Stone devnet faucet: ${token.display}`
    );

    // Record cooldown
    cooldowns.set(address, Date.now());

    client.disconnect();

    return NextResponse.json({
      txHash: result.transactionHash,
      amount: token.amount,
      denom: token.denom,
      display: token.display,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Faucet error:', message);
    return NextResponse.json(
      { error: `Failed to send tokens: ${message}` },
      { status: 500 }
    );
  }
}
