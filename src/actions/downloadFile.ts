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
import mime from 'mime';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DOWNLOAD_DIR } from '../index';
import { WalrusService } from 'src/WalrusService';

const downloadFileTemplate = `# Task: Download File

# Recent Messages:
{{recentMessages}}

# Instructions:
Extract the following fields from the user’s last message:
- blobId: string (required)
- fileName: string (required)

# Examples
User: download file blob abc123 fileName myfile.txt
Assistant: {"blobId":"abc123","fileName":"myfile.txt"}

User: decrypt file feedbeef using fileName report.pdf
Assistant: {"blobId":"feedbeef","fileName":"report.pdf"}

User: download file blob 111aaa with fileName image.png
Assistant: {"blobId":"111aaa","fileName":"image.png"}

User: download file {blobId: "999fff", fileName: "data.xlsx"}
Assistant: {"blobId":"999fff","fileName":"data.xlsx"}

Response format should be formatted in a valid JSON block like this:
\`\`\`json
{
  "blobId": string,
  "fileName": string
}
\`\`\`

Your response should include the valid JSON block and nothing else.
`;

export const downloadFileAction: Action = {
  name: 'DOWNLOAD_FILE',
  similes: [],
  description: 'Download from Walrus',

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
      logger.info('Handling DOWNLOAD_FILE action');

      const prompt = composePromptFromState({
        state,
        template: downloadFileTemplate,
      });
      const response = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt: prompt,
      });
      const responseContentObj = parseJSONObjectFromText(response);
      console.log('responseContentObj', responseContentObj);

      // check fileName
      const fileName = responseContentObj.fileName || 'downloaded-file';

      const walrusService = new WalrusService(runtime);
      const { success, data, error } = await walrusService.createDownloadTask(
        responseContentObj.blobId
      );
      logger.info(`download file success: ${success}`);

      // if success, create a download link
      let downloadLink = '';
      if (success && data) {
        // create a unique token for the download link using UUID v4
        const downloadToken = crypto.randomUUID();

        // get mime type from file extension
        const contentType =
          mime.getType(fileName.split('.').pop()) || 'application/octet-stream';

        // Ensure download directory exists
        if (!fs.existsSync(DOWNLOAD_DIR)) {
          fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
        }

        // Save file to disk instead of memory
        const filePath = path.join(
          DOWNLOAD_DIR,
          `${downloadToken}_${fileName}`
        );
        logger.info(`Saving downloaded file to: ${filePath}`);

        // Write the decrypted data to disk
        fs.writeFileSync(filePath, Buffer.from(data));

        // Only save metadata in memory
        if (!global.downloadMetadata) {
          global.downloadMetadata = new Map();
        }

        global.downloadMetadata.set(downloadToken, {
          filename: fileName,
          contentType: contentType,
          filePath: filePath,
          createdAt: Date.now(),
          expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 1 day expiration
        });

        // create download link
        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        downloadLink = `${baseUrl}/api/download?token=${downloadToken}`;
      }

      const responseContent: Content = {
        text: success
          ? `File downloaded successfully. [Download File](${downloadLink})`
          : `Failed to download file: ${error}`,
        actions: ['DOWNLOAD_FILE'],
      };

      await callback(responseContent);
      return responseContent;
    } catch (error) {
      logger.error(`Error in DOWNLOAD_FILE action: ${error}`);
      throw error;
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'download file blob abc123 fileName myfile.txt',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'file downloaded successfully!',
          actions: ['DOWNLOAD_FILE'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'decrypt file feedbeef using fileName report.pdf',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'file downloaded successfully!',
          actions: ['DOWNLOAD_FILE'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'download file {blobId: "999fff", fileName: "data.xlsx"}',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'file downloaded successfully!',
          actions: ['DOWNLOAD_FILE'],
        },
      },
    ],
  ],
};
