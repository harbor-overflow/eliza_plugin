import type { Plugin } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { z } from 'zod';
import multer from 'multer';
import { mintAccessNFTAction } from './actions/mintAccessNFT';
import { listCollectionsAction } from './actions/listCollections';
import { listMyNFTsAction } from './actions/listMyNFTs';

import path from 'path';
import fs from 'fs';
import { uploadFileWithNFTAction } from './actions/uploadFileWithNFT';
import { SuiService } from './SuiService';
import { SealService } from './SealService';
import { WalrusService } from './WalrusService';
import { uploadMemoryWithNFTAction } from './actions/uploadMemoryWithNFT';
import { downloadWithNFTAction } from './actions/downloadWithNFT';
import { downloadFileAction } from './actions/downloadFile';
import { downloadMemoryAction } from './actions/downloadMemory';
import { uploadFileAction } from './actions/uploadFile';
import { uploadMemoryAction } from './actions/uploadMemory';

const MAX_CHUNK_SIZE = 10 * 1024 * 1024;
const UPLOAD_DIR = path.join(process.cwd(), 'data/uploads');
export const DOWNLOAD_DIR = path.join(process.cwd(), 'data/downloads');

function cleanupUploadDirectory(directory: string) {
  logger.info(`Cleaning up upload directory: ${directory}`);

  if (fs.existsSync(directory)) {
    try {
      // Remove all files and subdirectories
      fs.readdirSync(directory).forEach((file) => {
        const currentPath = path.join(directory, file);
        if (fs.lstatSync(currentPath).isDirectory()) {
          // Remove directory and all contents
          fs.rmSync(currentPath, { recursive: true, force: true });
          logger.info(`Removed directory: ${currentPath}`);
        } else {
          // Remove file
          fs.unlinkSync(currentPath);
          logger.info(`Removed file: ${currentPath}`);
        }
      });
      logger.info('Upload directory cleaned successfully');
    } catch (error) {
      logger.error(`Error cleaning upload directory: ${error}`);
    }
  }

  // Ensure the directory exists after cleanup
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
    logger.info(`Created upload directory: ${directory}`);
  }
}

function cleanupExpiredDownloads() {
  logger.info('Cleaning up expired download files...');

  try {
    // Clear expired metadata entries
    if (global.downloadMetadata) {
      const now = Date.now();
      const expiredTokens = [];

      for (const [token, info] of global.downloadMetadata.entries()) {
        if (info.expiresAt && info.expiresAt < now) {
          expiredTokens.push(token);

          // Delete the associated file
          if (info.filePath && fs.existsSync(info.filePath)) {
            try {
              fs.unlinkSync(info.filePath);
              logger.info(`Removed expired file: ${info.filePath}`);
            } catch (err) {
              logger.error(`Failed to delete expired file: ${err}`);
            }
          }
        }
      }

      // Remove expired entries from metadata
      expiredTokens.forEach((token) => {
        global.downloadMetadata.delete(token);
      });

      logger.info(
        `Cleaned up ${expiredTokens.length} expired download entries`
      );
    }
  } catch (error) {
    logger.error(`Error in cleanup routine: ${error}`);
  }
}

/**
 * Defines the configuration schema for a plugin, including the validation rules for the plugin name.
 *
 * @type {import('zod').ZodObject<{ EXAMPLE_PLUGIN_VARIABLE: import('zod').ZodString }>}
 */
const configSchema = z.object({
  SUI_PRIVATE_KEY: z
    .string()
    .min(1, 'SUI_PRIVATE_KEY is not provided')
    .optional()
    .transform((val) => {
      if (!val) {
        logger.warn('SUI_PRIVATE_KEY is not provided');
      }
      return val;
    }),
});

