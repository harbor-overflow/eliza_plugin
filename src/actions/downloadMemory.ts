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
import { isValidMemory } from 'src/types';
import { WalrusService } from 'src/WalrusService';

const downloadMemoryTemplate = `# Task: Download and Decrypt Memory

# Recent Messages:
{{recentMessages}}

# Instructions:
Extract the following fields from the user’s last message:
- blobId: string (required)

# Examples
User: download memory blob abc123  
Assistant: {"blobId":"0xabc123"}

User: decrypt memory feedbeef  
Assistant: {"blobId":"feedbeef"}

User: download memory {blobId: "999fff"}
Assistant: {"blobId":"999fff"}

Response format should be formatted in a valid JSON block like this:
\`\`\`json
{
  "blobId": string
}
\`\`\`

Your response should include the valid JSON block and nothing else.
`;

export const downloadMemoryAction: Action = {
  name: 'DOWNLOAD_MEMORY',
  similes: ['DOWNLOAD_MEMORIES'],
  description: 'Download Memory from Walrus',

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
    _options: any,
    callback: HandlerCallback,
    _responses: Memory[]
  ) => {
    try {
      logger.info('Handling DOWNLOAD_MEMORY action');

      const prompt = composePromptFromState({
        state,
        template: downloadMemoryTemplate,
      });
      const response = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt: prompt,
      });
      const responseContentObj = parseJSONObjectFromText(response);
      console.log('responseContentObj', responseContentObj);

      const walrusService = new WalrusService(runtime);
      const { success, data, error } = await walrusService.createDownloadTask(
        responseContentObj.blobId
      );
      logger.info(`download file success: ${success}`);

      if (success) {
        const decodedData = new TextDecoder().decode(data);
        const parsedData = JSON.parse(decodedData);
        const validMemories = parsedData.filter(isValidMemory);

        // add memories to current runtime
        const agentId = runtime.agentId;
        await Promise.all(
          validMemories.map(async (memory: Memory) => {
            const type = (memory as any).type;
            const newMemory: Memory = {
              ...memory,
              agentId, // allocate current agentId
              entityId: message.entityId, // use current agentId if entityId is not set
            };
            return runtime.createMemory(newMemory, type, memory.unique);
          })
        );
      }
      logger.info(`download memory success: ${success}`);

      const responseContent: Content = {
        text: success
          ? `memory downloaded successfully!`
          : `Failed to add memory: ${error}`,
        actions: ['DOWNLOAD_MEMORY'],
      };

      await callback(responseContent);
      return responseContent;
    } catch (error) {
      logger.error(`Error in DOWNLOAD_MEMORY action: ${error}`);
      throw error;
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'download memory blob abc123',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'memory downloaded successfully!',
          actions: ['DOWNLOAD_MEMORY'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'decrypt memory feedbeef',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'memory downloaded successfully!',
          actions: ['DOWNLOAD_MEMORY'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'download memory {blobId: "999fff"}',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'memory downloaded successfully!',
          actions: ['DOWNLOAD_MEMORY'],
        },
      },
    ],
  ],
};
