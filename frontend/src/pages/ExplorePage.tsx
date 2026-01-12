import { useState, useEffect, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { getScene, type OrchestrationData } from '../lib/api';
import { useMetaTags } from '../hooks/useMetaTags';
import { NavBar } from '../components/NavBar';

// Lazy load EducationalScene to avoid loading SparkJS WASM until needed
const EducationalScene = lazy(() => import('../components/EducationalScene').then(m => ({ default: m.EducationalScene })));

export function ExplorePage() {
  const [concept, setConcept] = useState<string | null>(null);
  const [savedSplatUrl, setSavedSplatUrl] = useState<string | null>(null);
  const [savedOrchestration, setSavedOrchestration] = useState<OrchestrationData | null>(null);
  const [savedSceneId, setSavedSceneId] = useState<string | null>(null);
  const [customImageData, setCustomImageData] = useState<string | null>(null);
  const [showFadeOverlay, setShowFadeOverlay] = useState(true);
  const [isLoadingSavedScene, setIsLoadingSavedScene] = useState(false);

  // Parse query from URL hash on mount
  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace('#explore?', ''));
    const query = params.get('q');
    const sceneId = params.get('sceneId');
    const hasImage = params.get('hasImage');
    
    // Check for custom image in sessionStorage
    if (hasImage === 'true') {
      const imageData = sessionStorage.getItem('customImage');
      if (imageData) {
        console.log('🖼️ [EXPLORE] Found custom image in session storage');
        setCustomImageData(imageData);
        // Clear after reading
        sessionStorage.removeItem('customImage');
        sessionStorage.removeItem('customImageName');
      }
    }
    
    // If sceneId is provided, load the saved scene FIRST before setting concept
    if (sceneId) {
      setIsLoadingSavedScene(true);
      console.log('📚 [EXPLORE] Loading saved scene:', sceneId);
      getScene(sceneId)
        .then(scene => {
          console.log('📚 [EXPLORE] Scene loaded:', scene.title, scene.splatUrl);
          // Store scene ID for saving orchestration later
          setSavedSceneId(scene._id);
          // Set the splat URL BEFORE setting concept
          if (scene.splatUrl) {
            setSavedSplatUrl(scene.splatUrl);
          }
          // Set saved orchestration if available
          if (scene.orchestration) {
            console.log('📚 [EXPLORE] Found saved orchestration');
            setSavedOrchestration(scene.orchestration);
          }
          // Now set concept (will trigger EducationalScene render)
          setConcept(scene.concept || (query ? decodeURIComponent(query) : 'Unknown'));
        })
        .catch(err => {
          console.error('📚 [EXPLORE] Failed to load scene:', err);
          // Fallback to query-based generation
          if (query) {
            setConcept(decodeURIComponent(query));
          }
        })
        .finally(() => {
          setIsLoadingSavedScene(false);
        });
    } else if (query) {
      // No sceneId, just use the query for new generation
      setConcept(decodeURIComponent(query));
    }
  }, []);

  // Fade out the entry overlay after component mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowFadeOverlay(false);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Update page title when concept changes
  useEffect(() => {
    if (concept) {
      document.title = `flow | ${concept}`;
    } else {
      document.title = 'flow | explore';
    }
  }, [concept]);

  // Update meta tags for social sharing when concept changes
  useMetaTags({
    title: concept ? `flow | ${concept}` : 'flow | explore',
    description: concept
      ? `Explore ${concept} through an immersive, voice-guided 3D environment. Transform your learning experience with AI-powered spatial visualization.`
      : 'Explore any concept in immersive 3D space with voice guidance.',
    image: '/og-image.svg',
    url: `${window.location.origin}${window.location.pathname}${window.location.hash}`,
  });

  const handleExit = () => {
    // Navigate back to landing page
    window.location.hash = '';
  };

  // Show loading while fetching saved scene
  if (isLoadingSavedScene || !concept) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <p className="font-mono text-white text-glow mb-4">
            {isLoadingSavedScene ? 'Loading saved world...' : 'No concept specified. Redirecting...'}
          </p>
          {isLoadingSavedScene && (
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0">
      {/* Fade overlay that fades out on entry */}
      <motion.div
        className="fixed inset-0 bg-black z-[60] pointer-events-none"
        initial={{ opacity: 1 }}
        animate={{ opacity: showFadeOverlay ? 1 : 0 }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
      />

      {/* Navigation Bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: showFadeOverlay ? 0 : 1 }}
        transition={{ duration: 0.8, delay: 0.5, ease: 'easeOut' }}
      >
        <NavBar currentPage="explore" />
      </motion.div>

      <Suspense fallback={
        <div className="h-screen w-screen bg-black flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
          >
            <p className="font-mono text-white text-glow mb-4">
              Loading 3D experience...
            </p>
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 bg-white/60 rounded-full animate-pulse" />
              <div className="w-2 h-2 bg-white/60 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
              <div className="w-2 h-2 bg-white/60 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>
          </motion.div>
        </div>
      }>
        <EducationalScene 
          concept={concept}
          savedSplatUrl={savedSplatUrl}
          savedOrchestration={savedOrchestration}
          savedSceneId={savedSceneId}
          customImageData={customImageData}
          onExit={handleExit}
        />
      </Suspense>
    </div>
  );
}

