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

const downloadAndDecryptFileTemplate = `# Task: Download and Decrypt File

# Recent Messages:
{{recentMessages}}

# Instructions:
Extract the following fields from the user’s last message:
- blobId: string (required)
- allowlistId: string (required)

# Examples
User: download file blob abc123 allowlist 0xdef456  
Assistant: {"blobId":"0xabc123","allowlistId":"0xdef456"}

User: decrypt file feedbeef using allowlist 0xdeadbeef  
Assistant: {"blobId":"feedbeef","allowlistId":"0xdeadbeef"}

User: download file blob 111aaa with allowlist 0x222bbb  
Assistant: {"blobId":"111aaa","allowlistId":"0x222bbb"}

User: download file {blobId: "999fff", allowlistId: "0x888eee"}  
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

export const downloadAndDecryptFileAction: Action = {
  name: 'DOWNLOAD_AND_DECRYPT_FILE',
  similes: ['DOWNLOAD_FILE'],
  description: 'Download and Decrypt File from Walrus Seal',

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
      logger.info('Handling DOWNLOAD_AND_DECRYPT_FILE action');

      const prompt = composePromptFromState({
        state,
        template: downloadAndDecryptFileTemplate,
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
      logger.info(`download file success: ${success}`);

      const responseContent: Content = {
        text: success
          ? `file downloaded successfully!`
          : `Failed to upload file: ${error}`,
        actions: ['DOWNLOAD_AND_DECRYPT_FILE'],
        data: data,
      };

      await callback(responseContent);
      return responseContent;
    } catch (error) {
      logger.error(`Error in DOWNLOAD_AND_DECRYPT_FILE action: ${error}`);
      throw error;
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'download file blob abc123 allowlist 0xdef456',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'file downloaded successfully!',
          actions: ['DOWNLOAD_AND_DECRYPT_FILE'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'decrypt file feedbeef using allowlist 0xdeadbeef',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'file downloaded successfully!',
          actions: ['DOWNLOAD_AND_DECRYPT_FILE'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'download file {blobId: "999fff", allowlistId: "0x888eee"}',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'file downloaded successfully!',
          actions: ['DOWNLOAD_AND_DECRYPT_FILE'],
        },
      },
    ],
  ],
};
