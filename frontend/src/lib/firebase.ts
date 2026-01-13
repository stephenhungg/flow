/**
 * Firebase client configuration for authentication
 */

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';

export type { User as FirebaseUser };

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Configure Google provider
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

/**
 * Sign in with Google
 */
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const idToken = await result.user.getIdToken();
    
    // Verify token with backend and create/update user
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/auth/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idToken }),
      });

      if (response.ok) {
        const data = await response.json();
        // Convert string 'Infinity' back to Infinity for admin users
        if (data.user?.credits === 'Infinity') {
          data.user.credits = Infinity;
        }
        return { user: result.user, dbUser: data.user };
      } else {
        // Backend failed but Firebase auth succeeded
        console.warn('Backend verification failed, but Firebase auth succeeded:', response.status);
        return { user: result.user, dbUser: null };
      }
    } catch (backendError) {
      // Backend is unavailable but Firebase auth succeeded
      console.warn('Backend unavailable, but Firebase auth succeeded:', backendError);
      return { user: result.user, dbUser: null };
    }
  } catch (error) {
    console.error('Firebase sign in error:', error);
    throw error;
  }
}

/**
 * Sign out
 */
export async function signOutUser() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Sign out error:', error);
    throw error;
  }
}

/**
 * Get current user's ID token
 */
export async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return await user.getIdToken();
}

/**
 * Auth state change listener
 */
export function onAuthStateChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

