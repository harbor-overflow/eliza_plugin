import type { Plugin } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { z } from 'zod';
import { WalrusSealService } from './service';
import { encryptAndUploadMemoryAction } from './actions/encryptAndUploadMemory';
import { createAllowlistAction } from './actions/createAllowlist';
import { addAllowlistAction } from './actions/addAllowlist';
import { downloadAndDecryptMemoryAction } from './actions/downloadAndDecryptMemory';
import { createServiceAction } from './actions/createService';

/**
 * Defines the configuration schema for a plugin, including the validation rules for the plugin name.
 *
 * @type {import('zod').ZodObject<{ EXAMPLE_PLUGIN_VARIABLE: import('zod').ZodString }>}
 */
const configSchema = z.object({
  EXAMPLE_PLUGIN_VARIABLE: z
    .string()
    .min(1, 'Example plugin variable is not provided')
    .optional()
    .transform((val) => {
      if (!val) {
        logger.warn(
          'Example plugin variable is not provided (this is expected)'
        );
      }
      return val;
    }),
});

export const harborPlugin: Plugin = {
  name: 'plugin-harbor',
  description:
    'Plugin harbor for upload and download encrypted memories with walrus and seal',
  config: {
    EXAMPLE_PLUGIN_VARIABLE: process.env.EXAMPLE_PLUGIN_VARIABLE,
  },
  async init(config: Record<string, string>) {
    logger.info('*** TESTING DEV MODE - PLUGIN MODIFIED AND RELOADED! ***');
    try {
      const validatedConfig = await configSchema.parseAsync(config);

      // Set all environment variables at once
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value) process.env[key] = value;
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(
          `Invalid plugin configuration: ${error.errors.map((e) => e.message).join(', ')}`
        );
      }
      throw error;
    }
  },
  tests: [
    {
      name: 'plugin_starter_test_suite',
      tests: [
        {
          name: 'example_test',
          fn: async (runtime) => {
            logger.debug('example_test run by ', runtime.character.name);
            // Add a proper assertion that will pass]

            if (runtime.character.name !== 'Eliza') {
              throw new Error(
                `Expected character name to be "Eliza" but got "${runtime.character.name}"`
              );
            }
            // Verify the plugin is loaded properly
            const service = runtime.getService('starter');
            if (!service) {
              throw new Error('Starter service not found');
            }
            // Don't return anything to match the void return type
          },
        },
        {
          name: 'should_have_hello_world_action',
          fn: async (runtime) => {
            // Check if the hello world action is registered
            // Look for the action in our plugin's actions
            // The actual action name in this plugin is "helloWorld", not "hello"
            const actionExists = harborPlugin.actions.some(
              (a) => a.name === 'HELLO_WORLD'
            );
            console.log('Action exists:', actionExists);
            if (!actionExists) {
              throw new Error('Hello world action not found in plugin');
            }
          },
        },
      ],
    },
  ],
  routes: [],
  events: {},
  services: [WalrusSealService],
  actions: [
    encryptAndUploadMemoryAction,
    createAllowlistAction,
    addAllowlistAction,
    downloadAndDecryptMemoryAction,
    createServiceAction,
  ],
  providers: [],
};

export default harborPlugin;
