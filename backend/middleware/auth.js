/**
 * Authentication & authorization middleware
 * Re-exports authMiddleware from server/lib/auth.js and adds credit/rate-limit middleware
 */

import { getUsersCollection } from '../server/lib/mongodb.js';

// Re-export the Firebase auth middleware
export { authMiddleware } from '../server/lib/auth.js';

// Admin configuration - use environment variable for security
function getAdminEmails() {
  return process.env.ADMIN_EMAILS
    ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase())
    : ['stpnhh@gmail.com']; // Fallback for development
}

// Credit system configuration
const CREDITS_PER_GENERATION = 1;

/**
 * Middleware to check if user has enough credits
 */
export async function creditCheckMiddleware(req, res, next) {
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

    // Unlimited credits for admin emails
    const userEmail = user.email?.toLowerCase().trim();
    const isAdminEmail = getAdminEmails().includes(userEmail);

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

// Rate limiting for expensive API calls (Marble + Gemini)
// Track requests per IP: { ip: [timestamp1, timestamp2, ...] }
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_REQUESTS = 2; // Max 2 generations per hour per IP

/**
 * Simple rate limiting middleware (bypasses admin users)
 */
export function rateLimitMiddleware(req, res, next) {
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

export { getAdminEmails, CREDITS_PER_GENERATION };
