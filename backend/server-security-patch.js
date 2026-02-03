/**
 * EMERGENCY SECURITY PATCH
 * Apply these changes to server.js immediately
 */

import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { body, validationResult } from 'express-validator';
import mongoSanitize from 'express-mongo-sanitize';

// ============================================
// SECURITY MIDDLEWARE - Add after line 44
// ============================================

// Security headers - MUST BE FIRST
export const addSecurityHeaders = (app) => {
  // Helmet for security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: ["'self'", "https:", "wss:", "ws:"],
        fontSrc: ["'self'", "https:", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'", "blob:", "https:"],
        frameSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Required for Socket.io
  }));

  // Additional security headers
  app.use((req, res, next) => {
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
  });
};

// ============================================
// RATE LIMITING - Replace existing rate limiter
// ============================================

// General API rate limit
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limit for auth endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true,
});

// Very strict rate limit for expensive operations (Marble API, etc)
export const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 requests per hour
  message: 'Rate limit exceeded for this operation. Please try again later.',
  skipFailedRequests: true,
});

// Rate limit for scene creation
export const sceneLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 scenes per hour
  message: 'Too many scenes created. Please try again later.',
});

// ============================================
// INPUT VALIDATION RULES
// ============================================

export const validateSceneCreation = [
  body('title').trim().isLength({ min: 1, max: 100 }).escape(),
  body('description').optional().trim().isLength({ max: 500 }).escape(),
  body('concept').optional().trim().isLength({ max: 200 }).escape(),
  body('isPublic').optional().isBoolean(),
  body('allowRemix').optional().isBoolean(),
  body('thumbnailBase64').optional().isBase64(),
  // Validate category if present
  body('category').optional().isIn(['featured', 'community', 'educational', 'artistic']),
];

export const validateSceneUpdate = [
  body('title').optional().trim().isLength({ min: 1, max: 100 }).escape(),
  body('description').optional().trim().isLength({ max: 500 }).escape(),
  body('isPublic').optional().isBoolean(),
  body('allowRemix').optional().isBoolean(),
];

export const validateSearch = [
  body('search').optional().trim().escape().isLength({ max: 100 }),
  body('limit').optional().isInt({ min: 1, max: 100 }),
  body('offset').optional().isInt({ min: 0 }),
];

// Validation middleware
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Invalid input',
      details: errors.array()
    });
  }
  next();
};

// ============================================
// AUTHORIZATION HELPERS
// ============================================

// Check if user owns the resource
export const checkResourceOwnership = async (req, res, next) => {
  try {
    const resourceId = req.params.id;
    const userId = req.user?._id || req.user?.uid;
    const isAdmin = req.isAdmin;

    // Admin can access everything
    if (isAdmin) {
      return next();
    }

    // Get the scene to check ownership
    const scenesCollection = await getScenesCollection();
    const scene = await scenesCollection.findOne({
      _id: new ObjectId(resourceId)
    });

    if (!scene) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    // Check if user owns the resource
    if (scene.userId !== userId && scene.userUid !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to access this resource'
      });
    }

    // Store scene for later use
    req.resource = scene;
    next();
  } catch (error) {
    console.error('Authorization error:', error);
    res.status(500).json({ error: 'Authorization check failed' });
  }
};

// ============================================
// SANITIZATION MIDDLEWARE
// ============================================

// Sanitize MongoDB queries to prevent injection
export const sanitizeInput = mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    console.warn(`⚠️ [SECURITY] Attempted injection in ${key} from IP ${req.ip}`);
  }
});

// ============================================
// LOGGING HELPER (Replace console.log)
// ============================================

export const logger = {
  info: (message, data = {}) => {
    console.log(`ℹ️ [${new Date().toISOString()}] ${message}`, data);
  },
  error: (message, error = {}) => {
    console.error(`❌ [${new Date().toISOString()}] ${message}`, error.message || error);
  },
  warn: (message, data = {}) => {
    console.warn(`⚠️ [${new Date().toISOString()}] ${message}`, data);
  },
  security: (message, data = {}) => {
    console.error(`🔒 [SECURITY] [${new Date().toISOString()}] ${message}`, data);
  }
};

// ============================================
// ERROR HANDLER - Add at the end of server.js
// ============================================

export const globalErrorHandler = (err, req, res, next) => {
  // Log the full error internally
  logger.error('Unhandled error', err);

  // Don't leak error details in production
  const isDev = process.env.NODE_ENV === 'development';

  // Known error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: isDev ? err.message : undefined
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  if (err.name === 'ForbiddenError') {
    return res.status(403).json({
      error: 'Forbidden'
    });
  }

  // Default error
  res.status(err.status || 500).json({
    error: isDev ? err.message : 'Internal server error',
    requestId: req.id // Add request tracking
  });
};

// ============================================
// SECURE ASYNC HANDLER
// ============================================

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};