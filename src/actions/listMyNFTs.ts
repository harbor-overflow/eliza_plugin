import {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  logger,
  Content,
} from '@elizaos/core';
import { SuiService } from 'src/SuiService';

export const listMyNFTsAction: Action = {
  name: 'LIST_MY_NFTS',
  similes: ['SHOW_MY_NFTS', 'VIEW_MY_NFTS'],
  description: 'List all AccessNFTs owned by the current user',

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
      logger.info('Handling LIST_MY_NFTS action');

      const suiService = new SuiService(runtime);
      const { success, nfts, error } = await suiService.listMyNFTsTask();

      if (!success || !nfts) {
        const responseContent: Content = {
          text: `Failed to list NFTs: ${error}`,
          actions: ['LIST_MY_NFTS'],
        };
        await callback(responseContent);
        return responseContent;
      }

      // Format NFTs into readable text
      const nftsList = nfts
        .map((nft) => {
          return `NFT ID: ${nft.id}
Collection ID: ${nft.collection_id}
Owner: ${nft.owner}
`;
        })
        .join('\n---\n');

      const responseContent: Content = {
        text:
          nfts.length > 0
            ? `Found ${nfts.length} AccessNFTs:\n\n${nftsList}`
            : 'You do not own any AccessNFTs.',
        actions: ['LIST_MY_NFTS'],
      };

      await callback(responseContent);
      return responseContent;
    } catch (error) {
      logger.error(`Error in LIST_MY_NFTS action: ${error}`);
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
          text: 'Found 2 AccessNFTs:\n\nNFT ID: 0x789...\nCollection ID: 0x123...\nOwner: 0xabc...\n\n---\n\nNFT ID: 0xdef...\nCollection ID: 0x456...\nOwner: 0xabc...',
          actions: ['LIST_MY_NFTS'],
        },
      },
    ],
  ],
};
