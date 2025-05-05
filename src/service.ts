import {
  type IAgentRuntime,
  Service,
  ServiceType,
  logger,
} from '@elizaos/core';
import { getAllowlistedKeyServers, SealClient } from '@mysten/seal';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { toHex } from '@mysten/sui/utils';
import { WalrusClient } from '@mysten/walrus';
import { TESTNET_ALLOWLIST_PACKAGE_ID } from './constants';
import { Transaction } from '@mysten/sui/transactions';
import { SuiObjectCreateChange } from './types';

export class WalrusSealService extends Service {
  static serviceType = ServiceType.TASK;
  capabilityDescription =
    'This is a starter service which is attached to the agent through the starter plugin.';
  constructor(protected runtime: IAgentRuntime) {
    super(runtime);
  }

  async addAllowlistTask(allowlistId: string, capId: string, address: string) {
    try {
      const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
      const privateKey = process.env.SUI_PRIVATE_KEY;
      const keypair = Ed25519Keypair.fromSecretKey(privateKey);

      // add address to the allowlist
      const tx = new Transaction();
      tx.moveCall({
        target: `${TESTNET_ALLOWLIST_PACKAGE_ID}::allowlist::add`,
        arguments: [
          tx.object(allowlistId),
          tx.object(capId),
          tx.pure.address(address), // address to add
        ],
      });

      // run add allowlist transaction
      const result = await suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      });

      return {
        success: true,
        transactionDigest: result.digest,
      };
    } catch (error) {
      logger.error(`Failed to add address to allowlist: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async createAllowlistTask(name: string) {
    try {
      const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
      const privateKey = process.env.SUI_PRIVATE_KEY;
      const keypair = Ed25519Keypair.fromSecretKey(privateKey);

      // create_allowlist_entry
      const tx0 = new Transaction();
      tx0.moveCall({
        target: `${TESTNET_ALLOWLIST_PACKAGE_ID}::allowlist::create_allowlist_entry`,
        arguments: [tx0.pure.string(name)],
      });
      tx0.setSender(keypair.getPublicKey().toSuiAddress());
      const txBytes = await tx0.build({ client: suiClient });
      const signature = await keypair.signTransaction(txBytes);

      // use executeTransactionBlock for WaitForLocalExecution
      const result0 = await suiClient.executeTransactionBlock({
        transactionBlock: txBytes,
        signature: signature.signature,
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
        requestType: 'WaitForLocalExecution',
      });

      // find the created allowlist and cap
      const allowlist = result0.objectChanges.find(
        (change) =>
          change.type === 'created' &&
          change.objectType ===
            `${TESTNET_ALLOWLIST_PACKAGE_ID}::allowlist::Allowlist`
      ) as SuiObjectCreateChange;
      if (!allowlist) {
        throw new Error('Failed to create allowlist entry');
      }
      const cap = result0.objectChanges.find(
        (change) =>
          change.type === 'created' &&
          change.objectType ===
            `${TESTNET_ALLOWLIST_PACKAGE_ID}::allowlist::Cap`
      ) as SuiObjectCreateChange;
      if (!cap) {
        throw new Error('Failed to create allowlist entry');
      }

      // add myself to the allowlist
      const tx1 = new Transaction();
      tx1.moveCall({
        target: `${TESTNET_ALLOWLIST_PACKAGE_ID}::allowlist::add`,
        arguments: [
          tx1.object(allowlist.objectId),
          tx1.object(cap.objectId),
          tx1.pure.address(keypair.getPublicKey().toSuiAddress()), // my address
        ],
      });

      // run add allowlist transaction
      const result = await suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx1,
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      });

      return {
        success: true,
        allowlistId: allowlist.objectId,
        capId: cap.objectId,
        transactionDigest: result.digest,
      };
    } catch (error) {
      logger.error(`Failed to create allowlist entry: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async createEncryptAndUploadTask(
    dataToEncrypt: Uint8Array<ArrayBufferLike>,
    allowlistId: string,
    deletable: boolean = true,
    epochs: number = 3
  ) {
    try {
      // suiClient, sealClient, walrusClient setup
      const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
      const client = new SealClient({
        suiClient,
        serverObjectIds: getAllowlistedKeyServers('testnet'),
        verifyKeyServers: false,
      });
      const walrusClient = new WalrusClient({
        network: 'testnet',
        suiClient,
      });

      // SUI_PRIVATE_KEY from env. TODO change to signer provider
      const privateKey = process.env.SUI_PRIVATE_KEY;
      const keypair = Ed25519Keypair.fromSecretKey(privateKey);

      logger.info('Encrypting data with Seal...');

      // encrypt the data with seal and upload it to walrus
      const { encryptedObject: encryptedBytes } = await client.encrypt({
        threshold: 2,
        packageId: TESTNET_ALLOWLIST_PACKAGE_ID,
        id: allowlistId,
        data: dataToEncrypt,
      });
      logger.info('writing blob to walrus...');
      const storageInfo = await walrusClient.writeBlob({
        blob: encryptedBytes,
        deletable: deletable,
        epochs: epochs,
        signer: keypair,
      });

      return {
        success: true,
        blobId: storageInfo.blobId,
      };
    } catch (error) {
      logger.error(`Failed to encrypt and upload data: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // private constructMoveCall(packageId: string, allowlistId: string) {
  //   return (tx: Transaction, id: string) => {
  //     tx.moveCall({
  //       target: `${packageId}::allowlist::seal_approve`,
  //       arguments: [tx.pure.vector('u8', fromHex(id)), tx.object(allowlistId)],
  //     });
  //   };
  // }

  // async createDownloadAndDecryptTask(blobId: string) {
  //   try {
  //     // suiClient, sealClient, walrusClient setup
  //     const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
  //     const client = new SealClient({
  //       suiClient,
  //       serverObjectIds: getAllowlistedKeyServers('testnet'),
  //       verifyKeyServers: false,
  //     });
  //     const walrusClient = new WalrusClient({
  //       network: 'testnet',
  //       suiClient,
  //     });
  //     const blob = await walrusClient.readBlob({ blobId });
  //     console.log('Blob:', blob);
  //     // Create the Transaction for evaluating the seal_approve function.
  //     const tx = new Transaction();
  //     const moveCallConstructor = this.constructMoveCall(
  //       packageId,
  //       allowlistId
  //     );
  //     moveCallConstructor(tx, allowlistId);
  //     const txBytes = tx.build({
  //       client: suiClient,
  //       onlyTransactionKind: true,
  //     });
  //     const decryptedBytes = await client.decrypt({
  //       data: encryptedBytes,
  //       sessionKey,
  //       txBytes,
  //     });
  //   } catch (error) {
  //     console.log('Error downloading and decrypting data:', error);
  //     logger.error(`Failed to download and decrypt data: ${error}`);
  //     return {
  //       success: false,
  //       error: error instanceof Error ? error.message : String(error),
  //     };
  //   }
  // }

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
