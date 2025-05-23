import {
  type IAgentRuntime,
  Service,
  ServiceType,
  logger,
} from '@elizaos/core';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { WalrusClient } from '@mysten/walrus';

/**
 * WalrusService - A service providing upload and download functionality
 * Handles tasks that use WalrusClient.
 */
export class WalrusService extends Service {
  static serviceType = ServiceType.TASK;
  capabilityDescription = 'A service providing upload and download functionality.';

  async createDownloadTask(blobId: string) {
    try {
      // walrusClient setup
      const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
      const walrusClient = new WalrusClient({
        network: 'testnet',
        suiClient,
      });

      logger.info(`Downloading blob with ID ${blobId} from walrus...`);
      const blob = await walrusClient.readBlob({ blobId });

      return {
        success: true,
        data: blob,
      };
    } catch (error) {
      logger.error(`Failed to download blob: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async createUploadTask(
    data: Uint8Array<ArrayBufferLike>,
    deletable: boolean = true,
    epochs: number = 3
  ) {
    try {
      // suiClient, walrusClient setup
      const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
      const walrusClient = new WalrusClient({
        network: 'testnet',
        suiClient,
      });
      // SUI_PRIVATE_KEY from env. TODO change to signer provider
      const privateKey = process.env.SUI_PRIVATE_KEY;
      const keypair = Ed25519Keypair.fromSecretKey(privateKey);
      logger.info('writing blob to walrus...');
      const storageInfo = await walrusClient.writeBlob({
        blob: data,
        deletable: deletable,
        epochs: epochs,
        signer: keypair,
      });
      return {
        success: true,
        blobId: storageInfo.blobId,
        endEpoch: storageInfo.blobObject.storage.end_epoch,
      };
    } catch (error) {
      logger.error(`Failed to upload data: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  constructor(protected runtime: IAgentRuntime) {
    super(runtime);
  }

  static async start(runtime: IAgentRuntime) {
    logger.info(`*** Starting WalrusService: ${new Date().toISOString()} ***`);
    const service = new WalrusService(runtime);
    return service;
  }

  static async stop(runtime: IAgentRuntime) {
    logger.info('*** Stopping WalrusService ***');
    const service = runtime.getService(WalrusService.serviceType);
    if (!service) {
      throw new Error('WalrusService not found');
    }
    service.stop();
  }

  async stop() {
    logger.info('*** WalrusService stopped ***');
  }
}
