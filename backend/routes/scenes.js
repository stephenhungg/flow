/**
 * Scene CRUD, listing, sharing, and related route handlers
 * Also includes admin endpoints, user scenes, proxy, narration, and Gemini API proxies
 */

import { Router } from 'express';
import fetch from 'node-fetch';
import { ObjectId } from 'mongodb';
import multer from 'multer';
import { authMiddleware } from '../server/lib/auth.js';
import { getUsersCollection, getScenesCollection } from '../server/lib/mongodb.js';
import { uploadFile, deleteFile, generateSplatKey } from '../server/lib/storage.js';
import { textToSpeech } from '../server/lib/elevenlabs.js';
import { geminiGenerateImageBuffer, geminiVision } from '../lib/ai.js';
import { validateSceneCreation, handleValidationErrors } from '../middleware/validation.js';
import { getAdminEmails } from '../middleware/auth.js';

const router = Router();

// Increase file size limit for splat uploads (100MB)
const uploadLarge = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit for splat files
});

// Multer error handling
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('❌ [PROXY] Multer error:', err.message);
    return res.status(400).json({ error: `File upload error: ${err.message}` });
  }
  next(err);
};

// Thumbnail generation prompt template
const THUMBNAIL_PROMPT = (concept) => `Create a beautiful thumbnail image (4:3 aspect ratio) for a 3D educational scene about: ${concept}

STYLE:
- Bright, engaging, and educational
- Clear focal point that represents the concept
- Professional quality, suitable for a library thumbnail
- Vibrant colors, good contrast
- Clean composition

TECHNICAL:
- 4:3 aspect ratio (ideal for thumbnails)
- High quality, sharp details
- No text, no borders, no UI elements`;

/**
 * Auto-generate thumbnail in the background
 * @param {string} sceneId - Scene ID
 * @param {string} concept - Scene concept for prompt
 * @param {ObjectId} creatorId - Creator user ID
 */
async function autoGenerateThumbnail(sceneId, concept, creatorId) {
  try {
    console.log(`🎨 [SCENES] Auto-generating thumbnail for uploaded scene: ${sceneId}`);

    const imageResult = await geminiGenerateImageBuffer(THUMBNAIL_PROMPT(concept));
    if (!imageResult) {
      console.warn(`⚠️ [SCENES] No image data from Gemini for scene ${sceneId}`);
      return;
    }

    const thumbnailKey = `scenes/${creatorId}/${sceneId}/thumbnail.png`;
    const thumbnailUrl = await uploadFile(imageResult.buffer, thumbnailKey, imageResult.mimeType);

    const scenesCollection = getScenesCollection();
    await scenesCollection.updateOne(
      { _id: new ObjectId(sceneId) },
      { $set: { thumbnailUrl, updatedAt: new Date() } }
    );

    console.log(`✅ [SCENES] Auto-generated thumbnail for scene: ${sceneId}`);
  } catch (thumbGenError) {
    console.warn(`⚠️ [SCENES] Auto-thumbnail generation failed for scene ${sceneId}:`, thumbGenError.message);
  }
}

// ============================================
// SCENE CRUD ENDPOINTS
// ============================================

/**
 * GET /
 * List public scenes (paginated)
 */
