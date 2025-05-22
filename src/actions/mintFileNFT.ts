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
import { WalrusSealService } from 'src/service';


const mintFileNFTTemplate = `# Task: Mint File NFT

# Recent Messages:
{{recentMessages}}

# Instructions:
Extract the following fields from the user's message and create a JSON object:
- collectionId: string (required) - Collection ID to mint NFT in

# Examples
User: mint nft collection: 0x123
Assistant: {"collectionId":"0x123"}

User: create nft in collection 0x456
Assistant: {"collectionId":"0x456"}

Response format should be formatted in a valid JSON block like this:
\`\`\`json
{
  "collectionId": string,
}
\`\`\`

Your response should include ONLY the valid JSON block and nothing else.
`;

export const mintFileNFTAction: Action = {
  name: 'MINT_FILE_NFT',
  similes: ['MINT_NFT'],
  description: 'Mint an FileNFT',

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State
  ): Promise<boolean> => {
    // Always valid
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
      logger.info('Handling MINT_FILE_NFT action');
      const prompt = composePromptFromState({
        state,
        template: mintFileNFTTemplate,
      });
      const response = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt: prompt,
        response_format: { type: 'json_object' },
      });

      const responseContentObj = parseJSONObjectFromText(response);
      logger.info(`Minting NFT with params: ${JSON.stringify(responseContentObj)}`);

      const memoryWalrusSealService = new WalrusSealService(runtime);

      const { success, nftId, transactionDigest, error } = await memoryWalrusSealService.mintFileNFTTask(
        responseContentObj.collectionId,
      );

      const responseContent: Content = {
        text: success
          ? `NFT 민팅 성공!\nnftId: ${nftId}\n트랜잭션 ID: ${transactionDigest}\n\nhttps://testnet.suivision.xyz/txblock/${transactionDigest}`
          : `NFT 민팅 실패: ${error}`,
        actions: ['MINT_FILE_NFT'],
      };
      await callback(responseContent);

      return responseContent;
    } catch (error) {
      logger.error(`Error in MINT_FILE_NFT action: ${error}`);
      throw error;
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'mint nft collection: 0x123',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'NFT 민팅 성공!\nnftId: 0x123...\n트랜잭션 ID: 0x456...\n\nhttps://testnet.suivision.xyz/txblock/0x456...',
          actions: ['MINT_FILE_NFT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'create nft in collection 0x456',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'NFT 민팅 성공!\nnftId: 0x789...\n트랜잭션 ID: 0xabc...\n\nhttps://testnet.suivision.xyz/txblock/0xabc...',
          actions: ['MINT_FILE_NFT'],
        },
      },
    ],
  ],
}; 