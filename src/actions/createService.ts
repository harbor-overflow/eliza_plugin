import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
    logger,
    Content,
    ModelType,
    parseJSONObjectFromText,
    composePromptFromState,
  } from '@elizaos/core';
  import { WalrusSealService } from 'src/service';
  
  const createServiceTemplate = `# Task: Create a service entry with fee {{fee}} MIST, duration {{ttl}} minutes, and name {{name}}
  
  {{recentMessages}}
  
  # Instructions: Extract the fee, duration, and name from the message and create a JSON object.
  
  # Examples
  User: create a service with fee {{fee}} MIST for {{ttl}} minutes named {{name}}
  Assistant: {"fee":{{fee}}, "ttl":{{ttl}}, "name":"{{name}}"}
  
  User: create service {{fee}} {{ttl}} {{name}}
  Assistant: {"fee":{{fee}}, "ttl":{{ttl}}, "name":"{{name}}"}
  
  Response format should be formatted in a valid JSON block like this:
  \`\`\`json
  {
      "fee": <number>,
      "ttl": <number>,
      "name": "<string>"
  }
  \`\`\`
  
  Your response should include ONLY the valid JSON block and nothing else. Do not add any additional text or formatting.
  `;
  
  export const createServiceAction: Action = {
    name: 'CREATE_SERVICE',
    similes: ['CREATE_SERVICE_ENTRY'],
    description: 'Create a service entry for seal',
  
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
      _message: Memory,
      state: State,
      _options: any,
      callback: HandlerCallback,
      _responses: Memory[]
    ) => {
      try {
        logger.info('Handling CREATE_SERVICE action');
        const prompt = composePromptFromState({
          state,
          template: createServiceTemplate,
        });
        const response = await runtime.useModel(ModelType.TEXT_SMALL, {
          prompt: prompt,
          response_format: { type: 'json_object' },
        });
  
        const responseContentObj = parseJSONObjectFromText(response);
        logger.info(`Creating service: ${JSON.stringify(responseContentObj)}`);
  
        const memoryWalrusSealService = new WalrusSealService(runtime);
  
        const { success, serviceId, capId, transactionDigest, error } =
          await memoryWalrusSealService.createServiceTask(
            responseContentObj.fee,
            responseContentObj.ttl,
            responseContentObj.name
          );
  
        const responseContent: Content = {
          text: success
            ? `Service created successfully!\ntxId: ${transactionDigest}\nserviceId: ${serviceId}\ncapId: ${capId}\n\nhttps://testnet.suivision.xyz/txblock/${transactionDigest}`
            : `Failed to create service: ${error}`,
          actions: ['CREATE_SERVICE'],
        };
        await callback(responseContent);
  
        return responseContent;
      } catch (error) {
        logger.error(`Error in CREATE_SERVICE action: ${error}`);
        throw error;
      }
    },
  
    examples: [
      [
        {
          name: '{{name1}}',
          content: {
            text: 'create a service with fee 100 MIST for 30 minutes named myService',
          },
        },
        {
          name: '{{name2}}',
          content: {
            text: 'Service created successfully!\nTransaction ID: 0x...\nService ID: 0x...\nCap ID: 0x...\n\nView transaction: https://testnet.suivision.xyz/txblock/0x...',
            actions: ['CREATE_SERVICE'],
          },
        },
      ],
      [
        {
          name: '{{name1}}',
          content: {
            text: 'create service 50 60 premiumService',
          },
        },
        {
          name: '{{name2}}',
          content: {
            text: 'Service created successfully!\nTransaction ID: 0x...\nService ID: 0x...\nCap ID: 0x...\n\nView transaction: https://testnet.suivision.xyz/txblock/0x...',
            actions: ['CREATE_SERVICE'],
          },
        },
      ],
    ],
  };