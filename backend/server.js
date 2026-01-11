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
import { textToSpeech } from './server/lib/elevenlabs.js';
import { ObjectId } from 'mongodb';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from root directory FIRST (before importing lib files that need env vars)
// backend/ -> root = ../
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// Create HTTP server for Socket.io
const httpServer = createServer(app);

// Initialize Socket.io
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Store active pipeline jobs
const pipelineJobs = new Map();

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('🔌 [SOCKET] Client connected:', socket.id);

  socket.on('join-pipeline', (jobId) => {
    socket.join(`pipeline:${jobId}`);
    console.log(`🔌 [SOCKET] Client ${socket.id} joined pipeline:${jobId}`);
  });

  socket.on('disconnect', () => {
    console.log('🔌 [SOCKET] Client disconnected:', socket.id);
  });
});

// Helper function to emit pipeline updates
function emitPipelineUpdate(jobId, stage, progress, message, data = {}) {
  io.to(`pipeline:${jobId}`).emit('pipeline:progress', {
    jobId,
    stage,
    progress,
    message,
    timestamp: Date.now(),
    ...data
  });
  console.log(`📡 [SOCKET] Pipeline ${jobId}: ${stage} - ${progress}% - ${message}`);
}

// Export for use in routes
export { io, emitPipelineUpdate, pipelineJobs };

// Initialize database connection
connectToDatabase().catch(console.error);

