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

const createAllowlistTemplate = `# Task: Create allowlist entry for named {{name}}

{{recentMessages}}

# Instructions: Extract the name from the message and create a JSON object with the name.

# Examples
User: create an allowlist entry named {{name}}  
Assistant: {"name":"{{name}}"}

User: create allowlist {{name}}  
Assistant: {"name":"{{name}}"}

Response format should be formatted in a valid JSON block like this:
\`\`\`json
{
    "name": "<string>"
}
\`\`\`

Your response should include the valid JSON block and nothing else.
`;

export const createAllowlistAction: Action = {
  name: 'CREATE_ALLOWLIST',
  similes: ['CREATE_ALLOWLIST_ENTRY'],
  description: 'Create an allowlist entry for seal',

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
      logger.info('Handling CREATE_ALLOWLIST action');
      const prompt = composePromptFromState({
        state,
        template: createAllowlistTemplate,
      });
      const response = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt: prompt,
        response_format: { type: 'json_object' },
      });

      const responseContentObj = parseJSONObjectFromText(response);

      const memoryWalrusSealService = new WalrusSealService(runtime);
      logger.info(`responseContentObj.name: ${responseContentObj.name}`);

      const { success, allowlistId, capId, transactionDigest, error } =
        await memoryWalrusSealService.createAllowlistTask(
          responseContentObj.name
        );
      const responseContent: Content = {
        text: success
          ? `Allowlist entry created successfully!\ntxId: ${transactionDigest}\nallowlistId: ${allowlistId}\n\nhttps://testnet.suivision.xyz/txblock/${transactionDigest}`
          : `Failed to create allowlist entry: ${error}`,
        actions: ['CREATE_ALLOWLIST'],
      };
      await callback(responseContent);

      return responseContent;
    } catch (error) {
      logger.error(`Error in CREATE_ALLOWLIST action: ${error}`);
      throw error;
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'create an allowlist entry named myAllowlist',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Allowlist entry created successfully!...',
          actions: ['CREATE_ALLOWLIST'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'create allowlist fooBar',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Allowlist entry created successfully!...',
          actions: ['CREATE_ALLOWLIST'],
        },
      },
    ],
  ],
};
