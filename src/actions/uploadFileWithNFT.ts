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
import fs from 'fs';
import { SuiService } from 'src/SuiService';
import { SealService } from 'src/SealService';
import { WalrusService } from 'src/WalrusService';

const uploadFileWithNFTTemplate = `# Task: Upload File with NFT

# Recent Messages:
{{recentMessages}}

# Instructions:
Extract the following fields from the user’s last message:
- fileId: string (required)
- name: string or null
- deletable: boolean or null
- epochs: number or null
- maxSupply: boolean or null
- mintPrice: number or null

# Examples
User: upload file with nft fileId: ba057d8e-9b45-4c42-b2b5-f5177ccc690c
Assistant: {"fileId":"ba057d8e-9b45-4c42-b2b5-f5177ccc690c","name":null,"deletable":null,"epochs":null,"maxSupply":null,"mintPrice":null}

User: upload this file to nft fileId: 0x123abc name: Awesome Collection
Assistant: {"fileId":"0x123abc","name":"Awesome Collection","deletable":null,"epochs":null,"maxSupply":null,"mintPrice":null}

User: upload file to nft with deletable fileId: someId
Assistant: {"fileId":"someId","name":null,"deletable":true,"epochs":null,"maxSupply":null,"mintPrice":null}

User: upload fileNFT with not deletable fileId: a5ef6dd4-0b42-43b5-a181-0a140585f7a2
Assistant: {"fileId":"a5ef6dd4-0b42-43b5-a181-0a140585f7a2","name":null,"deletable":false,"epochs":null,"maxSupply":null,"mintPrice":null}

User: upload fileNFT with 5 epochs and max supply 100 fileId: a5ef6dd4-0b42-43b5-a181-0a140585f7a2
Assistant: {"fileId":"a5ef6dd4-0b42-43b5-a181-0a140585f7a2","name":null,"deletable":null,"epochs":5,"maxSupply":true,"mintPrice":null}

User: upload file to nft collection "My NFT" with mint price 0.1 fileId: a5ef6dd4-0b42-43b5-a181-0a140585f7a2
Assistant: {"fileId":"a5ef6dd4-0b42-43b5-a181-0a140585f7a2","name":"My NFT","deletable":null,"epochs":null,"maxSupply":null,"mintPrice":0.1}

User: upload file NFT {"name":"Premium Collection", "deletable":true, "epochs":5, "maxSupply":true, "mintPrice":1.5} fileId: a5ef6dd4-0b42-43b5-a181-0a140585f7a2
Assistant: {"fileId":"a5ef6dd4-0b42-43b5-a181-0a140585f7a2","name":"Premium Collection","deletable":true,"epochs":5,"maxSupply":true,"mintPrice":1.5}
Response format should be formatted in a valid JSON block like this:
\`\`\`json
{
  "fileId": string,
  "name": string | null,
  "deletable": boolean | null,
  "epochs": number | null,
  "maxSupply": number | null,
  "mintPrice": number | null
}
\`\`\`

Your response should include the valid JSON block and nothing else.
`;

