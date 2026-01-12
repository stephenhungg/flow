import { motion } from 'framer-motion';
import { Home, Library, LogIn, LogOut, User, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useState, useRef } from 'react';
import { BuyCreditsCard } from './BuyCreditsModal';

interface NavBarProps {
  currentPage?: 'home' | 'library' | 'explore';
}

export function NavBar({ currentPage = 'home' }: NavBarProps) {
  const { dbUser, loading, signIn, signOut } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [showCreditsCard, setShowCreditsCard] = useState(false);
  const creditsButtonRef = useRef<HTMLButtonElement>(null);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await signIn();
    } catch (error) {
      console.error('Sign in failed:', error);
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  const navigateToHome = () => {
    window.location.hash = '';
  };

  const navigateToLibrary = () => {
    window.location.hash = '#library';
  };

  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
      className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50"
    >
      <div className="glass rounded-full px-4 py-2 flex items-center gap-3 shadow-lg">
        {/* Home */}
        <motion.button
          onClick={navigateToHome}
          className={`flex items-center gap-2 px-4 py-2 rounded-full font-mono text-sm transition-all ${
            currentPage === 'home'
              ? 'glass-strong text-white'
              : 'text-white/70 hover:text-white hover:bg-white/10'
          }`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Home className="w-4 h-4" />
          <span>home</span>
        </motion.button>

        {/* Library */}
        <motion.button
          onClick={navigateToLibrary}
          className={`flex items-center gap-2 px-4 py-2 rounded-full font-mono text-sm transition-all ${
            currentPage === 'library'
              ? 'glass-strong text-white'
              : 'text-white/70 hover:text-white hover:bg-white/10'
          }`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Library className="w-4 h-4" />
          <span>library</span>
        </motion.button>

        {/* Divider */}
        <div className="w-px h-6 bg-white/20" />

        {/* Auth Section */}
        {loading ? (
          <div className="px-4 py-2">
            <div className="w-20 h-4 bg-white/10 rounded animate-pulse" />
          </div>
        ) : dbUser ? (
          <div className="flex items-center gap-2 relative">
            {/* Credits Balance */}
            <motion.button
              ref={creditsButtonRef}
              onClick={() => setShowCreditsCard(!showCreditsCard)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/30 font-mono text-xs text-purple-200 transition-all ${
                showCreditsCard ? 'bg-purple-500/40 border-purple-400/50' : ''
              }`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Sparkles className="w-3 h-3" />
              <span>{dbUser.credits || 0} credits</span>
            </motion.button>

            {/* Buy Credits Card */}
            <BuyCreditsCard
              isOpen={showCreditsCard}
              onClose={() => setShowCreditsCard(false)}
              anchorRef={creditsButtonRef}
            />

            {/* User Info */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10">
              {dbUser.photoURL ? (
                <img
                  src={dbUser.photoURL}
                  alt={dbUser.displayName}
                  className="w-5 h-5 rounded-full"
                />
              ) : (
                <User className="w-4 h-4 text-white/70" />
              )}
              <span className="font-mono text-xs text-white/90">
                {dbUser.displayName?.split(' ')[0] || 'User'}
              </span>
            </div>

            {/* Sign Out */}
            <motion.button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full font-mono text-xs text-white/70 hover:text-white hover:bg-white/10 transition-all"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <LogOut className="w-3.5 h-3.5" />
            </motion.button>
          </div>
        ) : (
          <motion.button
            onClick={handleSignIn}
            disabled={signingIn}
            className="flex items-center gap-2 px-4 py-2 rounded-full font-mono text-sm text-white/70 hover:text-white hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            whileHover={!signingIn ? { scale: 1.05 } : {}}
            whileTap={!signingIn ? { scale: 0.95 } : {}}
          >
            <LogIn className="w-4 h-4" />
            <span>{signingIn ? 'signing in...' : 'sign in'}</span>
          </motion.button>
        )}
      </div>
    </motion.nav>
  );
}
