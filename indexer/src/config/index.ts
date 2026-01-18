import dotenv from 'dotenv';

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

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (!value && defaultValue === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || defaultValue!;
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
    factoryAddress: getEnvVar('FACTORY_ADDRESS'),
    marketCodeId: getEnvVar('MARKET_CODE_ID'),
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
