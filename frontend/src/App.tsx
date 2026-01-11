import { useState, useEffect } from 'react';
import { LoadingScreen } from './components/LoadingScreen';
import { LandingPage } from './pages/LandingPage';
import { ExplorePage } from './pages/ExplorePage';
import { LibraryPage } from './pages/LibraryPage';

type Page = 'landing' | 'explore' | 'library';

function getPageFromHash(): Page {
  const hash = window.location.hash;
  if (hash.startsWith('#explore')) {
    return 'explore';
  }
  if (hash.startsWith('#library')) {
    return 'library';
  }
  return 'landing';
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<Page>(getPageFromHash);

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
    case 'landing':
    default:
      return <LandingPage />;
  }
}
