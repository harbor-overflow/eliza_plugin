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
import mime from 'mime';

const downloadAndDecryptFileTemplate = `# Task: Download and Decrypt File

# Recent Messages:
{{recentMessages}}

# Instructions:
Extract the following fields from the user’s last message:
- blobId: string (required)
- allowlistId: string (required)
- fileName: string (required)

# Examples
User: download file blob abc123 allowlist 0xdef456 fileName myfile.txt
Assistant: {"blobId":"abc123","allowlistId":"0xdef456","fileName":"myfile.txt"}

User: decrypt file feedbeef using allowlist 0xdeadbeef fileName report.pdf
Assistant: {"blobId":"feedbeef","allowlistId":"0xdeadbeef","fileName":"report.pdf"}

User: download file blob 111aaa with allowlist 0x222bbb fileName image.png
Assistant: {"blobId":"111aaa","allowlistId":"0x222bbb","fileName":"image.png"}

User: download file {blobId: "999fff", allowlistId: "0x888eee", fileName: "data.xlsx"}
Assistant: {"blobId":"999fff","allowlistId":"0x888eee","fileName":"data.xlsx"}

Response format should be formatted in a valid JSON block like this:
\`\`\`json
{
  "blobId": string,
  "allowlistId": string,
  "fileName": string
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

      // check fileName
      const fileName = responseContentObj.fileName || 'downloaded-file';

      const memoryWalrusSealService = new WalrusSealService(runtime);
      const { success, data, error } =
        await memoryWalrusSealService.createDownloadAndDecryptTask(
          responseContentObj.blobId,
          responseContentObj.allowlistId
        );
      logger.info(`download file success: ${success}`);

      // if success, create a download link
      let downloadLink = '';
      if (success && data) {
        // create a unique token for the download link using UUID v4
        const downloadToken = crypto.randomUUID();

        // get mime type from file extension
        const contentType = mime.getType(fileName.split('.').pop());

        // save file data in global storage
        if (!global.downloadTokens) {
          global.downloadTokens = new Map();
        }
        global.downloadTokens.set(downloadToken, data);

        // save metadata for the file
        if (!global.downloadMetadata) {
          global.downloadMetadata = new Map();
        }
        global.downloadMetadata.set(downloadToken, {
          filename: fileName,
          contentType: contentType,
        });

        // create download link
        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        downloadLink = `${baseUrl}/api/download/${downloadToken}`;
      }

      const responseContent: Content = {
        text: success
          ? `File downloaded successfully. [Download File](${downloadLink})`
          : `Failed to download file: ${error}`,
        actions: ['DOWNLOAD_AND_DECRYPT_FILE'],
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
          text: 'download file blob abc123 allowlist 0xdef456 fileName myfile.txt',
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
          text: 'decrypt file feedbeef using allowlist 0xdeadbeef fileName report.pdf',
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
          text: 'download file {blobId: "999fff", allowlistId: "0x888eee", fileName: "data.xlsx"}',
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
