# Harbor - File & Memory Sharing Plugin for ElizaOS

**Harbor** is an ElizaOS plugin that leverages Sui blockchain technology to securely share files and AI memories. It utilizes [Seal](https://github.com/MystenLabs/seal) for encryption/decryption and [Walrus](https://docs.wal.app/) for storage, enabling users to easily share content protected by NFTs or directly store and retrieve files without encryption.

## Features

### 🔐 NFT-Based Secure Sharing

- **Upload Files with NFT**: Encrypt and upload files to create NFT collections that control access
- **Upload Memories with NFT**: Encrypt and upload AI agent memories with NFT-based access control
- **Mint Access NFTs**: Create NFTs that grant access to encrypted content
- **Download with NFT**: Decrypt and download files/memories using owned NFTs
- **List My NFTs**: View all access NFTs in your wallet
- **List My Collections**: View all NFT collections you've created

### 📦 Direct Walrus Storage

- **Upload Files/Memories**: Upload files or AI memories directly to Walrus without encryption
- **Download Files/Memories**: Download content directly from Walrus without decryption

## Getting Started

### Installation

```bash
bun add @yhl125/plugin-harbor
```

Visit the [npm package page](https://www.npmjs.com/package/@yhl125/plugin-harbor) for more details.

## Configuration

The plugin requires the following environment variables in a `.env` file:

```
SUI_PRIVATE_KEY=your_sui_private_key_here
# Optional, URL for file downloads (set to https://your-domain.com in production)
BASE_URL=http://localhost:3000
```

The `agentConfig` section in `package.json` defines additional parameters:

```json
"agentConfig": {
  "pluginType": "elizaos:plugin:1.0.0",
  "pluginParameters": {
    "API_KEY": {
      "type": "string",
      "description": "API key for the service"
    }
  }
}
```

## Chat Commands

You can interact with the Harbor plugin directly through chat with these commands:

#### NFT-Based Operations

```
# Upload file and create NFT collection. Use fileId obtained from the upload API
upload file to nft collection "my file" with mint price 0.0001 fileId: ba057d8e

# Mint an NFT from an existing collection
mint nft from collection 0x8f89

# Download content using an NFT
download with nft 0xa0123

# Upload memory and create NFT collection
upload memory to nft collection "my memory" with mint price 0.1

# Mint an NFT from a memory collection
mint nft from collection 0x8f779

# Download memory using an NFT
download with nft 0xa0165

# List all owned NFTs
show my nfts

# List all created collections
show my collections
```

#### Direct Storage Operations

```
# Upload a file directly
upload file fileId: ba057d8e

# Upload memory directly
upload memory

# Download a file by blob ID
download file blob abc123 fileName myfile.txt

# Download memory by blob ID
download memory blob abc123
```

## How It Works

### Upload with NFT Protection

1. **Submit Content**: Submit a file or retrieve AI agent memory
2. **Create Collection**: Create an NFT collection with custom settings (name, mint price, max supply)
3. **Encrypt**: Encrypt data with Seal using the NFT collection address as the access key
4. **Store**: Upload encrypted data to Walrus with configurable settings (deletable state, retention period)
5. **Update Metadata**: Update collection with storage details (blobId, end_epoch, file_name, file_size, resource_type)

### Mint Access NFT

- Call `mintAccessNFT` with the collection ID and pay the specified SUI fee to mint an access NFT

### Download with NFT Authentication

1. **Request**: Submit the address of an NFT you own
2. **Retrieve**: Download encrypted data from Walrus using the blobId stored in the NFT collection
3. **Decrypt**: Decrypt data using Seal's `seal_approve` and SessionKey functionality
4. **Deliver**: Process decrypted data and provide as downloadable file or add to agent memory

## Development

```bash
# Start development with hot reloading
bun run dev

# Build the plugin
bun run build

# Test the plugin
bun run test
```

## Deployment

```bash
# Test the publish process
elizaos publish --test

# Publish to npm
elizaos publish --npm
```

## API Endpoints

Endpoints are prefixed with `/api`. For example:

```
http://localhost:3000/api/upload
```

### Available API Endpoints:

1. **File Upload**

   - `POST /api/upload` - Single file upload (up to 10MB)
   - `POST /api/upload-chunk` - Chunked file upload for larger files
   - `POST /api/complete-upload` - Complete a chunked file upload

2. **File Download**

   - `GET /api/download?token={downloadToken}` - Download file with a token

3. **File Management**
   - `DELETE /api/delete?fileId={fileId}` - Delete a file

These endpoints are primarily used by the chat commands internally, but they can also be accessed directly from your application if needed.

## Architecture

Harbor plugin has been refactored into a modular architecture with three specialized services:

### SuiService

Handles all interactions with the Sui blockchain through SuiClient:

- Creating NFT collections
- Minting access NFTs
- Updating collection metadata
- Querying NFT information

### SealService

Manages encryption and decryption operations using the Seal protocol:

- Encrypting files and memories with collection addresses as access keys
- Handling decryption approval through `seal_approve`
- Processing SessionKey operations for secure access

### WalrusService

Provides storage functionality using Walrus:

- Uploading encrypted and unencrypted content
- Downloading stored content by blobId
- Managing retention periods and storage settings

### Integration

These three services work together to provide the complete functionality of Harbor. The workflow typically involves:

1. Using SuiService to create a collection
2. Using SealService to encrypt data
3. Using WalrusService to store encrypted data
4. Using SuiService to update collection metadata
5. For downloading: using SuiService to verify NFT ownership, WalrusService to retrieve encrypted data, and SealService to decrypt it

## Smart Contract Details

The Harbor plugin uses a Move smart contract on the Sui blockchain called `file_nft`. The contract has the following key structures and functions:

### Structs

1. **Collection**

   - Stores metadata about the NFT collection
   - Properties: collection_name, max_supply, mint_price, blob_id, file_name, file_size, end_epoch, owner, resource_type, minted

2. **AccessNFT**
   - Represents an access token to the encrypted content
   - Properties: collection_id, owner

### Key Functions

1. **create_collection(name, max_supply, mint_price)**

   - Creates a new NFT collection with specified parameters

2. **update_collection_metadata(collection, blob_id, file_name, file_size, resource_type, end_epoch)**

   - Updates collection metadata after content is uploaded to Walrus

3. **mint_access_nft(collection, payment)**

   - Mints a new access NFT for the specified collection
   - Requires payment in SUI equal to the mint_price

4. **seal_approve(id, nft)**
   - Authorizes decryption of content for NFT owners
   - Used internally by Seal for access control
