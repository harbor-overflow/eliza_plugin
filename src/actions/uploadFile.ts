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
import { WalrusService } from 'src/WalrusService';

const uploadFileTemplate = `# Task: Upload File

# Recent Messages:
{{recentMessages}}

# Instructions:
Extract the following fields from the user’s last message:
- deletable: boolean or null
- epochs: number or null
- fileId: string (required)

# Examples
User: upload file fileId: ba057d8e-9b45-4c42-b2b5-f5177ccc690c
Assistant: {"fileId":"ba057d8e-9b45-4c42-b2b5-f5177ccc690c","deletable":null,"epochs":null}

User: upload this file fileId: 0x123abc
Assistant: {"fileId":"0x123abc","deletable":null,"epochs":null}

User: upload file with deletable fileId: someId
Assistant: {"fileId":"someId",""deletable":true,"epochs":null}

User: upload file with not deletable fileId: a5ef6dd4-0b42-43b5-a181-0a140585f7a2
Assistant: {"fileId":"a5ef6dd4-0b42-43b5-a181-0a140585f7a2",""deletable":false,"epochs":null}

User: upload this file with 5 epochs fileId: a5ef6dd4-0b42-43b5-a181-0a140585f7a2
Assistant: {"fileId":"a5ef6dd4-0b42-43b5-a181-0a140585f7a2","deletable":null,"epochs":5}

User: upload file {true, 5} fileId: a5ef6dd4-0b42-43b5-a181-0a140585f7a2
Assistant: {"fileId":"a5ef6dd4-0b42-43b5-a181-0a140585f7a2","deletable":true,"epochs":5}

Response format should be formatted in a valid JSON block like this:
\`\`\`json
{
  "fileId": string,
  "deletable": boolean | null,
  "epochs": number | null
}
\`\`\`

Your response should include the valid JSON block and nothing else.
`;

export const uploadFileAction: Action = {
  name: 'UPLOAD_FILE',
  similes: ['UPLOAD_PUBLIC_FILE'],
  description: 'Get file and upload them to walrus',

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
      logger.info('Handling UPLOAD_FILE action');

      const prompt = composePromptFromState({
        state,
        template: uploadFileTemplate,
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
      const deletable = getNullableValue(responseContentObj.deletable) ?? false;
      const epochs = getNullableValue(responseContentObj.epochs) ?? 3;
      let fileId = responseContentObj.fileId;

      // get file from disk storage
      if (!fileId || !global.fileInfo) {
        const responseContent: Content = {
          text: `No uploaded file found. Please upload a file first.`,
          actions: ['ENCRYPT_AND_UPLOAD_FILE'],
        };
        await callback(responseContent);
        return responseContent;
      }

      // First try direct fileId lookup
      const fileInfo = global.fileInfo.get(fileId);

      if (!fileInfo || !fs.existsSync(fileInfo.filePath)) {
        const responseContent: Content = {
          text: `File not found or has expired. Please upload a file first.`,
          actions: ['ENCRYPT_AND_UPLOAD_FILE'],
        };
        await callback(responseContent);
        return responseContent;
      }

      // Read file data from disk
      const fileData = fs.readFileSync(fileInfo.filePath);
      logger.info(`File data read successfully from ${fileInfo.filePath}`);

      const walrusService = new WalrusService(runtime);
      const { success, blobId, error } = await walrusService.createUploadTask(
        fileData,
        deletable,
        epochs
      );
      logger.info(`upload file success: ${success}`);

      // delete the file from storage if upload was successful
      if (success) {
        if (fs.existsSync(fileInfo.filePath)) {
          fs.unlinkSync(fileInfo.filePath);
        }
        global.fileInfo.delete(fileId);
      }

      const responseContent: Content = {
        text: success
          ? `File uploaded successfully!\nblobId: ${blobId}`
          : `Failed to upload file: ${error}`,
        actions: ['UPLOAD_FILE'],
      };

      await callback(responseContent);
      return responseContent;
    } catch (error) {
      logger.error(`Error in UPLOAD_FILE action: ${error}`);
      throw error;
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'upload file fileName: myfile.txt',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'file uploaded successfully!\nblobId: ...',
          actions: ['UPLOAD_FILE'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'upload file {true, 5} fileName: myfile.png',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'file uploaded successfully!\nblobId: ...',
          actions: ['UPLOAD_FILE'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'upload this file with not deletable fileName: myfile.png',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'file uploaded successfully!\nblobId: ...',
          actions: ['UPLOAD_FILE'],
        },
      },
    ],
  ],
};
