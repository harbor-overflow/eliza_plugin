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
- blobId: string (required) - Blob ID of the uploaded file
- fileName: string (required) - Name of the file
- fileSize: number or null - Size of the file in bytes
- endEpoch: number or null - Expiration epoch (default will be current epoch + 10)
- paymentAmount: number or null - Amount of SUI to pay (default will be the mint price)

# Examples
User: mint nft for blob abc123 fileName: myfile.txt
Assistant: {"blobId":"abc123","fileName":"myfile.txt","fileSize":1024,"endEpoch":1000,"paymentAmount":100000000}

User: create nft for blobId abc123 fileName myfile.png fileSize 12345 endEpoch 1000
Assistant: {"blobId":"abc123","fileName":"myfile.png","fileSize":12345,"endEpoch":1000,"paymentAmount":100000000}

User: mint nft from blob 111aaa with fileName image.png payment 100000000
Assistant: {"blobId":"111aaa","fileName":"image.png","fileSize":2048,"endEpoch":1000,"paymentAmount":100000000}

Response format should be formatted in a valid JSON block like this:
\`\`\`json
{
  "blobId": string,
  "fileName": string,
  "fileSize": number | null,
  "endEpoch": number | null,
  "paymentAmount": number | null
}
\`\`\`

Your response should include ONLY the valid JSON block and nothing else.
`;

export const mintFileNFTAction: Action = {
  name: 'MINT_FILE_NFT',
  similes: ['CREATE_NFT', 'MINT_NFT'],
  description: 'Create an NFT for a file stored in Walrus',

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
        responseContentObj.blobId,
        responseContentObj.fileName,
        responseContentObj.fileSize || 0,
        responseContentObj.endEpoch || 0,
        responseContentObj.paymentAmount || 0
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
          text: 'mint nft for blob abc123 fileName: myfile.txt fileSize 1024 endEpoch 1000 payment 100000000',
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
          text: 'create nft for blobId def456 fileName image.png fileSize 2048 endEpoch 1000 payment 100000000',
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