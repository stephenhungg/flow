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
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

// Database
import { connectToDatabase } from './server/lib/mongodb.js';

// Route modules
import authRoutes from './routes/auth.js';
import creditsRoutes, { createWebhookHandler } from './routes/credits.js';
import scenesRoutes from './routes/scenes.js';
import createPipelineRoutes from './routes/pipeline.js';

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

// Initialize database connection
connectToDatabase().catch(console.error);

// ============================================
// SECURITY MIDDLEWARE - CRITICAL FOR PRODUCTION
// ============================================

// Security headers with helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "blob:", "*.vultrobjects.com", "*.blob.vercel-storage.com"],
      connectSrc: ["'self'", "https:", "wss:", "ws:"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "blob:", "https:"],
      frameSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Required for Socket.io
}));

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 auth attempts
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true,
});

// Apply general rate limiting to all routes
app.use('/api/', apiLimiter);

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

// ============================================
// STRIPE WEBHOOK - MUST BE BEFORE express.json()
// ============================================
// Stripe webhooks need raw body for signature verification
app.post('/api/credits/webhook', express.raw({ type: 'application/json' }), createWebhookHandler());

// ============================================
// BODY PARSING - AFTER WEBHOOK ROUTE
// ============================================
// Increase JSON body limit for screenshots/images (50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Debug: Log all requests (BEFORE routes)
app.use((req, res, next) => {
  console.log(`📥 [PROXY] ${req.method} ${req.path}`);
  next();
});

// Health check - Define early to ensure availability
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// MOUNT ROUTE MODULES
// ============================================

// Auth routes: /api/auth/verify, /api/auth/me
app.use('/api/auth', authRoutes);

// Credits routes: /api/credits/create-checkout, /api/credits/verify-session, /api/credits/packages
// (webhook is mounted separately above before express.json)
app.use('/api/credits', creditsRoutes);

// Scene routes: /api/scenes/*, /api/scenes/users/*, /api/scenes/admin/*,
//               /api/scenes/gemini/*, /api/scenes/narration/*, /api/scenes/proxy/*
app.use('/api/scenes', scenesRoutes);

// User scenes shortcut routes (preserve original URL structure)
app.use('/api/users/me/scenes', (req, res, next) => {
  // Rewrite to scene router's /users/me path
  req.url = '/users/me' + req.url;
  scenesRoutes(req, res, next);
});
app.use('/api/users/:id/scenes', (req, res, next) => {
  req.url = `/users/${req.params.id}` + req.url;
  scenesRoutes(req, res, next);
});

// Gemini proxy routes (preserve original URL structure)
app.use('/api/gemini', (req, res, next) => {
  req.url = '/gemini' + req.url;
  scenesRoutes(req, res, next);
});

// Narration routes (preserve original URL structure)
app.use('/api/narration', (req, res, next) => {
  req.url = '/narration' + req.url;
  scenesRoutes(req, res, next);
});

// Proxy routes (preserve original URL structure)
app.use('/api/proxy', (req, res, next) => {
  req.url = '/proxy' + req.url;
  scenesRoutes(req, res, next);
});

// Admin routes (preserve original URL structure)
app.use('/api/admin', (req, res, next) => {
  req.url = '/admin' + req.url;
  scenesRoutes(req, res, next);
});

// Pipeline routes: /api/pipeline/start, /api/pipeline/:jobId/status, /api/pipeline/:jobId/cancel
// Also includes /api/marble/convert
const pipelineRoutes = createPipelineRoutes(io, pipelineJobs, emitPipelineUpdate);
app.use('/api/pipeline', pipelineRoutes);
app.use('/api/marble', (req, res, next) => {
  req.url = '/marble' + req.url;
  pipelineRoutes(req, res, next);
});

// Open Graph endpoint for scene sharing
app.get('/s/:id', async (req, res) => {
  try {
    const { ObjectId } = await import('mongodb');
    const { getScenesCollection } = await import('./server/lib/mongodb.js');
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

// ============================================
// ERROR HANDLING
// ============================================

// Global error handler (must be before catch-all)
app.use((err, req, res, next) => {
  console.error('❌ [ERROR] Unhandled error:', err);

  // Log the full error internally
  console.error('❌ [ERROR]', new Date().toISOString(), err.stack || err);

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: isDevelopment ? err.message : undefined
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large' });
  }

  // Default error response
  res.status(err.status || 500).json({
    error: isDevelopment ? err.message : 'Internal server error',
    ...(isDevelopment && { stack: err.stack }),
    requestId: req.id || 'unknown'
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
const MARBLE_API_KEY = process.env.VITE_MARBLE_API_KEY;
httpServer.listen(PORT, HOST, () => {
  console.log(`🚀 [PROXY] Server running on http://${HOST}:${PORT}`);
  console.log(`🔌 [SOCKET] WebSocket server ready`);
  console.log(`📡 [PROXY] Marble API proxy ready`);
  console.log(`🔑 [PROXY] Using Marble API key: ${MARBLE_API_KEY?.substring(0, 10) || 'NOT SET'}...`);
  console.log(`✅ [PROXY] Routes registered: POST /api/marble/convert, GET /health`);
  console.log(`📚 [PROXY] API docs: https://worldlabs-api-reference.mintlify.app/api`);
}).on('error', (error) => {
  console.error('❌ [SERVER] Failed to start:', error);
  process.exit(1);
});
