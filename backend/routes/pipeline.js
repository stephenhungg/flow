/**
 * Pipeline route handlers
 * POST /start — start a new world generation pipeline
 * GET /:jobId/status — get pipeline job status
 * POST /:jobId/cancel — cancel a running pipeline job
 *
 * Also includes the Marble /convert proxy endpoint
 */

import { Router } from 'express';
import fetch from 'node-fetch';
import multer from 'multer';
import { authMiddleware } from '../server/lib/auth.js';
import { getUsersCollection } from '../server/lib/mongodb.js';
import { creditCheckMiddleware, rateLimitMiddleware, getAdminEmails, CREDITS_PER_GENERATION } from '../middleware/auth.js';
import {
  prepareMediaUpload,
  uploadToSignedUrl,
  generateWorld,
  checkOperationStatus,
  fetchWorld,
  extractSplatUrl,
  extractColliderMeshUrl,
  extractLowResSplatUrl,
  MARBLE_MEDIA_ENDPOINT,
  MARBLE_GENERATE_ENDPOINT,
  MARBLE_OPERATIONS_ENDPOINT,
  MARBLE_WORLDS_ENDPOINT
} from '../lib/marble.js';
import rateLimit from 'express-rate-limit';

const router = Router();

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

// Very strict limiter for expensive operations (Marble API)
const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 requests per hour
  message: 'Rate limit exceeded for this operation. Please try again later.',
  skipFailedRequests: true,
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create pipeline routes with Socket.io access
 * @param {import('socket.io').Server} io - Socket.io server instance
 * @param {Map} pipelineJobs - Shared pipeline jobs map
 * @param {Function} emitPipelineUpdate - Function to emit pipeline updates
 * @returns {Router} Express router
 */
