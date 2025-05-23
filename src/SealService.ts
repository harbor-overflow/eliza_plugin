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
 * SealService - 암호화 및 복호화 기능을 제공하는 서비스
 * SealClient를 사용하는 작업을 처리합니다.
 */
export class SealService extends Service {
  static serviceType = ServiceType.TASK;
  capabilityDescription = '암호화 및 복호화 기능을 제공하는 서비스입니다.';

  constructor(protected runtime: IAgentRuntime) {
    super(runtime);
  }

  /**
   * Allowlist로 데이터를 암호화하는 태스크
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
   * FileNFT를 위한 데이터 암호화 태스크
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
   * 암호화된 데이터를 복호화하는 태스크
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

      // 암호화 ID 추출
      const id = EncryptedObject.parse(new Uint8Array(encryptedData)).id;

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
   * FileNFT를 위한 데이터 복호화 태스크
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

      // 암호화 ID 추출
      const id = EncryptedObject.parse(new Uint8Array(encryptedData)).id;

      logger.info('Creating decryption transaction...');
      // build seal_approve transaction
      const tx = new Transaction();
      tx.moveCall({
        target: `${FILE_NFT_PACKAGE_ID}::file_nft::seal_approve`,
        arguments: [tx.pure.vector('u8', fromHex(blobId)), tx.object(nftId)],
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
