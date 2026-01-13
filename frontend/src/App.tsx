import { useState, useEffect } from 'react';
import { LoadingScreen } from './components/LoadingScreen';
import { LandingPage } from './pages/LandingPage';
import { ExplorePage } from './pages/ExplorePage';
import { LibraryPage } from './pages/LibraryPage';
import { CreditsPage } from './pages/CreditsPage';
import { useMetaTags } from './hooks/useMetaTags';
import { useAuth } from './contexts/AuthContext';
import { verifyCheckoutSession } from './lib/api';

type Page = 'landing' | 'explore' | 'library' | 'credits';

function getPageFromHash(): Page {
  const hash = window.location.hash;
  if (hash.startsWith('#explore')) {
    return 'explore';
  }
  if (hash.startsWith('#library')) {
    return 'library';
  }
  if (hash.startsWith('#credits')) {
    return 'credits';
  }
  return 'landing';
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<Page>(getPageFromHash);
  const { getIdToken } = useAuth();

  // Listen for hash changes (browser back/forward, programmatic navigation)
  useEffect(() => {
    const handleHashChange = () => {
      setCurrentPage(getPageFromHash());
    };

    // Set initial page
    handleHashChange();

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Update page title and meta tags based on current page
  useEffect(() => {
    switch (currentPage) {
      case 'landing':
        document.title = 'flow | voice-guided 3d exploration';
        break;
      case 'library':
        document.title = 'flow | library';
        break;
      case 'credits':
        document.title = 'flow | buy credits';
        break;
      case 'explore':
        // The explore page will handle its own title updates
        document.title = 'flow | explore';
        break;
      default:
        document.title = 'flow';
    }
  }, [currentPage]);

  // Dynamic meta tags based on page
  useMetaTags({
    title: currentPage === 'landing'
      ? 'flow | voice-guided 3d exploration'
      : currentPage === 'library'
      ? 'flow | library'
      : currentPage === 'credits'
      ? 'flow | buy credits'
      : 'flow | explore',
    description: currentPage === 'landing'
      ? 'Explore any concept through immersive, voice-guided 3D environments. Transform learning into an interactive visual journey with AI-powered spatial experiences.'
      : currentPage === 'library'
      ? 'Browse your saved 3D explorations and revisit your learning journey through immersive environments.'
      : currentPage === 'credits'
      ? 'Purchase credits to generate unlimited 3D scenes. Each generation costs 1 credit.'
      : 'Explore concepts in immersive 3D space with voice guidance.',
    image: 'https://flow.app/og-image.png',
    url: currentPage === 'landing'
      ? window.location.origin
      : `${window.location.origin}${window.location.pathname}${window.location.hash}`,
  });

  // Handle Stripe checkout redirect
  useEffect(() => {
    // Parse query params from hash (Stripe puts them after #credits)
    const hash = window.location.hash;
    const hashParts = hash.split('?');
    const params = hashParts.length > 1 ? new URLSearchParams(hashParts[1]) : new URLSearchParams();
    const creditsStatus = params.get('credits');
    
    if (creditsStatus === 'success') {
      // Show success message and verify session (fallback if webhook hasn't fired)
      const sessionId = params.get('session_id');
      console.log('✅ [CREDITS] Purchase successful, session:', sessionId);
      
      // Remove query params from URL but keep #credits hash
      const cleanHash = hashParts[0];
      window.history.replaceState({}, '', window.location.pathname + cleanHash);
      
      // Verify session and add credits (fallback if webhook hasn't fired)
      if (sessionId) {
        getIdToken().then(token => {
          if (token) {
            verifyCheckoutSession(token, sessionId)
              .then(result => {
                console.log('✅ [CREDITS] Session verified, credits added:', result.creditsAdded);
                // Refresh page to update credit balance
                setTimeout(() => {
                  window.location.reload();
                }, 1000);
              })
              .catch(err => {
                console.error('❌ [CREDITS] Failed to verify session:', err);
                // Still refresh page (webhook might have added credits)
                setTimeout(() => {
                  window.location.reload();
                }, 1000);
              });
          } else {
            // No token, just refresh
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          }
        });
      } else {
        // No session ID, just refresh
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    } else if (creditsStatus === 'cancelled') {
      // Remove query params but keep #credits hash
      const cleanHash = hashParts[0];
      window.history.replaceState({}, '', window.location.pathname + cleanHash);
    }
  }, [getIdToken]);

  // Show loading screen only on initial load for landing page
  if (isLoading && currentPage === 'landing') {
    return <LoadingScreen onComplete={() => setIsLoading(false)} minDuration={1500} />;
  }

  // Route to appropriate page
  switch (currentPage) {
    case 'explore':
      return <ExplorePage />;
    case 'library':
      return <LibraryPage />;
    case 'credits':
      return <CreditsPage />;
    case 'landing':
    default:
      return <LandingPage />;
  }
}
