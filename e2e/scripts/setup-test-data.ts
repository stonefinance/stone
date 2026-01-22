import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { GasPrice } from '@cosmjs/stargate';
import * as fs from 'fs';
import * as path from 'path';

const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'http://localhost:26657';

// Test user mnemonic
const TEST_USER_1_MNEMONIC =
  'notice oak worry limit wrap speak medal online prefer cluster roof addict wrist behave treat actual wasp year salad speed social layer crew genius';

interface DeploymentResult {
  factoryAddress: string;
  testMarkets: {
    marketId: string;
    marketAddress: string;
    collateralDenom: string;
    debtDenom: string;
  }[];
}

async function main() {
  console.log('Setting up test data...');

  // Read deployment result
  let deployment: DeploymentResult;
  try {
    const deploymentPath = process.env.DEPLOYMENT_PATH || '/deployment/result.json';
    deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf-8'));
  } catch {
    // Try local path
    const localPath = path.join(__dirname, '..', '.deployment-result.json');
    deployment = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
  }

  console.log('Using deployment:', deployment);

  // Setup wallet for test user
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(TEST_USER_1_MNEMONIC, {
    prefix: 'wasm',
  });
  const [account] = await wallet.getAccounts();
  console.log(`Test user address: ${account.address}`);

  // Connect to chain
  const client = await SigningCosmWasmClient.connectWithSigner(
    RPC_ENDPOINT,
    wallet,
    { gasPrice: GasPrice.fromString('0.025ustake') }
  );

  // Check balances
  const atomBalance = await client.getBalance(account.address, 'uatom');
  const stoneBalance = await client.getBalance(account.address, 'ustone');
  console.log(`Test user ATOM balance: ${atomBalance.amount}`);
  console.log(`Test user STONE balance: ${stoneBalance.amount}`);

  if (deployment.testMarkets.length === 0) {
    console.log('No test markets found, skipping position setup');
    return;
  }

  const market1 = deployment.testMarkets[0];
  console.log(`\nSetting up position in market: ${market1.marketAddress}`);

  // Supply some STONE as liquidity (so others can borrow)
  console.log('Supplying STONE liquidity...');
  try {
    const supplyResult = await client.execute(
      account.address,
      market1.marketAddress,
      { supply: {} },
      'auto',
      '',
      [{ denom: 'ustone', amount: '10000000000' }] // 10,000 STONE
    );
    console.log(`Supply tx: ${supplyResult.transactionHash}`);
  } catch (error) {
    console.log('Supply failed (may already have liquidity):', error);
  }

  // Supply some collateral (ATOM)
  console.log('Supplying ATOM collateral...');
  try {
    const collateralResult = await client.execute(
      account.address,
      market1.marketAddress,
      { supply_collateral: {} },
      'auto',
      '',
      [{ denom: 'uatom', amount: '1000000000' }] // 1,000 ATOM
    );
    console.log(`Collateral tx: ${collateralResult.transactionHash}`);
  } catch (error) {
    console.log('Collateral supply failed:', error);
  }

  console.log('\nTest data setup complete!');
}

main().catch((error) => {
  console.error('Test data setup failed:', error);
  process.exit(1);
});
