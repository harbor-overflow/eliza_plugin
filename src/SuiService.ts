import {
  type IAgentRuntime,
  Service,
  ServiceType,
  logger,
} from '@elizaos/core';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { FILE_NFT_PACKAGE_ID, TESTNET_ALLOWLIST_PACKAGE_ID } from './constants';
import { SuiObjectCreateChange } from './types';

/**
 * SuiService - Sui 블록체인 관련 기능을 제공하는 서비스
 * SuiClient를 사용하는 작업을 처리합니다.
 */
export class SuiService extends Service {
  static serviceType = ServiceType.TASK;
  capabilityDescription = 'Sui 블록체인 관련 기능을 제공하는 서비스입니다.';

  constructor(protected runtime: IAgentRuntime) {
    super(runtime);
  }

  /**
   * allowlist에 주소를 추가하는 태스크
   */
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

  /**
   * allowlist를 생성하는 태스크
   */
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

  /**
   * 새로운 NFT 컬렉션을 생성하는 태스크
   */
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

      // 트랜잭션 생성
      const tx = new Transaction();

      // file_nft::create_collection 함수 호출
      tx.moveCall({
        target: `${FILE_NFT_PACKAGE_ID}::file_nft::create_collection`,
        arguments: [
          tx.pure.string(name),
          tx.pure.u64(maxSupply),
          tx.pure.u64(mintPrice * 1000000000), // SUI to lamports
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
          change.objectType === `${FILE_NFT_PACKAGE_ID}::file_nft::Collection`
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
      logger.error(`Failed to create Collection with file: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 파일 NFT의 메타데이터를 업데이트하는 태스크
   */
  async updateCollectionMetadataTask(
    collectionId: string,
    blobId: string,
    fileName: string,
    fileSize: number,
    resourceType: number,
    endEpoch: number
  ) {
    try {
      const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
      const privateKey = process.env.SUI_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error('SUI_PRIVATE_KEY environment variable is not set');
      }
      const keypair = Ed25519Keypair.fromSecretKey(privateKey);

      // 트랜잭션 생성
      const tx = new Transaction();

      // update_collection_metadata 함수 호출
      tx.moveCall({
        target: `${FILE_NFT_PACKAGE_ID}::file_nft::update_collection_metadata`,
        arguments: [
          tx.object(collectionId),
          tx.pure.string(blobId),
          tx.pure.string(fileName),
          tx.pure.u64(fileSize),
          tx.pure.u8(resourceType),
          tx.pure.u64(endEpoch),
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

      // 실행 결과 확인
      const status = result.effects?.status.status;
      const success = status === 'success';

      if (!success) {
        throw new Error(`Transaction failed with status: ${status}`);
      }

      return {
        success: true,
        transactionDigest: result.digest,
        effects: result.effects,
      };
    } catch (error) {
      logger.error(`Failed to update collection metadata: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * NFT를 민팅하는 태스크
   */
  async mintAccessNFT(collection: string, paymentAmount: number) {
    try {
      const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
      const privateKey = process.env.SUI_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error('SUI_PRIVATE_KEY environment variable is not set');
      }
      const keypair = Ed25519Keypair.fromSecretKey(privateKey);

      // 트랜잭션 생성
      const tx = new Transaction();

      // SUI 코인 생성
      const [paymentCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(paymentAmount)]);

      // file_nft::mint_access_nft 함수 호출
      tx.moveCall({
        target: `${FILE_NFT_PACKAGE_ID}::file_nft::mint_access_nft`,
        arguments: [tx.object(collection), paymentCoin],
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

      // 실행 결과 확인
      const status = result.effects?.status.status;
      const success = status === 'success';

      if (!success) {
        throw new Error(`Transaction failed with status: ${status}`);
      }

      return {
        success: true,
        transactionDigest: result.digest,
        effects: result.effects,
      };
    } catch (error) {
      logger.error(`Failed to update collection metadata: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 사용자 소유의 NFT 목록을 조회하는 태스크
   */
  async listMyNFTsTask() {
    try {
      const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
      const privateKey = process.env.SUI_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error('SUI_PRIVATE_KEY environment variable is not set');
      }
      const keypair = Ed25519Keypair.fromSecretKey(privateKey);
      const address = keypair.getPublicKey().toSuiAddress();

      // AccessNFT 객체 조회
      const nfts = await suiClient.getOwnedObjects({
        owner: address,
        filter: {
          MatchAll: [
            {
              StructType: `${FILE_NFT_PACKAGE_ID}::file_nft::AccessNFT`,
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
          collection_id: content?.fields?.collection_id,
          owner: content?.fields?.owner,
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

  async listCollectionsTask() {
    try {
      const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
      const privateKey = process.env.SUI_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error('SUI_PRIVATE_KEY environment variable is not set');
      }
      const keypair = Ed25519Keypair.fromSecretKey(privateKey);
      const address = keypair.getPublicKey().toSuiAddress();

      // Collection 객체 조회
      const collections = await suiClient.getOwnedObjects({
        owner: address,
        filter: {
          MatchAll: [
            {
              StructType: `${FILE_NFT_PACKAGE_ID}::file_nft::Collection`,
            },
          ],
        },
        options: {
          showContent: true,
          showType: true,
        },
      });

      // Collection 정보 파싱
      const collectionList = collections.data.map((collection) => {
        const content = collection.data?.content as any;
        return {
          id: collection.data?.objectId,
          name: content?.fields?.name,
          blob_id: content?.fields?.blob_id,
          file_name: content?.fields?.file_name,
          file_size: content?.fields?.file_size,
          resource_type: content?.fields?.resource_type,
          end_epoch: content?.fields?.end_epoch,
          max_supply: content?.fields?.max_supply,
          minted: content?.fields?.minted,
          mint_price: content?.fields?.mint_price,
          owner: content?.fields?.owner,
        };
      });

      return {
        success: true,
        collections: collectionList,
      };
    } catch (error) {
      logger.error(`Failed to list collections: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        collections: [],
      };
    }
  }

  static async start(runtime: IAgentRuntime) {
    logger.info(`*** Starting SuiService: ${new Date().toISOString()} ***`);
    const service = new SuiService(runtime);
    return service;
  }

  static async stop(runtime: IAgentRuntime) {
    logger.info('*** Stopping SuiService ***');
    const service = runtime.getService(SuiService.serviceType);
    if (!service) {
      throw new Error('SuiService not found');
    }
    service.stop();
  }

  async stop() {
    logger.info('*** SuiService stopped ***');
  }
}
