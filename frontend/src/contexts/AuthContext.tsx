/**
 * Auth Context - Global authentication state management
 */

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { onAuthStateChange, signInWithGoogle, signOutUser, getIdToken } from '../lib/firebase';
import type { FirebaseUser } from '../lib/firebase';

interface DBUser {
  _id: string;
  firebaseUid: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
}

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  dbUser: DBUser | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [dbUser, setDbUser] = useState<DBUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen for auth state changes
    const unsubscribe = onAuthStateChange(async (user) => {
      setFirebaseUser(user);
      setLoading(false);

      if (user) {
        // Fetch user data from backend
        try {
          const token = await user.getIdToken();
          const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/auth/me`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });

          if (response.ok) {
            const userData = await response.json();
            setDbUser(userData);
          }
        } catch (error) {
          console.error('Failed to fetch user data:', error);
        }
      } else {
        setDbUser(null);
      }
    });

    return unsubscribe;
  }, []);

  const signIn = async () => {
    try {
      const result = await signInWithGoogle();
      if (result.dbUser) {
        setDbUser(result.dbUser);
      }
      // Note: firebaseUser will be set by onAuthStateChange listener
    } catch (error) {
      console.error('Sign in error:', error);
      // Still allow Firebase auth to work even if backend fails
      // The onAuthStateChange listener will set firebaseUser
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await signOutUser();
      setDbUser(null);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  };

  const getToken = async () => {
    return await getIdToken();
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        dbUser,
        loading,
        signIn,
        signOut,
        getIdToken: getToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

