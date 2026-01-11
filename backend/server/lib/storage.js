/**
 * Vultr Object Storage client (S3-compatible)
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from root directory
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const VULTR_STORAGE_HOSTNAME = process.env.VULTR_STORAGE_HOSTNAME || 'ewr1.vultrobjects.com';
const VULTR_STORAGE_ACCESS_KEY = process.env.VULTR_STORAGE_ACCESS_KEY;
const VULTR_STORAGE_SECRET_KEY = process.env.VULTR_STORAGE_SECRET_KEY;
const VULTR_STORAGE_BUCKET = process.env.VULTR_STORAGE_BUCKET || 'flow-bucket';

if (!VULTR_STORAGE_ACCESS_KEY || !VULTR_STORAGE_SECRET_KEY) {
  console.warn('⚠️ [STORAGE] Vultr Object Storage credentials not configured');
}

// Create S3 client with Vultr endpoint
const s3Client = new S3Client({
  endpoint: `https://${VULTR_STORAGE_HOSTNAME}`,
  region: 'auto',
  credentials: {
    accessKeyId: VULTR_STORAGE_ACCESS_KEY || '',
    secretAccessKey: VULTR_STORAGE_SECRET_KEY || '',
  },
  forcePathStyle: false, // Vultr uses virtual-hosted style
});

/**
 * Upload a file to Vultr Object Storage
 * @param {Buffer} fileBuffer - File content as Buffer
 * @param {string} key - Object key (file path)
 * @param {string} contentType - MIME type
 * @returns {Promise<string>} Public URL of the uploaded file
 */
export async function uploadFile(fileBuffer, key, contentType = 'application/octet-stream') {
  if (!VULTR_STORAGE_ACCESS_KEY || !VULTR_STORAGE_SECRET_KEY) {
    throw new Error('Vultr Object Storage credentials not configured');
  }

  try {
    const command = new PutObjectCommand({
      Bucket: VULTR_STORAGE_BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
      ACL: 'public-read', // Make files publicly accessible
    });

    await s3Client.send(command);
    
    // Construct public URL
    const publicUrl = `https://${VULTR_STORAGE_BUCKET}.${VULTR_STORAGE_HOSTNAME}/${key}`;
    console.log(`✅ [STORAGE] Uploaded file: ${key}`);
    return publicUrl;
  } catch (error) {
    console.error(`❌ [STORAGE] Upload error for ${key}:`, error);
    throw error;
  }
}

/**
 * Delete a file from Vultr Object Storage
 * @param {string} key - Object key (file path)
 */
export async function deleteFile(key) {
  if (!VULTR_STORAGE_ACCESS_KEY || !VULTR_STORAGE_SECRET_KEY) {
    throw new Error('Vultr Object Storage credentials not configured');
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: VULTR_STORAGE_BUCKET,
      Key: key,
    });

    await s3Client.send(command);
    console.log(`✅ [STORAGE] Deleted file: ${key}`);
  } catch (error) {
    console.error(`❌ [STORAGE] Delete error for ${key}:`, error);
    throw error;
  }
}

/**
 * Generate a signed URL for private file access (optional)
 * @param {string} key - Object key (file path)
 * @param {number} expiresIn - URL expiration in seconds (default: 1 hour)
 * @returns {Promise<string>} Signed URL
 */
export async function getSignedFileUrl(key, expiresIn = 3600) {
  if (!VULTR_STORAGE_ACCESS_KEY || !VULTR_STORAGE_SECRET_KEY) {
    throw new Error('Vultr Object Storage credentials not configured');
  }

  try {
    const command = new GetObjectCommand({
      Bucket: VULTR_STORAGE_BUCKET,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return url;
  } catch (error) {
    console.error(`❌ [STORAGE] Signed URL error for ${key}:`, error);
    throw error;
  }
}

/**
 * Generate a unique key for a splat file
 * @param {string} userId - User ID
 * @param {string} sceneId - Scene ID
 * @returns {string} Object key
 */
export function generateSplatKey(userId, sceneId) {
  const timestamp = Date.now();
  return `splats/${userId}/${sceneId}-${timestamp}.spz`;
}

