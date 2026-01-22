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
