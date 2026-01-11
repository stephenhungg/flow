/**
 * Backend proxy server for Marble API
 * Solves CORS issue by proxying requests from browser to Marble API
 * 
 * Based on: https://worldlabs-api-reference.mintlify.app/api
 * 
 * Install dependencies: npm install express cors multer node-fetch dotenv
 * Run with: node server.js
 */

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3001;

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Debug: Log all requests (BEFORE routes)
app.use((req, res, next) => {
  console.log(`📥 [PROXY] ${req.method} ${req.path}`);
  next();
});

// Configure multer for file uploads (in-memory storage)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Multer error handling
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('❌ [PROXY] Multer error:', err.message);
    return res.status(400).json({ error: `File upload error: ${err.message}` });
  }
  next(err);
};

const MARBLE_API_KEY = process.env.VITE_MARBLE_API_KEY || '06XjKizwFxHRPaaUrTg1bmPtPql3QMhw';
// Correct Marble API endpoints (from https://worldlabs-api-reference.mintlify.app/api)
const MARBLE_API_BASE = 'https://api.worldlabs.ai';
const MARBLE_GENERATE_ENDPOINT = `${MARBLE_API_BASE}/marble/v1/worlds:generate`;
const MARBLE_OPERATIONS_ENDPOINT = `${MARBLE_API_BASE}/marble/v1/operations`;
const MARBLE_WORLDS_ENDPOINT = `${MARBLE_API_BASE}/marble/v1/worlds`;
const MARBLE_MEDIA_ENDPOINT = `${MARBLE_API_BASE}/marble/v1/media-assets:prepare_upload`;

