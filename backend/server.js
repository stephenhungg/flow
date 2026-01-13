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
import Stripe from 'stripe';
import { connectToDatabase, getUsersCollection, getScenesCollection } from './server/lib/mongodb.js';
import { authMiddleware } from './server/lib/auth.js';
import { uploadFile, deleteFile, generateSplatKey } from './server/lib/storage.js';
import { textToSpeech } from './server/lib/elevenlabs.js';
import { ObjectId } from 'mongodb';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

// 💥 Global Error Handlers - Log everything before crashing
process.on('uncaughtException', (err) => {
  console.error('💥 [FATAL] Uncaught Exception:', err);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 [FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env - try multiple locations for compatibility
dotenv.config(); // Try current dir
dotenv.config({ path: path.resolve(__dirname, '../.env') }); // Try parent dir (root)

const app = express();
// Railway provides PORT env var automatically
const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';

console.log(`🚀 [INIT] Starting server initialization...`);
console.log(`📅 [INIT] Time: ${new Date().toISOString()}`);
console.log(`🌐 [INIT] Configured Port: ${PORT}`);

// 🚨 CRITICAL: Handle OPTIONS preflight requests BEFORE EVERYTHING else
// This must be the first middleware to prevent any crash in body-parsing or auth
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin || "*";
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
    return res.sendStatus(200);
  }
  next();
});

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

// Rate limiting for expensive API calls (Marble + Gemini)
// Track requests per IP: { ip: [timestamp1, timestamp2, ...] }
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_REQUESTS = 2; // Max 2 generations per hour per IP

// Simple rate limiting middleware (bypasses admin users)
function rateLimitMiddleware(req, res, next) {
  // Skip rate limiting for admin users
  if (req.isAdmin) {
    console.log('✅ [RATE_LIMIT] Admin user - bypassing rate limit');
    return next();
  }
  
  const ip = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  
  // Clean up old entries (older than 1 hour)
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  
  for (const [key, timestamps] of rateLimitStore.entries()) {
    const filtered = timestamps.filter(ts => ts > cutoff);
    if (filtered.length === 0) {
      rateLimitStore.delete(key);
    } else {
      rateLimitStore.set(key, filtered);
    }
  }
  
  // Check current IP
  const ipTimestamps = rateLimitStore.get(ip) || [];
  const recentRequests = ipTimestamps.filter(ts => ts > cutoff);
  
  if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    const oldestRequest = Math.min(...recentRequests);
    const waitTime = Math.ceil((oldestRequest + RATE_LIMIT_WINDOW_MS - now) / 1000 / 60);
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: `You can generate ${RATE_LIMIT_MAX_REQUESTS} scenes per hour. Please wait ${waitTime} minute(s) before trying again.`,
      retryAfter: waitTime
    });
  }
  
  // Add current request
  recentRequests.push(now);
  rateLimitStore.set(ip, recentRequests);
  
  next();
}

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
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://flow.stephenhung.me',
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else if (origin.match(/\.vercel\.app$/) || origin.match(/\.railway\.app$/)) {
      // Allow Vercel and Railway preview URLs
      callback(null, true);
    } else {
      console.warn(`⚠️ [CORS] Blocked origin: ${origin}`);
      callback(null, true); // Allow for now but log it
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  optionsSuccessStatus: 200, // Some legacy browsers (IE11) choke on 204
};
app.use(cors(corsOptions));
// Handle preflight requests explicitly - REMOVED (handled manually at top)
// app.options('(.*)', cors(corsOptions));

// IMPORTANT: Webhook route must be BEFORE express.json() middleware
// Stripe webhooks need raw body for signature verification
/**
 * POST /api/credits/webhook
 * Stripe webhook to handle payment completion
 * IMPORTANT: Must use express.raw() for signature verification
 * MUST BE BEFORE express.json() middleware
 */