router.get('/', async (req, res) => {
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

    // Cache public scenes list for 5 minutes (data changes infrequently)
    res.set({
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
      'ETag': `"scenes-${page}-${limit}-${total}"`
    });

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
 * POST /
 * Create a new scene with splat file upload
 */
router.post('/',
  authMiddleware,
  uploadLarge.single('splatFile'),
  validateSceneCreation,
  handleValidationErrors,
  async (req, res) => {
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

    // Upload splat file to Vercel Blob Storage
    const splatKey = generateSplatKey(user._id.toString(), sceneId.toString());
    const splatUrl = await uploadFile(req.file.buffer, splatKey, 'application/octet-stream');

    // Upload thumbnail if provided
    let blobThumbnailUrl = null;
    if (thumbnailBase64) {
      try {
        const thumbnailBuffer = Buffer.from(thumbnailBase64, 'base64');
        const thumbnailKey = `scenes/${user._id}/${sceneId}/thumbnail.png`;
        console.log(`📤 [SCENES] Uploading thumbnail to Vercel Blob: ${thumbnailKey}`);
        blobThumbnailUrl = await uploadFile(thumbnailBuffer, thumbnailKey, 'image/png');
        console.log(`✅ [SCENES] Uploaded thumbnail to Vercel Blob: ${blobThumbnailUrl}`);
      } catch (thumbError) {
        console.warn(`⚠️ [SCENES] Thumbnail upload error:`, thumbError.message);
      }
    }

    // Update scene with splat URL and thumbnail URL
    const updateData = { splatUrl, splatKey };
    if (blobThumbnailUrl) {
      updateData.thumbnailUrl = blobThumbnailUrl;
    }
    await scenesCollection.updateOne(
      { _id: sceneId },
      { $set: updateData }
    );

    // Auto-generate thumbnail if not provided (async, don't block response)
    if (!blobThumbnailUrl && process.env.VITE_GEMINI_API_KEY) {
      autoGenerateThumbnail(sceneId.toString(), concept || title, user._id).catch(() => {});
    }

    res.status(201).json({
      _id: sceneId.toString(),
      ...sceneData,
      splatUrl,
      thumbnailUrl: blobThumbnailUrl,
    });
  } catch (error) {
    console.error('❌ [SCENES] Create error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /:id
 * Get scene details
 */
router.get('/:id', async (req, res) => {
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

    // Cache scene data for 1 hour
    res.set({
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=7200',
      'ETag': `"scene-${sceneId}-${scene.updatedAt?.getTime() || scene.createdAt.getTime()}"`
    });

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
 * DELETE /:id
 * Delete own scene
 */
router.delete('/:id', authMiddleware, async (req, res) => {
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

    // SECURITY: Check both creatorId and userId fields for ownership
    const isOwner = scene.creatorId?.toString() === user._id.toString() ||
                    scene.userId === req.user.uid ||
                    scene.userUid === req.user.uid;

    // Allow admin override
    const isAdmin = req.user.email && ['stpnhh@gmail.com'].includes(req.user.email);

    if (!isOwner && !isAdmin) {
      console.warn(`⚠️ [SECURITY] Unauthorized delete attempt by ${req.user.uid} for scene ${sceneId}`);
      return res.status(403).json({ error: 'Not authorized to delete this scene' });
    }

    // Delete file from storage if it exists
    if (scene.splatKey || scene.splatUrl) {
      try {
        await deleteFile(scene.splatKey || scene.splatUrl);
      } catch (error) {
        console.warn('⚠️ [SCENES] Failed to delete file from storage:', error.message);
      }
    }

    // Delete scene from database
    await scenesCollection.deleteOne({ _id: scene._id });

    console.log(`✅ [SCENES] Scene ${sceneId} deleted by user ${req.user.uid}`);
    res.json({ message: 'Scene deleted successfully' });
  } catch (error) {
    console.error('❌ [SCENES] Delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete scene. Please try again.' });
  }
});

/**
 * POST /from-url
 * Create a scene from an external splat URL (auto-save from pipeline)
 */
router.post('/from-url', authMiddleware, async (req, res) => {
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
      orchestration,
      thumbnailBase64
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

    // Check if URL is from Marble CDN - save directly instead of downloading/uploading
    const isMarbleCdn = externalSplatUrl.includes('cdn.marble.worldlabs.ai');

    let blobSplatUrl = externalSplatUrl; // Use Marble CDN URL directly
    let blobColliderUrl = externalColliderUrl || null;
    let splatKey = null;
    let sceneId = null;

    // Create scene document first to get ID (needed for both paths)
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
      hasCollider: !!blobColliderUrl,
      thumbnailUrl: null,
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
    sceneId = insertResult.insertedId;

    if (!isMarbleCdn) {
      // Only download/upload if NOT from Marble CDN (for backwards compatibility)
      console.log('📥 [SCENES] Downloading splat from external URL (non-Marble)...');
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

      // Upload splat file to Vercel Blob Storage
      splatKey = generateSplatKey(user._id.toString(), sceneId.toString());
      console.log(`📤 [SCENES] Uploading splat to Vercel Blob: ${splatKey}`);
      blobSplatUrl = await uploadFile(splatBuffer, splatKey, 'application/octet-stream');
      console.log(`✅ [SCENES] Uploaded splat to Vercel Blob: ${blobSplatUrl}`);

      // Upload collider mesh if available
      if (colliderBuffer) {
        const colliderKey = `scenes/${user._id}/${sceneId}/collider.glb`;
        console.log(`📤 [SCENES] Uploading collider to Vercel Blob: ${colliderKey}`);
        blobColliderUrl = await uploadFile(colliderBuffer, colliderKey, 'model/gltf-binary');
        console.log(`✅ [SCENES] Uploaded collider to Vercel Blob: ${blobColliderUrl}`);
      }
    } else {
      console.log('✅ [SCENES] Using Marble CDN URL directly (no download/upload needed):', externalSplatUrl);
    }

    // Upload thumbnail if provided (as actual image file, not base64 in DB)
    let blobThumbnailUrl = null;
    if (thumbnailBase64) {
      try {
        const thumbnailBuffer = Buffer.from(thumbnailBase64, 'base64');
        const thumbnailKey = `scenes/${user._id}/${sceneId}/thumbnail.png`;
        console.log(`📤 [SCENES] Uploading thumbnail to Vercel Blob: ${thumbnailKey}`);
        blobThumbnailUrl = await uploadFile(thumbnailBuffer, thumbnailKey, 'image/png');
        console.log(`✅ [SCENES] Uploaded thumbnail to Vercel Blob: ${blobThumbnailUrl}`);
      } catch (thumbError) {
        console.warn(`⚠️ [SCENES] Thumbnail upload error:`, thumbError.message);
      }
    }

    // Update scene with all URLs
    const updateData = {
      splatUrl: blobSplatUrl,
      splatKey,
      originalSplatUrl: externalSplatUrl
    };
    if (blobColliderUrl) {
      updateData.colliderMeshUrl = blobColliderUrl;
    }
    if (blobThumbnailUrl) {
      updateData.thumbnailUrl = blobThumbnailUrl;
    }

    await scenesCollection.updateOne(
      { _id: sceneId },
      { $set: updateData }
    );

    console.log(`✅ [SCENES] Scene created: ${sceneId}`);

    res.status(201).json({
      _id: sceneId.toString(),
      ...sceneData,
      splatUrl: blobSplatUrl,
      colliderMeshUrl: blobColliderUrl,
      thumbnailUrl: blobThumbnailUrl,
    });
  } catch (error) {
    console.error('❌ [SCENES] Create from URL error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /:id/orchestration
 * Save orchestration (educational content) to a scene
 */
router.post('/:id/orchestration', authMiddleware, async (req, res) => {
  try {
    const sceneId = req.params.id;

    if (!ObjectId.isValid(sceneId)) {
      return res.status(400).json({ error: 'Invalid scene ID' });
    }

    const { orchestration } = req.body;

    if (!orchestration) {
      return res.status(400).json({ error: 'Orchestration data is required' });
    }

    const scenesCollection = getScenesCollection();
    const scene = await scenesCollection.findOne({ _id: new ObjectId(sceneId) });

    if (!scene) {
      return res.status(404).json({ error: 'Scene not found' });
    }

    // Verify user owns the scene
    const usersCollection = getUsersCollection();
    const user = await usersCollection.findOne({ firebaseUid: req.user.uid });
    if (!user || scene.creatorId.toString() !== user._id.toString()) {
      return res.status(403).json({ error: 'You can only update orchestration for your own scenes' });
    }

    // Update scene with orchestration
    await scenesCollection.updateOne(
      { _id: new ObjectId(sceneId) },
      {
        $set: {
          orchestration: {
            learningObjectives: orchestration.learningObjectives || [],
            keyFacts: orchestration.keyFacts || [],
            narrationScript: orchestration.narrationScript || '',
            subtitleLines: orchestration.subtitleLines || [],
            callouts: orchestration.callouts || [],
            sources: orchestration.sources || [],
          },
          updatedAt: new Date()
        }
      }
    );

    console.log(`✅ [SCENES] Saved orchestration for scene ${sceneId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ [SCENES] Save orchestration error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /:id/generate-description
 * Generate AI description for a scene using Gemini
 */
router.post('/:id/generate-description', async (req, res) => {
  try {
    const sceneId = req.params.id;

    if (!ObjectId.isValid(sceneId)) {
      return res.status(400).json({ error: 'Invalid scene ID' });
    }

    const scenesCollection = getScenesCollection();
    const scene = await scenesCollection.findOne({ _id: new ObjectId(sceneId) });

    if (!scene) {
      return res.status(404).json({ error: 'Scene not found' });
    }

    // If description already exists, return it
    if (scene.description && scene.description.trim().length > 0) {
      return res.json({ description: scene.description });
    }

    // Generate description using Gemini
    const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    const prompt = `Generate a concise, engaging description (2-3 sentences) for a 3D educational scene about: "${scene.concept || scene.title}".
The description should be informative, accessible, and suitable for a learning environment.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [GEMINI] Description generation error:', response.status, errorText);
      return res.status(response.status).json({ error: 'Failed to generate description' });
    }

    const data = await response.json();
    const description = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    if (!description) {
      return res.status(500).json({ error: 'No description generated' });
    }

    // Update scene with generated description
    await scenesCollection.updateOne(
      { _id: scene._id },
      { $set: { description, updatedAt: new Date() } }
    );

    res.json({ description });
  } catch (error) {
    console.error('❌ [SCENES] Generate description error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /:id/generate-thumbnail
 * Generate thumbnail image for a scene using Gemini
 */
router.post('/:id/generate-thumbnail', async (req, res) => {
  try {
    const sceneId = req.params.id;

    if (!ObjectId.isValid(sceneId)) {
      return res.status(400).json({ error: 'Invalid scene ID' });
    }

    const scenesCollection = getScenesCollection();
    const scene = await scenesCollection.findOne({ _id: new ObjectId(sceneId) });

    if (!scene) {
      return res.status(404).json({ error: 'Scene not found' });
    }

    // If thumbnail already exists, return it
    if (scene.thumbnailUrl) {
      return res.json({ thumbnailUrl: scene.thumbnailUrl });
    }

    const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    console.log(`🎨 [SCENES] Generating thumbnail for scene: ${sceneId}, concept: ${scene.concept}`);

    try {
      const imageResult = await geminiGenerateImageBuffer(THUMBNAIL_PROMPT(scene.concept || scene.title));
      if (!imageResult) {
        throw new Error('No image data in Gemini response');
      }

      console.log(`✅ [SCENES] Thumbnail generated: ${imageResult.buffer.length} bytes`);

      // Upload thumbnail
      const thumbnailKey = `scenes/${scene.creatorId}/${sceneId}/thumbnail.png`;
      const thumbnailUrl = await uploadFile(imageResult.buffer, thumbnailKey, imageResult.mimeType);
      console.log(`✅ [SCENES] Thumbnail uploaded to Vultr: ${thumbnailUrl}`);

      // Update scene with thumbnail URL
      await scenesCollection.updateOne(
        { _id: new ObjectId(sceneId) },
        { $set: { thumbnailUrl, updatedAt: new Date() } }
      );

      res.json({ thumbnailUrl });
    } catch (geminiError) {
      console.error('❌ [SCENES] Gemini thumbnail generation error:', geminiError);
      res.status(500).json({ error: geminiError.message || 'Failed to generate thumbnail' });
    }
  } catch (error) {
    console.error('❌ [SCENES] Generate thumbnail error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ADMIN ENDPOINTS
// ============================================

/**
 * POST /admin/generate-missing-thumbnails
 * Batch generate thumbnails for all scenes missing them
 */
router.post('/admin/generate-missing-thumbnails', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    const usersCollection = getUsersCollection();
    const user = await usersCollection.findOne({ firebaseUid: req.user.uid });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const ADMIN_EMAILS = getAdminEmails();

    if (!user.email || !ADMIN_EMAILS.includes(user.email.toLowerCase())) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    const scenesCollection = getScenesCollection();
    const regenerate = req.query.regenerate === 'true';

    let scenesToProcess = [];

    if (regenerate) {
      // Find ALL scenes and delete existing thumbnails first
      const allScenes = await scenesCollection.find({}).toArray();
      console.log(`🎨 [BATCH] Regenerating thumbnails for ALL ${allScenes.length} scenes`);

      // Delete existing thumbnails from storage
      let deletedCount = 0;
      for (const scene of allScenes) {
        if (scene.thumbnailUrl) {
          try {
            const url = scene.thumbnailUrl;
            if (url.includes('/scenes/')) {
              const keyIndex = url.indexOf('/scenes/');
              const key = url.substring(keyIndex + 1);
              await deleteFile(key);
              deletedCount++;
            }
          } catch (error) {
            console.warn(`   ⚠️  Could not delete thumbnail: ${scene.thumbnailUrl}`);
          }
        }
      }
      console.log(`🗑️  [BATCH] Deleted ${deletedCount} existing thumbnails from storage`);

      // Clear thumbnail URLs in database
      await scenesCollection.updateMany(
        { thumbnailUrl: { $exists: true, $ne: null } },
        { $set: { thumbnailUrl: null } }
      );

      scenesToProcess = allScenes;
    } else {
      // Find only scenes without thumbnails
      scenesToProcess = await scenesCollection.find({
        $or: [
          { thumbnailUrl: null },
          { thumbnailUrl: { $exists: false } }
        ]
      }).toArray();
      console.log(`🎨 [BATCH] Found ${scenesToProcess.length} scenes without thumbnails`);
    }

    if (scenesToProcess.length === 0) {
      return res.json({
        message: regenerate ? 'No scenes found' : 'All scenes already have thumbnails',
        processed: 0,
        succeeded: 0,
        failed: 0
      });
    }

    // Return immediately and process in background
    res.json({
      message: regenerate
        ? `Started regenerating thumbnails for ${scenesToProcess.length} scenes`
        : `Started generating thumbnails for ${scenesToProcess.length} scenes`,
      total: scenesToProcess.length
    });

    // Process in background
    (async () => {
      let succeeded = 0;
      let failed = 0;

      for (const scene of scenesToProcess) {
        try {
          console.log(`🎨 [BATCH] Generating thumbnail for scene ${scene._id}: ${scene.concept || scene.title}`);

          const imageResult = await geminiGenerateImageBuffer(THUMBNAIL_PROMPT(scene.concept || scene.title));
          if (imageResult) {
            const thumbnailKey = `scenes/${scene.creatorId}/${scene._id}/thumbnail.png`;
            const thumbnailUrl = await uploadFile(imageResult.buffer, thumbnailKey, imageResult.mimeType);

            await scenesCollection.updateOne(
              { _id: scene._id },
              { $set: { thumbnailUrl, updatedAt: new Date() } }
            );

            console.log(`✅ [BATCH] Generated thumbnail for scene ${scene._id}`);
            succeeded++;
          } else {
            throw new Error('No image data in Gemini response');
          }

          // Add a small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`❌ [BATCH] Failed to generate thumbnail for scene ${scene._id}:`, error.message);
          failed++;
        }
      }

      console.log(`✅ [BATCH] Batch thumbnail generation complete: ${succeeded} succeeded, ${failed} failed`);
    })();

  } catch (error) {
    console.error('❌ [BATCH] Batch thumbnail generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// USER SCENE ENDPOINTS
// ============================================

/**
 * GET /users/me
 * Get current user's scenes (both public and private)
 */
router.get('/users/me', authMiddleware, async (req, res) => {
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
 * GET /users/:id
 * Get user's public scenes
 */
router.get('/users/:id', async (req, res) => {
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

    // Cache user scenes for 2 minutes
    res.set({
      'Cache-Control': 'public, max-age=120, stale-while-revalidate=300'
    });

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

// ============================================
// GEMINI API PROXY ENDPOINTS
// ============================================

/**
 * POST /gemini/orchestrate
 * Proxy for Gemini orchestration (text generation)
 */
router.post('/gemini/orchestrate', async (req, res) => {
  try {
    const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
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
 * POST /gemini/generate-image
 * Proxy for Gemini image generation
 */
router.post('/gemini/generate-image', async (req, res) => {
  try {
    const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log('🎨 [GEMINI] Generating image for:', prompt.substring(0, 50) + '...');

    const { geminiGenerateImage } = await import('../lib/ai.js');
    const data = await geminiGenerateImage(prompt);
    res.json(data);
  } catch (error) {
    console.error('❌ [GEMINI] Generate image error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// VOICE NARRATION API
// ============================================

/**
 * POST /narration/ask
 * Voice Q&A - analyze screenshot with Gemini Vision and respond with ElevenLabs TTS
 */
router.post('/narration/ask', async (req, res) => {
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

    const textResponse = await geminiVision(prompt, screenshot);

    console.log('🎤 [NARRATION] Response:', textResponse);

    // 2. Convert to speech using ElevenLabs
    let audioBase64 = null;
    try {
      const audioBuffer = await textToSpeech(textResponse);
      audioBase64 = audioBuffer.toString('base64');
    } catch (ttsError) {
      console.error('⚠️ [NARRATION] TTS error (continuing without audio):', ttsError.message);
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

// ============================================
// PROXY ENDPOINTS
// ============================================

/**
 * GET /proxy/splat
 * Proxy splat files from Vercel Blob or Marble CDN to avoid CORS issues
 */
router.get('/proxy/splat', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL parameter required' });
    }

    // Validate it's a Vercel Blob or Marble CDN URL
    const isValidUrl = url.includes('blob.vercel-storage.com') || url.includes('cdn.marble.worldlabs.ai');
    if (!isValidUrl) {
      return res.status(400).json({ error: 'Invalid URL - must be Vercel Blob Storage or Marble CDN' });
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

export default router;
