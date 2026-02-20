import { ExecuteResult, SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { GasPrice } from '@cosmjs/stargate';
import * as fs from 'fs';

/**
 * Extracts the market address from the wasm events in an ExecuteResult.
 * Throws an error if the market_address attribute is not found.
 */
function extractMarketAddress(result: ExecuteResult): string {
  const wasmEvents = result.events.filter((e) => e.type === 'wasm');
  const allWasmAttributes = wasmEvents.flatMap((e) => e.attributes);
  const marketAddressAttr = allWasmAttributes.find((a) => a.key === 'market_address');

  if (!marketAddressAttr?.value) {
    const availableKeys = allWasmAttributes.map((a) => a.key).join(', ');
    throw new Error(
      `market_address not found in wasm events. ` +
      `Available wasm attributes: [${availableKeys || 'none'}]`
    );
  }

  return marketAddressAttr.value;
}

const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'http://localhost:26657';
const CHAIN_ID = process.env.CHAIN_ID || 'stone-local-1';
const DEPLOYER_MNEMONIC = process.env.DEPLOYER_MNEMONIC ||
  'satisfy adjust timber high purchase tuition stool faith fine install that you unaware feed domain license impose boss human eager hat rent enjoy dawn';
const ORACLE_TYPE = (process.env.ORACLE_TYPE || 'pyth').toLowerCase(); // 'mock' or 'pyth'

// Pyth configuration file path (optional)
const PYTH_CONFIG_PATH = process.env.PYTH_CONFIG_PATH;

interface DeploymentResult {
  factoryAddress: string;
  factoryCodeId: number;
  marketCodeId: number;
  oracleAddress: string;
  oracleCodeId: number;
  pythAdapterAddress?: string;
  pythAdapterCodeId?: number;
  pythContractAddress?: string;
  testMarkets: TestMarket[];
}

interface TestMarket {
  marketId: string;
  marketAddress: string;
  collateralDenom: string;
  debtDenom: string;
}

interface PythMockPrice {
  price: number;
  expo: number;
  conf: number;
}

interface PythPriceFeedConfig {
  denom: string;
  feedId: string;
  mockPrice?: PythMockPrice;
}

interface PythDeploymentConfig {
  chainId: string;
  pythContractAddress: string;
  note?: string;
  priceFeeds: PythPriceFeedConfig[];
}

// Default Pyth feed IDs for common assets
// Source: Pyth Network price feed IDs (https://pyth.network/price-feed-ids)
const DEFAULT_PYTH_FEEDS: PythPriceFeedConfig[] = [
  {
    denom: 'uatom',
    feedId: 'b00b60f88b03a6a625a8d1c048c3f66653edf217439983d037e7222c4e612819', // ATOM/USD
  },
  {
    denom: 'uusdc',
    feedId: 'eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a', // USDC/USD
  },
  {
    denom: 'ustone',
    feedId: '4ea5bb4d2f5900cc2e97ba534240950740b4d3b89fe712a94a7304fd2fd92702', // AKT/USD feed as proxy for STONE
  },
];

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

function loadPythConfig(): PythDeploymentConfig | null {
  // If a config path is provided, try to load it
  if (PYTH_CONFIG_PATH && fs.existsSync(PYTH_CONFIG_PATH)) {
    try {
      const config = JSON.parse(fs.readFileSync(PYTH_CONFIG_PATH, 'utf-8'));
      console.log(`Loaded Pyth config from ${PYTH_CONFIG_PATH}`);
      return config;
    } catch (error) {
      console.warn(`Failed to load Pyth config from ${PYTH_CONFIG_PATH}:`, error);
    }
  }

  // Try to load config based on chain ID
  const configPaths = [
    `/app/e2e/deploy/${CHAIN_ID}.json`,
    `./deploy/${CHAIN_ID}.json`,
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        console.log(`Loaded Pyth config from ${configPath}`);
        return config;
      } catch {
        // Continue to next path
      }
    }
  }

  return null;
}