export default function createPipelineRoutes(io, pipelineJobs, emitPipelineUpdate) {

  // ============================================
  // MARBLE PROXY ENDPOINT
  // ============================================

  /**
   * POST /marble/convert
   * Proxy endpoint for Marble API - handles image upload and world generation
   */
  router.post('/marble/convert', strictLimiter, upload.single('image'), handleMulterError, async (req, res) => {
    try {
      console.log('🔄 [PROXY] Received Marble world generation request');
      console.log('📦 [PROXY] Request body keys:', Object.keys(req.body || {}));
      console.log('📁 [PROXY] File received:', req.file ? `Yes (${req.file.size} bytes)` : 'No');

      const MARBLE_API_KEY = process.env.VITE_MARBLE_API_KEY;
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

      // Step 3: Poll operation until complete with exponential backoff
      console.log('⏳ [PROXY] Step 3: Polling operation until complete...');
      const operationId = operation.operation_id;
      const maxRetries = 3;
      const backoffDelays = [5000, 15000, 45000]; // 5s, 15s, 45s between retries
      let retryAttempt = 0;
      let completed = false;

      while (retryAttempt < maxRetries) {
        const delay = backoffDelays[retryAttempt];
        console.log(`⏳ [PROXY] Waiting ${delay / 1000}s before polling (attempt ${retryAttempt + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        retryAttempt++;

        const statusResponse = await fetch(`${MARBLE_OPERATIONS_ENDPOINT}/${operationId}`, {
          headers: {
            'WLT-Api-Key': MARBLE_API_KEY
          }
        });

        if (!statusResponse.ok) {
          console.error(`❌ [PROXY] Status check failed (attempt ${retryAttempt}/${maxRetries}): ${statusResponse.status}`);
          continue;
        }

        const statusData = await statusResponse.json();
        console.log(`📊 [PROXY] Operation status (${retryAttempt}/${maxRetries}):`, statusData.metadata?.progress?.status || 'pending');

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
          completed = true;
          return res.json({
            splat_url: splatUrl,
            world_id: worldId,
            operation_id: operationId
          });
        }
      }

      if (!completed) {
        throw new Error('Marble API: operation did not complete after 3 retry attempts. Please try again later.');
      }

    } catch (error) {
      console.error('❌ [PROXY] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // PIPELINE ENDPOINTS
  // ============================================

  /**
   * POST /start
   * Start a new world generation pipeline with real-time updates
   */
  router.post('/start', authMiddleware, creditCheckMiddleware, rateLimitMiddleware, upload.single('image'), async (req, res) => {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      const { quality } = req.body;
      const imageFile = req.file;

      // Validate concept param
      const concept = typeof req.body.concept === 'string' ? req.body.concept.trim() : '';

      if (!concept) {
        return res.status(400).json({ error: 'Concept is required and cannot be empty' });
      }

      if (concept.length > 200) {
        return res.status(400).json({ error: 'Concept must be 200 characters or less' });
      }

      // Deduct credits immediately (before generation starts) - skip for admin
      let newCredits = Infinity;
      if (!req.isAdmin) {
        const usersCollection = getUsersCollection();
        const result = await usersCollection.findOneAndUpdate(
          { _id: req.userId },
          { $inc: { credits: -CREDITS_PER_GENERATION } },
          { returnDocument: 'after' }
        );

        newCredits = result.value?.credits || result?.credits || 0;
        console.log(`💰 [CREDITS] Deducted ${CREDITS_PER_GENERATION} credit(s). User now has ${newCredits} credit(s).`);
      } else {
        console.log(`💰 [CREDITS] Admin user - no credits deducted`);
      }

      // Store job info
      pipelineJobs.set(jobId, {
        status: 'started',
        concept,
        quality: quality || 'standard',
        startTime: Date.now(),
        userId: req.userId.toString(),
        cancelled: false,
      });

      // Return jobId immediately so frontend can subscribe
      res.json({ jobId, status: 'started', creditsRemaining: newCredits === Infinity ? 'Infinity' : newCredits });

      // Run pipeline asynchronously with real-time updates
      runPipeline(jobId, concept, imageFile, quality, pipelineJobs, emitPipelineUpdate).catch(async (err) => {
        console.error(`❌ [PIPELINE] Job ${jobId} failed:`, err);

        // Refund credits if generation fails - skip for admin
        if (!req.isAdmin) {
          try {
            const usersCollection = getUsersCollection();
            await usersCollection.findOneAndUpdate(
              { _id: req.userId },
              { $inc: { credits: CREDITS_PER_GENERATION } }
            );
            console.log(`💰 [CREDITS] Refunded ${CREDITS_PER_GENERATION} credit(s) due to generation failure.`);
          } catch (refundError) {
            console.error('❌ [CREDITS] Failed to refund credits:', refundError);
          }
        }

        emitPipelineUpdate(jobId, 'error', 0, err.message, { error: true });
      });

    } catch (error) {
      console.error('❌ [PIPELINE] Start error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /:jobId/status
   * Get current status of a pipeline job
   */
  router.get('/:jobId/status', (req, res) => {
    const { jobId } = req.params;
    const job = pipelineJobs.get(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);
  });

  /**
   * POST /:jobId/cancel
   * Cancel a running pipeline job and refund credits
   */
  router.post('/:jobId/cancel', authMiddleware, async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = pipelineJobs.get(jobId);

      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      // Verify user owns this job
      const usersCollection = getUsersCollection();
      const user = await usersCollection.findOne({ firebaseUid: req.user.uid });
      if (!user || user._id.toString() !== job.userId) {
        return res.status(403).json({ error: 'Not authorized to cancel this job' });
      }

      // CRITICAL FIX: Check status BEFORE changing it
      const originalStatus = job.status;
      const wasRunning = job.status === 'started' || job.status === 'processing';

      // Mark job as cancelled
      job.cancelled = true;
      job.status = 'cancelled';
      pipelineJobs.set(jobId, job);

      // Refund credits if job was started but not completed - skip for admin
      const ADMIN_EMAILS = getAdminEmails();
      const userEmail = user.email?.toLowerCase().trim();
      const isAdmin = ADMIN_EMAILS.includes(userEmail);

      // FIX: Check original status, not the cancelled status
      if (!isAdmin && wasRunning && !job.completed) {
        await usersCollection.findOneAndUpdate(
          { _id: user._id },
          { $inc: { credits: CREDITS_PER_GENERATION } }
        );
        console.log(`💰 [CREDITS] Refunded ${CREDITS_PER_GENERATION} credit(s) for job ${jobId} (was ${originalStatus})`);
      }

      // Notify via WebSocket
      emitPipelineUpdate(jobId, 'error', 0, 'Pipeline cancelled by user', { error: true, cancelled: true });

      res.json({ success: true, message: 'Pipeline cancelled' });
    } catch (error) {
      console.error('❌ [PIPELINE] Cancel error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

/**
 * Run the full pipeline with WebSocket updates - REAL API CALLS
 */
async function runPipeline(jobId, concept, imageFile, quality = 'standard', pipelineJobs, emitPipelineUpdate) {
  const MARBLE_API_KEY = process.env.VITE_MARBLE_API_KEY;
  const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;

  // Helper to check if job is cancelled
  const checkCancelled = () => {
    const job = pipelineJobs.get(jobId);
    return job?.cancelled === true;
  };

  try {
    // Check if cancelled before starting
    if (checkCancelled()) {
      console.log(`⏹️ [PIPELINE] Job ${jobId} was cancelled before starting`);
      return;
    }
    // Stage 1: Orchestrating (5-15%) - Quick UI updates, no artificial delays
    emitPipelineUpdate(jobId, 'orchestrating', 5, 'Analyzing your concept...', {
      details: 'Understanding the scene requirements'
    });

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

          // Store Gemini-generated image for thumbnail
          pipelineJobs.set(jobId, {
            ...pipelineJobs.get(jobId),
            generatedImageBase64, // Store for thumbnail
          });

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

    if (!MARBLE_API_KEY) {
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
        'WLT-Api-Key': MARBLE_API_KEY
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
    let enhancedTextPrompt = `${concept}. `;

    if (quality === 'quick') {
      enhancedTextPrompt += 'A 3D environment suitable for quick exploration.';
    } else if (quality === 'premium') {
      enhancedTextPrompt += `A beautiful, immersive 3D environment with rich architectural details and atmospheric depth.
Natural lighting, realistic textures, wide explorable spaces with clear pathways and interesting viewpoints.
Perfect for wide vistas and expansive exploration.`;
    } else {
      enhancedTextPrompt += `A beautiful, immersive 3D environment with rich architectural details and atmospheric depth.
Natural lighting, realistic textures, explorable space with clear pathways and interesting viewpoints.
Optimized for tight spaces and detailed exploration.`;
    }

    console.log('🌍 [PIPELINE] Generating world with quality:', quality);
    console.log('🌍 [PIPELINE] Enhanced prompt:', enhancedTextPrompt.substring(0, 100) + '...');

    emitPipelineUpdate(jobId, 'creating_world', 50, 'Generating 3D world...', {
      details: `Quality: ${quality} | Prompt: "${enhancedTextPrompt.substring(0, 60)}..."`
    });

    const generateResponse = await fetch(MARBLE_GENERATE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'WLT-Api-Key': MARBLE_API_KEY
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

    const maxRetries = 3;
    const backoffDelays = [5000, 15000, 45000]; // 5s, 15s, 45s between retries
    let retryAttempt = 0;
    let splatUrl = null;
    const startTime = Date.now();
    const FIVE_MINUTES = 5 * 60 * 1000;
    let notifiedSlowProcessing = false;

    while (retryAttempt < maxRetries) {
      const delay = backoffDelays[retryAttempt];
      console.log(`⏳ [PIPELINE] Waiting ${delay / 1000}s before polling (attempt ${retryAttempt + 1}/${maxRetries})...`);
      await sleep(delay);
      retryAttempt++;

      // Update progress
      if (progressIndex < progressSteps.length) {
        const step = progressSteps[progressIndex];
        emitPipelineUpdate(jobId, 'creating_world', step.progress, step.message, {
          details: 'Neural radiance field processing'
        });
        progressIndex++;
      }

      // Notify user if processing is taking longer than 5 minutes
      if (!notifiedSlowProcessing && (Date.now() - startTime) > FIVE_MINUTES) {
        notifiedSlowProcessing = true;
        emitPipelineUpdate(jobId, 'creating_world', 75, 'Still working on your scene, this is taking longer than usual...', {
          details: 'Neural radiance field processing'
        });
      }

      const statusResponse = await fetch(`${MARBLE_OPERATIONS_ENDPOINT}/${operationId}`, {
        headers: {
          'WLT-Api-Key': MARBLE_API_KEY
        }
      });

      if (!statusResponse.ok) {
        console.error(`❌ [PIPELINE] Status check failed (attempt ${retryAttempt}/${maxRetries}): ${statusResponse.status}`);
        continue;
      }

      const statusData = await statusResponse.json();
      console.log(`📊 [PIPELINE] Operation status (${retryAttempt}/${maxRetries}): ${statusData.metadata?.progress?.status || 'pending'}`);

      if (statusData.done) {
        if (statusData.error) {
          throw new Error(`Operation failed: ${statusData.error}`);
        }

        const worldId = statusData.metadata?.world_id || statusData.response?.world_id;
        if (!worldId) {
          throw new Error('Operation completed but no world_id found');
        }

        console.log('✅ [PIPELINE] World generation complete! world_id:', worldId);

        // Small delay to ensure assets are ready
        await sleep(2000);

        // Fetch the world to get splat URLs - retry if assets are null
        let worldData = null;
        let retryCount = 0;
        const maxWorldRetries = 5;

        while (retryCount < maxWorldRetries) {
          const worldResponse = await fetch(`${MARBLE_WORLDS_ENDPOINT}/${worldId}`, {
            headers: {
              'WLT-Api-Key': MARBLE_API_KEY
            }
          });

          if (!worldResponse.ok) {
            throw new Error(`Failed to fetch world: ${worldResponse.status}`);
          }

          worldData = await worldResponse.json();

          // Log world data structure for debugging
          console.log('📦 [PIPELINE] World data keys:', Object.keys(worldData));
          console.log('📦 [PIPELINE] World assets:', worldData.assets ? 'exists' : 'null');

          // If assets exist, break out of retry loop
          if (worldData.assets) {
            console.log('📦 [PIPELINE] Assets keys:', Object.keys(worldData.assets));
            if (worldData.assets.splats) {
              console.log('📦 [PIPELINE] Splats keys:', Object.keys(worldData.assets.splats));
            }
            break;
          }

          // If assets are null, wait and retry
          retryCount++;
          if (retryCount < maxWorldRetries) {
            console.log(`⏳ [PIPELINE] Assets not ready yet, retrying (${retryCount}/${maxWorldRetries})...`);
            await sleep(3000);
          }
        }

        // Extract URLs using helper functions
        splatUrl = extractSplatUrl(worldData, statusData);
        const colliderMeshUrl = extractColliderMeshUrl(worldData);
        const splatUrlLowRes = extractLowResSplatUrl(worldData);

        if (!splatUrl) {
          // Log full world data for debugging (truncated)
          const worldDataStr = JSON.stringify(worldData, null, 2);
          console.error('❌ [PIPELINE] Full world data (first 2000 chars):', worldDataStr.substring(0, 2000));
          console.error('❌ [PIPELINE] Operation response keys:', statusData.response ? Object.keys(statusData.response) : 'no response');
          throw new Error('World generated but no splat URL found. World assets may still be processing.');
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
      throw new Error('Marble API: 3D world generation did not complete after 3 retry attempts. Please try again later.');
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

    // Prepare thumbnail - prefer Gemini-generated image, fallback to image buffer (uploaded image)
    const thumbnailBase64 = jobData.generatedImageBase64 || (imageBuffer ? imageBuffer.toString('base64') : null);

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
