import {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  logger,
  Content,
  composePromptFromState,
  ModelType,
  parseJSONObjectFromText,
} from '@elizaos/core';
import { SuiService } from 'src/SuiService';

const createCollectionTemplate = `# Task: Create NFT Collection
  
  # Recent Messages:
  {{recentMessages}}
  
  # Instructions:
  Extract the following fields from the user's message:
  - mintPrice: number (required) - Price in SUI for minting an NFT from this collection
  - maxSupply: number (required) - Maximum number of NFTs that can be minted from this collection
  - resourceType: string (required) - Type of resource ("file" or "memory")
  
  # Examples
  User: create collection with mint price 100 SUI and max supply 50 for file access
  Assistant: {"mintPrice":100000000,"maxSupply":50,"resourceType":"file"}
  
  User: make memory nft collection with price 200 SUI limit 100 nfts
  Assistant: {"mintPrice":200000000,"maxSupply":100,"resourceType":"memory"}
  
  Response format should be formatted in a valid JSON block like this:
  \`\`\`json
  {
    "mintPrice": number,
    "maxSupply": number,
    "resourceType": string
  }
  \`\`\`
  
  Your response should include ONLY the valid JSON block and nothing else.
  `;

export const createCollectionAction: Action = {
  name: 'CREATE_COLLECTION',
  similes: ['CREATE_NFT_COLLECTION', 'MAKE_COLLECTION'],
  description: 'Create a new NFT collection for file/memory access control',

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
    state: State,
    _options: any,
    callback: HandlerCallback,
    _responses: Memory[]
  ) => {
    try {
      logger.info('Handling CREATE_COLLECTION action');

      const prompt = composePromptFromState({
        state,
        template: createCollectionTemplate,
      });
      const response = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt: prompt,
        response_format: { type: 'json_object' },
      });
      const responseContentObj = parseJSONObjectFromText(response);
      logger.info(
        `Creating collection with params: ${JSON.stringify(responseContentObj)}`
      );

      const suiService = new SuiService(runtime);

      const { success, collectionId, error } =
        await suiService.createCollectionTask(
          responseContentObj.mintPrice,
          responseContentObj.maxSupply,
          responseContentObj.resourceType === 'memory' ? 1 : 0
        );

      const responseContent: Content = {
        text: success
          ? `Successfully created NFT collection!\nCollection ID: ${collectionId}\nMint Price: ${responseContentObj.mintPrice} SUI\nMax Supply: ${responseContentObj.maxSupply}\nResource Type: ${responseContentObj.resourceType}`
          : `Failed to create collection: ${error}`,
        actions: ['CREATE_COLLECTION'],
      };

      await callback(responseContent);
      return responseContent;
    } catch (error) {
      logger.error(`Error in CREATE_COLLECTION action: ${error}`);
      throw error;
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'create collection with mint price 100 SUI and max supply 50 for file access',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Successfully created NFT collection!\nCollection ID: 0x123...\nMint Price: 100000000 SUI\nMax Supply: 50\nResource Type: file',
          actions: ['CREATE_COLLECTION'],
        },
      },
    ],
  ],
};
