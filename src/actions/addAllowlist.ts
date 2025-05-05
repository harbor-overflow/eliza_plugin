import {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  logger,
  Content,
  ModelType,
  parseJSONObjectFromText,
  composePromptFromState,
} from '@elizaos/core';
import { WalrusSealService } from 'src/service';

const addAllowlistTemplate = `# Task: add address allowlist

# Recent Messages:
{{recentMessages}}

# Instructions:
Extract the following fields from the user’s last message:
- allowlistId: string (required)
- capId: string (required)
- address: string (required)

# Examples
User: add {address} to allowlist {allowlistId} with capId {capId}
Assistant: {"allowlistId":"{allowlistId}","capId":"{capId}","address":"{address}"}

User: add address 0xDeF456 to allowlist 0xList42 using capId 0xCapB  
Assistant: {"allowlistId":"0xList42","capId":"0xCapB","address":"0xDeF456"}

User: include 0xFeedBeef into allowlist 0xList99 under capId 0xCapZ  
Assistant: {"allowlistId":"0xList99","capId":"0xCapZ","address":"0xFeedBeef"}

User: add allowlist {allowlistId:"0xList99", capId:"0xCapZ", address:"0xFeedBeef"}
Assistant: {"allowlistId":"0xList99","capId":"0xCapZ","address":"0xFeedBeef"}

Response format should be formatted in a valid JSON block like this:
\`\`\`json
{
  "allowlistId": string,
  "capId": string,
  "address": string
}
\`\`\`

Your response should include the valid JSON block and nothing else.
`;

export const addAllowlistAction: Action = {
  name: 'ADD_ALLOWLIST',
  similes: ['ADD_ALLOWLIST_ADDRESS'],
  description: 'add allowlist address for walrus seal',

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
      logger.info('Handling ADD_ALLOWLIST action');
      const prompt = composePromptFromState({
        state,
        template: addAllowlistTemplate,
      });
      const response = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt: prompt,
        response_format: { type: 'json_object' },
      });

      const responseContentObj = parseJSONObjectFromText(response);
      logger.info(
        `allowlistId: ${responseContentObj.allowlistId}, capId: ${responseContentObj.capId}, address: ${responseContentObj.address}`
      );

      const memoryWalrusSealService = new WalrusSealService(runtime);

      const { success, transactionDigest, error } =
        await memoryWalrusSealService.addAllowlistTask(
          responseContentObj.name,
          responseContentObj.capId,
          responseContentObj.address
        );
      const responseContent: Content = {
        text: success
          ? `Added ${responseContentObj.address} to allowlist successfully!\ntxId: ${transactionDigest}\n\nhttps://testnet.suivision.xyz/txblock/${transactionDigest}`
          : `Failed to create allowlist entry: ${error}`,
        actions: ['ADD_ALLOWLIST'],
      };
      await callback(responseContent);

      return responseContent;
    } catch (error) {
      logger.error(`Error in ADD_ALLOWLIST action: ${error}`);
      throw error;
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'add {address} to allowlist {allowlistId} with capId {capId}',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Added {address} to allowlist successfully!...',
          actions: ['ADD_ALLOWLIST'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'add address 0xDeF456 to allowlist 0xList42 using capId 0xCapB',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Added 0xDeF456 to allowlist successfully!...',
          actions: ['ADD_ALLOWLIST'],
        },
      },
    ],
    ,
    [
      {
        name: '{{name1}}',
        content: {
          text: 'add allowlist {allowlistId:"0xList99", capId:"0xCapZ", address:"0xFeedBeef"}',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Added 0xFeedBeef to allowlist successfully!...',
          actions: ['ADD_ALLOWLIST'],
        },
      },
    ],
  ],
};
