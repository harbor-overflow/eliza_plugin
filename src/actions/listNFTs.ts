import {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  logger,
  Content,
} from '@elizaos/core';
import { WalrusSealService } from 'src/service';

export const listNFTsAction: Action = {
  name: 'LIST_NFTS',
  similes: ['SHOW_NFTS', 'MY_NFTS', 'GET_NFTS'],
  description: 'Show all NFTs owned by the user',

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State
  ): Promise<boolean> => {
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback,
    _responses: Memory[]
  ) => {
    try {
      logger.info('Handling LIST_NFTS action');
      
      const memoryWalrusSealService = new WalrusSealService(runtime);
      const { success, nfts, error } = await memoryWalrusSealService.listNFTsTask();

      if (!success) {
        const responseContent: Content = {
          text: `NFT 목록 조회 실패: ${error}`,
          actions: ['LIST_NFTS'],
        };
        await callback(responseContent);
        return responseContent;
      }

      // NFT 목록 포맷팅
      const nftList = nfts.map(nft => {
        const type = nft.resource_type === 0 ? '파일' : '메모리';
        return `- NFT ID: ${nft.id}
  타입: ${type}
  이름: ${nft.file_name || nft.memory_name}
  컬렉션: ${nft.collection_id}
  Blob ID: ${nft.blob_id}
  크기: ${nft.file_size || nft.memory_size} bytes`;
      }).join('\n\n');

      const responseContent: Content = {
        text: nfts.length > 0 
          ? `보유 중인 NFT 목록:\n\n${nftList}`
          : '보유 중인 NFT가 없습니다.',
        actions: ['LIST_NFTS'],
      };

      await callback(responseContent);
      return responseContent;
    } catch (error) {
      logger.error(`Error in LIST_NFTS action: ${error}`);
      throw error;
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'show my nfts',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '보유 중인 NFT 목록:\n\n- NFT ID: 0x123...\n  타입: 파일\n  이름: test.txt\n  컬렉션: 0x456...\n  Blob ID: abc123\n  크기: 1024 bytes',
          actions: ['LIST_NFTS'],
        },
      },
    ],
  ],
}; 