import {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  logger,
  Content,
} from '@elizaos/core';
import { WalrusSealService } from 'src/service';

// const encryptAndUploadMemoryTemplate = `# Task: Encrypt and Upload Memory

// # Recent Messages:
// {{recentMessages}}

// # Instructions:
// Analyze the conversation to identify:
// 1. The table name (string or null)
// 2. deletable (boolean or null)
// 3. epochs (number or null)

// Return a JSON object with:
// \`\`\`json
// {
//   "tableName": string | null,
//   "deletable": boolean | null,
//   "epochs": number | null
// }
// \`\`\`

// Make sure to include the \`\`\`json\`\`\` tags around the JSON object.
// `;

export const encryptAndUploadMemoryAction: Action = {
  name: 'ENCRYPT_AND_UPLOAD_MEMORY',
  similes: ['UPLOAD_MEMORY', 'UPLOAD_MEMORIES', 'ENCRYPT_AND_UPLOAD_MEMORIES'],
  description: 'Get memories and encrypt with seal and upload them to walrus',

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
      logger.info('Handling ENCRYPT_AND_UPLOAD_MEMORY action');

      // const prompt = composePrompt({
      //   state,
      //   template: encryptAndUploadMemoryTemplate,
      // });
      // const response = await runtime.useModel(ModelType.TEXT_LARGE, {
      //   prompt: prompt,
      // });
      // console.log('response:', response);
      // const responseContentObj = parseJSONObjectFromText(response);

      const memoryWalrusSealService = new WalrusSealService(runtime);

      // const tableName = responseContentObj.tableName ?? 'memories';
      // const deletable = responseContentObj.deletable ?? true;
      // const epochs = responseContentObj.epochs ?? 3;
      const tableName = 'memories';
      const deletable = true;
      const epochs = 1;

      const memories = await runtime.getMemories({
        agentId: message.roomId ? undefined : runtime.agentId,
        tableName: tableName,
        roomId: message.roomId ? message.roomId : undefined,
      });
      const jsonData = JSON.stringify(memories, null, 0);
      const dataToEncrypt = new TextEncoder().encode(jsonData);
      const { success, blobId, error } =
        await memoryWalrusSealService.createEncryptAndUploadTask(
          dataToEncrypt,
          deletable,
          epochs
        );

      // // Simple response content
      // const responseContent: Content = {
      //   text: 'memory uploaded successfully! blobId: ',
      //   actions: ['ENCRYPT_AND_UPLOAD_MEMORY'],
      // };
      if (success) {
        const responseContent: Content = {
          text: `memory uploaded successfully!\nblobId: ${blobId}`,
          actions: ['ENCRYPT_AND_UPLOAD_MEMORY'],
        };
        // Call back with the response message
        await callback(responseContent);

        return responseContent;
      } else {
        const responseContent: Content = {
          text: `Failed to upload memory: ${error}`,
          actions: ['ENCRYPT_AND_UPLOAD_MEMORY'],
        };
        // Call back with the response message
        await callback(responseContent);

        return responseContent;
      }
    } catch (error) {
      logger.error('Error in ENCRYPT_AND_UPLOAD_MEMORY action:', error);
      throw error;
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'upload memory',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'memory uploaded successfully!\nblobId: ...',
          actions: ['ENCRYPT_AND_UPLOAD_MEMORY'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'upload history',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'memory uploaded successfully!\nblobId: ...',
          actions: ['ENCRYPT_AND_UPLOAD_MEMORY'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'upload this conversation',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'memory uploaded successfully!\nblobId: ...',
          actions: ['ENCRYPT_AND_UPLOAD_MEMORY'],
        },
      },
    ],
  ],
};
