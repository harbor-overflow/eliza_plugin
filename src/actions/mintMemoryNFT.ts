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

const mintMemoryNFTTemplate = `# Task: Mint Memory NFT

# Recent Messages:
{{recentMessages}}

# Instructions:
Extract the following fields from the user's message:
- blobId: string (required) - Blob ID of the encrypted memory
- memoryName: string (required) - Name to identify the memory
- memorySize: number or null - Size of the memory in bytes
- collectionId: string (required) - Collection ID to mint NFT in
- paymentAmount: number or null - Amount of SUI to pay (default will be the mint price)

# Examples
User: mint memory nft for blob abc123 name: my_memory collection: 0x123
Assistant: {"blobId":"abc123","memoryName":"my_memory","memorySize":1024,"collectionId":"0x123","paymentAmount":100000000}

User: create memory nft in collection 0x456 for blobId abc123 name secret_data size 1024
Assistant: {"blobId":"abc123","memoryName":"secret_data","memorySize":1024,"collectionId":"0x456","paymentAmount":100000000}

Response format should be formatted in a valid JSON block like this:
\`\`\`json
{
  "blobId": string,
  "memoryName": string,
  "memorySize": number | null,
  "collectionId": string,
  "paymentAmount": number | null
}
\`\`\`

Your response should include ONLY the valid JSON block and nothing else.
`;

export const mintMemoryNFTAction: Action = {
  name: 'MINT_MEMORY_NFT',
  similes: ['CREATE_MEMORY_NFT', 'MINT_MEMORY_NFT'],
  description: 'Create an NFT for encrypted memory data stored in Walrus',

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
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback,
    _responses: Memory[]
  ) => {
    try {
      logger.info('Handling MINT_MEMORY_NFT action');

      const prompt = composePromptFromState({
        state,
        template: mintMemoryNFTTemplate,
      });
      const response = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt: prompt,
        response_format: { type: 'json_object' },
      });
      const responseContentObj = parseJSONObjectFromText(response);
      logger.info(`Minting NFT with params: ${JSON.stringify(responseContentObj)}`);
      
      const memoryWalrusSealService = new WalrusSealService(runtime);

      const { success, nftId, transactionDigest, error } = await memoryWalrusSealService.mintMemoryNFTTask(
        responseContentObj.collectionId,
        responseContentObj.blobId,
        responseContentObj.memoryName,
        responseContentObj.memorySize || 0,
        responseContentObj.paymentAmount || 0
      );

      const responseContent: Content = {
        text: success
          ? `메모리 NFT 민팅 성공!\nnftId: ${nftId}\n트랜잭션 ID: ${transactionDigest}\n\nhttps://testnet.suivision.xyz/txblock/${transactionDigest}`
          : `메모리 NFT 민팅 실패: ${error}`,
        actions: ['MINT_MEMORY_NFT'],
      };

      await callback(responseContent);
      return responseContent;
    } catch (error) {
      logger.error(`Error in MINT_MEMORY_NFT action: ${error}`);
      throw error;
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'mint memory nft for blob abc123 name: my_memory collection: 0x123',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '메모리 NFT 민팅 성공!\nnftId: 0x123...\n트랜잭션 ID: 0x456...\n\nhttps://testnet.suivision.xyz/txblock/0x456...',
          actions: ['MINT_MEMORY_NFT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'create memory nft in collection 0x456 for blobId abc123 name secret_data size 2048',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '메모리 NFT 민팅 성공!\nnftId: 0x789...\n트랜잭션 ID: 0xabc...\n\nhttps://testnet.suivision.xyz/txblock/0xabc...',
          actions: ['MINT_MEMORY_NFT'],
        },
      },
    ],
  ],
}; 