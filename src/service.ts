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
import { WalrusClient } from '@mysten/walrus';
import { FILE_NFT_PACKAGE_ID, TESTNET_ALLOWLIST_PACKAGE_ID } from './constants';
import { Transaction } from '@mysten/sui/transactions';
import { SuiObjectCreateChange } from './types';

export class WalrusSealService extends Service {
  static serviceType = ServiceType.TASK;
  capabilityDescription =
    'This is a starter service which is attached to the agent through the starter plugin.';
  constructor(protected runtime: IAgentRuntime) {
    super(runtime);
  }

  async downloadWithNFTTask(nftId: string, blobId: string) {
    try {
      const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
      const privateKey = process.env.SUI_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error('SUI_PRIVATE_KEY environment variable is not set');
      }
      const keypair = Ed25519Keypair.fromSecretKey(privateKey);

      // seal_approve 트랜잭션 생성
      const tx = new Transaction();
      tx.moveCall({
        target: `${FILE_NFT_PACKAGE_ID}::file_nft::seal_approve`,
        arguments: [tx.pure.vector('u8', fromHex(blobId)), tx.object(nftId)],
      });

      // 트랜잭션 바이트 생성
      const txBytes = await tx.build({
        client: suiClient,
        onlyTransactionKind: true,
      });

      // SessionKey 생성
      const sessionKey = new SessionKey({
        address: keypair.getPublicKey().toSuiAddress(),
        packageId: FILE_NFT_PACKAGE_ID,
        ttlMin: 10,
        signer: keypair,
      });

      // SealClient 설정
      const client = new SealClient({
        suiClient,
        serverObjectIds: getAllowlistedKeyServers('testnet').map((id) => [
          id,
          1,
        ]),
        verifyKeyServers: false,
      });

      // 다운로드 및 복호화
      const downloadResult = await this.createDownloadTask(blobId);
      if (!downloadResult.success) {
        throw new Error(downloadResult.error);
      }

      const decryptedData = await client.decrypt({
        data: downloadResult.data,
        sessionKey,
        txBytes,
      });

      return {
        success: true,
        data: decryptedData,
      };
    } catch (error) {
      logger.error(`Failed to download with NFT: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

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
