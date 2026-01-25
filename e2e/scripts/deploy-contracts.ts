import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { GasPrice } from '@cosmjs/stargate';
import * as fs from 'fs';

const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'http://localhost:26657';
const CHAIN_ID = process.env.CHAIN_ID || 'stone-local-1';
const DEPLOYER_MNEMONIC = process.env.DEPLOYER_MNEMONIC ||
  'satisfy adjust timber high purchase tuition stool faith fine install that you unaware feed domain license impose boss human eager hat rent enjoy dawn';

interface DeploymentResult {
  factoryAddress: string;
  factoryCodeId: number;
  marketCodeId: number;
  oracleAddress: string;
  oracleCodeId: number;
  testMarkets: TestMarket[];
}

interface TestMarket {
  marketId: string;
  marketAddress: string;
  collateralDenom: string;
  debtDenom: string;
}

async function waitForChain(maxRetries = 30, delayMs = 2000): Promise<void> {
  console.log('Waiting for chain to be ready...');
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${RPC_ENDPOINT}/status`);
      if (response.ok) {
        const data = await response.json();
        if (data.result?.sync_info?.catching_up === false) {
          console.log('Chain is ready!');
          return;
        }
      }
    } catch {
      // Chain not ready yet
    }
    console.log(`Waiting for chain... (${i + 1}/${maxRetries})`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  throw new Error('Chain did not become ready in time');
}

async function main() {
  console.log('Starting contract deployment...');
  console.log(`RPC Endpoint: ${RPC_ENDPOINT}`);
  console.log(`Chain ID: ${CHAIN_ID}`);

  // Wait for chain to be ready
  await waitForChain();

  // Setup wallet
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(DEPLOYER_MNEMONIC, {
    prefix: 'wasm',
  });
  const [account] = await wallet.getAccounts();
  console.log(`Deployer address: ${account.address}`);

  // Connect to chain
  const client = await SigningCosmWasmClient.connectWithSigner(
    RPC_ENDPOINT,
    wallet,
    { gasPrice: GasPrice.fromString('0.025stake') }
  );

  // Check balance
  const balance = await client.getBalance(account.address, 'stake');
  console.log(`Deployer balance: ${balance.amount} ${balance.denom}`);

  // Read WASM files
  console.log('Reading WASM files...');
  const factoryWasm = fs.readFileSync('/artifacts/stone_factory.wasm');
  const marketWasm = fs.readFileSync('/artifacts/stone_market.wasm');

  // Check if mock oracle exists, if not we'll skip it
  let oracleWasm: Buffer | null = null;
  try {
    oracleWasm = fs.readFileSync('/artifacts/mock_oracle.wasm');
  } catch {
    console.log('Mock oracle WASM not found, will create a simple mock');
  }

  // Upload contracts
  console.log('Uploading factory contract...');
  const factoryUpload = await client.upload(account.address, factoryWasm, 'auto');
  console.log(`Factory code ID: ${factoryUpload.codeId}`);

  console.log('Uploading market contract...');
  const marketUpload = await client.upload(account.address, marketWasm, 'auto');
  console.log(`Market code ID: ${marketUpload.codeId}`);

  let oracleCodeId = 0;
  let oracleAddress = '';

  if (oracleWasm) {
    console.log('Uploading mock oracle contract...');
    const oracleUpload = await client.upload(account.address, oracleWasm, 'auto');
    oracleCodeId = oracleUpload.codeId;
    console.log(`Oracle code ID: ${oracleCodeId}`);

    // Instantiate mock oracle
    console.log('Instantiating mock oracle...');
    const oracleResult = await client.instantiate(
      account.address,
      oracleCodeId,
      {
        prices: [
          { denom: 'uatom', price: '10' },    // $10
          { denom: 'uosmo', price: '1' },     // $1
          { denom: 'ustone', price: '1' },    // $1
        ],
      },
      'Mock Oracle',
      'auto'
    );
    oracleAddress = oracleResult.contractAddress;
    console.log(`Oracle address: ${oracleAddress}`);
  }

  // Instantiate factory
  console.log('Instantiating factory...');
  const factoryResult = await client.instantiate(
    account.address,
    factoryUpload.codeId,
    {
      owner: account.address,
      protocol_fee_collector: account.address,
      market_code_id: marketUpload.codeId,
      market_creation_fee: { denom: 'stake', amount: '1000000' },
    },
    'Stone Factory',
    'auto'
  );
  console.log(`Factory address: ${factoryResult.contractAddress}`);

  // Create test markets
  const testMarkets: TestMarket[] = [];

  // Build oracle config for market creation
  // Use Generic oracle type with optional code ID validation
  const oracleConfig = {
    address: oracleAddress || account.address, // Use deployer address as fallback
    oracle_type: {
      generic: {
        expected_code_id: oracleCodeId > 0 ? oracleCodeId : null,
        max_staleness_secs: 300, // 5 minutes
      },
    },
  };

  // Market 1: ATOM/STONE (collateral/debt)
  console.log('Creating ATOM/STONE market...');
  const market1Result = await client.execute(
    account.address,
    factoryResult.contractAddress,
    {
      create_market: {
        collateral_denom: 'uatom',
        debt_denom: 'ustone',
        oracle_config: oracleConfig,
        params: {
          loan_to_value: '0.75',          // 75%
          liquidation_threshold: '0.80',  // 80%
          liquidation_bonus: '0.05',      // 5%
          liquidation_protocol_fee: '0.1', // 10%
          close_factor: '0.5',            // 50%
          protocol_fee: '0.1',            // 10%
          curator_fee: '0.05',            // 5%
          interest_rate_model: {
            linear: {
              base_rate: '0.02',            // 2%
              slope_1: '0.04',              // 4%
              slope_2: '0.75',              // 75%
              optimal_utilization: '0.80',  // 80%
            },
          },
          supply_cap: null,
          borrow_cap: null,
          is_mutable: true,
        },
      },
    },
    'auto',
    '',
    [{ denom: 'stake', amount: '1000000' }]
  );

  // Parse market address from events
  const market1Address = market1Result.logs[0]?.events
    .find(e => e.type === 'wasm')
    ?.attributes.find(a => a.key === 'market_address')?.value || '';

  testMarkets.push({
    marketId: '1',
    marketAddress: market1Address,
    collateralDenom: 'uatom',
    debtDenom: 'ustone',
  });
  console.log(`Market 1 address: ${market1Address}`);

  // Market 2: OSMO/STONE
  console.log('Creating OSMO/STONE market...');
  const market2Result = await client.execute(
    account.address,
    factoryResult.contractAddress,
    {
      create_market: {
        collateral_denom: 'uosmo',
        debt_denom: 'ustone',
        oracle_config: oracleConfig,
        params: {
          loan_to_value: '0.65',          // 65%
          liquidation_threshold: '0.75',  // 75%
          liquidation_bonus: '0.08',      // 8%
          liquidation_protocol_fee: '0.1', // 10%
          close_factor: '0.5',            // 50%
          protocol_fee: '0.1',            // 10%
          curator_fee: '0.05',            // 5%
          interest_rate_model: {
            linear: {
              base_rate: '0.03',            // 3%
              slope_1: '0.05',              // 5%
              slope_2: '1.00',              // 100%
              optimal_utilization: '0.75',  // 75%
            },
          },
          supply_cap: null,
          borrow_cap: null,
          is_mutable: true,
        },
      },
    },
    'auto',
    '',
    [{ denom: 'stake', amount: '1000000' }]
  );

  const market2Address = market2Result.logs[0]?.events
    .find(e => e.type === 'wasm')
    ?.attributes.find(a => a.key === 'market_address')?.value || '';

  testMarkets.push({
    marketId: '2',
    marketAddress: market2Address,
    collateralDenom: 'uosmo',
    debtDenom: 'ustone',
  });
  console.log(`Market 2 address: ${market2Address}`);

  // Write deployment result
  const result: DeploymentResult = {
    factoryAddress: factoryResult.contractAddress,
    factoryCodeId: factoryUpload.codeId,
    marketCodeId: marketUpload.codeId,
    oracleAddress: oracleAddress,
    oracleCodeId: oracleCodeId,
    testMarkets,
  };

  // Write to shared volume for other services
  fs.writeFileSync('/deployment/result.json', JSON.stringify(result, null, 2));

  // Write .env file for docker-compose
  const envContent = `NEXT_PUBLIC_FACTORY_ADDRESS=${result.factoryAddress}
FACTORY_ADDRESS=${result.factoryAddress}
MARKET_CODE_ID=${result.marketCodeId}
ORACLE_ADDRESS=${result.oracleAddress}
TEST_MARKET_1_ADDRESS=${testMarkets[0]?.marketAddress || ''}
TEST_MARKET_2_ADDRESS=${testMarkets[1]?.marketAddress || ''}`;

  fs.writeFileSync('/deployment/.env.deployment', envContent);

  // Write frontend .env.local with local chain config
  const frontendEnvContent = `# Local chain configuration (auto-generated by deploy-contracts.ts)
NEXT_PUBLIC_CHAIN_ID=stone-local-1
NEXT_PUBLIC_RPC_ENDPOINT=http://localhost:26657
NEXT_PUBLIC_REST_ENDPOINT=http://localhost:1317

# Contract addresses from deployment
NEXT_PUBLIC_FACTORY_ADDRESS=${result.factoryAddress}
NEXT_PUBLIC_ORACLE_ADDRESS=${result.oracleAddress}
`;

  // Also copy to e2e directory for local access
  try {
    fs.copyFileSync('/deployment/.env.deployment', '/app/e2e/.env.deployment');
  } catch {
    // May not exist in all environments
  }

  // Write to frontend directory if accessible
  try {
    fs.writeFileSync('/app/frontend/.env.local', frontendEnvContent);
    console.log('Wrote frontend/.env.local');
  } catch {
    // Frontend directory may not be mounted
  }

  console.log('Deployment complete!');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error('Deployment failed:', error);
  process.exit(1);
});
