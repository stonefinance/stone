import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

export interface IndexerConfig {
  database: {
    url: string;
  };
  blockchain: {
    rpcEndpoint: string;
    chainId: string;
  };
  contracts: {
    factoryAddress: string;
    marketCodeId: string;
  };
  indexer: {
    startBlockHeight: number;
    batchSize: number;
    pollIntervalMs: number;
  };
  api: {
    port: number;
    enableSubscriptions: boolean;
  };
  logging: {
    level: string;
  };
  oracle: {
    endpoints: string[];
  };
}

interface DeploymentResult {
  factoryAddress: string;
  factoryCodeId: number;
  marketCodeId: number;
  oracleAddress: string;
  oracleCodeId: number;
  testMarkets: Array<{
    marketId: string;
    marketAddress: string;
    collateralDenom: string;
    debtDenom: string;
  }>;
}

function loadDeploymentResult(): DeploymentResult | null {
  const deploymentPaths = [
    '/deployment/result.json',
    path.join(process.cwd(), 'deployment', 'result.json'),
    path.join(process.cwd(), '..', 'e2e', 'deployment', 'result.json'),
  ];

  for (const deploymentPath of deploymentPaths) {
    try {
      if (fs.existsSync(deploymentPath)) {
        const content = fs.readFileSync(deploymentPath, 'utf-8');
        console.log(`Loaded deployment result from ${deploymentPath}`);
        return JSON.parse(content) as DeploymentResult;
      }
    } catch {
      // Continue to next path
    }
  }
  return null;
}

const deploymentResult = loadDeploymentResult();

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (!value && defaultValue === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || defaultValue!;
}

function getContractAddress(envKey: string, deploymentKey: keyof DeploymentResult): string {
  const envValue = process.env[envKey];
  if (envValue) {
    return envValue;
  }

  if (deploymentResult) {
    const value = deploymentResult[deploymentKey];
    if (value !== undefined && value !== null) {
      return String(value);
    }
  }

  throw new Error(
    `Missing ${envKey}: not found in environment or deployment result. ` +
    `Ensure contracts are deployed and /deployment/result.json exists.`
  );
}

export const config: IndexerConfig = {
  database: {
    url: getEnvVar('DATABASE_URL'),
  },
  blockchain: {
    rpcEndpoint: getEnvVar('RPC_ENDPOINT'),
    chainId: getEnvVar('CHAIN_ID'),
  },
  contracts: {
    factoryAddress: getContractAddress('FACTORY_ADDRESS', 'factoryAddress'),
    marketCodeId: getContractAddress('MARKET_CODE_ID', 'marketCodeId'),
  },
  indexer: {
    startBlockHeight: parseInt(getEnvVar('START_BLOCK_HEIGHT', '1'), 10),
    batchSize: parseInt(getEnvVar('BATCH_SIZE', '100'), 10),
    pollIntervalMs: parseInt(getEnvVar('POLL_INTERVAL_MS', '1000'), 10),
  },
  api: {
    port: parseInt(getEnvVar('API_PORT', '4000'), 10),
    enableSubscriptions: getEnvVar('ENABLE_SUBSCRIPTIONS', 'true') === 'true',
  },
  logging: {
    level: getEnvVar('LOG_LEVEL', 'info'),
  },
  oracle: {
    endpoints: JSON.parse(getEnvVar('ORACLE_ENDPOINTS', '[]')),
  },
};
