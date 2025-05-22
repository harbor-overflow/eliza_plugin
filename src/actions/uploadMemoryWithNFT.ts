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

const uploadMemoryWithNFTTemplate = `# Task: Upload Memory with NFT

# Recent Messages:
{{recentMessages}}

# Instructions:
Extract the following fields from the user’s last message:
- name: string or null
- deletable: boolean or null
- epochs: number or null
- maxSupply: boolean or null
- mintPrice: number or null

# Examples
User: upload memory with nft
Assistant: {"name":null,"deletable":null,"epochs":null,"maxSupply":null,"mintPrice":null}

User: upload this conversation to nft name: Awesome Collection
Assistant: {"name":"Awesome Collection","deletable":null,"epochs":null,"maxSupply":null,"mintPrice":null}

User: upload memory to nft with deletable
Assistant: {"name":null,"deletable":true,"epochs":null,"maxSupply":null,"mintPrice":null}

User: upload memoryNFT with not deletable
Assistant: {"name":null,"deletable":false,"epochs":null,"maxSupply":null,"mintPrice":null}

User: upload memoryNFT with 5 epochs and max supply 100
Assistant: {"name":null,"deletable":null,"epochs":5,"maxSupply":true,"mintPrice":null}

User: upload memory to nft collection "My NFT" with mint price 0.1
Assistant: {"name":"My NFT","deletable":null,"epochs":null,"maxSupply":null,"mintPrice":0.1}

User: upload memory NFT {"name":"Premium Collection", "deletable":true, "epochs":5, "maxSupply":true, "mintPrice":1.5} fileId: a5ef6dd4-0b42-43b5-a181-0a140585f7a2
Assistant: {"name":"Premium Collection","deletable":true,"epochs":5,"maxSupply":true,"mintPrice":1.5}
Response format should be formatted in a valid JSON block like this:
\`\`\`json
{
  "name": string | null,
  "deletable": boolean | null,
  "epochs": number | null,
  "maxSupply": number | null,
  "mintPrice": number | null
}
\`\`\`

Your response should include the valid JSON block and nothing else.
`;

