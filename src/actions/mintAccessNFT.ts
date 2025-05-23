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

const mintAccessNFTTemplate = `# Task: Mint Access NFT

# Recent Messages:
{{recentMessages}}

# Instructions:
Extract the following field from the user's message:
- collectionId: string (required) - ID of the collection to mint from

# Examples
User: mint nft from collection 0x123
Assistant: {"collectionId":"0x123"}

User: buy access nft for collection 0xabc
Assistant: {"collectionId":"0xabc"}

Response format should be formatted in a valid JSON block like this:
\`\`\`json
{
  "collectionId": string
}
\`\`\`

Your response should include ONLY the valid JSON block and nothing else.
`;

export const mintAccessNFTAction: Action = {
  name: 'MINT_ACCESS_NFT',
  similes: ['BUY_ACCESS_NFT', 'MINT_NFT'],
  description: 'Mint an AccessNFT from a specified collection',

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
      logger.info('Handling MINT_ACCESS_NFT action');

      const prompt = composePromptFromState({
        state,
        template: mintAccessNFTTemplate,
      });
      const response = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt: prompt,
        response_format: { type: 'json_object' },
      });
      const responseContentObj = parseJSONObjectFromText(response);
      logger.info(
        `Minting AccessNFT with params: ${JSON.stringify(responseContentObj)}`
      );

      const suiService = new SuiService(runtime);

      // First, get collection info to check mint_price
      const collections = await suiService.listCollectionsTask();
      const collection = collections.collections.find(
        (c) => c.id === responseContentObj.collectionId
      );

      if (!collection) {
        const responseContent: Content = {
          text: `Collection not found: ${responseContentObj.collectionId}`,
          actions: ['MINT_ACCESS_NFT'],
        };
        await callback(responseContent);
        return responseContent;
      }

      // Mint with collection's mint_price
      const { success, transactionDigest, error } =
        await suiService.mintAccessNFT(
          responseContentObj.collectionId,
          collection.mint_price
        );

      const responseContent: Content = {
        text: success
          ? `Successfully minted AccessNFT!\nCollection ID: ${responseContentObj.collectionId}\nTransaction ID: ${transactionDigest}\nMint Price: ${collection.mint_price} SUI\n\n[https://testnet.suivision.xyz/txblock/${transactionDigest}](https://testnet.suivision.xyz/txblock/${transactionDigest})`
          : `Failed to mint AccessNFT: ${error}`,
        actions: ['MINT_ACCESS_NFT'],
      };

      await callback(responseContent);
      return responseContent;
    } catch (error) {
      logger.error(`Error in MINT_ACCESS_NFT action: ${error}`);
      throw error;
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'mint nft from collection 0x123',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Successfully minted AccessNFT!\nNFT ID: 0x789...\nCollection ID: 0x123...\nTransaction ID: 0x456...\nMint Price: 100000000 SUI\n\nhttps://testnet.suivision.xyz/txblock/0x456...',
          actions: ['MINT_ACCESS_NFT'],
        },
      },
    ],
  ],
};
