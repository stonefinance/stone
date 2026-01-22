import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { Tendermint37Client } from '@cosmjs/tendermint-rpc';
import { logger } from './logger';
import { config } from '../config';

let cosmWasmClient: CosmWasmClient | null = null;
let tendermintClient: Tendermint37Client | null = null;

export async function getCosmWasmClient(): Promise<CosmWasmClient> {
  if (!cosmWasmClient) {
    try {
      cosmWasmClient = await CosmWasmClient.connect(config.blockchain.rpcEndpoint);
      logger.info('CosmWasm client connected', {
        endpoint: config.blockchain.rpcEndpoint,
      });
    } catch (error) {
      logger.error('Failed to connect CosmWasm client', { error });
      throw error;
    }
  }
  return cosmWasmClient;
}

export async function getTendermintClient(): Promise<Tendermint37Client> {
  if (!tendermintClient) {
    try {
      tendermintClient = await Tendermint37Client.connect(config.blockchain.rpcEndpoint);
      logger.info('Tendermint client connected', {
        endpoint: config.blockchain.rpcEndpoint,
      });
    } catch (error) {
      logger.error('Failed to connect Tendermint client', { error });
      throw error;
    }
  }
  return tendermintClient;
}

export async function getCurrentBlockHeight(): Promise<number> {
  const client = await getCosmWasmClient();
  return client.getHeight();
}

export async function getBlockTimestamp(height: number): Promise<number> {
  const tmClient = await getTendermintClient();
  const block = await tmClient.block(height);
  // ReadonlyDateWithNanoseconds has getTime() method
  return Math.floor(block.block.header.time.getTime() / 1000);
}

export async function disconnectClients(): Promise<void> {
  if (cosmWasmClient) {
    cosmWasmClient.disconnect();
    cosmWasmClient = null;
    logger.info('CosmWasm client disconnected');
  }
  if (tendermintClient) {
    tendermintClient.disconnect();
    tendermintClient = null;
    logger.info('Tendermint client disconnected');
  }
}

/**
 * Market config response (from { config: {} } query)
 */
export interface MarketConfigResponse {
  factory: string;
  curator: string;
  oracle: string;
  collateral_denom: string;
  debt_denom: string;
  protocol_fee_collector: string;
}

/**
 * Market params response (from { params: {} } query)
 */
export interface MarketParamsResponse {
  loan_to_value: string;
  liquidation_threshold: string;
  liquidation_bonus: string;
  liquidation_protocol_fee: string;
  close_factor: string;
  interest_rate_model: unknown;
  protocol_fee: string;
  curator_fee: string;
  supply_cap: string | null;
  borrow_cap: string | null;
  enabled: boolean;
  is_mutable: boolean;
}

/**
 * Combined market info for indexer
 */
export interface MarketInfo {
  config: MarketConfigResponse;
  params: MarketParamsResponse;
}

export async function queryMarketInfo(marketAddress: string): Promise<MarketInfo> {
  const client = await getCosmWasmClient();

  const [config, params] = await Promise.all([
    client.queryContractSmart(marketAddress, { config: {} }) as Promise<MarketConfigResponse>,
    client.queryContractSmart(marketAddress, { params: {} }) as Promise<MarketParamsResponse>,
  ]);

  return { config, params };
}
