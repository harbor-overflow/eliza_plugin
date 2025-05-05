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

const encryptAndUploadMemoryTemplate = `# Task: Encrypt and Upload Memory

# Recent Messages:
{{recentMessages}}

# Instructions:
Extract the following fields from the user’s last message:
- allowlistId: string (required)
- tableName: string or null
- deletable: boolean or null
- epochs: number or null

# Examples
User: upload memory 0x123abc  
Assistant: {"allowlistId":"0x123abc","tableName":null,"deletable":null,"epochs":null}

User: upload this conversation 0x123abc table myTable  
Assistant: {"allowlistId":"0x123abc","tableName":"myTable","deletable":null,"epochs":null}

User: upload history 0x123abc table myTable and make it deletable  
Assistant: {"allowlistId":"0x123abc","tableName":"myTable","deletable":true,"epochs":null}

User: upload this conversation 0x123abc table myTable and make it not deletable  
Assistant: {"allowlistId":"0x123abc","tableName":"myTable","deletable":false,"epochs":null}

User: upload this conversation 0x123abc with 5 epochs  
Assistant: {"allowlistId":"0x123abc","tableName":null,"deletable":null,"epochs":5}

User: upload memory {"0x123abc", "myTable", true, 5}
Assistant: {"allowlistId":"0x123abc","tableName":"myTable","deletable":true,"epochs":5}

Response format should be formatted in a valid JSON block like this:
\`\`\`json
{
  "allowlistId": string,
  "tableName": string | null,
  "deletable": boolean | null,
  "epochs": number | null
}
\`\`\`

Your response should include the valid JSON block and nothing else.
`;

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

      const prompt = composePromptFromState({
        state,
        template: encryptAndUploadMemoryTemplate,
      });
      const response = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt: prompt,
      });
      const responseContentObj = parseJSONObjectFromText(response);

      // parseJSONObjectFromText represents null values as the string "null",
      // so convert those back to actual null
      const getNullableValue = (value: any) => {
        return value === 'null' || value === null ? null : value;
      };
      const tableName =
        getNullableValue(responseContentObj.tableName) ?? 'messages';
      const deletable = getNullableValue(responseContentObj.deletable) ?? true;
      const epochs = getNullableValue(responseContentObj.epochs) ?? 3;

      logger.info('getting memories...');
      const memories = await runtime.getMemories({
        agentId: message.roomId ? undefined : runtime.agentId,
        tableName: tableName,
        roomId: message.roomId ? message.roomId : undefined,
      });
      const jsonData = JSON.stringify(memories, null, 0);
      const dataToEncrypt = new TextEncoder().encode(jsonData);

      const memoryWalrusSealService = new WalrusSealService(runtime);
      const { success, blobId, error } =
        await memoryWalrusSealService.createEncryptAndUploadTask(
          dataToEncrypt,
          responseContentObj.allowlistId,
          deletable,
          epochs
        );
      logger.info(`upload memory success: ${success}`);

      const responseContent: Content = {
        text: success
          ? `memory uploaded successfully!\nblobId: ${blobId}`
          : `Failed to upload memory: ${error}`,
        actions: ['ENCRYPT_AND_UPLOAD_MEMORY'],
      };

      await callback(responseContent);
      return responseContent;
    } catch (error) {
      logger.error(`Error in ENCRYPT_AND_UPLOAD_MEMORY action: ${error}`);
      throw error;
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'upload memory 0x123abc',
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
          text: 'upload memory {"0x123abc", "myTable", true, 5}',
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
          text: 'upload this conversation 0x123abc table myTable',
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