async function deployMockOracle(
  client: SigningCosmWasmClient,
  account: { address: string }
): Promise<{ oracleAddress: string; oracleCodeId: number }> {
  console.log('Deploying mock oracle...');

  // Read mock oracle WASM
  const oracleWasm = fs.readFileSync('/artifacts/mock_oracle.wasm');

  // Upload mock oracle
  console.log('Uploading mock oracle contract...');
  const oracleUpload = await client.upload(account.address, oracleWasm, 'auto');
  console.log(`Mock oracle code ID: ${oracleUpload.codeId}`);

  // Instantiate mock oracle
  console.log('Instantiating mock oracle...');
  const oracleResult = await client.instantiate(
    account.address,
    oracleUpload.codeId,
    {
      prices: [
        { denom: 'uatom', price: '10' },    // $10
        { denom: 'uusdc', price: '1' },     // $1
        { denom: 'ustone', price: '0.5' },  // $0.50
      ],
    },
    'Mock Oracle',
    'auto'
  );

  console.log(`Mock oracle address: ${oracleResult.contractAddress}`);

  return {
    oracleAddress: oracleResult.contractAddress,
    oracleCodeId: oracleUpload.codeId,
  };
}

async function deployMockPyth(
  client: SigningCosmWasmClient,
  account: { address: string },
  config: PythDeploymentConfig
): Promise<{ pythContractAddress: string; pythCodeId: number }> {
  console.log('Deploying mock Pyth contract for local testing...');

  // Read mock Pyth WASM
  const mockPythWasm = fs.readFileSync('/artifacts/mock_pyth.wasm');

  // Upload mock Pyth contract
  console.log('Uploading mock Pyth contract...');
  const uploadResult = await client.upload(account.address, mockPythWasm, 'auto');
  console.log(`Mock Pyth code ID: ${uploadResult.codeId}`);

  // Prepare price feeds for instantiation
  const now = Math.floor(Date.now() / 1000);
  const feeds = config.priceFeeds
    .filter(feed => feed.mockPrice)
    .map(feed => ({
      id: feed.feedId,
      price: feed.mockPrice!.price,
      conf: feed.mockPrice!.conf,
      expo: feed.mockPrice!.expo,
      publish_time: now,
    }));

  if (feeds.length === 0) {
    throw new Error('No price feeds with mockPrice configured in local.json');
  }

  console.log(`Initializing mock Pyth with ${feeds.length} price feeds:`);
  for (const feed of feeds) {
 const actualPrice = feed.price * Math.pow(10, feed.expo);
 console.log(`  - ${feed.id}: $${actualPrice.toFixed(2)} (price=${feed.price}, expo=${feed.expo})`);
  }

  // Instantiate mock Pyth contract
  console.log('Instantiating mock Pyth contract...');
  const instantiateResult = await client.instantiate(
    account.address,
    uploadResult.codeId,
    { feeds },
    'Mock Pyth Oracle',
    'auto'
  );

  console.log(`Mock Pyth contract address: ${instantiateResult.contractAddress}`);

  return {
    pythContractAddress: instantiateResult.contractAddress,
    pythCodeId: uploadResult.codeId,
  };
}

async function deployPythAdapter(
  client: SigningCosmWasmClient,
  account: { address: string }
): Promise<{
  oracleAddress: string;
  oracleCodeId: number;
  pythAdapterAddress: string;
  pythAdapterCodeId: number;
  pythContractAddress: string;
}> {
  console.log('Deploying Pyth oracle adapter...');

  // Load Pyth configuration
  const config = loadPythConfig();
  if (!config) {
    throw new Error(
      `No Pyth configuration found for chain ${CHAIN_ID}. ` +
      `Please provide a config file via PYTH_CONFIG_PATH or create deploy/${CHAIN_ID}.json`
    );
  }

  const priceFeeds = config.priceFeeds || DEFAULT_PYTH_FEEDS;

  // Check if we need to deploy mock Pyth (empty pythContractAddress indicates local mode)
  const isMockPyth = !config.pythContractAddress;
  let pythContractAddress = config.pythContractAddress;
  if (isMockPyth) {
    console.log('pythContractAddress is empty - deploying mock Pyth contract for local testing');
    const mockPythDeployment = await deployMockPyth(client, account, config);
    pythContractAddress = mockPythDeployment.pythContractAddress;
  }

  // Set confidence ratio based on environment: more lenient (5%) for local/mock, strict (1%) for production
  const maxConfidenceRatio = isMockPyth ? '0.05' : '0.01';

  console.log(`Using Pyth contract: ${pythContractAddress}`);
  console.log(`Price feeds: ${priceFeeds.length} configured`);
  console.log(`Max confidence ratio: ${maxConfidenceRatio} (${isMockPyth ? 'mock/local' : 'production'})`);

  // Read WASM files
  const pythAdapterWasm = fs.readFileSync('/artifacts/pyth_oracle_adapter.wasm');

  // Upload Pyth adapter
  console.log('Uploading Pyth oracle adapter contract...');
  const adapterUpload = await client.upload(account.address, pythAdapterWasm, 'auto');
  console.log(`Pyth adapter code ID: ${adapterUpload.codeId}`);

  // Prepare price feeds for instantiation
  const priceFeedsConfig = priceFeeds.map(feed => ({
    denom: feed.denom,
    feed_id: feed.feedId,
  }));

  // Instantiate Pyth adapter
  console.log('Instantiating Pyth oracle adapter...');
  const adapterResult = await client.instantiate(
    account.address,
    adapterUpload.codeId,
    {
      owner: account.address,
      pyth_contract_addr: pythContractAddress,
      max_confidence_ratio: maxConfidenceRatio,
      price_feeds: priceFeedsConfig,
    },
    'Pyth Oracle Adapter',
    'auto'
  );

  console.log(`Pyth adapter address: ${adapterResult.contractAddress}`);

  return {
    oracleAddress: adapterResult.contractAddress, // Use adapter as oracle
    oracleCodeId: adapterUpload.codeId,
    pythAdapterAddress: adapterResult.contractAddress,
    pythAdapterCodeId: adapterUpload.codeId,
    pythContractAddress,
  };
}

