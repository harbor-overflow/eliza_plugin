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
import { WalrusService } from 'src/WalrusService';

const uploadMemoryTemplate = `# Task: Encrypt and Upload Memory

# Recent Messages:
{{recentMessages}}

# Instructions:
Extract the following fields from the user’s last message:
- tableName: string or null
- deletable: boolean or null
- epochs: number or null

# Examples
User: upload memory  
Assistant: {"tableName":null,"deletable":null,"epochs":null}

User: upload this conversation table myTable  
Assistant: {"tableName":"myTable","deletable":null,"epochs":null}

User: upload history table myTable and make it deletable  
Assistant: {"tableName":"myTable","deletable":true,"epochs":null}

User: upload this conversation table myTable and make it not deletable  
Assistant: {"tableName":"myTable","deletable":false,"epochs":null}

User: upload this conversation with 5 epochs  
Assistant: {"tableName":null,"deletable":null,"epochs":5}

User: upload memory {"myTable", true, 5}
Assistant: {"tableName":"myTable","deletable":true,"epochs":5}

Response format should be formatted in a valid JSON block like this:
\`\`\`json
{
  "tableName": string | null,
  "deletable": boolean | null,
  "epochs": number | null
}
\`\`\`

Your response should include the valid JSON block and nothing else.
`;

export const uploadMemoryAction: Action = {
  name: 'UPLOAD_MEMORY',
  similes: ['UPLOAD_MEMORY', 'UPLOAD_MEMORIES'],
  description: 'Get memories and upload them to walrus',

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
      logger.info('Handling UPLOAD_MEMORY action');

      const prompt = composePromptFromState({
        state,
        template: uploadMemoryTemplate,
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
      const encodedData = new TextEncoder().encode(jsonData);

      const walrusService = new WalrusService(runtime);
      const { success, blobId, error } = await walrusService.createUploadTask(
        encodedData,
        deletable,
        epochs
      );
      logger.info(`upload file success: ${success}`);
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
          text: 'upload memory {"myTable", true, 5}',
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
          text: 'upload this conversation table myTable',
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