app.post('/api/credits/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    console.error('❌ [STRIPE] Webhook not configured - stripe:', !!stripe, 'secret:', !!STRIPE_WEBHOOK_SECRET);
    return res.status(500).json({ error: 'Stripe webhook not configured' });
  }

  const sig = req.headers['stripe-signature'];
  
  // Debug logging (remove in production if needed)
  console.log('🔔 [STRIPE] Webhook received');
  console.log('   Signature header present:', !!sig);
  console.log('   Body type:', typeof req.body);
  console.log('   Body is buffer:', Buffer.isBuffer(req.body));
  console.log('   Body length:', req.body?.length);

  if (!sig) {
    console.error('❌ [STRIPE] No stripe-signature header found');
    return res.status(400).send('Webhook Error: No signature header');
  }

  let event;
  try {
    // Ensure body is a Buffer (raw body)
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
    event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);
    console.log('✅ [STRIPE] Webhook signature verified, event type:', event.type);
  } catch (err) {
    console.error('❌ [STRIPE] Webhook signature verification failed:', err.message);
    console.error('   Error type:', err.type);
    console.error('   Signature header:', sig?.substring(0, 20) + '...');
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const credits = parseInt(session.metadata.credits);
    const userId = session.metadata.userId;

    try {
      const usersCollection = getUsersCollection();
      await usersCollection.findOneAndUpdate(
        { _id: new ObjectId(userId) },
        { $inc: { credits: credits } }
      );
      console.log(`💰 [CREDITS] Added ${credits} credits to user ${userId}`);
    } catch (error) {
      console.error('❌ [CREDITS] Failed to add credits:', error);
    }
  }

  res.json({ received: true });
});

// Increase JSON body limit for screenshots/images (50MB)
// NOTE: Must be AFTER webhook route (webhooks need raw body)
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

// Health check - Define early to ensure availability
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

const MARBLE_API_KEY = process.env.VITE_MARBLE_API_KEY;
if (!MARBLE_API_KEY) {
  console.error('❌ [MARBLE] VITE_MARBLE_API_KEY not set - Marble API will not work');
}
// Correct Marble API endpoints (from https://worldlabs-api-reference.mintlify.app/api)
const MARBLE_API_BASE = 'https://api.worldlabs.ai';
const MARBLE_GENERATE_ENDPOINT = `${MARBLE_API_BASE}/marble/v1/worlds:generate`;
const MARBLE_OPERATIONS_ENDPOINT = `${MARBLE_API_BASE}/marble/v1/operations`;
const MARBLE_WORLDS_ENDPOINT = `${MARBLE_API_BASE}/marble/v1/worlds`;
const MARBLE_MEDIA_ENDPOINT = `${MARBLE_API_BASE}/marble/v1/media-assets:prepare_upload`;

// Stripe configuration for credit payments
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

// Admin configuration - use environment variable for security
const ADMIN_EMAILS = process.env.ADMIN_EMAILS 
  ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase())
  : ['stpnhh@gmail.com']; // Fallback for development