function buildOracleConfig(
  oracleType: 'mock' | 'pyth',
  oracleAddress: string,
  oracleCodeId: number
): { address: string; oracle_type: Record<string, unknown> } {
  if (oracleType === 'pyth') {
    return {
      address: oracleAddress,
      oracle_type: {
        pyth: {
          expected_code_id: oracleCodeId,
          max_staleness_secs: 60, // 1 minute for Pyth
          max_confidence_ratio: '0.01', // 1%
        },
      },
    };
  }

  // Default: mock/generic oracle
  return {
    address: oracleAddress,
    oracle_type: {
      generic: {
        expected_code_id: oracleCodeId > 0 ? oracleCodeId : null,
        max_staleness_secs: 300, // 5 minutes
      },
    },
  };
}

async function main() {
  console.log('Starting contract deployment...');
  console.log(`RPC Endpoint: ${RPC_ENDPOINT}`);
  console.log(`Chain ID: ${CHAIN_ID}`);
  console.log(`Oracle Type: ${ORACLE_TYPE}`);

  if (ORACLE_TYPE !== 'mock' && ORACLE_TYPE !== 'pyth') {
    throw new Error(`Invalid ORACLE_TYPE: ${ORACLE_TYPE}. Must be 'mock' or 'pyth'`);
  }

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

  // Upload factory and market contracts
  console.log('Uploading factory contract...');
  const factoryUpload = await client.upload(account.address, factoryWasm, 'auto');
  console.log(`Factory code ID: ${factoryUpload.codeId}`);

  console.log('Uploading market contract...');
  const marketUpload = await client.upload(account.address, marketWasm, 'auto');
  console.log(`Market code ID: ${marketUpload.codeId}`);

  // Deploy oracle based on ORACLE_TYPE
  let oracleAddress: string;
  let oracleCodeId: number;
  let pythAdapterAddress: string | undefined;
  let pythAdapterCodeId: number | undefined;
  let pythContractAddress: string | undefined;

  if (ORACLE_TYPE === 'pyth') {
    const pythDeployment = await deployPythAdapter(client, account);
    oracleAddress = pythDeployment.oracleAddress;
    oracleCodeId = pythDeployment.oracleCodeId;
    pythAdapterAddress = pythDeployment.pythAdapterAddress;
    pythAdapterCodeId = pythDeployment.pythAdapterCodeId;
    pythContractAddress = pythDeployment.pythContractAddress;
  } else {
    const mockDeployment = await deployMockOracle(client, account);
    oracleAddress = mockDeployment.oracleAddress;
    oracleCodeId = mockDeployment.oracleCodeId;
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
  const oracleConfig = buildOracleConfig(
    ORACLE_TYPE as 'mock' | 'pyth',
    oracleAddress,
    oracleCodeId
  );

  // Market 1: STONE/USDC (collateral/debt)
  console.log('Creating STONE/USDC market...');
  const market1Result = await client.execute(
    account.address,
    factoryResult.contractAddress,
    {
      create_market: {
        collateral_denom: 'ustone',
        debt_denom: 'uusdc',
        oracle_config: oracleConfig,
        params: {
          loan_to_value: '0.75',          // 75%
          liquidation_threshold: '0.80',  // 80%
          liquidation_bonus: '0.05',      // 5%
          liquidation_protocol_fee: '0.1', // 10%
          close_factor: '0.5',            // 50%
          dust_debt_threshold: '1000000', // 1M micro-units (1 token)
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
  // The factory uses a two-phase pattern: create_market → submessage instantiates market → reply emits market_address
  // Events are at top-level result.events (not logs[0].events), and we need the wasm event with action=market_instantiated
  const market1Address = extractMarketAddress(market1Result);

  testMarkets.push({
    marketId: '1',
    marketAddress: market1Address,
    collateralDenom: 'ustone',
    debtDenom: 'uusdc',
  });
  console.log(`Market 1 address: ${market1Address}`);

  // Market 2: ATOM/USDC
  console.log('Creating ATOM/USDC market...');
  const market2Result = await client.execute(
    account.address,
    factoryResult.contractAddress,
    {
      create_market: {
        collateral_denom: 'uatom',
        debt_denom: 'uusdc',
        oracle_config: oracleConfig,
        params: {
          loan_to_value: '0.75',          // 75%
          liquidation_threshold: '0.80',  // 80%
          liquidation_bonus: '0.05',      // 5%
          liquidation_protocol_fee: '0.1', // 10%
          close_factor: '0.5',            // 50%
          dust_debt_threshold: '1000000', // 1M micro-units (1 token)
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

  // Parse market address from events (same pattern as market1)
  const market2Address = extractMarketAddress(market2Result);

  testMarkets.push({
    marketId: '2',
    marketAddress: market2Address,
    collateralDenom: 'uatom',
    debtDenom: 'uusdc',
  });
  console.log(`Market 2 address: ${market2Address}`);

  // Write deployment result
  const result: DeploymentResult = {
    factoryAddress: factoryResult.contractAddress,
    factoryCodeId: factoryUpload.codeId,
    marketCodeId: marketUpload.codeId,
    oracleAddress,
    oracleCodeId,
    pythAdapterAddress,
    pythAdapterCodeId,
    pythContractAddress,
    testMarkets,
  };

  // Write to shared volume for other services
  fs.writeFileSync('/deployment/result.json', JSON.stringify(result, null, 2));

  // Write .env file for docker-compose
  const envContent = `NEXT_PUBLIC_FACTORY_ADDRESS=${result.factoryAddress}
FACTORY_ADDRESS=${result.factoryAddress}
MARKET_CODE_ID=${result.marketCodeId}
ORACLE_ADDRESS=${result.oracleAddress}
${pythAdapterAddress ? `PYTH_ADAPTER_ADDRESS=${pythAdapterAddress}` : '# PYTH_ADAPTER_ADDRESS='}
${pythContractAddress ? `PYTH_CONTRACT_ADDRESS=${pythContractAddress}` : '# PYTH_CONTRACT_ADDRESS='}
TEST_MARKET_1_ADDRESS=${testMarkets[0]?.marketAddress || ''}
TEST_MARKET_2_ADDRESS=${testMarkets[1]?.marketAddress || ''}`;

  fs.writeFileSync('/deployment/.env.deployment', envContent);

  // Write frontend .env.local with local chain config
  const frontendEnvContent = `# Local chain configuration (auto-generated by deploy-contracts.ts)
NEXT_PUBLIC_CHAIN_ID=${CHAIN_ID}
NEXT_PUBLIC_RPC_ENDPOINT=${RPC_ENDPOINT.replace('26657', '26657')}
NEXT_PUBLIC_REST_ENDPOINT=${RPC_ENDPOINT.replace('26657', '1317')}

# Contract addresses from deployment
NEXT_PUBLIC_FACTORY_ADDRESS=${result.factoryAddress}
NEXT_PUBLIC_ORACLE_ADDRESS=${result.oracleAddress}
${pythAdapterAddress ? `NEXT_PUBLIC_PYTH_ADAPTER_ADDRESS=${pythAdapterAddress}` : '# NEXT_PUBLIC_PYTH_ADAPTER_ADDRESS='}
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
