/**
 * Authentication route handlers
 * POST /verify — verify Firebase token and create/update user
 * GET /me — get current user profile
 */

import { Router } from 'express';
import { verifyIdToken, authMiddleware } from '../server/lib/auth.js';
import { getUsersCollection } from '../server/lib/mongodb.js';
import { getAdminEmails } from '../middleware/auth.js';

const router = Router();

/**
 * POST /verify
 * Verify Firebase token and create/update user
 */
router.post('/verify', async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required' });
    }

    // Verify token using Firebase Admin
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
    const ADMIN_EMAILS = getAdminEmails();
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
 * GET /me
 * Get current user profile (requires auth)
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const usersCollection = getUsersCollection();
    const user = await usersCollection.findOne({ firebaseUid: req.user.uid });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if admin user
    const ADMIN_EMAILS = getAdminEmails();
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

export default router;
