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

export const listCollectionsAction: Action = {
  name: 'LIST_COLLECTIONS',
  similes: ['SHOW_COLLECTIONS', 'VIEW_COLLECTIONS'],
  description: 'List all available NFT collections',

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
      logger.info('Handling LIST_COLLECTIONS action');

      const suiService = new SuiService(runtime);
      const { success, collections, error } =
        await suiService.listCollectionsTask();

      if (!success || !collections) {
        const responseContent: Content = {
          text: `Failed to list collections: ${error}`,
          actions: ['LIST_COLLECTIONS'],
        };
        await callback(responseContent);
        return responseContent;
      }

      // Format collections into readable text
      const collectionsList = collections
        .map((collection) => {
          return `Collection ID: ${collection.id}
Name: ${collection.name}
File Name: ${collection.file_name}
File Size: ${collection.file_size} bytes
Resource Type: ${collection.resource_type === 0 ? 'File' : 'Memory'}
Minted: ${collection.minted}/${collection.max_supply}
Mint Price: ${collection.mint_price} SUI
Owner: ${collection.owner}
`;
        })
        .join('\n---\n');

      const responseContent: Content = {
        text:
          collections.length > 0
            ? `Found ${collections.length} collections:\n\n${collectionsList}`
            : 'No collections found.',
        actions: ['LIST_COLLECTIONS'],
      };

      await callback(responseContent);
      return responseContent;
    } catch (error) {
      logger.error(`Error in LIST_COLLECTIONS action: ${error}`);
      throw error;
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'show all collections',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Found 2 collections:\n\nCollection ID: 0x123...\nName: Test Collection\nFile Name: test.pdf\nFile Size: 1024 bytes\nResource Type: File\nMinted: 5/100\nMint Price: 100000000 SUI\nOwner: 0xabc...\n\n---\n\nCollection ID: 0x456...\nName: Memory Collection\nFile Name: memory.dat\nFile Size: 2048 bytes\nResource Type: Memory\nMinted: 10/50\nMint Price: 200000000 SUI\nOwner: 0xdef...',
          actions: ['LIST_COLLECTIONS'],
        },
      },
    ],
  ],
};