// Proxy endpoint for Marble API - handles image upload and world generation
app.post('/api/marble/convert', upload.single('image'), handleMulterError, async (req, res) => {
  try {
    console.log('🔄 [PROXY] Received Marble world generation request');
    console.log('📦 [PROXY] Request body keys:', Object.keys(req.body || {}));
    console.log('📁 [PROXY] File received:', req.file ? `Yes (${req.file.size} bytes)` : 'No');
    
    if (!MARBLE_API_KEY) {
      return res.status(500).json({ error: 'Marble API key not configured' });
    }

    // Step 1: If image file provided, upload it as media asset first
    let imageUri = null;
    let mediaAssetId = null;
    
    if (req.file) {
      console.log('📤 [PROXY] Step 1: Uploading image as media asset...');
      
      // Prepare upload
      const prepareResponse = await fetch(MARBLE_MEDIA_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'WLT-Api-Key': MARBLE_API_KEY
        },
        body: JSON.stringify({
          file_name: req.file.originalname || 'image.png',
          kind: 'image',
          extension: 'png'
        })
      });

      if (!prepareResponse.ok) {
        const errorText = await prepareResponse.text();
        throw new Error(`Failed to prepare upload: ${prepareResponse.status} - ${errorText}`);
      }

      const prepareData = await prepareResponse.json();
      mediaAssetId = prepareData.media_asset.id;
      const uploadUrl = prepareData.upload_info.upload_url;
      const uploadMethod = prepareData.upload_info.upload_method || 'PUT';
      const requiredHeaders = prepareData.upload_info.required_headers || {};

      console.log('📤 [PROXY] Uploading file to signed URL...');
      
      // Upload the file
      const uploadResponse = await fetch(uploadUrl, {
        method: uploadMethod,
        headers: {
          ...requiredHeaders,
          'Content-Type': req.file.mimetype || 'image/png'
        },
        body: req.file.buffer
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload file: ${uploadResponse.status}`);
      }

      console.log('✅ [PROXY] Image uploaded as media asset:', mediaAssetId);
    } else if (req.body.image_url) {
      imageUri = req.body.image_url;
      console.log('📤 [PROXY] Using provided image URL:', imageUri);
    } else {
      return res.status(400).json({ error: 'No image file or URL provided' });
    }

    // Step 2: Generate world using Marble API
    console.log('🔄 [PROXY] Step 2: Generating world with Marble API...');
    
    const worldPrompt = mediaAssetId 
      ? {
          type: 'image',
          image_prompt: {
            source: 'media_asset',
            media_asset_id: mediaAssetId
          },
          text_prompt: req.body.text_prompt || req.body.concept || 'A 3D environment'
        }
      : {
          type: 'image',
          image_prompt: {
            source: 'uri',
            uri: imageUri
          },
          text_prompt: req.body.text_prompt || req.body.concept || 'A 3D environment'
        };

    const generateResponse = await fetch(MARBLE_GENERATE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'WLT-Api-Key': MARBLE_API_KEY
      },
      body: JSON.stringify({
        display_name: req.body.display_name || req.body.concept || 'Generated World',
        world_prompt: worldPrompt
      })
    });

    if (!generateResponse.ok) {
      const errorText = await generateResponse.text();
      console.error('❌ [PROXY] Marble API error:', generateResponse.status, errorText);
      return res.status(generateResponse.status).json({ 
        error: `Marble API error: ${generateResponse.status}`,
        details: errorText
      });
    }

    const operation = await generateResponse.json();
    console.log('✅ [PROXY] World generation started, operation_id:', operation.operation_id);

    // Step 3: Poll operation until complete
    console.log('⏳ [PROXY] Step 3: Polling operation until complete...');
    const operationId = operation.operation_id;
    const maxAttempts = 120; // 10 minutes max (5s intervals)
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5 seconds
      attempts++;

      const statusResponse = await fetch(`${MARBLE_OPERATIONS_ENDPOINT}/${operationId}`, {
        headers: {
          'WLT-Api-Key': MARBLE_API_KEY
        }
      });

      if (!statusResponse.ok) {
        throw new Error(`Failed to check operation status: ${statusResponse.status}`);
      }

      const statusData = await statusResponse.json();
      console.log(`📊 [PROXY] Operation status (${attempts}/${maxAttempts}):`, statusData.metadata?.progress?.status || 'pending');

      if (statusData.done) {
        if (statusData.error) {
          throw new Error(`Operation failed: ${statusData.error}`);
        }

        // Get the world_id and fetch the world
        const worldId = statusData.metadata?.world_id || statusData.response?.world_id;
        if (!worldId) {
          throw new Error('Operation completed but no world_id found');
        }

        console.log('✅ [PROXY] World generation complete! world_id:', worldId);

        // Fetch the world to get splat URLs
        const worldResponse = await fetch(`${MARBLE_WORLDS_ENDPOINT}/${worldId}`, {
          headers: {
            'WLT-Api-Key': MARBLE_API_KEY
          }
        });

        if (!worldResponse.ok) {
          throw new Error(`Failed to fetch world: ${worldResponse.status}`);
        }

        const worldData = await worldResponse.json();
        const splatUrl = worldData.assets?.splats?.spz_urls?.full_res || 
                        worldData.assets?.splats?.spz_urls?.full_res ||
                        worldData.assets?.splats?.spz_urls?.['500k'] ||
                        worldData.assets?.splats?.spz_urls?.['100k'];

        if (!splatUrl) {
          throw new Error('World generated but no splat URL found');
        }

        console.log('✅ [PROXY] Splat URL retrieved:', splatUrl);
        return res.json({
          splat_url: splatUrl,
          world_id: worldId,
          operation_id: operationId
        });
      }
    }

    throw new Error('Operation timeout after 10 minutes');

  } catch (error) {
    console.error('❌ [PROXY] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Catch-all for debugging (must be LAST)
app.use((req, res) => {
  console.log(`❌ [PROXY] 404 - Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

app.listen(PORT, () => {
  console.log(`🚀 [PROXY] Server running on http://localhost:${PORT}`);
  console.log(`📡 [PROXY] Marble API proxy ready`);
  console.log(`🔑 [PROXY] Using Marble API key: ${MARBLE_API_KEY.substring(0, 10)}...`);
  console.log(`✅ [PROXY] Routes registered: POST /api/marble/convert, GET /health`);
  console.log(`📚 [PROXY] API docs: https://worldlabs-api-reference.mintlify.app/api`);
});