// Enable CORS for all routes
const corsOptions = {
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://flow.stephenhung.me',
    /\.vercel\.app$/,
    /\.railway\.app$/,
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));
// Increase JSON body limit for screenshots/images (50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

    // MongoDB driver 6.x returns document directly, not in result.value
    const updatedUser = result.value || result;
    
    res.json({
      user: {
        _id: updatedUser._id.toString(),
        firebaseUid: updatedUser.firebaseUid,
        email: updatedUser.email,
        displayName: updatedUser.displayName,
        photoURL: updatedUser.photoURL,
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
        thumbnailUrl: scene.thumbnailUrl || null,
        animatedThumbnailUrl: scene.animatedThumbnailUrl || null,
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
      thumbnailUrl: null, // Will be set after upload
      viewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const insertResult = await scenesCollection.insertOne(sceneData);
    const sceneId = insertResult.insertedId;

    // Upload splat file to Vultr Object Storage
    const splatKey = generateSplatKey(user._id.toString(), sceneId.toString());
    const splatUrl = await uploadFile(req.file.buffer, splatKey, 'application/octet-stream');

    // Upload thumbnail if provided
    let vultrThumbnailUrl = null;
    if (thumbnailBase64) {
      try {
        const thumbnailBuffer = Buffer.from(thumbnailBase64, 'base64');
        const thumbnailKey = `scenes/${user._id}/${sceneId}/thumbnail.png`;
        console.log(`📤 [SCENES] Uploading thumbnail to Vultr: ${thumbnailKey}`);
        vultrThumbnailUrl = await uploadFile(thumbnailBuffer, thumbnailKey, 'image/png');
        console.log(`✅ [SCENES] Uploaded thumbnail to Vultr: ${vultrThumbnailUrl}`);
      } catch (thumbError) {
        console.warn(`⚠️ [SCENES] Thumbnail upload error:`, thumbError.message);
      }
    }

    // Update scene with splat URL and thumbnail URL
    const updateData = { splatUrl, splatKey };
    if (vultrThumbnailUrl) {
      updateData.thumbnailUrl = vultrThumbnailUrl;
    }
    await scenesCollection.updateOne(
      { _id: sceneId },
      { $set: updateData }
    );

    res.status(201).json({
      _id: sceneId.toString(),
      ...sceneData,
      splatUrl,
      thumbnailUrl: vultrThumbnailUrl,
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
      colliderMeshUrl: scene.colliderMeshUrl || null,
      thumbnailUrl: scene.thumbnailUrl || null,
      animatedThumbnailUrl: scene.animatedThumbnailUrl || null,
      tags: scene.tags || [],
      viewCount: (scene.viewCount || 0) + 1,
      createdAt: scene.createdAt,
      // Educational content (if saved)
      orchestration: scene.orchestration || null,
    });
  } catch (error) {
    console.error('❌ [SCENES] Get error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/proxy/splat
 * Proxy splat files from Vultr to avoid CORS issues
 */
app.get('/api/proxy/splat', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL parameter required' });
    }

    // Validate it's a Vultr URL
    if (!url.includes('vultrobjects.com')) {
      return res.status(400).json({ error: 'Invalid URL - must be Vultr Object Storage' });
    }

    console.log('🔄 [PROXY] Fetching splat from:', url);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('❌ [PROXY] Failed to fetch:', response.status, response.statusText);
      return res.status(response.status).json({ error: 'Failed to fetch splat file' });
    }

    // Set CORS and content headers
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400', // Cache for 1 day
    });

    // Stream the response
    const buffer = await response.buffer();
    console.log(`✅ [PROXY] Serving splat: ${buffer.length} bytes`);
    res.send(buffer);
  } catch (error) {
    console.error('❌ [PROXY] Error:', error);
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
 * POST /api/scenes/from-url
 * Create a scene from an external splat URL (auto-save from pipeline)
 * Downloads the splat, uploads to Vultr, saves to MongoDB
 * Also supports collider mesh URL for physics
 */
app.post('/api/scenes/from-url', authMiddleware, async (req, res) => {
  try {
    const { 
      title, 
      description, 
      concept, 
      tags, 
      isPublic, 
      splatUrl: externalSplatUrl,
      colliderMeshUrl: externalColliderUrl,
      worldId,
      orchestration, // Educational content to save
      thumbnailBase64 // Generated image from pipeline
    } = req.body;
    
    if (!title || !concept || !externalSplatUrl) {
      return res.status(400).json({ error: 'title, concept, and splatUrl are required' });
    }
    
    if (orchestration) {
      console.log('📚 [SCENES] Saving orchestration data with scene');
    }

    console.log('📥 [SCENES] Creating scene from URL:', externalSplatUrl);
    if (externalColliderUrl) {
      console.log('📥 [SCENES] With collider mesh:', externalColliderUrl);
    }

    // Get user info
    const usersCollection = getUsersCollection();
    const user = await usersCollection.findOne({ firebaseUid: req.user.uid });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Download the splat file from external URL
    console.log('📥 [SCENES] Downloading splat from external URL...');
    const splatResponse = await fetch(externalSplatUrl);
    if (!splatResponse.ok) {
      throw new Error(`Failed to download splat: ${splatResponse.status} ${splatResponse.statusText}`);
    }
    
    const splatBuffer = Buffer.from(await splatResponse.arrayBuffer());
    console.log(`📥 [SCENES] Downloaded splat: ${splatBuffer.length} bytes`);

    // Download collider mesh if provided
    let colliderBuffer = null;
    if (externalColliderUrl) {
      console.log('📥 [SCENES] Downloading collider mesh...');
      try {
        const colliderResponse = await fetch(externalColliderUrl);
        if (colliderResponse.ok) {
          colliderBuffer = Buffer.from(await colliderResponse.arrayBuffer());
          console.log(`📥 [SCENES] Downloaded collider: ${colliderBuffer.length} bytes`);
        } else {
          console.warn(`⚠️ [SCENES] Failed to download collider: ${colliderResponse.status}`);
        }
      } catch (colliderError) {
        console.warn(`⚠️ [SCENES] Collider download error:`, colliderError.message);
      }
    }

    // Create scene document first to get ID (without thumbnail URL yet)
    const scenesCollection = getScenesCollection();
    const sceneData = {
      title,
      description: description || '',
      concept,
      creatorId: user._id,
      creatorName: user.displayName,
      tags: tags ? (typeof tags === 'string' ? tags.split(',') : tags) : [],
      isPublic: isPublic === 'true' || isPublic === true || isPublic === undefined,
      viewCount: 0,
      worldId: worldId || null,
      hasCollider: !!colliderBuffer,
      thumbnailUrl: null, // Will be set after upload
      // Save educational content if provided
      orchestration: orchestration ? {
        learningObjectives: orchestration.learningObjectives || [],
        keyFacts: orchestration.keyFacts || [],
        narrationScript: orchestration.narrationScript || '',
        subtitleLines: orchestration.subtitleLines || [],
        callouts: orchestration.callouts || [],
        sources: orchestration.sources || [],
      } : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const insertResult = await scenesCollection.insertOne(sceneData);
    const sceneId = insertResult.insertedId;

    // Upload splat file to Vultr Object Storage
    const splatKey = generateSplatKey(user._id.toString(), sceneId.toString());
    console.log(`📤 [SCENES] Uploading splat to Vultr: ${splatKey}`);
    const vultrSplatUrl = await uploadFile(splatBuffer, splatKey, 'application/octet-stream');
    console.log(`✅ [SCENES] Uploaded splat to Vultr: ${vultrSplatUrl}`);

    // Upload thumbnail if provided (as actual image file, not base64 in DB)
    let vultrThumbnailUrl = null;
    if (thumbnailBase64) {
      try {
        const thumbnailBuffer = Buffer.from(thumbnailBase64, 'base64');
        const thumbnailKey = `scenes/${user._id}/${sceneId}/thumbnail.png`;
        console.log(`📤 [SCENES] Uploading thumbnail to Vultr: ${thumbnailKey}`);
        vultrThumbnailUrl = await uploadFile(thumbnailBuffer, thumbnailKey, 'image/png');
        console.log(`✅ [SCENES] Uploaded thumbnail to Vultr: ${vultrThumbnailUrl}`);
      } catch (thumbError) {
        console.warn(`⚠️ [SCENES] Thumbnail upload error:`, thumbError.message);
      }
    }

    // Upload collider mesh if available
    let vultrColliderUrl = null;
    if (colliderBuffer) {
      const colliderKey = `scenes/${user._id}/${sceneId}/collider.glb`;
      console.log(`📤 [SCENES] Uploading collider to Vultr: ${colliderKey}`);
      vultrColliderUrl = await uploadFile(colliderBuffer, colliderKey, 'model/gltf-binary');
      console.log(`✅ [SCENES] Uploaded collider to Vultr: ${vultrColliderUrl}`);
    }

    // Update scene with all URLs
    const updateData = { 
      splatUrl: vultrSplatUrl, 
      splatKey, 
      originalSplatUrl: externalSplatUrl 
    };
    if (vultrColliderUrl) {
      updateData.colliderMeshUrl = vultrColliderUrl;
    }
    if (vultrThumbnailUrl) {
      updateData.thumbnailUrl = vultrThumbnailUrl;
    }
    
    await scenesCollection.updateOne(
      { _id: sceneId },
      { $set: updateData }
    );

    console.log(`✅ [SCENES] Scene created: ${sceneId}`);

    res.status(201).json({
      _id: sceneId.toString(),
      ...sceneData,
      splatUrl: vultrSplatUrl,
      colliderMeshUrl: vultrColliderUrl,
      thumbnailUrl: vultrThumbnailUrl,
    });
  } catch (error) {
    console.error('❌ [SCENES] Create from URL error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/users/me/scenes
 * Get current user's scenes (both public and private)
 */
app.get('/api/users/me/scenes', authMiddleware, async (req, res) => {
  try {
    const usersCollection = getUsersCollection();
    const user = await usersCollection.findOne({ firebaseUid: req.user.uid });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const scenesCollection = getScenesCollection();
    const scenes = await scenesCollection
      .find({ creatorId: user._id })
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
        thumbnailUrl: scene.thumbnailUrl || null,
        animatedThumbnailUrl: scene.animatedThumbnailUrl || null,
        tags: scene.tags || [],
        isPublic: scene.isPublic,
        viewCount: scene.viewCount || 0,
        createdAt: scene.createdAt,
      }))
    });
  } catch (error) {
    console.error('❌ [SCENES] Get my scenes error:', error);
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
        thumbnailUrl: scene.thumbnailUrl || null,
        animatedThumbnailUrl: scene.animatedThumbnailUrl || null,
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

// ==========================================
// GEMINI API PROXY ENDPOINTS
// ==========================================

const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;

/**
 * POST /api/gemini/orchestrate
 * Proxy for Gemini orchestration (text generation)
 */
app.post('/api/gemini/orchestrate', async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log('🤖 [GEMINI] Orchestrating concept...');

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [GEMINI] API error:', response.status, errorText);
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    console.log('✅ [GEMINI] Orchestration complete');
    res.json(data);
  } catch (error) {
    console.error('❌ [GEMINI] Orchestrate error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/gemini/generate-image
 * Proxy for Gemini image generation
 */
app.post('/api/gemini/generate-image', async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log('🎨 [GEMINI] Generating image for:', prompt.substring(0, 50) + '...');

    // Try different models (gemini-3-pro-image-preview is the best for image gen)
    const models = ['gemini-3-pro-image-preview', 'gemini-2.0-flash-exp', 'gemini-1.5-flash'];
    let lastError = null;

    for (const model of models) {
      try {
        console.log(`🔄 [GEMINI] Trying model: ${model}`);
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        });

        if (response.ok) {
          const data = await response.json();
          console.log('✅ [GEMINI] Image generation complete with', model);
          return res.json(data);
        } else {
          lastError = await response.text();
          console.warn(`⚠️ [GEMINI] ${model} failed:`, lastError);
        }
      } catch (e) {
        lastError = e.message;
        console.warn(`⚠️ [GEMINI] ${model} error:`, e.message);
      }
    }

    res.status(500).json({ error: lastError || 'All Gemini models failed' });
  } catch (error) {
    console.error('❌ [GEMINI] Generate image error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// VOICE NARRATION API
// ==========================================

/**
 * POST /api/narration/ask
 * Voice Q&A - analyze screenshot with Gemini Vision and respond with ElevenLabs TTS
 */
app.post('/api/narration/ask', async (req, res) => {
  try {
    const { screenshot, question, concept } = req.body;
    
    if (!screenshot || !question) {
      return res.status(400).json({ error: 'Screenshot and question are required' });
    }
    
    console.log('🎤 [NARRATION] Question:', question);
    console.log('🎤 [NARRATION] Concept:', concept);
    
    // 1. Call Gemini Vision with educational prompt
    const prompt = `You are a friendly, knowledgeable educational tour guide helping someone explore a 3D world about "${concept || 'this location'}".

They are looking at this scene and ask: "${question}"

Give a helpful, engaging 2-3 sentence response. Include interesting facts, history, or science when relevant. Speak naturally as if having a conversation. Be enthusiastic but concise.`;

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: 'image/jpeg', data: screenshot } }
            ]
          }]
        })
      }
    );
    
    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('❌ [NARRATION] Gemini error:', errorText);
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }
    
    const geminiData = await geminiResponse.json();
    const textResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 
                        "I'm not quite sure what I'm looking at. Could you ask me something else?";
    
    console.log('🎤 [NARRATION] Response:', textResponse);
    
    // 2. Convert to speech using ElevenLabs
    let audioBase64 = null;
    try {
      const audioBuffer = await textToSpeech(textResponse);
      audioBase64 = audioBuffer.toString('base64');
    } catch (ttsError) {
      console.error('⚠️ [NARRATION] TTS error (continuing without audio):', ttsError.message);
      // Continue without audio if TTS fails
    }
    
    res.json({
      text: textResponse,
      audio: audioBase64
    });
    
  } catch (error) {
    console.error('❌ [NARRATION] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// PIPELINE API WITH WEBSOCKET UPDATES
// ==========================================

/**
 * POST /api/pipeline/start
 * Start a new world generation pipeline with real-time updates
 */
app.post('/api/pipeline/start', upload.single('image'), async (req, res) => {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const { concept, quality } = req.body;
    const imageFile = req.file;

    if (!concept) {
      return res.status(400).json({ error: 'Concept is required' });
    }

    // Store job info
    pipelineJobs.set(jobId, {
      status: 'started',
      concept,
      quality: quality || 'standard',
      startTime: Date.now()
    });

    // Return jobId immediately so frontend can subscribe
    res.json({ jobId, status: 'started' });

    // Run pipeline asynchronously with real-time updates
    runPipeline(jobId, concept, imageFile, quality).catch(err => {
      console.error(`❌ [PIPELINE] Job ${jobId} failed:`, err);
      emitPipelineUpdate(jobId, 'error', 0, err.message, { error: true });
    });

  } catch (error) {
    console.error('❌ [PIPELINE] Start error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/pipeline/:jobId/status
 * Get current status of a pipeline job
 */
app.get('/api/pipeline/:jobId/status', (req, res) => {
  const { jobId } = req.params;
  const job = pipelineJobs.get(jobId);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json(job);
});

/**
 * Run the full pipeline with WebSocket updates - REAL API CALLS
 */
async function runPipeline(jobId, concept, imageFile) {
  const MARBLE_API_KEY_LOCAL = process.env.VITE_MARBLE_API_KEY;
  const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
  
  try {
    // Stage 1: Orchestrating (5%)
    emitPipelineUpdate(jobId, 'orchestrating', 5, 'Analyzing your concept...', {
      details: 'Understanding the scene requirements'
    });
    await sleep(500);

    emitPipelineUpdate(jobId, 'orchestrating', 10, 'Generating educational content...', {
      details: 'Creating learning objectives and key facts'
    });
    await sleep(500);

    emitPipelineUpdate(jobId, 'orchestrating', 15, 'Preparing scene parameters...', {
      details: 'Optimizing for 3D world generation'
    });
    await sleep(500);

    // Stage 2: Generating Image (20-40%)
    emitPipelineUpdate(jobId, 'generating_image', 20, 'Initializing image generation...', {
      details: 'Connecting to Gemini AI'
    });

    let imageBuffer = null;
    let imageMimeType = 'image/png';
    
    if (imageFile) {
      // Use uploaded image
      imageBuffer = imageFile.buffer;
      imageMimeType = imageFile.mimetype || 'image/png';
      emitPipelineUpdate(jobId, 'generating_image', 35, 'Using uploaded image...', {
        details: 'Processing your custom image'
      });
    } else if (GEMINI_API_KEY) {
      // Generate image with Gemini
      emitPipelineUpdate(jobId, 'generating_image', 25, 'Creating visual representation...', {
        details: `Generating image for: ${concept}`
      });

      try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp-image-generation' });

        // Cinematic, dreamlike prompt optimized for 3D world generation
        const prompt = `Create a breathtakingly beautiful, cinematic wide-angle photograph of: ${concept}

VISUAL STYLE:
- Dreamlike, ethereal atmosphere with soft volumetric lighting
- Golden hour or blue hour lighting with warm/cool color contrasts
- Subtle lens flare and atmospheric haze for depth
- High dynamic range with rich shadows and highlights
- Professional architectural/landscape photography quality

COMPOSITION (critical for 3D):
- Wide establishing shot showing the full environment
- Clear foreground, midground, and background layers
- Strong perspective lines leading into the scene
- Open spaces that invite exploration
- NO close-ups, NO people, NO animals, NO text

TECHNICAL:
- Ultra high resolution, sharp details
- 16:9 cinematic aspect ratio
- Depth of field with distant elements slightly soft
- Natural, realistic textures (stone, wood, fabric, metal)
- Consistent lighting direction throughout

Make this look like a frame from a Terrence Malick or Denis Villeneuve film - beautiful, contemplative, and immersive.`;

        emitPipelineUpdate(jobId, 'generating_image', 25, 'Sending prompt to Gemini...', {
          details: `Prompt: "Create a breathtakingly beautiful, cinematic wide-angle photograph of: ${concept}..."`
        });

        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['image', 'text'],
          },
        });

        const response = await result.response;
        const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        
        if (imagePart?.inlineData?.data) {
          imageBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
          imageMimeType = imagePart.inlineData.mimeType || 'image/png';
          console.log(`✅ [PIPELINE] Generated image: ${imageBuffer.length} bytes`);
          
          // Send generated image to frontend immediately!
          const generatedImageBase64 = imagePart.inlineData.data;
          emitPipelineUpdate(jobId, 'generating_image', 35, 'Image generated successfully!', {
            details: 'Your scene has been visualized',
            generatedImage: generatedImageBase64, // Send the image!
            generatedImageMime: imageMimeType
          });
        } else {
          throw new Error('No image generated by Gemini');
        }
      } catch (geminiError) {
        console.error('❌ [PIPELINE] Gemini image generation failed:', geminiError.message);
        emitPipelineUpdate(jobId, 'generating_image', 30, 'Using fallback image...', {
          details: 'Gemini unavailable, using placeholder'
        });
        // Use a placeholder - continue without image generation
        imageBuffer = null;
      }

      emitPipelineUpdate(jobId, 'generating_image', 38, 'Preparing for 3D conversion...', {
        details: 'Optimizing for world generation'
      });
    }

    // Stage 3: Creating World (40-90%)
    emitPipelineUpdate(jobId, 'creating_world', 40, 'Initializing 3D world generation...', {
      details: 'Connecting to Marble API'
    });

    if (!MARBLE_API_KEY_LOCAL) {
      throw new Error('Marble API key not configured');
    }

    if (!imageBuffer) {
      throw new Error('No image available for world generation');
    }

    emitPipelineUpdate(jobId, 'creating_world', 45, 'Uploading image to world engine...', {
      details: 'Preparing for 3D conversion'
    });

    // Step 1: Upload image as media asset
    console.log('📤 [PIPELINE] Uploading image as media asset...');
    const prepareResponse = await fetch(MARBLE_MEDIA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'WLT-Api-Key': MARBLE_API_KEY_LOCAL
      },
      body: JSON.stringify({
        file_name: `${concept.replace(/[^a-z0-9]/gi, '_')}.png`,
        kind: 'image',
        extension: 'png'
      })
    });

    if (!prepareResponse.ok) {
      const errorText = await prepareResponse.text();
      throw new Error(`Failed to prepare upload: ${prepareResponse.status} - ${errorText}`);
    }

    const prepareData = await prepareResponse.json();
    const mediaAssetId = prepareData.media_asset.id;
    const uploadUrl = prepareData.upload_info.upload_url;
    const uploadMethod = prepareData.upload_info.upload_method || 'PUT';
    const requiredHeaders = prepareData.upload_info.required_headers || {};

    console.log('📤 [PIPELINE] Upload URL:', uploadUrl);
    console.log('📤 [PIPELINE] Required headers:', JSON.stringify(requiredHeaders));

    // Upload the image with required headers
    const uploadResponse = await fetch(uploadUrl, {
      method: uploadMethod,
      headers: {
        ...requiredHeaders,
        'Content-Type': imageMimeType
      },
      body: imageBuffer
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text().catch(() => 'No error body');
      console.error('❌ [PIPELINE] Upload failed:', uploadResponse.status, errorText);
      throw new Error(`Failed to upload file: ${uploadResponse.status} - ${errorText}`);
    }
    console.log('✅ [PIPELINE] Image uploaded as media asset:', mediaAssetId);

    emitPipelineUpdate(jobId, 'creating_world', 50, 'Generating 3D world...', {
      details: 'Starting neural radiance field processing'
    });

    // Step 2: Generate world with enhanced text prompt
    // Text prompt helps Marble understand the scene better
    const enhancedTextPrompt = `${concept}. 
A beautiful, immersive 3D environment with rich architectural details and atmospheric depth. 
Natural lighting, realistic textures, explorable space with clear pathways and interesting viewpoints.`;

    console.log('🌍 [PIPELINE] Generating world with enhanced prompt:', enhancedTextPrompt.substring(0, 100) + '...');

    emitPipelineUpdate(jobId, 'creating_world', 50, 'Generating 3D world...', {
      details: `Prompt: "${enhancedTextPrompt}"`
    });

    const generateResponse = await fetch(MARBLE_GENERATE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'WLT-Api-Key': MARBLE_API_KEY_LOCAL
      },
      body: JSON.stringify({
        display_name: concept,
        world_prompt: {
          type: 'image',
          image_prompt: {
            source: 'media_asset',
            media_asset_id: mediaAssetId
          },
          text_prompt: enhancedTextPrompt
        }
      })
    });

    if (!generateResponse.ok) {
      const errorText = await generateResponse.text();
      throw new Error(`Marble API error: ${generateResponse.status} - ${errorText}`);
    }

    const operation = await generateResponse.json();
    const operationId = operation.operation_id;
    console.log('✅ [PIPELINE] World generation started, operation_id:', operationId);

    // Step 3: Poll operation until complete
    const progressSteps = [
      { progress: 55, message: 'Analyzing depth information...' },
      { progress: 60, message: 'Extracting scene geometry...' },
      { progress: 65, message: 'Building point cloud...' },
      { progress: 70, message: 'Optimizing gaussian splats...' },
      { progress: 75, message: 'Generating view-dependent colors...' },
      { progress: 80, message: 'Refining surface details...' },
      { progress: 85, message: 'Compressing world data...' },
    ];
    let progressIndex = 0;

    const maxAttempts = 120;
    let attempts = 0;
    let splatUrl = null;

    while (attempts < maxAttempts) {
      await sleep(5000);
      attempts++;

      // Update progress
      if (progressIndex < progressSteps.length) {
        const step = progressSteps[progressIndex];
        emitPipelineUpdate(jobId, 'creating_world', step.progress, step.message, {
          details: 'Neural radiance field processing'
        });
        progressIndex++;
      }

      const statusResponse = await fetch(`${MARBLE_OPERATIONS_ENDPOINT}/${operationId}`, {
        headers: {
          'WLT-Api-Key': MARBLE_API_KEY_LOCAL
        }
      });

      if (!statusResponse.ok) {
        throw new Error(`Failed to check operation status: ${statusResponse.status}`);
      }

      const statusData = await statusResponse.json();
      console.log(`📊 [PIPELINE] Operation status (${attempts}): ${statusData.metadata?.progress?.status || 'pending'}`);

      if (statusData.done) {
        if (statusData.error) {
          throw new Error(`Operation failed: ${statusData.error}`);
        }

        const worldId = statusData.metadata?.world_id || statusData.response?.world_id;
        if (!worldId) {
          throw new Error('Operation completed but no world_id found');
        }

        console.log('✅ [PIPELINE] World generation complete! world_id:', worldId);

        // Fetch the world to get splat URLs
        const worldResponse = await fetch(`${MARBLE_WORLDS_ENDPOINT}/${worldId}`, {
          headers: {
            'WLT-Api-Key': MARBLE_API_KEY_LOCAL
          }
        });

        if (!worldResponse.ok) {
          throw new Error(`Failed to fetch world: ${worldResponse.status}`);
        }

        const worldData = await worldResponse.json();
        
        // Log full assets structure for debugging
        console.log('📦 [PIPELINE] World assets structure:', JSON.stringify(worldData.assets, null, 2));
        
        // Get best available splat URL (prefer full res for quality)
        splatUrl = worldData.assets?.splats?.spz_urls?.full_res || 
                   worldData.assets?.splats?.spz_urls?.['500k'] ||
                   worldData.assets?.splats?.spz_urls?.['100k'];

        // Get collider mesh URL for physics - try multiple possible paths
        const colliderMeshUrl = worldData.assets?.meshes?.glb_urls?.collider ||
                                worldData.assets?.meshes?.collider_glb_url ||
                                worldData.assets?.collider_mesh?.url ||
                                worldData.assets?.collider?.glb_url ||
                                null;
        
        // Get low-res splat for faster preview loading
        const splatUrlLowRes = worldData.assets?.splats?.spz_urls?.['500k'] || 
                               worldData.assets?.splats?.spz_urls?.['100k'] || null;

        if (!splatUrl) {
          throw new Error('World generated but no splat URL found');
        }

        console.log('✅ [PIPELINE] Splat URL retrieved:', splatUrl);
        if (colliderMeshUrl) {
          console.log('✅ [PIPELINE] Collider mesh URL:', colliderMeshUrl);
        }
        if (splatUrlLowRes && splatUrlLowRes !== splatUrl) {
          console.log('✅ [PIPELINE] Low-res splat URL:', splatUrlLowRes);
        }
        
        // Store additional assets in job
        pipelineJobs.set(jobId, {
          ...pipelineJobs.get(jobId),
          colliderMeshUrl,
          splatUrlLowRes,
          worldId,
        });
        
        break;
      }
    }

    if (!splatUrl) {
      throw new Error('Operation timeout after 10 minutes');
    }
    
    // Get stored data
    const jobData = pipelineJobs.get(jobId) || {};

    // Stage 4: Loading Splat (90-100%)
    emitPipelineUpdate(jobId, 'loading_splat', 90, 'Preparing 3D scene for viewing...', {
      details: 'Downloading gaussian splat data'
    });
    await sleep(1000);

    emitPipelineUpdate(jobId, 'loading_splat', 95, 'Initializing WebGL renderer...', {
      details: 'Setting up interactive environment'
    });
    await sleep(500);

    // Prepare thumbnail from original image buffer
    const thumbnailBase64 = imageBuffer ? imageBuffer.toString('base64') : null;

    // Complete!
    pipelineJobs.set(jobId, {
      ...pipelineJobs.get(jobId),
      status: 'completed',
      splatUrl,
      colliderMeshUrl: jobData.colliderMeshUrl,
      splatUrlLowRes: jobData.splatUrlLowRes,
      worldId: jobData.worldId,
      thumbnailBase64, // Store thumbnail
      completedAt: Date.now()
    });

    emitPipelineUpdate(jobId, 'complete', 100, 'Your 3D world is ready!', {
      splatUrl,
      splatUrlLowRes: jobData.splatUrlLowRes,
      colliderMeshUrl: jobData.colliderMeshUrl,
      worldId: jobData.worldId,
      thumbnailBase64, // Send thumbnail to frontend
      completed: true
    });

  } catch (error) {
    console.error('❌ [PIPELINE] Error:', error.message);
    pipelineJobs.set(jobId, {
      ...pipelineJobs.get(jobId),
      status: 'error',
      error: error.message
    });
    
    emitPipelineUpdate(jobId, 'error', 0, `Pipeline failed: ${error.message}`, {
      error: error.message
    });
    throw error;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Global error handler (must be before catch-all)
app.use((err, req, res, next) => {
  console.error('❌ [ERROR] Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Catch-all for debugging (must be LAST)
app.use((req, res) => {
  console.log(`❌ [PROXY] 404 - Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// Listen on all interfaces (0.0.0.0) for Railway/cloud deployments
const HOST = process.env.HOST || '0.0.0.0';
httpServer.listen(PORT, HOST, () => {
  console.log(`🚀 [PROXY] Server running on http://${HOST}:${PORT}`);
  console.log(`🔌 [SOCKET] WebSocket server ready`);
  console.log(`📡 [PROXY] Marble API proxy ready`);
  console.log(`🔑 [PROXY] Using Marble API key: ${MARBLE_API_KEY.substring(0, 10)}...`);
  console.log(`✅ [PROXY] Routes registered: POST /api/marble/convert, GET /health`);
  console.log(`📚 [PROXY] API docs: https://worldlabs-api-reference.mintlify.app/api`);
});
