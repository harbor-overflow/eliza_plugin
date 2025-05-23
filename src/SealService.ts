import {
  type IAgentRuntime,
  Service,
  ServiceType,
  logger,
} from '@elizaos/core';
import {
  EncryptedObject,
  getAllowlistedKeyServers,
  SealClient,
  SessionKey,
} from '@mysten/seal';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromHex } from '@mysten/sui/utils';
import { FILE_NFT_PACKAGE_ID, TESTNET_ALLOWLIST_PACKAGE_ID } from './constants';
import { Transaction } from '@mysten/sui/transactions';

/**
 * SealService - A service providing encryption and decryption functions
 * Handles tasks that use SealClient.
 */
export class SealService extends Service {
  static serviceType = ServiceType.TASK;
  capabilityDescription = 'A service that provides encryption and decryption functions.';

  constructor(protected runtime: IAgentRuntime) {
    super(runtime);
  }

  /**
   * Task to encrypt data using an allowlist
   */
  async createAllowlistEncryptTask(
    dataToEncrypt: Uint8Array<ArrayBufferLike>,
    allowlistId: string
  ) {
    try {
      // suiClient, sealClient setup
      const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
      const client = new SealClient({
        suiClient,
        serverObjectIds: getAllowlistedKeyServers('testnet').map((id) => [
          id,
          1,
        ]),
        verifyKeyServers: false,
      });

      logger.info('Encrypting data with Seal...');

      // encrypt the data with seal
      const { encryptedObject: encryptedBytes } = await client.encrypt({
        threshold: 2,
        packageId: TESTNET_ALLOWLIST_PACKAGE_ID,
        id: allowlistId,
        data: dataToEncrypt,
      });
      return encryptedBytes;
    } catch (error) {
      logger.error(`Failed to encrypt data: ${error}`);
      return error;
    }
  }

  /**
   * Task to encrypt data for FileNFT
   */
  async createFileNFTEncryptTask(
    dataToEncrypt: Uint8Array<ArrayBufferLike>,
    collectionId: string
  ) {
    try {
      // suiClient, sealClient setup
      const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
      const client = new SealClient({
        suiClient,
        serverObjectIds: getAllowlistedKeyServers('testnet').map((id) => [
          id,
          1,
        ]),
        verifyKeyServers: false,
      });

      logger.info('Encrypting data with Seal...');

      // encrypt the data with seal
      const { encryptedObject: encryptedBytes } = await client.encrypt({
        threshold: 2,
        packageId: FILE_NFT_PACKAGE_ID,
        id: collectionId,
        data: dataToEncrypt,
      });
      return encryptedBytes;
    } catch (error) {
      logger.error(`Failed to encrypt data: ${error}`);
      return error;
    }
  }

  /**
   * Task to decrypt encrypted data
   */
  async createAllowlistDecryptTask(
    encryptedData: Uint8Array<ArrayBufferLike>,
    allowlistId: string
  ) {
    try {
      // suiClient, sealClient setup
      const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
      const client = new SealClient({
        suiClient,
        serverObjectIds: getAllowlistedKeyServers('testnet').map((id) => [
          id,
          1,
        ]),
        verifyKeyServers: false,
      });

      // Extract encryption ID
      const id = EncryptedObject.parse(encryptedData).id;

      logger.info('Creating decryption transaction...');
      // build seal_approve transaction
      const tx = new Transaction();
      tx.moveCall({
        target: `${TESTNET_ALLOWLIST_PACKAGE_ID}::allowlist::seal_approve`,
        arguments: [tx.pure.vector('u8', fromHex(id)), tx.object(allowlistId)],
      });
      const txBytes = await tx.build({
        client: suiClient,
        onlyTransactionKind: true,
      });

      // SUI_PRIVATE_KEY from env
      const privateKey = process.env.SUI_PRIVATE_KEY;
      const keypair = Ed25519Keypair.fromSecretKey(privateKey);

      const sessionKey = new SessionKey({
        address: keypair.getPublicKey().toSuiAddress(),
        packageId: TESTNET_ALLOWLIST_PACKAGE_ID,
        ttlMin: 10,
        signer: keypair,
      });

      logger.info('Decrypting data with Seal...');
      const decryptedBytes = await client.decrypt({
        data: encryptedData,
        sessionKey,
        txBytes,
      });

      return {
        success: true,
        data: decryptedBytes,
      };
    } catch (error) {
      logger.error(`Failed to decrypt data: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Task to decrypt data for FileNFT
   */
  async createFileNFTDecryptTask(
    encryptedData: Uint8Array<ArrayBufferLike>,
    nftId: string,
    blobId: string
  ) {
    try {
      // suiClient, sealClient setup
      const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
      const client = new SealClient({
        suiClient,
        serverObjectIds: getAllowlistedKeyServers('testnet').map((id) => [
          id,
          1,
        ]),
        verifyKeyServers: false,
      });

      // Extract encryption ID
      const id = EncryptedObject.parse(encryptedData).id;

      logger.info('Creating decryption transaction...');
      // build seal_approve transaction
      const tx = new Transaction();
      tx.moveCall({
        target: `${FILE_NFT_PACKAGE_ID}::file_nft::seal_approve`,
        arguments: [tx.pure.vector('u8', fromHex(id)), tx.object(nftId)],
      });
      const txBytes = await tx.build({
        client: suiClient,
        onlyTransactionKind: true,
      });

      // SUI_PRIVATE_KEY from env
      const privateKey = process.env.SUI_PRIVATE_KEY;
      const keypair = Ed25519Keypair.fromSecretKey(privateKey);

      const sessionKey = new SessionKey({
        address: keypair.getPublicKey().toSuiAddress(),
        packageId: FILE_NFT_PACKAGE_ID,
        ttlMin: 10,
        signer: keypair,
      });

      logger.info('Decrypting data with Seal...');
      const decryptedBytes = await client.decrypt({
        data: encryptedData,
        sessionKey,
        txBytes,
      });

      return {
        success: true,
        data: decryptedBytes,
      };
    } catch (error) {
      logger.error(`Failed to decrypt data: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  static async start(runtime: IAgentRuntime) {
    logger.info(`*** Starting SealService: ${new Date().toISOString()} ***`);
    const service = new SealService(runtime);
    return service;
  }

  static async stop(runtime: IAgentRuntime) {
    logger.info('*** Stopping SealService ***');
    const service = runtime.getService(SealService.serviceType);
    if (!service) {
      throw new Error('SealService not found');
    }
    service.stop();
  }

  async stop() {
    logger.info('*** SealService stopped ***');
  }
}
