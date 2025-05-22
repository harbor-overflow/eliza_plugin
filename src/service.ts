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

  async createEncryptTask(
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
      };
    } catch (error) {
      logger.error(`Failed to upload data: ${error}`);
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
      logger.info('Starting encrypt and upload process...');

      // 1. encrypt the data
      const encryptedBytes = await this.createEncryptTask(
        dataToEncrypt,
        allowlistId
      );

      // Check if encryption was successful
      if (encryptedBytes instanceof Error) {
        throw encryptedBytes;
      }

      // 2. upload the encrypted data
      const uploadResult = await this.createUploadTask(
        encryptedBytes,
        deletable,
        epochs
      );

      // Check if upload was successful
      if (!uploadResult.success) {
        throw new Error(uploadResult.error);
      }

      logger.info(
        `Data successfully encrypted and uploaded with blob ID: ${uploadResult.blobId}`
      );

      return {
        success: true,
        blobId: uploadResult.blobId,
      };
    } catch (error) {
      logger.error(`Failed to encrypt and upload data: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

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

  async createDecryptTask(
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

  async createDownloadAndDecryptTask(blobId: string, allowlistId: string) {
    try {
      logger.info('Starting download and decrypt process...');

      // 1. download the blob
      const downloadResult = await this.createDownloadTask(blobId);

      // check if download was successful
      if (!downloadResult.success) {
        throw new Error(downloadResult.error);
      }

      // 2. decrypt the downloaded data
      const decryptResult = await this.createDecryptTask(
        downloadResult.data,
        allowlistId
      );

      // Check if decryption was successful
      if (!decryptResult.success) {
        throw new Error(decryptResult.error);
      }

      logger.info('Data successfully downloaded and decrypted');

      return {
        success: true,
        data: decryptResult.data,
      };
    } catch (error) {
      logger.error(`Failed to download and decrypt data: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async createServiceTask(fee: number, ttl: number, name: string) {
    try {
      const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
      const privateKey = process.env.SUI_PRIVATE_KEY;
      const keypair = Ed25519Keypair.fromSecretKey(privateKey);

      // create_service_entry 호출
      const tx = new Transaction();
      tx.moveCall({
        target: `${TESTNET_ALLOWLIST_PACKAGE_ID}::subscription::create_service_entry`,
        arguments: [tx.pure.u64(fee), tx.pure.u64(ttl), tx.pure.string(name)],
      });

      // 발신자 설정 및 트랜잭션 서명
      tx.setSender(keypair.getPublicKey().toSuiAddress());
      const txBytes = await tx.build({ client: suiClient });
      const signature = await keypair.signTransaction(txBytes);

      // 트랜잭션 실행
      const result = await suiClient.executeTransactionBlock({
        transactionBlock: txBytes,
        signature: signature.signature,
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
        requestType: 'WaitForLocalExecution',
      });

      // 생성된 Service와 Cap 객체 찾기
      const service = result.objectChanges.find(
        (change) =>
          change.type === 'created' &&
          change.objectType ===
            `${TESTNET_ALLOWLIST_PACKAGE_ID}::subscription::Service`
      ) as SuiObjectCreateChange;
      if (!service) {
        throw new Error('Failed to create service entry');
      }

      const cap = result.objectChanges.find(
        (change) =>
          change.type === 'created' &&
          change.objectType ===
            `${TESTNET_ALLOWLIST_PACKAGE_ID}::subscription::Cap`
      ) as SuiObjectCreateChange;
      if (!cap) {
        throw new Error('Failed to create service entry');
      }

      return {
        success: true,
        serviceId: service.objectId,
        capId: cap.objectId,
        transactionDigest: result.digest,
      };
    } catch (error) {
      logger.error(`Failed to create service entry: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async mintFileNFTTask(collectionId: string) {
    try {
      const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
      const privateKey = process.env.SUI_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error('SUI_PRIVATE_KEY environment variable is not set');
      }
      const keypair = Ed25519Keypair.fromSecretKey(privateKey);

      const packageId = process.env.FILE_NFT_PACKAGE_ID;
      if (!packageId) {
        throw new Error('FILE_NFT_PACKAGE_ID environment variable is not set');
      }

      // 트랜잭션 생성
      const tx = new Transaction();

      // 민팅 비용 가져오기
      // const mintPrice = await ...

      // SUI 코인 생성
      // const [paymentCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(mintPrice)]);
      const [paymentCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(0)]);

      // file_nft::mint_nft 함수 호출
      tx.moveCall({
        target: `${packageId}::file_nft::mint_nft`,
        arguments: [tx.object(collectionId), paymentCoin],
      });

      // 트랜잭션 실행
      const result = await suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      });

      // NFT objectId 추출
      const nftObj = result.objectChanges?.find(
        (change) =>
          change.type === 'created' &&
          change.objectType === `${packageId}::file_nft::FileNFT`
      );

      return {
        success: true,
        nftId: nftObj && 'objectId' in nftObj ? nftObj.objectId : undefined,
        transactionDigest: result.digest,
      };
    } catch (error) {
      logger.error(`Failed to mint NFT: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async mintMemoryNFTTask(
    collectionId: string,
    blobId: string,
    memoryName: string,
    memorySize: number,
    paymentAmount: number
  ) {
    try {
      const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
      const privateKey = process.env.SUI_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error('SUI_PRIVATE_KEY environment variable is not set');
      }
      const keypair = Ed25519Keypair.fromSecretKey(privateKey);

      const packageId = process.env.FILE_NFT_PACKAGE_ID;
      if (!packageId) {
        throw new Error('FILE_NFT_PACKAGE_ID environment variable is not set');
      }

      // 트랜잭션 생성
      const tx = new Transaction();

      // SUI 코인 생성
      const [paymentCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(paymentAmount)]);

      // file_nft::mint_nft 함수 호출
      tx.moveCall({
        target: `${packageId}::file_nft::mint_nft`,
        arguments: [
          tx.object(collectionId),
          tx.pure.string(blobId),
          tx.pure.string(memoryName),
          tx.pure.u64(memorySize),
          tx.pure.u8(1), // resource_type: 1 = 메모리
          paymentCoin,
        ],
      });

      // 트랜잭션 실행
      const result = await suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      });

      // NFT objectId 추출
      const nftObj = result.objectChanges?.find(
        (change) =>
          change.type === 'created' &&
          change.objectType === `${packageId}::file_nft::FileNFT`
      );

      return {
        success: true,
        nftId: nftObj && 'objectId' in nftObj ? nftObj.objectId : undefined,
        transactionDigest: result.digest,
      };
    } catch (error) {
      logger.error(`Failed to mint NFT: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async createCollectionTask(
    name: string,
    maxSupply: number,
    mintPrice: number
  ) {
    try {
      const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
      const privateKey = process.env.SUI_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error('SUI_PRIVATE_KEY environment variable is not set');
      }
      const keypair = Ed25519Keypair.fromSecretKey(privateKey);

      const packageId = process.env.FILE_NFT_PACKAGE_ID;
      if (!packageId) {
        throw new Error('FILE_NFT_PACKAGE_ID environment variable is not set');
      }

      // 트랜잭션 생성
      const tx = new Transaction();

      // file_nft::create_collection 함수 호출
      tx.moveCall({
        target: `${packageId}::file_nft::create_collection`,
        arguments: [
          tx.pure.string(name),
          tx.pure.u64(maxSupply),
          tx.pure.u64(mintPrice),
        ],
      });

      // 트랜잭션 실행
      const result = await suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      });

      // Collection objectId 추출
      const collectionObj = result.objectChanges?.find(
        (change) =>
          change.type === 'created' &&
          change.objectType.includes('::file_nft::Collection')
      );

      return {
        success: true,
        collectionId:
          collectionObj && 'objectId' in collectionObj
            ? collectionObj.objectId
            : undefined,
        transactionDigest: result.digest,
      };
    } catch (error) {
      logger.error(`Failed to create Collection: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async listNFTsTask() {
    try {
      const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
      const privateKey = process.env.SUI_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error('SUI_PRIVATE_KEY environment variable is not set');
      }
      const keypair = Ed25519Keypair.fromSecretKey(privateKey);
      const address = keypair.getPublicKey().toSuiAddress();

      // 내 주소가 소유한 모든 NFT 조회
      const nfts = await suiClient.getOwnedObjects({
        owner: address,
        filter: {
          MatchAll: [
            {
              StructType: `${process.env.FILE_NFT_PACKAGE_ID}::file_nft::FileNFT`,
            },
          ],
        },
        options: {
          showContent: true,
          showType: true,
        },
      });

      // NFT 정보 파싱
      const nftList = nfts.data.map((nft) => {
        const content = nft.data?.content as any;
        return {
          id: nft.data?.objectId,
          blob_id: content?.fields?.blob_id,
          file_name: content?.fields?.file_name,
          file_size: content?.fields?.file_size,
          resource_type: content?.fields?.resource_type,
          collection_id: content?.fields?.collection_id,
        };
      });

      return {
        success: true,
        nfts: nftList,
      };
    } catch (error) {
      logger.error(`Failed to list NFTs: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        nfts: [],
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
