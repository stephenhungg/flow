/**
 * Firebase Admin SDK for server-side authentication
 */

import admin from 'firebase-admin';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from root directory
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Initialize Firebase Admin SDK
// In production, use a service account JSON file or environment variables
if (!admin.apps.length) {
  try {
    // Try to initialize with service account from environment
    // For production, store FIREBASE_SERVICE_ACCOUNT as a JSON string or use a file
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else {
      // For development/testing without service account
      // Note: This won't work for actual token verification
      // You need to set FIREBASE_SERVICE_ACCOUNT in production
      console.warn('⚠️ [AUTH] Firebase Admin SDK not initialized - FIREBASE_SERVICE_ACCOUNT not set');
      admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    }
    
    console.log('✅ [AUTH] Firebase Admin SDK initialized');
  } catch (error) {
    console.error('❌ [AUTH] Firebase Admin initialization error:', error);
    // Continue without admin SDK - auth endpoints will fail gracefully
  }
}

/**
 * Verify Firebase ID token
 * @param {string} idToken - Firebase ID token from client
 * @returns {Promise<admin.auth.DecodedIdToken>} Decoded token with user info
 */
export async function verifyIdToken(idToken) {
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    console.error('❌ [AUTH] Token verification error:', error);
    throw new Error('Invalid or expired token');
  }
}

/**
 * Express middleware to verify Firebase authentication
 * Adds req.user with Firebase user info
 */
export async function authMiddleware(req, res, next) {
  // Allow preflight requests to bypass authentication
  if (req.method === 'OPTIONS') {
    return next();
  }

  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await verifyIdToken(idToken);
    
    // Attach user info to request
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
      picture: decodedToken.picture,
    };
    
    next();
  } catch (error) {
    console.error('❌ [AUTH] Middleware error:', error);
    return res.status(401).json({ error: 'Unauthorized', details: error.message });
  }
}