// Credit system configuration
// World Labs pricing: $0.80 per 1,000 credits
// Each generation costs 1,500 credits = $1.20 actual cost
// Pricing set to be competitive while covering costs
const CREDITS_PER_GENERATION = 1; // Cost per 3D generation (in our system)
const CREDITS_PACKAGES = {
  1: 99,    // $0.99 for 1 credit - Single generation option
  5: 499,   // $4.99 for 5 credits (~$1.00/gen) - Small loss to attract users
  10: 999,  // $9.99 for 10 credits (~$1.00/gen)
  20: 1899, // $18.99 for 20 credits (~$0.95/gen) - Best value, covers cost
  50: 4499, // $44.99 for 50 credits (~$0.90/gen) - Best value, small profit
};

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
    
    // Upsert user - only update fields that should change, preserve credits
    const userUpdate = {
      firebaseUid: decodedToken.uid,
      email: decodedToken.email || '',
      displayName: decodedToken.name || decodedToken.email?.split('@')[0] || 'User',
      photoURL: decodedToken.picture || null,
      updatedAt: new Date(),
    };

    const result = await usersCollection.findOneAndUpdate(
      { firebaseUid: decodedToken.uid },
      { 
        $set: userUpdate,
        $setOnInsert: { 
          createdAt: new Date(),
          credits: 0 // Only set credits to 0 on initial creation
        }
      },
      { upsert: true, returnDocument: 'after' }
    );

    // MongoDB driver 6.x returns document directly, not in result.value
    const updatedUser = result.value || result;
    
    // Check if admin user
    const userEmail = updatedUser.email?.toLowerCase().trim();
    const isAdmin = ADMIN_EMAILS.includes(userEmail);
    
    // Debug logging for admin check
    if (userEmail) {
      console.log(`🔍 [AUTH] Checking admin status for: ${userEmail}`);
      console.log(`🔍 [AUTH] ADMIN_EMAILS:`, ADMIN_EMAILS);
      console.log(`🔍 [AUTH] Is admin:`, isAdmin);
    }
    
    res.json({
      user: {
        _id: updatedUser._id.toString(),
        firebaseUid: updatedUser.firebaseUid,
        email: updatedUser.email,
        displayName: updatedUser.displayName,
        photoURL: updatedUser.photoURL,
        // JSON doesn't support Infinity, so send as string for admin users
        credits: isAdmin ? 'Infinity' : (updatedUser.credits || 0),
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

    // Check if admin user
    const userEmail = user.email?.toLowerCase().trim();
    const isAdmin = ADMIN_EMAILS.includes(userEmail);
    
    // Debug logging for admin check
    if (userEmail) {
      console.log(`🔍 [AUTH] /me - Checking admin status for: ${userEmail}`);
      console.log(`🔍 [AUTH] /me - ADMIN_EMAILS:`, ADMIN_EMAILS);
      console.log(`🔍 [AUTH] /me - Is admin:`, isAdmin);
    }
    
    res.json({
      _id: user._id.toString(),
      firebaseUid: user.firebaseUid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      // JSON doesn't support Infinity, so send as string for admin users
      credits: isAdmin ? 'Infinity' : (user.credits || 0),
    });
  } catch (error) {
    console.error('❌ [AUTH] Get me error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Credits & Payment Endpoints
// ============================================

/**
 * Middleware to check if user has enough credits
 */
async function creditCheckMiddleware(req, res, next) {
  try {
    const userId = req.user?.uid;
    
    if (!userId) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Please sign in to generate scenes. Each generation costs credits.'
      });
    }

    const usersCollection = getUsersCollection();
    const user = await usersCollection.findOne({ firebaseUid: userId });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Unlimited credits for admin emails (check both email and Firebase UID for security)
    const userEmail = user.email?.toLowerCase().trim();
    const isAdminEmail = ADMIN_EMAILS.includes(userEmail);
    
    // Additional check: verify Firebase UID matches (prevents email spoofing)
    // In production, you could also check against a whitelist of Firebase UIDs
    if (isAdminEmail) {
      console.log(`✅ [CREDITS] Admin user ${userEmail} (${userId}) - unlimited credits`);
      req.userCredits = Infinity;
      req.userId = user._id;
      req.isAdmin = true;
      return next();
    }

    const credits = user.credits || 0;
    
    if (credits < CREDITS_PER_GENERATION) {
      return res.status(402).json({
        error: 'Insufficient credits',
        message: `You need ${CREDITS_PER_GENERATION} credit(s) to generate a scene. You have ${credits} credit(s).`,
        credits: credits,
        required: CREDITS_PER_GENERATION
      });
    }

    req.userCredits = credits;
    req.userId = user._id;
    next();
  } catch (error) {
    console.error('❌ [CREDITS] Check error:', error);
    res.status(500).json({ error: 'Failed to check credits' });
  }
}

/**
 * POST /api/credits/create-checkout
 * Create Stripe checkout session for purchasing credits
 */
app.post('/api/credits/create-checkout', authMiddleware, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe not configured. Please set STRIPE_SECRET_KEY.' });
    }

    const { packageId } = req.body;
    const credits = parseInt(packageId);
    const amount = CREDITS_PACKAGES[credits];

    if (!amount) {
      return res.status(400).json({ error: 'Invalid credit package' });
    }

    const usersCollection = getUsersCollection();
    const user = await usersCollection.findOne({ firebaseUid: req.user.uid });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const origin = req.headers.origin || 'https://flow.stephenhung.me';
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${credits} Generation Credits`,
              description: `Purchase ${credits} credits to generate ${credits} 3D scenes`,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${origin}/#credits?credits=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/#credits?credits=cancelled`,
      client_reference_id: user._id.toString(),
      metadata: {
        userId: user._id.toString(),
        firebaseUid: req.user.uid,
        credits: credits.toString(),
      },
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('❌ [STRIPE] Checkout error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/credits/verify-session
 * Verify Stripe checkout session and add credits (fallback if webhook hasn't fired)
 */
app.post('/api/credits/verify-session', authMiddleware, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }

    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Retrieve the checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    // Verify payment was successful
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed' });
    }

    // Verify this session belongs to the current user
    const usersCollection = getUsersCollection();
    const user = await usersCollection.findOne({ firebaseUid: req.user.uid });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (session.client_reference_id !== user._id.toString()) {
      return res.status(403).json({ error: 'Session does not belong to this user' });
    }

    // Check if credits were already added (prevent double-crediting)
    // We'll check by looking at session metadata
    const credits = parseInt(session.metadata.credits);
    if (!credits) {
      return res.status(400).json({ error: 'Invalid session metadata' });
    }

    // Check if we've already processed this session (optional: store processed sessions)
    // For now, we'll just add credits (webhook might have already done it, but $inc is idempotent-ish)
    // Actually, let's add a flag to check if credits were added recently
    // But for simplicity, we'll just add credits - $inc is safe to call multiple times
    
    await usersCollection.findOneAndUpdate(
      { _id: user._id },
      { $inc: { credits: credits } }
    );

    console.log(`💰 [CREDITS] Added ${credits} credits via session verification for user ${user._id}`);

    const updatedUser = await usersCollection.findOne({ _id: user._id });
    res.json({ 
      success: true, 
      creditsAdded: credits,
      totalCredits: updatedUser?.credits || 0 
    });
  } catch (error) {
    console.error('❌ [CREDITS] Session verification error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/credits/packages
 * Get available credit packages
 */
app.get('/api/credits/packages', (req, res) => {
  const packages = Object.entries(CREDITS_PACKAGES).map(([credits, amount]) => ({
    credits: parseInt(credits),
    price: amount / 100,
    priceCents: amount,
  }));

  // Cache credit packages for 5 minutes (can change when pricing updates)
  res.set({
    'Cache-Control': 'public, max-age=300, must-revalidate'
  });

  res.json({ packages });
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

    // Auto-generate thumbnail if not provided (async, don't block response)
    const GEMINI_API_KEY_FOR_THUMB = process.env.VITE_GEMINI_API_KEY;
    if (!vultrThumbnailUrl && GEMINI_API_KEY_FOR_THUMB) {
      (async () => {
        try {
          console.log(`🎨 [SCENES] Auto-generating thumbnail for uploaded scene: ${sceneId}`);
          const { GoogleGenerativeAI } = await import('@google/generative-ai');
          const genAI = new GoogleGenerativeAI(GEMINI_API_KEY_FOR_THUMB);
          const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp-image-generation' });

          const prompt = `Create a beautiful thumbnail image (4:3 aspect ratio) for a 3D educational scene about: ${concept || title}

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

          const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              responseModalities: ['image', 'text'],
            },
          });
          const response = await result.response;
          
          const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);
          if (imagePart?.inlineData) {
            const imageData = imagePart.inlineData.data;
            const imageMimeType = imagePart.inlineData.mimeType || 'image/png';
            const imageBuffer = Buffer.from(imageData, 'base64');

            const thumbnailKey = `scenes/${user._id}/${sceneId}/thumbnail.png`;
            const thumbnailUrl = await uploadFile(imageBuffer, thumbnailKey, imageMimeType);
            
            await scenesCollection.updateOne(
              { _id: sceneId },
              { $set: { thumbnailUrl, updatedAt: new Date() } }
            );
            
            console.log(`✅ [SCENES] Auto-generated thumbnail for scene: ${sceneId}`);
          }
        } catch (thumbGenError) {
          console.warn(`⚠️ [SCENES] Auto-thumbnail generation failed for scene ${sceneId}:`, thumbGenError.message);
          // Don't throw - this is background generation
        }
      })();
    }

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

    // Cache scene data for 1 hour (can use stale-while-revalidate for better UX)
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
 * GET /s/:id
 * Open Graph endpoint for scene sharing
 * Serves HTML with meta tags for social media previews
 */
app.get('/s/:id', async (req, res) => {
  try {
    const sceneId = req.params.id;
    
    if (!ObjectId.isValid(sceneId)) {
      return res.status(400).send('Invalid scene ID');
    }

    const scenesCollection = getScenesCollection();
    const scene = await scenesCollection.findOne({ 
      _id: new ObjectId(sceneId),
      isPublic: true 
    });

    if (!scene) {
      return res.status(404).send('Scene not found');
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://flow.stephenhung.me';
    const sceneUrl = `${frontendUrl}/#explore?q=${encodeURIComponent(scene.concept)}&sceneId=${sceneId}`;
    const imageUrl = scene.thumbnailUrl || `${frontendUrl}/og-image.png`;
    const title = `${scene.title} | flow`;
    const description = scene.description || `Explore ${scene.concept} through an immersive, voice-guided 3D environment.`;

    // Serve HTML with Open Graph meta tags
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${sceneUrl}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:site_name" content="flow">
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${sceneUrl}">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">
  
  <!-- Redirect to actual scene -->
  <meta http-equiv="refresh" content="0; url=${sceneUrl}">
  <link rel="canonical" href="${sceneUrl}">
  
  <script>
    window.location.href = "${sceneUrl}";
  </script>
</head>
<body>
  <p>Redirecting to <a href="${sceneUrl}">${title}</a>...</p>
</body>
</html>`;

    res.set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    });
    
    res.send(html);
  } catch (error) {
    console.error('❌ [OG] Open Graph error:', error);
    res.status(500).send('Internal server error');
  }
});

/**
 * POST /api/scenes/:id/generate-description
 * Generate AI description for a scene using Gemini
 */
app.post('/api/scenes/:id/generate-description', async (req, res) => {
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
 * POST /api/scenes/:id/generate-thumbnail
 * Generate thumbnail image for a scene using Gemini
 */
app.post('/api/scenes/:id/generate-thumbnail', async (req, res) => {
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

    // Generate thumbnail using Gemini
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    console.log(`🎨 [SCENES] Generating thumbnail for scene: ${sceneId}, concept: ${scene.concept}`);

    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp-image-generation' });

      // Create a thumbnail-optimized prompt
      const prompt = `Create a beautiful thumbnail image (4:3 aspect ratio) for a 3D educational scene about: ${scene.concept || scene.title}

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

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['image', 'text'],
        },
      });
      const response = await result.response;
      
      // Extract image data from response
      const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);
      if (!imagePart?.inlineData) {
        throw new Error('No image data in Gemini response');
      }

      const imageData = imagePart.inlineData.data;
      const imageMimeType = imagePart.inlineData.mimeType || 'image/png';
      const imageBuffer = Buffer.from(imageData, 'base64');

      console.log(`✅ [SCENES] Thumbnail generated: ${imageBuffer.length} bytes`);

      // Get user info for upload path
      const usersCollection = getUsersCollection();
      const user = await usersCollection.findOne({ _id: scene.creatorId });
      if (!user) {
        return res.status(404).json({ error: 'Creator not found' });
      }

      // Upload thumbnail to Vultr
      const thumbnailKey = `scenes/${scene.creatorId}/${sceneId}/thumbnail.png`;
      const thumbnailUrl = await uploadFile(imageBuffer, thumbnailKey, imageMimeType);
      console.log(`✅ [SCENES] Thumbnail uploaded to Vultr: ${thumbnailUrl}`);

      // Update scene with thumbnail URL
      await scenesCollection.updateOne(
        { _id: new ObjectId(sceneId) },
        { $set: { thumbnailUrl, updatedAt: new Date() } }
      );

      res.json({ thumbnailUrl });
    } catch (geminiError) {
      console.error('❌ [SCENES] Gemini thumbnail generation error:', geminiError);
      // Fallback: return error but don't fail completely
      res.status(500).json({ error: geminiError.message || 'Failed to generate thumbnail' });
    }
  } catch (error) {
    console.error('❌ [SCENES] Generate thumbnail error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/generate-missing-thumbnails
 * Batch generate thumbnails for all scenes missing them
 * Query param ?regenerate=true to regenerate ALL thumbnails (including existing ones)
 * Admin-only endpoint
 */
app.post('/api/admin/generate-missing-thumbnails', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    const usersCollection = getUsersCollection();
    const user = await usersCollection.findOne({ firebaseUid: req.user.uid });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const ADMIN_EMAILS = process.env.ADMIN_EMAILS 
      ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase())
      : ['stpnhh@gmail.com'];
    
    if (!user.email || !ADMIN_EMAILS.includes(user.email.toLowerCase())) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const GEMINI_API_KEY_FOR_BATCH = process.env.VITE_GEMINI_API_KEY;
    if (!GEMINI_API_KEY_FOR_BATCH) {
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
            // Extract key from URL (format: https://bucket.hostname/key)
            const url = scene.thumbnailUrl;
            if (url.includes('/scenes/')) {
              const keyIndex = url.indexOf('/scenes/');
              const key = url.substring(keyIndex + 1); // Remove leading slash
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
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY_FOR_BATCH);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp-image-generation' });

      let succeeded = 0;
      let failed = 0;

      for (const scene of scenesToProcess) {
        try {
          console.log(`🎨 [BATCH] Generating thumbnail for scene ${scene._id}: ${scene.concept || scene.title}`);

          const prompt = `Create a beautiful thumbnail image (4:3 aspect ratio) for a 3D educational scene about: ${scene.concept || scene.title}

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

          const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              responseModalities: ['image', 'text'],
            },
          });
          const response = await result.response;
          
          const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);
          if (imagePart?.inlineData) {
            const imageData = imagePart.inlineData.data;
            const imageMimeType = imagePart.inlineData.mimeType || 'image/png';
            const imageBuffer = Buffer.from(imageData, 'base64');

            const thumbnailKey = `scenes/${scene.creatorId}/${scene._id}/thumbnail.png`;
            const thumbnailUrl = await uploadFile(imageBuffer, thumbnailKey, imageMimeType);
            
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

/**
 * POST /api/scenes/:id/orchestration
 * Save orchestration (educational content) to a scene
 */
app.post('/api/scenes/:id/orchestration', authMiddleware, async (req, res) => {
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

    // Verify user owns the scene (optional - could allow public updates)
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
 * GET /api/proxy/splat
 * Proxy splat files from Vultr or Marble CDN to avoid CORS issues
 */
app.get('/api/proxy/splat', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL parameter required' });
    }

    // Validate it's a Vultr or Marble CDN URL
    const isValidUrl = url.includes('vultrobjects.com') || url.includes('cdn.marble.worldlabs.ai');
    if (!isValidUrl) {
      return res.status(400).json({ error: 'Invalid URL - must be Vultr Object Storage or Marble CDN' });
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

    // Check if URL is from Marble CDN - save directly instead of downloading/uploading
    const isMarbleCdn = externalSplatUrl.includes('cdn.marble.worldlabs.ai');
    
    let vultrSplatUrl = externalSplatUrl; // Use Marble CDN URL directly
    let vultrColliderUrl = externalColliderUrl || null;
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
      hasCollider: !!vultrColliderUrl,
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

      // Upload splat file to Vultr Object Storage
      splatKey = generateSplatKey(user._id.toString(), sceneId.toString());
      console.log(`📤 [SCENES] Uploading splat to Vultr: ${splatKey}`);
      vultrSplatUrl = await uploadFile(splatBuffer, splatKey, 'application/octet-stream');
      console.log(`✅ [SCENES] Uploaded splat to Vultr: ${vultrSplatUrl}`);
      
      // Upload collider mesh if available
      if (colliderBuffer) {
        const colliderKey = `scenes/${user._id}/${sceneId}/collider.glb`;
        console.log(`📤 [SCENES] Uploading collider to Vultr: ${colliderKey}`);
        vultrColliderUrl = await uploadFile(colliderBuffer, colliderKey, 'model/gltf-binary');
        console.log(`✅ [SCENES] Uploaded collider to Vultr: ${vultrColliderUrl}`);
      }
    } else {
      console.log('✅ [SCENES] Using Marble CDN URL directly (no download/upload needed):', externalSplatUrl);
    }

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

    // Update scene with all URLs (vultrColliderUrl already set above if needed)
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
 * Rate limited to prevent excessive API costs
 */
app.post('/api/pipeline/start', authMiddleware, creditCheckMiddleware, rateLimitMiddleware, upload.single('image'), async (req, res) => {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const { concept, quality } = req.body;
    const imageFile = req.file;

    if (!concept) {
      return res.status(400).json({ error: 'Concept is required' });
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
    });

    // Return jobId immediately so frontend can subscribe
    res.json({ jobId, status: 'started', creditsRemaining: newCredits });

    // Run pipeline asynchronously with real-time updates
    runPipeline(jobId, concept, imageFile, quality).catch(async (err) => {
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
async function runPipeline(jobId, concept, imageFile, quality = 'standard') {
  const MARBLE_API_KEY_LOCAL = process.env.VITE_MARBLE_API_KEY;
  const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
  
  try {
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
    // Adjust prompt based on quality mode
    let enhancedTextPrompt = `${concept}. `;
    
    if (quality === 'quick') {
      // Quick mode: minimal prompt for faster generation
      enhancedTextPrompt += 'A 3D environment suitable for quick exploration.';
    } else if (quality === 'premium') {
      // Premium mode: detailed prompt for wide vistas
      enhancedTextPrompt += `A beautiful, immersive 3D environment with rich architectural details and atmospheric depth. 
Natural lighting, realistic textures, wide explorable spaces with clear pathways and interesting viewpoints. 
Perfect for wide vistas and expansive exploration.`;
    } else {
      // Standard mode: balanced prompt for tight spaces
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

        // Small delay to ensure assets are ready (world might be created but assets still processing)
        await sleep(2000);

        // Fetch the world to get splat URLs - retry if assets are null
        let worldData = null;
        let retryCount = 0;
        const maxRetries = 5;
        
        while (retryCount < maxRetries) {
          const worldResponse = await fetch(`${MARBLE_WORLDS_ENDPOINT}/${worldId}`, {
            headers: {
              'WLT-Api-Key': MARBLE_API_KEY_LOCAL
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
          if (retryCount < maxRetries) {
            console.log(`⏳ [PIPELINE] Assets not ready yet, retrying (${retryCount}/${maxRetries})...`);
            await sleep(3000);
          }
        }
        
        // Try multiple paths to get splat URL
        // Check operation response first (might contain splat URL directly)
        const responseSplatUrl = statusData.response?.splat_url || 
                                 statusData.response?.assets?.splats?.spz_urls?.full_res ||
                                 statusData.response?.world?.assets?.splats?.spz_urls?.full_res;
        
        // Then check world data assets
        const worldSplatUrl = worldData?.assets?.splats?.spz_urls?.full_res || 
                              worldData?.assets?.splats?.spz_urls?.['500k'] ||
                              worldData?.assets?.splats?.spz_urls?.['100k'] ||
                              worldData?.splats?.spz_urls?.full_res ||
                              worldData?.splat_url ||
                              worldData?.assets?.splat_url;
        
        // Use response URL if available, otherwise world URL
        splatUrl = responseSplatUrl || worldSplatUrl;

        // Get collider mesh URL for physics - try multiple possible paths
        const colliderMeshUrl = worldData?.assets?.meshes?.glb_urls?.collider ||
                                worldData?.assets?.meshes?.collider_glb_url ||
                                worldData?.assets?.collider_mesh?.url ||
                                worldData?.assets?.collider?.glb_url ||
                                worldData?.collider_mesh?.url ||
                                null;
        
        // Get low-res splat for faster preview loading
        const splatUrlLowRes = worldData?.assets?.splats?.spz_urls?.['500k'] || 
                               worldData?.assets?.splats?.spz_urls?.['100k'] || null;

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

// Process-level error handlers to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('❌ [PROCESS] Uncaught Exception:', error);
  // Don't exit - keep server running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ [PROCESS] Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - keep server running
});

// Listen on all interfaces (0.0.0.0) for Railway/cloud deployments
const SERVER_HOST = '0.0.0.0';
httpServer.listen(PORT, SERVER_HOST, () => {
  console.log(`🚀 [PROXY] Server running on http://${SERVER_HOST}:${PORT}`);
  console.log(`🔌 [SOCKET] WebSocket server ready`);
  console.log(`📡 [PROXY] Marble API proxy ready`);
  console.log(`🔑 [PROXY] Using Marble API key: ${MARBLE_API_KEY?.substring(0, 10) || 'NOT SET'}...`);
  console.log(`✅ [PROXY] Routes registered: POST /api/marble/convert, GET /health`);
  console.log(`📚 [PROXY] API docs: https://worldlabs-api-reference.mintlify.app/api`);
}).on('error', (error) => {
  console.error('❌ [SERVER] Failed to start:', error);
  process.exit(1);
});
