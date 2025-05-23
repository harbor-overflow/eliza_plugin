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
import { SealService } from 'src/SealService';
import { SuiService } from 'src/SuiService';
import { isValidMemory } from 'src/types';

const downloadWithNFTTemplate = `# Task: Download and Decrypt File or Memory with NFT

# Recent Messages:
{{recentMessages}}

# Instructions:
Extract the following fields from the user's last message:
- nft: string (required)

# Examples
User: download file with nft 0x49d
Assistant: {"nft":"0x49d"}

User: download nft 0x12345
Assistant: {"nft":"0x12345"}

User: download with nft 0xabc
Assistant: {"nft":"0xabc"}

User: can you get the file from my nft 0xdef789
Assistant: {"nft":"0xdef789"}

User: retrieve my memories from nft 0x999abc
Assistant: {"nft":"0x999abc"}

User: I'd like to access my content from NFT 0x123456abcdef
Assistant: {"nft":"0x123456abcdef"}

User: decrypt and download my nft at 0xaa11bb22
Assistant: {"nft":"0xaa11bb22"}

Response format should be formatted in a valid JSON block like this:
\`\`\`json
{
  "nft": string
}
\`\`\`

Your response should include the valid JSON block and nothing else.
`;

export const downloadWithNFTAction: Action = {
  name: 'DOWNLOAD_WITH_NFT',
  similes: ['DOWNLOAD_FILE_WITH_NFT', 'DOWNLOAD_MEMORY_WITH_NFT'],
  description: 'Download and Decrypt from NFT',

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
      logger.info('Handling DOWNLOAD_WITH_NFT action');

      const prompt = composePromptFromState({
        state,
        template: downloadWithNFTTemplate,
      });
      const response = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt: prompt,
      });
      const responseContentObj = parseJSONObjectFromText(response);
      console.log('responseContentObj', responseContentObj);

      // check nft
      if (!responseContentObj.nft) {
        throw new Error('NFT ID is required');
      }
      const nftId = responseContentObj.nft;
      logger.info(`NFT ID: ${nftId}`);
      const suiService = new SuiService(runtime);
      const {
        success,
        collectionId,
        endEpoch,
        fileName,
        fileSize,
        resourceType,
        blobId,
        error,
      } = await suiService.getNFTCollectionIdTask(nftId);
      logger.info(`get NFT collection ID success: ${success}`);
      if (!success) {
        throw new Error(error);
      }

      const walrusService = new WalrusService(runtime);
      const {
        success: downloadSuccess,
        data,
        error: downloadError,
      } = await walrusService.createDownloadTask(blobId);
      logger.info(`download file success: ${success}`);
      if (!downloadSuccess) {
        throw new Error(downloadError);
      }

      const sealService = new SealService(runtime);
      const {
        success: decryptSuccess,
        data: decryptedData,
        error: decryptError,
      } = await sealService.createFileNFTDecryptTask(data, nftId, blobId);
      logger.info(`decrypt file success: ${decryptSuccess}`);
      if (!decryptSuccess) {
        throw new Error(decryptError);
      }

      if (resourceType == 1) {
        const decodedData = new TextDecoder().decode(decryptedData);
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
        logger.info(`download memory success: ${decryptSuccess}`);
        const responseContent: Content = {
          text: decryptSuccess
            ? `memory downloaded successfully!`
            : `Failed to add memory: ${decryptError}`,
          actions: ['DOWNLOAD_MEMORY_WITH_NFT'],
        };

        await callback(responseContent);
        return responseContent;
      } else {
        // if success, create a download link
        let downloadLink = '';
        if (decryptSuccess && decryptedData) {
          // create a unique token for the download link using UUID v4
          const downloadToken = crypto.randomUUID();

          // get mime type from file extension
          const contentType =
            mime.getType(fileName.split('.').pop()) ||
            'application/octet-stream';

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
          fs.writeFileSync(filePath, Buffer.from(decryptedData));

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
          text: decryptSuccess
            ? `File downloaded successfully. [Download File](${downloadLink})`
            : `Failed to download file`,
          actions: ['DOWNLOAD_FILE_WITH_NFT'],
        };

        await callback(responseContent);
        return responseContent;
      }
    } catch (error) {
      logger.error(`Error in DOWNLOAD_WITH_NFT action: ${error}`);
      throw error;
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'download file with nft 0x49d',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'File downloaded successfully. [Download File](http://localhost:3000/api/download?token=abc123)',
          actions: ['DOWNLOAD_WITH_NFT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'download nft 0x12345',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'File downloaded successfully. [Download File](http://localhost:3000/api/download?token=def456)',
          actions: ['DOWNLOAD_WITH_NFT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'download with nft 0xabc',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'memory downloaded successfully!',
          actions: ['DOWNLOAD_WITH_NFT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'can you get the file from my nft 0xdef789',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'File downloaded successfully. [Download File](http://localhost:3000/api/download?token=ghi789)',
          actions: ['DOWNLOAD_WITH_NFT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'retrieve my memories from nft 0x999abc',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'memory downloaded successfully!',
          actions: ['DOWNLOAD_WITH_NFT'],
        },
      },
    ],
  ],
};