export const uploadFileWithNFTAction: Action = {
  name: 'UPLOAD_FILE_WITH_NFT',
  similes: ['UPLOAD_FILE_NFT', 'ENCRYPT_AND_UPLOAD_FILE_WITH_NFT'],
  description:
    'Upload a file, encrypt it with Seal, and create an NFT collection for access control',

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
    options: any,
    callback: HandlerCallback,
    _responses: Memory[]
  ) => {
    try {
      logger.info('Handling UPLOAD_FILE_WITH_NFT action');

      const prompt = composePromptFromState({
        state,
        template: uploadFileWithNFTTemplate,
      });
      const response = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt: prompt,
      });
      const responseContentObj = parseJSONObjectFromText(response);

      // Parse and validate response fields
      const getNullableValue = (value: any) => {
        return value === 'null' || value === null ? null : value;
      };

      // Extract all fields from the response
      const fileId = responseContentObj.fileId;
      const name =
        getNullableValue(responseContentObj.name) ||
        `File NFT Collection ${new Date().toISOString()}`;
      const deletable = getNullableValue(responseContentObj.deletable) ?? false;
      const epochs = getNullableValue(responseContentObj.epochs) ?? 3; // day in testnet, multiple weeks in mainnet
      const maxSupply = getNullableValue(responseContentObj.maxSupply) ?? 10;
      const mintPrice = getNullableValue(responseContentObj.mintPrice) ?? 0;

      // Validate file exists
      if (!fileId || !global.fileInfo) {
        const responseContent: Content = {
          text: `No uploaded file found. Please upload a file first.`,
          actions: ['UPLOAD_FILE_WITH_NFT'],
        };
        await callback(responseContent);
        return responseContent;
      }

      // First try direct fileId lookup
      const fileInfo = global.fileInfo.get(fileId);

      if (!fileInfo || !fs.existsSync(fileInfo.filePath)) {
        const responseContent: Content = {
          text: `File not found or has expired. Please upload a file first.`,
          actions: ['UPLOAD_FILE_WITH_NFT'],
        };
        await callback(responseContent);
        return responseContent;
      }

      // Read file data from disk
      const fileData = fs.readFileSync(fileInfo.filePath);
      const fileName = fileInfo.fileName;
      const fileSize = fileInfo.size || fileData.length;

      const suiService = new SuiService(runtime);

      // Step 1: Create NFT Collection
      logger.info(`Creating NFT collection with name: ${name}`);
      const createCollectionResult = await suiService.createCollectionTask(
        name,
        maxSupply,
        mintPrice
      );

      if (!createCollectionResult.success) {
        const responseContent: Content = {
          text: `Failed to create NFT collection: ${createCollectionResult.error}`,
          actions: ['UPLOAD_FILE_WITH_NFT'],
        };
        await callback(responseContent);
        return responseContent;
      }

      const collectionId = createCollectionResult.collectionId;
      logger.info(`Created collection with ID: ${collectionId}`);

      // Step 2: Encrypt the file data with Seal using the nft collection ID
      logger.info('Encrypting file data...');
      const sealService = new SealService(runtime);
      const encryptedBytes = await sealService.createFileNFTEncryptTask(
        fileData,
        collectionId
      );

      if (encryptedBytes instanceof Error) {
        const responseContent: Content = {
          text: `Failed to encrypt file: ${encryptedBytes.message}`,
          actions: ['UPLOAD_FILE_WITH_NFT'],
        };
        await callback(responseContent);
        return responseContent;
      }

      // Step 3: Upload encrypted data to Walrus
      logger.info('Uploading encrypted data to Walrus...');
      const walrusService = new WalrusService(runtime);
      const uploadResult = await walrusService.createUploadTask(
        encryptedBytes,
        deletable,
        epochs
      );

      if (!uploadResult.success) {
        const responseContent: Content = {
          text: `Failed to upload encrypted data: ${uploadResult.error}`,
          actions: ['UPLOAD_FILE_WITH_NFT'],
        };
        await callback(responseContent);
        return responseContent;
      }

      const blobId = uploadResult.blobId;
      logger.info(`Data uploaded with blob ID: ${blobId}`);

      // Step 4: Update collection with file information
      logger.info('Updating collection with file information...');

      const updateCollectionResult =
        await suiService.updateCollectionMetadataTask(
          collectionId,
          blobId,
          fileName,
          fileSize,
          0,
          uploadResult.endEpoch
        );
      if (!updateCollectionResult.success) {
        const responseContent: Content = {
          text: `Failed to update collection metadata: ${updateCollectionResult.error}`,
          actions: ['UPLOAD_FILE_WITH_NFT'],
        };
        await callback(responseContent);
        return responseContent;
      }
      logger.info(
        `Collection metadata updated with blob ID: ${blobId}, file name: ${fileName}, file size: ${fileSize}`
      );

      // Delete the file from storage if upload was successful
      if (fs.existsSync(fileInfo.filePath)) {
        fs.unlinkSync(fileInfo.filePath);
      }
      global.fileInfo.delete(fileId);

      // Prepare response text
      let responseText =
        `File uploaded successfully and NFT collection created!\n\n` +
        `Collection ID: ${collectionId}\n` +
        `Name: ${name}\n` +
        `Max Supply: ${maxSupply}\n` +
        `Mint Price: ${mintPrice / 1000000000} SUI\n` +
        `Blob ID: ${blobId}`;

      const responseContent: Content = {
        text: responseText,
        actions: ['UPLOAD_FILE_WITH_NFT'],
      };

      await callback(responseContent);
      return responseContent;
    } catch (error) {
      logger.error(`Error in UPLOAD_FILE_WITH_NFT action: ${error}`);
      const responseContent: Content = {
        text: `An error occurred: ${error.message}`,
        actions: ['UPLOAD_FILE_WITH_NFT'],
      };
      await callback(responseContent);
      return responseContent;
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'upload file with nft fileId: ba057d8e-9b45-4c42-b2b5-f5177ccc690c',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'File uploaded successfully and NFT collection created!\n\nCollection ID: 0x123abc\nName: File NFT Collection 2025-05-22T10:15:30.123Z\nMax Supply: 10\nMint Price: 0.001 SUI\nBlob ID: blob123',
          actions: ['UPLOAD_FILE_WITH_NFT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'upload file to nft collection "Premium Files" with mint price 0.5 fileId: a5ef6dd4-0b42-43b5-a181-0a140585f7a2',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'File uploaded successfully and NFT collection created!\n\nCollection ID: 0x456def\nName: Premium Files\nMax Supply: 10\nMint Price: 0.5 SUI\nBlob ID: blob456',
          actions: ['UPLOAD_FILE_WITH_NFT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'upload this file with max supply and 5 epochs fileId: myfile123',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'File uploaded successfully and NFT collection created!\n\nCollection ID: 0x789ghi\nName: File NFT Collection 2025-05-22T10:15:30.123Z\nMax Supply: 100\nMint Price: 0.001 SUI\nBlob ID: blob789',
          actions: ['UPLOAD_FILE_WITH_NFT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'upload file to nft with deletable fileId: someId',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'File uploaded successfully and NFT collection created!\n\nCollection ID: 0xabc123\nName: File NFT Collection 2025-05-22T10:15:30.123Z\nMax Supply: 10\nMint Price: 0.001 SUI\nBlob ID: blob555',
          actions: ['UPLOAD_FILE_WITH_NFT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'upload fileNFT with not deletable fileId: a5ef6dd4-0b42-43b5-a181-0a140585f7a2',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'File uploaded successfully and NFT collection created!\n\nCollection ID: 0xdef456\nName: File NFT Collection 2025-05-22T10:15:30.123Z\nMax Supply: 10\nMint Price: 0.001 SUI\nBlob ID: blob444',
          actions: ['UPLOAD_FILE_WITH_NFT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'upload this file to nft fileId: 0x123abc name: Awesome Collection',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'File uploaded successfully and NFT collection created!\n\nCollection ID: 0xfed321\nName: Awesome Collection\nMax Supply: 10\nMint Price: 0.001 SUI\nBlob ID: blob777',
          actions: ['UPLOAD_FILE_WITH_NFT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'upload file NFT {"name":"Premium Collection", "deletable":true, "epochs":5, "maxSupply":true, "mintPrice":1.5} fileId: a5ef6dd4-0b42-43b5-a181-0a140585f7a2',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'File uploaded successfully and NFT collection created!\n\nCollection ID: 0x999fff\nName: Premium Collection\nMax Supply: 100\nMint Price: 1.5 SUI\nBlob ID: blob999',
          actions: ['UPLOAD_FILE_WITH_NFT'],
        },
      },
    ],
  ],
};
