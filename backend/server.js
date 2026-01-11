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
import { connectToDatabase, getUsersCollection, getScenesCollection } from './server/lib/mongodb.js';
import { authMiddleware } from './server/lib/auth.js';
import { uploadFile, deleteFile, generateSplatKey } from './server/lib/storage.js';
import { ObjectId } from 'mongodb';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from root directory FIRST (before importing lib files that need env vars)
// backend/ -> root = ../
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database connection
connectToDatabase().catch(console.error);

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Increase file size limit for splat uploads (100MB)
const uploadLarge = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit for splat files
});

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

// ============================================
// Authentication Endpoints
// ============================================

/**
 * POST /api/auth/verify
 * Verify Firebase token and create/update user
 */
app.post('/api/auth/verify', async (req, res) => {
  try {
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required' });
    }

    // Verify token using Firebase Admin
    const { verifyIdToken } = await import('./server/lib/auth.js');
    const decodedToken = await verifyIdToken(idToken);

    const usersCollection = getUsersCollection();
    
    // Upsert user
    const user = {
      firebaseUid: decodedToken.uid,
      email: decodedToken.email || '',
      displayName: decodedToken.name || decodedToken.email?.split('@')[0] || 'User',
      photoURL: decodedToken.picture || null,
      updatedAt: new Date(),
    };

    const result = await usersCollection.findOneAndUpdate(
      { firebaseUid: decodedToken.uid },
      { 
        $set: user,
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true, returnDocument: 'after' }
    );

    res.json({
      user: {
        _id: result.value._id.toString(),
        firebaseUid: result.value.firebaseUid,
        email: result.value.email,
        displayName: result.value.displayName,
        photoURL: result.value.photoURL,
      }
    });
  } catch (error) {
    console.error('❌ [AUTH] Verify error:', error);
    res.status(401).json({ error: 'Authentication failed', details: error.message });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile (requires auth)
 */
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const usersCollection = getUsersCollection();
    const user = await usersCollection.findOne({ firebaseUid: req.user.uid });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      _id: user._id.toString(),
      firebaseUid: user.firebaseUid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
    });
  } catch (error) {
    console.error('❌ [AUTH] Get me error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Scenes Library Endpoints
// ============================================

/**
 * GET /api/scenes
 * List public scenes (paginated)
 */
app.get('/api/scenes', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const scenesCollection = getScenesCollection();
    
    // Only show public scenes
    const scenes = await scenesCollection
      .find({ isPublic: true })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const total = await scenesCollection.countDocuments({ isPublic: true });

    res.json({
      scenes: scenes.map(scene => ({
        _id: scene._id.toString(),
        title: scene.title,
        description: scene.description,
        concept: scene.concept,
        creatorId: scene.creatorId.toString(),
        creatorName: scene.creatorName,
        splatUrl: scene.splatUrl,
        thumbnailBase64: scene.thumbnailBase64,
        tags: scene.tags || [],
        viewCount: scene.viewCount || 0,
        createdAt: scene.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      }
    });
  } catch (error) {
    console.error('❌ [SCENES] List error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/scenes
 * Create a new scene with splat file upload
 */
app.post('/api/scenes', authMiddleware, uploadLarge.single('splatFile'), async (req, res) => {
  try {
    const { title, description, concept, tags, isPublic, thumbnailBase64 } = req.body;
    
    if (!title || !concept) {
      return res.status(400).json({ error: 'title and concept are required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'splatFile is required' });
    }

    // Get user info
    const usersCollection = getUsersCollection();
    const user = await usersCollection.findOne({ firebaseUid: req.user.uid });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create scene document first to get ID
    const scenesCollection = getScenesCollection();
    const sceneData = {
      title,
      description: description || '',
      concept,
      creatorId: user._id,
      creatorName: user.displayName,
      tags: tags ? (typeof tags === 'string' ? tags.split(',') : tags) : [],
      isPublic: isPublic === 'true' || isPublic === true,
      thumbnailBase64: thumbnailBase64 || null,
      viewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const insertResult = await scenesCollection.insertOne(sceneData);
    const sceneId = insertResult.insertedId;

    // Upload splat file to Vultr Object Storage
    const splatKey = generateSplatKey(user._id.toString(), sceneId.toString());
    const splatUrl = await uploadFile(req.file.buffer, splatKey, 'application/octet-stream');

    // Update scene with splat URL
    await scenesCollection.updateOne(
      { _id: sceneId },
      { $set: { splatUrl, splatKey } }
    );

    res.status(201).json({
      _id: sceneId.toString(),
      ...sceneData,
      splatUrl,
    });
  } catch (error) {
    console.error('❌ [SCENES] Create error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/scenes/:id
 * Get scene details
 */
app.get('/api/scenes/:id', async (req, res) => {
  try {
    const sceneId = req.params.id;
    
    if (!ObjectId.isValid(sceneId)) {
      return res.status(400).json({ error: 'Invalid scene ID' });
    }

    const scenesCollection = getScenesCollection();
    const scene = await scenesCollection.findOne({ 
      _id: new ObjectId(sceneId),
      isPublic: true 
    });

    if (!scene) {
      return res.status(404).json({ error: 'Scene not found' });
    }

    // Increment view count
    await scenesCollection.updateOne(
      { _id: scene._id },
      { $inc: { viewCount: 1 } }
    );

    res.json({
      _id: scene._id.toString(),
      title: scene.title,
      description: scene.description,
      concept: scene.concept,
      creatorId: scene.creatorId.toString(),
      creatorName: scene.creatorName,
      splatUrl: scene.splatUrl,
      thumbnailBase64: scene.thumbnailBase64,
      tags: scene.tags || [],
      viewCount: (scene.viewCount || 0) + 1,
      createdAt: scene.createdAt,
    });
  } catch (error) {
    console.error('❌ [SCENES] Get error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/scenes/:id
 * Delete own scene
 */
app.delete('/api/scenes/:id', authMiddleware, async (req, res) => {
  try {
    const sceneId = req.params.id;
    
    if (!ObjectId.isValid(sceneId)) {
      return res.status(400).json({ error: 'Invalid scene ID' });
    }

    const scenesCollection = getScenesCollection();
    const usersCollection = getUsersCollection();

    // Get user
    const user = await usersCollection.findOne({ firebaseUid: req.user.uid });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Find scene and verify ownership
    const scene = await scenesCollection.findOne({ _id: new ObjectId(sceneId) });
    
    if (!scene) {
      return res.status(404).json({ error: 'Scene not found' });
    }

    if (scene.creatorId.toString() !== user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to delete this scene' });
    }

    // Delete file from storage if it exists
    if (scene.splatKey) {
      try {
        await deleteFile(scene.splatKey);
      } catch (error) {
        console.warn('⚠️ [SCENES] Failed to delete file from storage:', error);
        // Continue with database deletion even if storage deletion fails
      }
    }

    // Delete scene from database
    await scenesCollection.deleteOne({ _id: scene._id });

    res.json({ message: 'Scene deleted successfully' });
  } catch (error) {
    console.error('❌ [SCENES] Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/users/:id/scenes
 * Get user's public scenes
 */
app.get('/api/users/:id/scenes', async (req, res) => {
  try {
    const userId = req.params.id;
    
    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const scenesCollection = getScenesCollection();
    const scenes = await scenesCollection
      .find({ 
        creatorId: new ObjectId(userId),
        isPublic: true 
      })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      scenes: scenes.map(scene => ({
        _id: scene._id.toString(),
        title: scene.title,
        description: scene.description,
        concept: scene.concept,
        creatorId: scene.creatorId.toString(),
        creatorName: scene.creatorName,
        splatUrl: scene.splatUrl,
        thumbnailBase64: scene.thumbnailBase64,
        tags: scene.tags || [],
        viewCount: scene.viewCount || 0,
        createdAt: scene.createdAt,
      }))
    });
  } catch (error) {
    console.error('❌ [SCENES] Get user scenes error:', error);
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