export const harborPlugin: Plugin = {
  name: 'plugin-harbor',
  description:
    'Plugin harbor for upload and download encrypted memories with walrus and seal',
  config: {
    SUI_PRIVATE_KEY: process.env.SUI_PRIVATE_KEY,
  },
  async init(config: Record<string, string>) {
    logger.info('*** TESTING DEV MODE - PLUGIN MODIFIED AND RELOADED! ***');
    try {
      // Clean up the upload directory at startup
      cleanupUploadDirectory(UPLOAD_DIR);
      cleanupUploadDirectory(DOWNLOAD_DIR);

      // Schedule periodic cleanup
      setInterval(cleanupExpiredDownloads, 60 * 60 * 1000); // Every hour

      const validatedConfig = await configSchema.parseAsync(config);

      // Set all environment variables at once
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value) process.env[key] = value;
      }

      // Initialize global variables
      if (!global.fileInfo) {
        global.fileInfo = new Map();
      }
      if (!global.chunkInfo) {
        global.chunkInfo = new Map();
      }
      if (!global.downloadMetadata) {
        global.downloadMetadata = new Map();
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
      path: '/upload-chunk',
      handler: async (req, res) => {
        try {
          // Configure multer for chunk upload
          const storage = multer.memoryStorage();
          const upload = multer({
            storage: storage,
            limits: { fileSize: MAX_CHUNK_SIZE + 1 },
          });

          // Handle chunk upload
          upload.single('file')(req, res, async (err) => {
            if (err) {
              return res.status(400).json({
                success: false,
                error: `Chunk upload error: ${err.message}`,
              });
            }

            if (!req.file) {
              return res.status(400).json({
                success: false,
                error: 'No chunk uploaded',
              });
            }

            // Parse chunk metadata
            const fileId = req.body.fileId || crypto.randomUUID();
            const chunkIndex = parseInt(req.body.chunkIndex || '0', 10);
            const totalChunks = parseInt(req.body.totalChunks || '1', 10);
            const fileName = req.body.fileName || 'unknown';
            const contentType =
              req.body.contentType ||
              req.file.mimetype ||
              'application/octet-stream';

            // Create file directory
            const fileDir = path.join(UPLOAD_DIR, fileId);
            if (!fs.existsSync(fileDir)) {
              fs.mkdirSync(fileDir, { recursive: true });
            }

            // Write chunk to disk
            const chunkPath = path.join(fileDir, `chunk-${chunkIndex}`);
            fs.writeFileSync(chunkPath, req.file.buffer);

            if (!global.chunkInfo) {
              global.chunkInfo = new Map();
            }

            // Update chunk tracking info
            if (!global.chunkInfo.has(fileId)) {
              global.chunkInfo.set(fileId, {
                fileName,
                totalChunks,
                contentType,
                receivedChunks: new Set(),
                createdAt: Date.now(),
                expiresAt: Date.now() + 24 * 60 * 60 * 1000, // expires in 24 hours
              });
            }

            console.log('global.chunkInfo: ', global.chunkInfo);

            // Mark chunk as received
            const fileInfo = global.chunkInfo.get(fileId);
            fileInfo.receivedChunks.add(chunkIndex);

            // Return response with fileId for subsequent chunks
            return res.status(200).json({
              success: true,
              fileId,
              chunkIndex,
              receivedChunks: Array.from(fileInfo.receivedChunks),
              totalChunks,
              message: 'Chunk uploaded successfully',
            });
          });
        } catch (error) {
          logger.error(`Error in chunk upload API: ${error}`);
          return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error',
          });
        }
      },
    },
    {
      type: 'POST',
      path: '/complete-upload',
      handler: async (req, res) => {
        try {
          const { fileId } = req.body;

          if (!fileId) {
            return res.status(400).json({
              success: false,
              error: 'File ID is required',
            });
          }

          // Validate file exists
          if (!global.chunkInfo.has(fileId)) {
            return res.status(404).json({
              success: false,
              error: 'File not found or no chunks uploaded',
            });
          }

          const fileInfo = global.chunkInfo.get(fileId);

          // Check if all chunks are uploaded
          if (fileInfo.receivedChunks.size !== fileInfo.totalChunks) {
            return res.status(400).json({
              success: false,
              error: `Missing chunks. Received ${fileInfo.receivedChunks.size} of ${fileInfo.totalChunks}`,
              receivedChunks: Array.from(fileInfo.receivedChunks),
              totalChunks: fileInfo.totalChunks,
            });
          }

          // Prepare for file assembly
          const fileDir = path.join(UPLOAD_DIR, fileId);
          const outputPath = path.join(UPLOAD_DIR, `${fileId}-complete`);
          const writeStream = fs.createWriteStream(outputPath);

          // Combine chunks in order
          for (let i = 0; i < fileInfo.totalChunks; i++) {
            const chunkPath = path.join(fileDir, `chunk-${i}`);
            if (fs.existsSync(chunkPath)) {
              const chunkData = fs.readFileSync(chunkPath);
              writeStream.write(chunkData);
            } else {
              // This shouldn't happen if we checked correctly
              return res.status(500).json({
                success: false,
                error: `Chunk ${i} missing during assembly`,
              });
            }
          }

          writeStream.end();

          // Wait for stream to finish
          await new Promise<void>((resolve) => {
            writeStream.on('finish', resolve);
          });

          // Store file info for later use
          if (!global.fileInfo) {
            global.fileInfo = new Map();
          }

          // Get file size
          const stats = fs.statSync(outputPath);

          global.fileInfo.set(fileId, {
            fileName: fileInfo.fileName,
            filePath: outputPath,
            contentType: fileInfo.contentType,
            size: stats.size,
            createdAt: Date.now(),
            expiresAt: Date.now() + 24 * 60 * 60 * 1000, // expires in 24 hours
          });

          return res.status(200).json({
            success: true,
            fileId,
            fileName: fileInfo.fileName,
            fileSize: stats.size,
            message: 'File assembly completed successfully',
          });
        } catch (error) {
          logger.error(`Error in complete upload API: ${error}`);
          return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error',
          });
        }
      },
    },
    {
      // Legacy single-file upload (for backward compatibility)
      type: 'POST',
      path: '/upload',
      handler: async (req, res) => {
        try {
          // Configure multer
          const storage = multer.memoryStorage();
          const upload = multer({
            storage: storage,
            limits: { fileSize: MAX_CHUNK_SIZE }, // 10MB limit
          });
          // Handle file upload
          upload.single('file')(req, res, async (err) => {
            console.log('Multer upload handler called');
            console.log('upload');

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
            const fileId = crypto.randomUUID();
            const filePath = path.join(UPLOAD_DIR, `${fileId}-complete`);

            console.log('upload::filepath: ', filePath);

            // Save file to disk
            fs.writeFileSync(filePath, fileBuffer);

            // Save file info
            if (!global.fileInfo) {
              global.fileInfo = new Map();
            }

            global.fileInfo.set(fileId, {
              fileName: req.file.originalname,
              filePath: filePath,
              contentType: req.file.mimetype,
              size: req.file.size,
              createdAt: Date.now(),
              expiresAt: Date.now() + 24 * 60 * 60 * 1000, // expires in 24 hours
            });
            console.log('global.fileInfo: ', global.fileInfo);

            return res.status(200).json({
              success: true,
              fileId,
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
      path: '/delete',
      handler: async (req, res) => {
        const fileId = req.query.fileId as string;
        if (!fileId) {
          return res.status(400).json({
            success: false,
            error: 'File ID is required',
          });
        }

        try {
          // Check if the file exists
          const fileExists = global.fileInfo && global.fileInfo.has(fileId);

          if (fileExists) {
            // Get file information
            const fileInfo = global.fileInfo.get(fileId);

            // Delete file from disk
            if (fileInfo.filePath && fs.existsSync(fileInfo.filePath)) {
              fs.unlinkSync(fileInfo.filePath);
            }

            // Delete chunk directory if exists
            const chunkDir = path.join(UPLOAD_DIR, fileId);
            if (fs.existsSync(chunkDir)) {
              // Delete all chunks
              const files = fs.readdirSync(chunkDir);
              for (const file of files) {
                fs.unlinkSync(path.join(chunkDir, file));
              }
              // Remove directory
              fs.rmdirSync(chunkDir);
            }

            // Remove from maps
            global.fileInfo.delete(fileId);
            global.chunkInfo?.delete(fileId);

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
        } catch (error) {
          logger.error(`Error deleting file: ${error}`);
          return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error',
          });
        }
      },
    },
    {
      type: 'GET',
      path: '/download',
      handler: async (req, res) => {
        try {
          const token = req.query.token as string;

          if (!token) {
            return res.status(400).json({
              success: false,
              error: 'Token parameter is required',
            });
          }

          // Check if token metadata exists
          if (!global.downloadMetadata || !global.downloadMetadata.has(token)) {
            return res.status(404).json({
              success: false,
              error: 'Invalid download token or file expired',
            });
          }

          // Get file metadata
          const fileInfo = global.downloadMetadata.get(token);

          // Check if file exists on disk
          if (!fileInfo.filePath || !fs.existsSync(fileInfo.filePath)) {
            return res.status(404).json({
              success: false,
              error: 'File not found on server',
            });
          }

          // Get file stats for content-length and other headers
          const stats = fs.statSync(fileInfo.filePath);

          // Support for range requests
          const rangeHeader = req.headers.range;
          if (rangeHeader) {
            const fileSize = stats.size;
            const parts = rangeHeader.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = end - start + 1;

            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': chunkSize,
              'Content-Type': fileInfo.contentType,
              'Content-Disposition': `attachment; filename="${fileInfo.filename}"`,
            });

            // Stream the file range
            const fileStream = fs.createReadStream(fileInfo.filePath, {
              start,
              end,
            });
            fileStream.pipe(res);

            // Delete metadata after streaming is complete
            fileStream.on('close', () => {
              global.downloadMetadata.delete(token);
            });
          } else {
            // Stream whole file
            res.setHeader(
              'Content-Disposition',
              `attachment; filename="${fileInfo.filename}"`
            );
            res.setHeader('Content-Type', fileInfo.contentType);
            res.setHeader('Content-Length', stats.size);

            const fileStream = fs.createReadStream(fileInfo.filePath);
            fileStream.pipe(res);

            // Cleanup after file is sent
            fileStream.on('close', () => {
              // Remove metadata
              global.downloadMetadata.delete(token);

              // Optionally delete file after download (uncomment if desired)
              // try {
              //   fs.unlinkSync(fileInfo.filePath);
              // } catch (err) {
              //   logger.error(`Error removing file after download: ${err}`);
              // }
            });
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
  services: [SuiService, WalrusService, SealService],
  actions: [
    uploadMemoryAction,
    uploadFileAction,
    downloadMemoryAction,
    downloadFileAction,
    mintAccessNFTAction,
    listCollectionsAction,
    listMyNFTsAction,
    uploadFileWithNFTAction,
    uploadMemoryWithNFTAction,
    downloadWithNFTAction,
  ],
  providers: [],
};

export default harborPlugin;
