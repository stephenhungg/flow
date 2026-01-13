import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FirstPersonScene, type FirstPersonSceneHandle } from './FirstPersonScene';
import { SubtitleOverlay } from './SubtitleOverlay';
import { EducationOverlay } from './EducationOverlay';
import { SaveToLibraryModal } from './SaveToLibraryModal';
import { GenerationLoadingScreen } from './GenerationLoadingScreen';
import { NarrationOverlay } from './NarrationOverlay';
import { usePipelineSocket } from '../hooks/usePipelineSocket';
import { orchestrateConcept, type GeminiOrchestrationResponse } from '../lib/orchestrateConcept';
import { getProxiedSplatUrl, saveSceneOrchestration, createSceneFromUrl, type OrchestrationData } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

type SceneMode = 'idle' | 'listening' | 'processing' | 'loading_scene' | 'in_scene';

interface EducationalSceneProps {
  concept: string;
  savedSplatUrl?: string | null;
  savedOrchestration?: OrchestrationData | null;
  savedSceneId?: string | null;
  customImageData?: string | null;
  onExit?: () => void;
}

export function EducationalScene({ concept, savedSplatUrl, savedOrchestration, savedSceneId, customImageData, onExit }: EducationalSceneProps) {
  const [mode, setMode] = useState<SceneMode>('processing');
  const { getIdToken } = useAuth();
  const [orchestration, setOrchestration] = useState<GeminiOrchestrationResponse | null>(null);
  const [splatUrl, setSplatUrl] = useState<string>('');
  const [colliderMeshUrl, setColliderMeshUrl] = useState<string | undefined>(undefined);
  const [worldId, setWorldId] = useState<string | undefined>(undefined);
  const [audioCurrentTime] = useState(0);
  const [isAudioPlaying] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | null>(null);
  const useNewLoadingScreen = true;
  const sceneRef = useRef<FirstPersonSceneHandle | null>(null);
  const hasAutoSavedRef = useRef(false); // Track if we've already auto-saved this generation

  // Callback for NarrationOverlay to get screenshot
  const getScreenshot = useCallback(() => {
    return sceneRef.current?.captureScreenshot() || null;
  }, []);

  // Get quality mode from sessionStorage
  const qualityMode = sessionStorage.getItem('qualityMode') || 'standard';

  // Pipeline socket for real-time updates
  const pipeline = usePipelineSocket();

  // Start pipeline when component mounts - prevent double calls
  const pipelineStartedRef = useRef(false);
  const effectIdRef = useRef(0);
  
  // Reset auto-save flag when starting a new generation
  useEffect(() => {
    if (pipeline.stage === 'idle' || pipeline.stage === 'generating') {
      hasAutoSavedRef.current = false;
    }
  }, [pipeline.stage]);
  
  useEffect(() => {
    // Prevent double calls (React StrictMode in dev)
    if (pipelineStartedRef.current) return;
    pipelineStartedRef.current = true;
    
    // Increment effect ID for this effect run
    const currentEffectId = ++effectIdRef.current;

    async function runPipeline() {
      try {
        setMode('processing');
        console.log('🚀 [PIPELINE] Starting pipeline for concept:', concept);

        // Check for SAVED splat from library (already generated)
        if (savedSplatUrl) {
          // Use proxy to bypass CORS for Vultr URLs
          const proxiedUrl = getProxiedSplatUrl(savedSplatUrl);
          console.log('✅ [PIPELINE] Using SAVED splat from library:', savedSplatUrl);
          console.log('✅ [PIPELINE] Proxied URL:', proxiedUrl);
          setSplatUrl(proxiedUrl);
          setMode('loading_scene');
          
          // Use saved orchestration if available, otherwise generate
          if (savedOrchestration) {
            console.log('✅ [PIPELINE] Using saved orchestration');
            // Convert API OrchestrationData to GeminiOrchestrationResponse format
            // Handle both string and object formats from different data sources
            setOrchestration({
              concept,
              sceneId: 'saved',
              learningObjectives: savedOrchestration.learningObjectives.map((obj: string | { text: string }) => 
                typeof obj === 'string' ? obj : obj.text
              ),
              keyFacts: savedOrchestration.keyFacts.map((fact: string | { text: string; source?: string }) => 
                typeof fact === 'string' ? { text: fact, source: '' } : { text: fact.text, source: fact.source || '' }
              ),
              narrationScript: savedOrchestration.narrationScript,
              subtitleLines: savedOrchestration.subtitleLines.map((line: { text: string; startTime?: number; endTime?: number; t?: number }) => ({ 
                t: line.startTime ?? line.t ?? 0, 
                text: line.text 
              })),
              callouts: savedOrchestration.callouts.map((callout: { id?: string; text: string; position?: { x: number; y: number; z: number }; anchor?: string }) => ({
                text: callout.text,
                anchor: (callout.anchor || 'center') as 'center' | 'left' | 'right' | 'top' | 'bottom'
              })),
              sources: savedOrchestration.sources.map((source: { title?: string; label?: string; url: string }) => ({
                label: source.title || source.label || 'Source',
                url: source.url
              })),
            });
          } else {
            // Generate orchestration in background, but don't block scene loading
            // Use default empty orchestration so scene can load immediately
            setOrchestration({
              concept,
              sceneId: 'saved',
              learningObjectives: [],
              keyFacts: [],
              narrationScript: '',
              subtitleLines: [],
              callouts: [],
              sources: [],
            });
            // Generate orchestration in background
            console.log('🔄 [PIPELINE] Starting orchestration generation...');
            orchestrateConcept(concept)
              .then(async orchestrationResponse => {
                console.log('✅ [PIPELINE] Orchestration generated:', orchestrationResponse);
                console.log('✅ [PIPELINE] Learning objectives:', orchestrationResponse.learningObjectives?.length || 0);
                console.log('✅ [PIPELINE] Key facts:', orchestrationResponse.keyFacts?.length || 0);
                setOrchestration(orchestrationResponse);

                // Save orchestration to scene if we have a scene ID
                if (savedSceneId) {
                  try {
                    const token = await getIdToken();
                    if (token) {
                      // Convert GeminiOrchestrationResponse to OrchestrationData format
                      // Note: OrchestrationData.keyFacts is string[], but backend stores as objects
                      // The backend endpoint will handle the conversion
                      await saveSceneOrchestration(token, savedSceneId, {
                        learningObjectives: orchestrationResponse.learningObjectives,
                        keyFacts: orchestrationResponse.keyFacts.map(fact => fact.text), // Convert to string array
                        narrationScript: orchestrationResponse.narrationScript,
                        subtitleLines: orchestrationResponse.subtitleLines.map(line => ({
                          text: line.text,
                          startTime: line.t,
                          endTime: line.t + 3 // Default 3 second duration
                        })),
                        callouts: orchestrationResponse.callouts.map((callout, i) => ({
                          id: `callout-${i}`,
                          text: callout.text,
                          position: { x: 0, y: 0, z: 0 } // Default position
                        })),
                        sources: orchestrationResponse.sources.map(source => ({
                          title: source.label,
                          url: source.url
                        })),
                      });
                      console.log('✅ [PIPELINE] Saved orchestration to scene');
                    }
                  } catch (saveError) {
                    console.warn('⚠️ [PIPELINE] Failed to save orchestration:', saveError);
                    // Don't fail the whole flow if saving fails
                  }
                }
              })
              .catch(err => {
                console.warn('⚠️ [PIPELINE] Orchestration failed, continuing without:', err);
              });
          }
          return;
        }

        // No existing scene - use the full pipeline with WebSocket updates
        console.log('🔄 [PIPELINE] Starting full generation pipeline...');
        console.log('🔄 [PIPELINE] Quality mode:', qualityMode);
        console.log('🔄 [PIPELINE] Custom image:', customImageData ? 'yes' : 'no');
        
        // Convert custom image data URL to File if provided
        let imageFile: File | undefined;
        if (customImageData) {
          try {
            const response = await fetch(customImageData);
            const blob = await response.blob();
            imageFile = new File([blob], 'custom-image.png', { type: blob.type });
            console.log('📸 [PIPELINE] Using custom uploaded image');
          } catch (err) {
            console.warn('⚠️ [PIPELINE] Failed to process custom image:', err);
          }
        }
        
        // Start the pipeline via WebSocket
        await pipeline.startPipeline(concept, imageFile, qualityMode);

      } catch (err) {
        console.error('❌ [PIPELINE] Error:', err);
        if (effectIdRef.current === currentEffectId) {
          setMode('processing'); // Stay in processing to show error
        }
      }
    }

    runPipeline();
    
    return () => {
      // Mark this effect run as inactive by incrementing the ID
      effectIdRef.current++;
      console.log('🧹 [PIPELINE] Cleanup - effect ID incremented');
      // Do not reset pipelineStartedRef to avoid double-run in React StrictMode dev
    };
  }, [concept, savedSplatUrl, savedOrchestration, savedSceneId, customImageData, qualityMode, getIdToken]);

  // Watch for pipeline completion
  useEffect(() => {
    if (pipeline.stage === 'complete' && pipeline.splatUrl) {
      console.log('✅ [PIPELINE] Pipeline complete, splat URL:', pipeline.splatUrl);
      // Proxy the URL to avoid CORS issues with Marble CDN
      const proxiedUrl = getProxiedSplatUrl(pipeline.splatUrl);
      setSplatUrl(proxiedUrl);

      // Store collider and world info
      if (pipeline.colliderMeshUrl) {
        setColliderMeshUrl(pipeline.colliderMeshUrl);
      }
      if (pipeline.worldId) {
        setWorldId(pipeline.worldId);
      }

      // Set thumbnail from pipeline (generated image)
      if (pipeline.thumbnailBase64) {
        const thumbnailDataUrl = `data:image/png;base64,${pipeline.thumbnailBase64}`;
        setThumbnailDataUrl(thumbnailDataUrl);
        console.log('✅ [PIPELINE] Thumbnail set from pipeline');
      }

      setMode('loading_scene');

      // Generate orchestration if not already done
      if (!orchestration) {
        orchestrateConcept(concept)
          .then(result => setOrchestration(result))
          .catch(err => console.warn('⚠️ Orchestration failed:', err));
      }
    }
  }, [pipeline.stage, pipeline.splatUrl, pipeline.colliderMeshUrl, pipeline.worldId, pipeline.thumbnailBase64, concept, orchestration]);

  // Auto-save to library when generation completes (defined before useEffect that uses it)
  const autoSaveToLibrary = useCallback(async () => {
    // Don't auto-save if this is already a saved scene
    if (savedSceneId) {
      console.log('⏭️ [AUTO-SAVE] Skipping - scene already saved');
      return;
    }

    // Don't auto-save if we've already auto-saved this generation
    if (hasAutoSavedRef.current) {
      console.log('⏭️ [AUTO-SAVE] Skipping - already auto-saved');
      return;
    }

    if (!pipeline.splatUrl) {
      console.warn('⚠️ [AUTO-SAVE] No splat URL available');
      return;
    }

    try {
      const token = await getIdToken();
      if (!token) {
        console.warn('⚠️ [AUTO-SAVE] Not signed in, skipping auto-save');
        return;
      }

      console.log('💾 [AUTO-SAVE] Saving world to library...');

      // Generate title from concept (capitalize first letter of each word)
      const title = concept
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      const sceneData = await createSceneFromUrl(token, {
        title,
        concept,
        isPublic: true, // Auto-save as public
        splatUrl: pipeline.splatUrl,
        colliderMeshUrl: colliderMeshUrl,
        worldId: worldId,
        thumbnailBase64: thumbnailDataUrl?.replace(/^data:image\/\w+;base64,/, ''),
        orchestration: orchestration ? {
          learningObjectives: orchestration.learningObjectives,
          keyFacts: orchestration.keyFacts.map(fact => typeof fact === 'string' ? fact : fact.text),
          narrationScript: orchestration.narrationScript,
          subtitleLines: orchestration.subtitleLines.map(line => ({
            text: line.text,
            startTime: line.t,
            endTime: line.t + 3
          })),
          callouts: orchestration.callouts.map((callout, i) => ({
            id: `callout-${i}`,
            text: callout.text,
            position: { x: 0, y: 0, z: 0 }
          })),
          sources: orchestration.sources.map(source => ({
            title: source.label,
            url: source.url
          })),
        } : undefined,
      });

      console.log('✅ [AUTO-SAVE] World saved to library:', sceneData._id);
      // Mark as saved to prevent duplicate saves
      hasAutoSavedRef.current = true;
    } catch (error) {
      console.error('❌ [AUTO-SAVE] Failed to save:', error);
      // Don't show error to user - auto-save is best-effort
    }
  }, [pipeline.splatUrl, concept, colliderMeshUrl, worldId, thumbnailDataUrl, orchestration, savedSceneId, getIdToken]);

  // Auto-save after screenshot is captured
  useEffect(() => {
    if (mode === 'in_scene' && thumbnailDataUrl && pipeline.splatUrl && !savedSceneId) {
      // Small delay to ensure everything is settled
      const timer = setTimeout(() => {
        autoSaveToLibrary();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [mode, thumbnailDataUrl, pipeline.splatUrl, savedSceneId, autoSaveToLibrary]);

  // Handle scene ready
  const handleSceneReady = useCallback(() => {
    console.log('✅ [SCENE] 3D scene ready');
    setMode('in_scene');
  }, []);

  // Handle screenshot captured
  const handleScreenshotCaptured = useCallback((dataUrl: string) => {
    console.log('📸 [SCREENSHOT] Captured for thumbnail');
    setThumbnailDataUrl(dataUrl);
  }, []);

  // Handle loading complete from GenerationLoadingScreen
  const handleLoadingComplete = useCallback((completedSplatUrl: string) => {
    console.log('✅ [LOADING] Complete, transitioning to scene');
    setSplatUrl(completedSplatUrl);
    setMode('loading_scene');
  }, []);

  // Handle retry
  const handleRetry = useCallback(() => {
    console.log('🔄 [PIPELINE] Retrying...');
    pipeline.startPipeline(concept, undefined, qualityMode);
  }, [concept, qualityMode, pipeline]);

  // Handle cancel/exit - cancel pipeline and then exit
  const handleCancel = useCallback(async () => {
    console.log('🛑 [PIPELINE] Cancel requested');
    
    // Cancel the pipeline if it's running
    if (pipeline.jobId && pipeline.stage !== 'complete' && pipeline.stage !== 'error' && pipeline.stage !== 'idle') {
      await pipeline.cancelPipeline();
    }
    
    // Reset pipeline state
    pipeline.reset();
    
    // Reset auto-save flag
    hasAutoSavedRef.current = false;
    
    // Call the original onExit handler
    onExit?.();
  }, [pipeline, onExit]);

  // Show new loading screen during processing
  if (mode === 'processing' && useNewLoadingScreen) {
    return (
      <GenerationLoadingScreen
        stage={pipeline.stage}
        progress={pipeline.progress}
        message={pipeline.message}
        concept={concept}
        splatUrl={pipeline.splatUrl}
        generatedImage={pipeline.generatedImage}
        generatedImageMime={pipeline.generatedImageMime}
        error={pipeline.error}
        onComplete={handleLoadingComplete}
        onRetry={handleRetry}
        onExit={handleCancel}
        onCancel={handleCancel}
      />
    );
  }

  // Old loading screen fallback
  if (mode === 'processing') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="mb-6">
            <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto" />
          </div>
          <p className="font-mono text-white/80 text-lg mb-2">
            {pipeline.message || 'Generating your world...'}
          </p>
          <p className="font-mono text-white/40 text-sm">
            {pipeline.progress}% complete
          </p>
          </div>
      </div>
    );
  }

  // For saved scenes, render directly without waiting for orchestration
  if (mode === 'loading_scene' && splatUrl) {
    // Render the scene immediately - orchestration will load in background
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="scene-loading"
          className="fixed inset-0 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <FirstPersonScene
            ref={sceneRef}
            splatUrl={splatUrl}
            colliderMeshUrl={colliderMeshUrl}
            onSceneReady={handleSceneReady}
            onScreenshotCaptured={handleScreenshotCaptured}
          />

          {/* Voice Q&A Narration */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.8 }}
          >
            <NarrationOverlay
              getScreenshot={getScreenshot}
              concept={concept}
              enabled={true}
            />
          </motion.div>

          {/* Show minimal UI while orchestration loads */}
          <AnimatePresence>
            {orchestration && (
              <>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: 1, duration: 0.8, ease: 'easeOut' }}
                >
                  <SubtitleOverlay
                    subtitleLines={orchestration.subtitleLines}
                    audioCurrentTime={audioCurrentTime}
                    isPlaying={isAudioPlaying}
                  />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: 1.2, duration: 0.8, ease: 'easeOut' }}
                >
                  <EducationOverlay
                    concept={orchestration.concept}
                    learningObjectives={orchestration.learningObjectives}
                    keyFacts={orchestration.keyFacts}
                    callouts={orchestration.callouts}
                    sources={orchestration.sources}
                  />
                </motion.div>
              </>
            )}
          </AnimatePresence>

          <div className="absolute top-6 right-6 flex gap-2 z-50">
            <motion.button
              onClick={() => setShowSaveModal(true)}
              className="glass px-4 py-2 rounded-full font-mono text-sm text-white hover:bg-white/30 transition-colors"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.4, duration: 0.6, ease: 'easeOut' }}
            >
              save to library
            </motion.button>
            {onExit && (
              <motion.button
                onClick={handleCancel}
                className="glass px-4 py-2 rounded-full font-mono text-sm text-white hover:bg-white/30 transition-colors"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.4, duration: 0.6, ease: 'easeOut' }}
              >
                exit
              </motion.button>
            )}
          </div>

          <SaveToLibraryModal
            isOpen={showSaveModal}
            onClose={() => setShowSaveModal(false)}
            concept={concept}
            splatUrl={splatUrl}
            colliderMeshUrl={colliderMeshUrl}
            worldId={worldId}
            thumbnailDataUrl={thumbnailDataUrl}
            orchestration={orchestration ? {
              learningObjectives: orchestration.learningObjectives,
              keyFacts: orchestration.keyFacts.map(fact => typeof fact === 'string' ? fact : fact.text),
              narrationScript: orchestration.narrationScript,
              subtitleLines: orchestration.subtitleLines.map(line => ({
                text: line.text,
                startTime: line.t,
                endTime: line.t + 3 // Approximate end time
              })),
              callouts: orchestration.callouts.map(callout => ({
                id: callout.text.substring(0, 10),
                text: callout.text,
                position: { x: 0, y: 0, z: 0 }
              })),
              sources: orchestration.sources.map(source => ({
                title: source.label,
                url: source.url
              })),
            } : null}
            onSaveComplete={() => {
              setShowSaveModal(false);
            }}
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  // Waiting for orchestration
  if (!orchestration || !splatUrl) {
    return (
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.8 }}
      >
        <motion.p
          className="font-mono text-white text-glow"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          {!splatUrl ? 'Loading 3D environment...' : 'Preparing educational content...'}
        </motion.p>
      </motion.div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="scene-in"
        className="fixed inset-0 z-50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      >
      <FirstPersonScene 
          ref={sceneRef}
        splatUrl={splatUrl} 
          colliderMeshUrl={colliderMeshUrl}
        onSceneReady={handleSceneReady}
          onScreenshotCaptured={handleScreenshotCaptured}
        />

        {/* Voice Q&A Narration */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.8 }}
        >
          <NarrationOverlay
            getScreenshot={getScreenshot}
            concept={concept}
            enabled={true}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.8, ease: 'easeOut' }}
        >
      <SubtitleOverlay
        subtitleLines={orchestration.subtitleLines}
        audioCurrentTime={audioCurrentTime}
        isPlaying={isAudioPlaying}
      />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.8, ease: 'easeOut' }}
        >
      <EducationOverlay
        concept={orchestration.concept}
        learningObjectives={orchestration.learningObjectives}
        keyFacts={orchestration.keyFacts}
        callouts={orchestration.callouts}
        sources={orchestration.sources}
      />
        </motion.div>

      <div className="absolute top-6 right-6 flex gap-2 z-50">
        <motion.button
          onClick={() => setShowSaveModal(true)}
          className="glass px-4 py-2 rounded-full font-mono text-sm text-white hover:bg-white/30 transition-colors"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.4, duration: 0.6, ease: 'easeOut' }}
        >
          save to library
        </motion.button>
        {onExit && (
          <motion.button
            onClick={onExit}
            className="glass px-4 py-2 rounded-full font-mono text-sm text-white hover:bg-white/30 transition-colors"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.4, duration: 0.6, ease: 'easeOut' }}
          >
            exit
          </motion.button>
        )}
      </div>

      <SaveToLibraryModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        concept={concept}
        splatUrl={splatUrl}
          colliderMeshUrl={colliderMeshUrl}
          worldId={worldId}
          thumbnailDataUrl={thumbnailDataUrl}
          orchestration={orchestration ? {
            learningObjectives: orchestration.learningObjectives,
            keyFacts: orchestration.keyFacts.map(fact => typeof fact === 'string' ? fact : fact.text),
            narrationScript: orchestration.narrationScript,
            subtitleLines: orchestration.subtitleLines.map(line => ({
              text: line.text,
              startTime: line.t,
              endTime: line.t + 3 // Approximate end time
            })),
            callouts: orchestration.callouts.map(callout => ({
              id: callout.text.substring(0, 10),
              text: callout.text,
              position: { x: 0, y: 0, z: 0 }
            })),
            sources: orchestration.sources.map(source => ({
              title: source.label,
              url: source.url
            })),
          } : null}
        onSaveComplete={() => {
          setShowSaveModal(false);
        }}
      />
      </motion.div>
    </AnimatePresence>
  );
}
