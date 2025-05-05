import {
  type IAgentRuntime,
  Service,
  ServiceType,
  UUID,
  logger,
} from '@elizaos/core';
import { SealClient } from '@mysten/seal';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { toHex } from '@mysten/sui/utils';
import { WalrusClient } from '@mysten/walrus';
import { sealKeyServerIds, TESTNET_PACKAGE_ID } from './constants';

export class WalrusSealService extends Service {
  static serviceType = ServiceType.TASK;
  capabilityDescription =
    'This is a starter service which is attached to the agent through the starter plugin.';
  constructor(protected runtime: IAgentRuntime) {
    super(runtime);
  }

  async createEncryptAndUploadTask(
    dataToEncrypt: Uint8Array<ArrayBufferLike>,
    deletable: boolean = true,
    epochs: number = 3
  ) {
    // suiClient, sealClient, walrusClient setup
    const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
    const client = new SealClient({
      suiClient,
      serverObjectIds: sealKeyServerIds,
      verifyKeyServers: false,
    });
    const walrusClient = new WalrusClient({
      network: 'testnet',
      suiClient,
    });

    // SUI_PRIVATE_KEY from env. TODO change to signer provider
    const privateKey = process.env.SUI_PRIVATE_KEY;
    const keypair = Ed25519Keypair.fromSecretKey(privateKey);

    try {
      logger.info('Encrypting and uploading data with Seal...');
      // random hex
      const id = toHex(crypto.getRandomValues(new Uint8Array(16)));

      // 데이터 암호화 및 업로드
      const { encryptedObject: encryptedBytes } = await client.encrypt({
        threshold: 2,
        packageId: TESTNET_PACKAGE_ID,
        id: id,
        data: dataToEncrypt,
      });
      console.log('Encrypted data:', encryptedBytes);
      logger.info('writing blob to walrus...');
      const storageInfo = await walrusClient.writeBlob({
        blob: encryptedBytes,
        deletable: deletable,
        epochs: epochs,
        signer: keypair,
      });

      console.log(storageInfo);
    } catch (error) {
      console.log('Error encrypting and uploading data:', error);
      logger.error(`Failed to encrypt and upload data: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // async createDownloadAndDecryptTask() {}

  static async start(runtime: IAgentRuntime) {
    logger.info(
      `*** Starting starter service - MODIFIED: ${new Date().toISOString()} ***`
    );
    const service = new WalrusSealService(runtime);
    return service;
  }

  static async stop(runtime: IAgentRuntime) {
    logger.info('*** TESTING DEV MODE - STOP MESSAGE CHANGED! ***');
    // get the service from the runtime
    const service = runtime.getService(WalrusSealService.serviceType);
    if (!service) {
      throw new Error('Starter service not found');
    }
    service.stop();
  }

  async stop() {
    logger.info('*** THIRD CHANGE - TESTING FILE WATCHING! ***');
  }
}
