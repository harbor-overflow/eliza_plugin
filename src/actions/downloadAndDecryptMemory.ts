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

const downloadAndDecryptMemoryTemplate = `# Task: Download and Decrypt Memory

# Recent Messages:
{{recentMessages}}

# Instructions:
Extract the following fields from the user’s last message:
- blobId: string (required)
- allowlistId: string (required)

# Examples
User: download memory blob abc123 allowlist 0xdef456  
Assistant: {"blobId":"0xabc123","allowlistId":"0xdef456"}

User: decrypt memory feedbeef using allowlist 0xdeadbeef  
Assistant: {"blobId":"feedbeef","allowlistId":"0xdeadbeef"}

User: download memory blob 111aaa with allowlist 0x222bbb  
Assistant: {"blobId":"111aaa","allowlistId":"0x222bbb"}

User: download memory {blobId: "999fff", allowlistId: "0x888eee"}  
Assistant: {"blobId":"999fff","allowlistId":"0x888eee"}

Response format should be formatted in a valid JSON block like this:
\`\`\`json
{
  "blobId": string,
  "allowlistId": string
}
\`\`\`

Your response should include the valid JSON block and nothing else.
`;

function isValidMemory(item: any): item is Memory {
  return (
    item &&
    typeof item === 'object' &&
    typeof item.entityId === 'string' &&
    typeof item.content === 'object' &&
    typeof item.roomId === 'string'
  );
}

export const downloadAndDecryptMemoryAction: Action = {
  name: 'DOWNLOAD_AND_DECRYPT_MEMORY',
  similes: [
    'DOWNLOAD_MEMORY',
    'DOWNLOAD_MEMORIES',
    'DECRYPT_AND_DOWNLOAD_MEMORIES',
  ],
  description: 'Download and Decrypt Memory from Walrus Seal',

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
      logger.info('Handling DOWNLOAD_AND_DECRYPT_MEMORY action');

      const prompt = composePromptFromState({
        state,
        template: downloadAndDecryptMemoryTemplate,
      });
      const response = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt: prompt,
      });
      const responseContentObj = parseJSONObjectFromText(response);
      console.log('responseContentObj', responseContentObj);

      const memoryWalrusSealService = new WalrusSealService(runtime);
      const { success, data, error } =
        await memoryWalrusSealService.createDownloadAndDecryptTask(
          responseContentObj.blobId,
          responseContentObj.allowlistId
        );
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
          : `Failed to upload memory: ${error}`,
        actions: ['DOWNLOAD_AND_DECRYPT_MEMORY'],
      };

      await callback(responseContent);
      return responseContent;
    } catch (error) {
      logger.error(`Error in DOWNLOAD_AND_DECRYPT_MEMORY action: ${error}`);
      throw error;
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'download memory blob abc123 allowlist 0xdef456',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'memory downloaded successfully!',
          actions: ['DOWNLOAD_AND_DECRYPT_MEMORY'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'decrypt memory feedbeef using allowlist 0xdeadbeef',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'memory downloaded successfully!',
          actions: ['DOWNLOAD_AND_DECRYPT_MEMORY'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'download memory {blobId: "999fff", allowlistId: "0x888eee"}',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'memory downloaded successfully!',
          actions: ['DOWNLOAD_AND_DECRYPT_MEMORY'],
        },
      },
    ],
  ],
};
