/**
 * Marble API client (WorldLabs)
 * Handles image upload, world generation, and operation polling
 *
 * Based on: https://worldlabs-api-reference.mintlify.app/api
 */

import fetch from 'node-fetch';

// Marble API endpoints
const MARBLE_API_BASE = 'https://api.worldlabs.ai';
const MARBLE_GENERATE_ENDPOINT = `${MARBLE_API_BASE}/marble/v1/worlds:generate`;
const MARBLE_OPERATIONS_ENDPOINT = `${MARBLE_API_BASE}/marble/v1/operations`;
const MARBLE_WORLDS_ENDPOINT = `${MARBLE_API_BASE}/marble/v1/worlds`;
const MARBLE_MEDIA_ENDPOINT = `${MARBLE_API_BASE}/marble/v1/media-assets:prepare_upload`;

function getApiKey() {
  return process.env.VITE_MARBLE_API_KEY;
}

/**
 * Prepare a media asset upload
 * @param {string} fileName - Original file name
 * @returns {Promise<{mediaAssetId: string, uploadUrl: string, uploadMethod: string, requiredHeaders: object}>}
 */
export async function prepareMediaUpload(fileName) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Marble API key not configured');
  }

  const prepareResponse = await fetch(MARBLE_MEDIA_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'WLT-Api-Key': apiKey
    },
    body: JSON.stringify({
      file_name: fileName,
      kind: 'image',
      extension: 'png'
    })
  });

  if (!prepareResponse.ok) {
    const errorText = await prepareResponse.text();
    throw new Error(`Failed to prepare upload: ${prepareResponse.status} - ${errorText}`);
  }

  const prepareData = await prepareResponse.json();
  return {
    mediaAssetId: prepareData.media_asset.id,
    uploadUrl: prepareData.upload_info.upload_url,
    uploadMethod: prepareData.upload_info.upload_method || 'PUT',
    requiredHeaders: prepareData.upload_info.required_headers || {}
  };
}

/**
 * Upload a file buffer to a signed URL
 * @param {string} uploadUrl - Signed upload URL
 * @param {string} uploadMethod - HTTP method (PUT)
 * @param {object} requiredHeaders - Required headers for upload
 * @param {Buffer} buffer - File buffer
 * @param {string} contentType - MIME type
 */
export async function uploadToSignedUrl(uploadUrl, uploadMethod, requiredHeaders, buffer, contentType) {
  const uploadResponse = await fetch(uploadUrl, {
    method: uploadMethod,
    headers: {
      ...requiredHeaders,
      'Content-Type': contentType
    },
    body: buffer
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text().catch(() => 'No error body');
    throw new Error(`Failed to upload file: ${uploadResponse.status} - ${errorText}`);
  }
}

/**
 * Start world generation
 * @param {string} displayName - World display name
 * @param {object} worldPrompt - World prompt object
 * @returns {Promise<{operationId: string}>}
 */
export async function generateWorld(displayName, worldPrompt) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Marble API key not configured');
  }

  const generateResponse = await fetch(MARBLE_GENERATE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'WLT-Api-Key': apiKey
    },
    body: JSON.stringify({
      display_name: displayName,
      world_prompt: worldPrompt
    })
  });

  if (!generateResponse.ok) {
    const errorText = await generateResponse.text();
    throw new Error(`Marble API error: ${generateResponse.status} - ${errorText}`);
  }

  const operation = await generateResponse.json();
  return { operationId: operation.operation_id };
}

/**
 * Check operation status
 * @param {string} operationId - Operation ID to check
 * @returns {Promise<object>} Operation status data
 */
export async function checkOperationStatus(operationId) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Marble API key not configured');
  }

  const statusResponse = await fetch(`${MARBLE_OPERATIONS_ENDPOINT}/${operationId}`, {
    headers: {
      'WLT-Api-Key': apiKey
    }
  });

  if (!statusResponse.ok) {
    throw new Error(`Status check failed: ${statusResponse.status}`);
  }

  return statusResponse.json();
}

/**
 * Fetch world data by ID
 * @param {string} worldId - World ID
 * @returns {Promise<object>} World data
 */
export async function fetchWorld(worldId) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Marble API key not configured');
  }

  const worldResponse = await fetch(`${MARBLE_WORLDS_ENDPOINT}/${worldId}`, {
    headers: {
      'WLT-Api-Key': apiKey
    }
  });

  if (!worldResponse.ok) {
    throw new Error(`Failed to fetch world: ${worldResponse.status}`);
  }

  return worldResponse.json();
}

/**
 * Extract splat URL from world data, trying multiple paths
 * @param {object} worldData - World data object
 * @param {object} [statusData] - Optional operation status data
 * @returns {string|null} Splat URL or null
 */
export function extractSplatUrl(worldData, statusData = null) {
  // Check operation response first (might contain splat URL directly)
  const responseSplatUrl = statusData?.response?.splat_url ||
                           statusData?.response?.assets?.splats?.spz_urls?.full_res ||
                           statusData?.response?.world?.assets?.splats?.spz_urls?.full_res;

  // Then check world data assets
  const worldSplatUrl = worldData?.assets?.splats?.spz_urls?.full_res ||
                        worldData?.assets?.splats?.spz_urls?.['500k'] ||
                        worldData?.assets?.splats?.spz_urls?.['100k'] ||
                        worldData?.splats?.spz_urls?.full_res ||
                        worldData?.splat_url ||
                        worldData?.assets?.splat_url;

  return responseSplatUrl || worldSplatUrl || null;
}

/**
 * Extract collider mesh URL from world data, trying multiple paths
 * @param {object} worldData - World data object
 * @returns {string|null} Collider mesh URL or null
 */
export function extractColliderMeshUrl(worldData) {
  return worldData?.assets?.meshes?.glb_urls?.collider ||
         worldData?.assets?.meshes?.collider_glb_url ||
         worldData?.assets?.collider_mesh?.url ||
         worldData?.assets?.collider?.glb_url ||
         worldData?.collider_mesh?.url ||
         null;
}

/**
 * Extract low-res splat URL from world data
 * @param {object} worldData - World data object
 * @returns {string|null} Low-res splat URL or null
 */
export function extractLowResSplatUrl(worldData) {
  return worldData?.assets?.splats?.spz_urls?.['500k'] ||
         worldData?.assets?.splats?.spz_urls?.['100k'] ||
         null;
}

export {
  MARBLE_API_BASE,
  MARBLE_GENERATE_ENDPOINT,
  MARBLE_OPERATIONS_ENDPOINT,
  MARBLE_WORLDS_ENDPOINT,
  MARBLE_MEDIA_ENDPOINT
};
