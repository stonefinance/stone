import { vi } from 'vitest';
import type { Event as TendermintEvent } from '@cosmjs/tendermint-rpc/build/tendermint37/responses';

// Mock block structure
export interface MockTransaction {
  bytes: string; // base64 encoded tx bytes
  code: number; // 0 for success, non-zero for failure
  events: TendermintEvent[];
}

export interface MockBlock {
  height: number;
  hash: string;
  timestamp: number;
  txs: MockTransaction[];
}

// Create a mock Tendermint client
export function createMockTendermintClient(blocks: MockBlock[]) {
  const blockMap = new Map(blocks.map((b) => [b.height, b]));

  return {
    block: vi.fn((height: number) => {
      const block = blockMap.get(height);
      if (!block) {
        throw new Error(`Block ${height} not found`);
      }
      // Hash should be provided as hex string, decode to Buffer
      // The caller will convert back via Buffer.from(hash).toString('hex')
      return {
        blockId: { hash: Buffer.from(block.hash, 'hex') },
        block: {
          header: { time: new Date(block.timestamp * 1000) },
          txs: block.txs.map((tx) => Buffer.from(tx.bytes, 'base64')),
        },
      };
    }),
    blockResults: vi.fn((height: number) => {
      const block = blockMap.get(height);
      if (!block) {
        throw new Error(`Block ${height} not found`);
      }
      return {
        results: block.txs.map((tx) => ({
          code: tx.code,
          events: tx.events,
        })),
      };
    }),
    status: vi.fn(() => ({
      syncInfo: {
        latestBlockHeight: Math.max(...blocks.map((b) => b.height)),
      },
    })),
  };
}

// Create a wasm event with string key/value attributes
export function createWasmEvent(
  contractAddress: string,
  attributes: Record<string, string>
): TendermintEvent {
  const allAttributes: Array<{ key: string; value: string }> = [
    { key: '_contract_address', value: contractAddress },
  ];

  for (const [key, value] of Object.entries(attributes)) {
    allAttributes.push({ key, value });
  }

  return {
    type: 'wasm',
    attributes: allAttributes,
  } as TendermintEvent;
}

// Create a mock CosmWasm client for querying market config
export interface MockMarketConfig {
  curator: string;
  collateralDenom: string;
  debtDenom: string;
  oracle: string;
  params: {
    loan_to_value: string;
    liquidation_threshold: string;
    liquidation_bonus: string;
    liquidation_protocol_fee: string;
    close_factor: string;
    interest_rate_model: object;
    protocol_fee: string;
    curator_fee: string;
    supply_cap: string | null;
    borrow_cap: string | null;
    enabled: boolean;
    is_mutable: boolean;
  };
}

export function createMockCosmWasmClient(marketConfigs: Record<string, MockMarketConfig>) {
  return {
    queryContractSmart: vi.fn((address: string, query: object) => {
      const config = marketConfigs[address];
      if (!config) {
        throw new Error(`Unknown market: ${address}`);
      }

      if ('config' in query) {
        return {
          curator: config.curator,
          collateral_denom: config.collateralDenom,
          debt_denom: config.debtDenom,
          oracle: config.oracle,
        };
      }

      if ('params' in query) {
        return config.params;
      }

      throw new Error(`Unknown query: ${JSON.stringify(query)}`);
    }),
  };
}

// Create mock queryMarketInfo response
export function createMockMarketInfo(overrides: Partial<MockMarketConfig> = {}): {
  config: {
    curator: string;
    collateral_denom: string;
    debt_denom: string;
    oracle: string;
  };
  params: MockMarketConfig['params'];
} {
  const defaults: MockMarketConfig = {
    curator: 'cosmos1curator...',
    collateralDenom: 'ueth',
    debtDenom: 'uusdc',
    oracle: 'cosmos1oracle...',
    params: {
      loan_to_value: '0.8',
      liquidation_threshold: '0.85',
      liquidation_bonus: '0.05',
      liquidation_protocol_fee: '0.1',
      close_factor: '0.5',
      interest_rate_model: {
        optimal_utilization: '0.8',
        base_rate: '0.02',
        slope1: '0.04',
        slope2: '0.75',
      },
      protocol_fee: '0.1',
      curator_fee: '0.05',
      supply_cap: null,
      borrow_cap: null,
      enabled: true,
      is_mutable: true,
    },
  };

  const merged = { ...defaults, ...overrides };

  return {
    config: {
      curator: merged.curator,
      collateral_denom: merged.collateralDenom,
      debt_denom: merged.debtDenom,
      oracle: merged.oracle,
    },
    params: merged.params,
  };
}
