import type { Plugin } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { z } from 'zod';
import { WalrusSealService } from './service';
import { encryptAndUploadMemoryAction } from './actions/encryptAndUploadMemory';
import { createAllowlistAction } from './actions/createAllowlist';
import { addAllowlistAction } from './actions/addAllowlist';
import { downloadAndDecryptMemoryAction } from './actions/downloadAndDecryptMemory';
import { createServiceAction } from './actions/createService';
import { encryptAndUploadFileAction } from './actions/encryptAndUploadFile';
import multer from 'multer';
import { downloadAndDecryptFileAction } from './actions/downloadAndDecryptFile';

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
  routes: [
    {
      type: 'POST',
      path: '/upload',
      handler: async (req, res) => {
        try {
          // Configure multer
          const storage = multer.memoryStorage();
          const upload = multer({
            storage: storage,
            limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
          });
          // Handle file upload
          upload.single('file')(req, res, async (err) => {
            console.log('Multer upload handler called');
            if (err) {
              return res.status(400).json({
                success: false,
                error: `File upload error: ${err.message}`,
              });
            }

            if (!req.file) {
              return res.status(400).json({
                success: false,
                error: 'No file uploaded',
              });
            }

            // Create and save file ID
            const fileBuffer = req.file.buffer;

            // Save file in temporary storage
            if (!global.tempFiles) {
              console.log('Creating global tempFiles map');
              global.tempFiles = new Map();
            }
            global.tempFiles.set(req.file.originalname, fileBuffer);

            return res.status(200).json({
              success: true,
              fileName: req.file.originalname,
              fileSize: req.file.size,
              message: 'File received successfully',
            });
          });
        } catch (error) {
          logger.error(`Error in file upload API: ${error}`);
          return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error',
          });
        }
      },
    },
    {
      type: 'DELETE',
      path: '/delete/:fileId',
      handler: async (req, res) => {
        const { fileId } = req.params;
        if (!fileId) {
          return res.status(400).json({
            success: false,
            error: 'File ID is required',
          });
        }

        // Check if the file exists in temporary storage
        if (global.tempFiles && global.tempFiles.has(fileId)) {
          global.tempFiles.delete(fileId);
          return res.status(200).json({
            success: true,
            message: `File with ID ${fileId} deleted successfully`,
          });
        } else {
          return res.status(404).json({
            success: false,
            error: `File with ID ${fileId} not found`,
          });
        }
      },
    },
    {
      type: 'GET',
      path: '/download/:token',
      handler: async (req, res) => {
        try {
          const { token } = req.params;

          // check file token
          if (!global.downloadTokens || !global.downloadTokens.has(token)) {
            return res.status(404).json({
              success: false,
              error: 'Invalid download token or file expired',
            });
          }

          const fileData = global.downloadTokens.get(token);
          const fileInfo = global.downloadMetadata?.get(token) || {
            filename: 'downloaded-file',
            contentType: 'application/octet-stream',
          };

          // set headers for file download
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="${fileInfo.filename}"`
          );
          res.setHeader('Content-Type', fileInfo.contentType);

          // send file data
          res.send(Buffer.from(fileData));

          // delete the token after download
          global.downloadTokens.delete(token);
          if (global.downloadMetadata) {
            global.downloadMetadata.delete(token);
          }
        } catch (error) {
          logger.error(`Error in file download API: ${error}`);
          res.status(500).json({
            success: false,
            error: error.message || 'Internal server error',
          });
        }
      },
    },
  ],
  events: {},
  services: [WalrusSealService],
  actions: [
    encryptAndUploadMemoryAction,
    encryptAndUploadFileAction,
    createAllowlistAction,
    addAllowlistAction,
    downloadAndDecryptMemoryAction,
    downloadAndDecryptFileAction,
    createServiceAction,
  ],
  providers: [],
};

export default harborPlugin;
