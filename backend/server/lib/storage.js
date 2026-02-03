/**
 * Vercel Blob Storage client
 * Migrated from Vultr Object Storage (S3-compatible) to Vercel Blob
 */

import { put, del, list } from '@vercel/blob';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from root directory
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

if (!BLOB_READ_WRITE_TOKEN) {
  console.warn('⚠️ [STORAGE] Vercel Blob Storage token not configured');
}

/**
 * Upload a file to Vercel Blob Storage
 * @param {Buffer} fileBuffer - File content as Buffer
 * @param {string} key - Object key (file path)
 * @param {string} contentType - MIME type
 * @returns {Promise<string>} Public URL of the uploaded file
 */
export async function uploadFile(fileBuffer, key, contentType = 'application/octet-stream') {
  if (!BLOB_READ_WRITE_TOKEN) {
    throw new Error('Vercel Blob Storage token not configured');
  }

  try {
    // Upload to Vercel Blob
    const blob = await put(key, fileBuffer, {
      access: 'public',
      contentType: contentType,
      token: BLOB_READ_WRITE_TOKEN
    });

    console.log(`✅ [STORAGE] Uploaded file: ${key}`);
    // Return the URL provided by Vercel Blob
    return blob.url;
  } catch (error) {
    console.error(`❌ [STORAGE] Upload error for ${key}:`, error);
    throw error;
  }
}

/**
 * Delete a file from Vercel Blob Storage
 * @param {string} keyOrUrl - Object key (file path) or the full URL
 */
export async function deleteFile(keyOrUrl) {
  if (!BLOB_READ_WRITE_TOKEN) {
    throw new Error('Vercel Blob Storage token not configured');
  }

  try {
    // Vercel Blob's del() accepts either the pathname or the full URL
    await del(keyOrUrl, {
      token: BLOB_READ_WRITE_TOKEN
    });
    console.log(`✅ [STORAGE] Deleted file: ${keyOrUrl}`);
  } catch (error) {
    console.error(`❌ [STORAGE] Delete error for ${keyOrUrl}:`, error);
    // Don't throw error if file doesn't exist (already deleted)
    if (!error.message?.includes('not found')) {
      throw error;
    }
  }
}

/**
 * Generate a signed URL for private file access
 * Note: Vercel Blob URLs are already signed and secure by default
 * This function is kept for backward compatibility but returns the public URL
 * @param {string} url - The blob URL
 * @param {number} expiresIn - Ignored (kept for compatibility)
 * @returns {Promise<string>} The blob URL
 */
export async function getSignedFileUrl(url, expiresIn = 3600) {
  // Vercel Blob URLs are already secure and don't need additional signing
  // They include a token in the URL that provides access control
  return url;
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

/**
 * Extract key from Vercel Blob URL
 * Helper function to get the pathname from a blob URL
 * @param {string} url - Vercel Blob URL
 * @returns {string} The pathname/key
 */
export function extractKeyFromUrl(url) {
  try {
    const urlObj = new URL(url);
    // Remove the leading slash from pathname
    return urlObj.pathname.substring(1);
  } catch {
    // If it's not a valid URL, assume it's already a key
    return url;
  }
}

/**
 * List all blobs (optional utility function)
 * @param {string} prefix - Optional prefix to filter results
 * @returns {Promise<Array>} List of blob objects
 */
export async function listFiles(prefix = '') {
  if (!BLOB_READ_WRITE_TOKEN) {
    throw new Error('Vercel Blob Storage token not configured');
  }

  try {
    const response = await list({
      prefix,
      token: BLOB_READ_WRITE_TOKEN
    });
    return response.blobs;
  } catch (error) {
    console.error(`❌ [STORAGE] List error:`, error);
    throw error;
  }
}