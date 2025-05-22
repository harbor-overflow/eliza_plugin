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

const createCollectionTemplate = `# Task: Create NFT Collection

# Recent Messages:
{{recentMessages}}

# Instructions:
Extract the following fields from the user's message:
- name: string (required) - Collection 이름
- maxSupply: number (required) - 최대 발행량
- mintPrice: number (required) - 민팅 가격 (SUI)

# Examples
User: create collection name: MyCollection maxSupply: 1000 mintPrice: 0.1
Assistant: {"name":"MyCollection","maxSupply":1000,"mintPrice":100000000}

User: make collection Test with max supply 500 and price 0.5 SUI
Assistant: {"name":"Test","maxSupply":500,"mintPrice":500000000}

Response format should be formatted in a valid JSON block like this:
\`\`\`json
{
  "name": string,
  "maxSupply": number,
  "mintPrice": number
}
\`\`\`

Your response should include ONLY the valid JSON block and nothing else.
`;

export const createCollectionAction: Action = {
  name: 'CREATE_COLLECTION',
  similes: ['CREATE_NFT_COLLECTION', 'MAKE_COLLECTION'],
  description: 'Create a new NFT collection with specified parameters',

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
      logger.info(`Creating collection with params: ${JSON.stringify(responseContentObj)}`);

      const walrusSealService = new WalrusSealService(runtime);

      const { success, collectionId, transactionDigest, error } = await walrusSealService.createCollectionTask(
        responseContentObj.name,
        responseContentObj.maxSupply,
        responseContentObj.mintPrice
      );

      const responseContent: Content = {
        text: success
          ? `컬렉션 생성 성공!\nCollection ID: ${collectionId}\n트랜잭션 ID: ${transactionDigest}\n\nhttps://testnet.suivision.xyz/txblock/${transactionDigest}`
          : `컬렉션 생성 실패: ${error}`,
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
          text: 'create collection name: TestCollection maxSupply: 1000 mintPrice: 0.1',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '컬렉션 생성 성공!\nCollection ID: 0x123...\n트랜잭션 ID: 0x456...\n\nhttps://testnet.suivision.xyz/txblock/0x456...',
          actions: ['CREATE_COLLECTION'],
        },
      },
    ],
  ],
}; 