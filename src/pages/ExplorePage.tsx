import { useState, useEffect, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';

// Lazy load EducationalScene to avoid loading SparkJS WASM until needed
const EducationalScene = lazy(() => import('../components/EducationalScene').then(m => ({ default: m.EducationalScene })));

export function ExplorePage() {
  const [concept, setConcept] = useState<string | null>(null);
  const [showFadeOverlay, setShowFadeOverlay] = useState(true);

  // Parse query from URL hash on mount
  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace('#explore?', ''));
    const query = params.get('q');
    if (query) {
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

  const handleExit = () => {
    // Navigate back to landing page
    window.location.hash = '';
  };

  if (!concept) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <p className="font-mono text-white text-glow">
          No concept specified. Redirecting...
        </p>
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
          onExit={handleExit}
        />
      </Suspense>
    </div>
  );
}