export const uploadMemoryWithNFTAction: Action = {
  name: 'UPLOAD_MEMORY_WITH_NFT',
  similes: ['UPLOAD_MEMORY_NFT', 'ENCRYPT_AND_UPLOAD_MEMORY_WITH_NFT'],
  description: 'Upload a memory, encrypt it with Seal, and create an NFT collection for access control',

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
      logger.info('Handling UPLOAD_MEMORY_WITH_NFT action');

      const prompt = composePromptFromState({
        state,
        template: uploadMemoryWithNFTTemplate,
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
      const name = getNullableValue(responseContentObj.name) || `Memory NFT Collection ${new Date().toISOString()}`;
      const deletable = getNullableValue(responseContentObj.deletable) ?? true;
      const epochs = getNullableValue(responseContentObj.epochs) ?? 3;
      const maxSupply = getNullableValue(responseContentObj.maxSupply) ?? 10; // 기본값 10
      const mintPrice = getNullableValue(responseContentObj.mintPrice) ?? 0.001;
      
      // Get memory data
      logger.info('Getting memories...');
      const memories = await runtime.getMemories({
        agentId: message.roomId ? undefined : runtime.agentId,
        tableName: 'messages',
        roomId: message.roomId ? message.roomId : undefined,
      });
      
      // Convert memories to JSON and then to bytes
      const jsonData = JSON.stringify(memories, null, 2);
      const dataToEncrypt = new TextEncoder().encode(jsonData);
      
      // Create WalrusSealService instance
      const walrusSealService = new WalrusSealService(runtime);
      
      // Step 1: Create NFT Collection
      logger.info(`Creating NFT collection with name: ${name}`);
      const createCollectionResult = await walrusSealService.createCollectionTask(
        name,
        maxSupply,
        mintPrice * 1000000000 // Convert from SUI to MIST
      );
      
      if (!createCollectionResult.success) {
        const responseContent: Content = {
          text: `Failed to create NFT collection: ${createCollectionResult.error}`,
          actions: ['UPLOAD_MEMORY_WITH_NFT'],
        };
        await callback(responseContent);
        return responseContent;
      }
      
      const collectionId = createCollectionResult.collectionId;
      logger.info(`Created collection with ID: ${collectionId}`);
      
      // Step 2: Encrypt memory data
      logger.info('Encrypting memory data...');
      const encryptedBytes = await walrusSealService.createEncryptTask(
        dataToEncrypt,
        collectionId
      );
      
      if (encryptedBytes instanceof Error) {
        const responseContent: Content = {
          text: `Failed to encrypt memory: ${encryptedBytes.message}`,
          actions: ['UPLOAD_MEMORY_WITH_NFT'],
        };
        await callback(responseContent);
        return responseContent;
      }
      
      // Step 3: Upload encrypted data to Walrus
      logger.info('Uploading encrypted memory data to Walrus...');
      const uploadResult = await walrusSealService.createUploadTask(
        encryptedBytes,
        deletable,
        epochs
      );
      
      if (!uploadResult.success) {
        const responseContent: Content = {
          text: `Failed to upload encrypted memory: ${uploadResult.error}`,
          actions: ['UPLOAD_MEMORY_WITH_NFT'],
        };
        await callback(responseContent);
        return responseContent;
      }
      
      const blobId = uploadResult.blobId;
      logger.info(`Memory data uploaded with blob ID: ${blobId}`);
      
      // Step 4: Update collection with file information
      // 이 부분은 Sui Move 컨트랙트와 연동 필요 - updateCollectionInfo 메서드가 없어 의사코드로 표시
      logger.info('Updating collection with file information...');
      
      /* 
      // Pseudo code for updateCollectionInfo
      const updateResult = await walrusSealService.updateCollectionInfoTask(
        collectionId,
        blobId,
        allowlistId,
        fileName,
        fileSize,
        0 // resource_type: 0 = 파일
      );
      
      if (!updateResult.success) {
        logger.error(`Failed to update collection info: ${updateResult.error}`);
        // Continue anyway since collection and blob were created successfully
      }
      */      

      // Prepare response text
      let responseText = `Memory uploaded successfully and NFT collection created!\n\n` +
        `Collection ID: ${collectionId}\n` +
        `Name: ${name}\n` +
        `Max Supply: ${maxSupply}\n` +
        `Mint Price: ${mintPrice} SUI\n` +
        `Blob ID: ${blobId}\n` +
        `Memory size: ${memories.length} messages`;
      
      const responseContent: Content = {
        text: responseText,
        actions: ['UPLOAD_MEMORY_WITH_NFT'],
      };

      await callback(responseContent);
      return responseContent;
    } catch (error) {
      logger.error(`Error in UPLOAD_MEMORY_WITH_NFT action: ${error}`);
      const responseContent: Content = {
        text: `An error occurred: ${error.message}`,
        actions: ['UPLOAD_MEMORY_WITH_NFT'],
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
          text: 'upload memory with nft',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Memory uploaded successfully and NFT collection created!\n\nCollection ID: 0x123abc\nName: Memory NFT Collection 2025-05-22T10:15:30.123Z\nMax Supply: 10\nMint Price: 0.001 SUI\nBlob ID: blob123\nAllowlist ID: 0xdef456\nMemory size: 42 messages',
          actions: ['UPLOAD_MEMORY_WITH_NFT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'upload this conversation to nft name: Awesome Collection',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Memory uploaded successfully and NFT collection created!\n\nCollection ID: 0x456def\nName: Awesome Collection\nMax Supply: 10\nMint Price: 0.001 SUI\nBlob ID: blob456\nAllowlist ID: 0xabc123\nMemory size: 38 messages',
          actions: ['UPLOAD_MEMORY_WITH_NFT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'upload memory to nft with deletable',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Memory uploaded successfully and NFT collection created!\n\nCollection ID: 0x789ghi\nName: Memory NFT Collection 2025-05-22T10:15:30.123Z\nMax Supply: 10\nMint Price: 0.001 SUI\nBlob ID: blob789\nAllowlist ID: 0xghi789\nMemory size: 55 messages',
          actions: ['UPLOAD_MEMORY_WITH_NFT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'upload memoryNFT with not deletable',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Memory uploaded successfully and NFT collection created!\n\nCollection ID: 0xabc123\nName: Memory NFT Collection 2025-05-22T10:15:30.123Z\nMax Supply: 10\nMint Price: 0.001 SUI\nBlob ID: blob555\nAllowlist ID: 0xabc456\nMemory size: 27 messages',
          actions: ['UPLOAD_MEMORY_WITH_NFT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'upload memoryNFT with 5 epochs and max supply 100',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Memory uploaded successfully and NFT collection created!\n\nCollection ID: 0xdef456\nName: Memory NFT Collection 2025-05-22T10:15:30.123Z\nMax Supply: 100\nMint Price: 0.001 SUI\nBlob ID: blob444\nAllowlist ID: 0xdef789\nMemory size: 31 messages',
          actions: ['UPLOAD_MEMORY_WITH_NFT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'upload memory to nft collection "My NFT" with mint price 0.1',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Memory uploaded successfully and NFT collection created!\n\nCollection ID: 0xfed321\nName: My NFT\nMax Supply: 10\nMint Price: 0.1 SUI\nBlob ID: blob777\nAllowlist ID: 0xfed654\nMemory size: 19 messages',
          actions: ['UPLOAD_MEMORY_WITH_NFT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'upload memory NFT {"name":"Premium Collection", "deletable":true, "epochs":5, "maxSupply":true, "mintPrice":1.5}',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Memory uploaded successfully and NFT collection created!\n\nCollection ID: 0x999fff\nName: Premium Collection\nMax Supply: 100\nMint Price: 1.5 SUI\nBlob ID: blob999\nAllowlist ID: 0x999aaa\nMemory size: 45 messages\n\nFirst NFT minted with ID: 0xnft123',
          actions: ['UPLOAD_MEMORY_WITH_NFT'],
        },
      },
    ],
  ],
};
