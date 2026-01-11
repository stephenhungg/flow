import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FirstPersonScene, type FirstPersonSceneHandle } from './FirstPersonScene';
import { SubtitleOverlay } from './SubtitleOverlay';
import { EducationOverlay } from './EducationOverlay';
import { SaveToLibraryModal } from './SaveToLibraryModal';
import { GenerationLoadingScreen } from './GenerationLoadingScreen';
import { NarrationOverlay } from './NarrationOverlay';
import { usePipelineSocket } from '../hooks/usePipelineSocket';
import { orchestrateConcept, type GeminiOrchestrationResponse } from '../lib/orchestrateConcept';
import { findSceneByConcept } from '../lib/sceneRegistry';
import { getProxiedSplatUrl, type OrchestrationData } from '../lib/api';

type SceneMode = 'idle' | 'listening' | 'processing' | 'loading_scene' | 'in_scene';

interface EducationalSceneProps {
  concept: string;
  savedSplatUrl?: string | null;
  savedOrchestration?: OrchestrationData | null;
  customImageData?: string | null;
  onExit?: () => void;
}

export function EducationalScene({ concept, savedSplatUrl, savedOrchestration, customImageData, onExit }: EducationalSceneProps) {
  const [mode, setMode] = useState<SceneMode>('processing');
  const [orchestration, setOrchestration] = useState<GeminiOrchestrationResponse | null>(null);
  const [splatUrl, setSplatUrl] = useState<string>('');
  const [colliderMeshUrl, setColliderMeshUrl] = useState<string | undefined>(undefined);
  const [worldId, setWorldId] = useState<string | undefined>(undefined);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | null>(null);
  const useNewLoadingScreen = true;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sceneRef = useRef<FirstPersonSceneHandle | null>(null);

  // Callback for NarrationOverlay to get screenshot
  const getScreenshot = useCallback(() => {
    return sceneRef.current?.captureScreenshot() || null;
  }, []);

  // Get quality mode from sessionStorage
  const qualityMode = sessionStorage.getItem('qualityMode') || 'standard';

  // Pipeline socket for real-time updates
  const pipeline = usePipelineSocket();

  // Start pipeline when component mounts
  useEffect(() => {
    let cancelled = false;

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
            setOrchestration({
              concept,
              learningObjectives: savedOrchestration.learningObjectives,
              keyFacts: savedOrchestration.keyFacts,
              narrationScript: savedOrchestration.narrationScript,
              subtitleLines: savedOrchestration.subtitleLines,
              callouts: savedOrchestration.callouts,
              sources: savedOrchestration.sources,
            });
          } else {
            // Generate orchestration in background
            try {
              const orchestrationResponse = await orchestrateConcept(concept);
              if (!cancelled) {
                setOrchestration(orchestrationResponse);
              }
            } catch (err) {
              console.warn('⚠️ [PIPELINE] Orchestration failed, continuing without:', err);
            }
          }
          return;
        }

        // Check for existing local scene (FREE)
        const existingScene = findSceneByConcept(concept);
        if (existingScene) {
          console.log('✅ [PIPELINE] Found existing LOCAL scene:', existingScene);
          setSplatUrl(existingScene.splatUrl);
          setMode('loading_scene');
          
          // Generate orchestration in background
          try {
            const orchestrationResponse = await orchestrateConcept(concept);
            if (!cancelled) {
              setOrchestration(orchestrationResponse);
            }
          } catch (err) {
            console.warn('⚠️ [PIPELINE] Orchestration failed, continuing without:', err);
          }
          return;
        }

        // No existing scene - use the full pipeline with WebSocket updates
        console.log('🔄 [PIPELINE] Starting full generation pipeline...');
        
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
        if (!cancelled) {
          setMode('processing'); // Stay in processing to show error
        }
      }
    }

    runPipeline();

    return () => {
      cancelled = true;
    };
  }, [concept, savedSplatUrl, savedOrchestration, customImageData, qualityMode]);

  // Watch for pipeline completion
  useEffect(() => {
    if (pipeline.stage === 'complete' && pipeline.splatUrl) {
      console.log('✅ [PIPELINE] Pipeline complete, splat URL:', pipeline.splatUrl);
      setSplatUrl(pipeline.splatUrl);
      
      // Store collider and world info
      if (pipeline.colliderMeshUrl) {
        setColliderMeshUrl(pipeline.colliderMeshUrl);
      }
      if (pipeline.worldId) {
        setWorldId(pipeline.worldId);
      }
      
      setMode('loading_scene');
      
      // Generate orchestration if not already done
      if (!orchestration) {
        orchestrateConcept(concept)
          .then(result => setOrchestration(result))
          .catch(err => console.warn('⚠️ Orchestration failed:', err));
      }
    }
  }, [pipeline.stage, pipeline.splatUrl, pipeline.colliderMeshUrl, pipeline.worldId, concept, orchestration]);

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
        onExit={onExit}
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
      <div className="fixed inset-0 z-50">
        <FirstPersonScene
          ref={sceneRef}
          splatUrl={splatUrl}
          colliderMeshUrl={colliderMeshUrl}
          onSceneReady={handleSceneReady}
          onScreenshotCaptured={handleScreenshotCaptured}
        />

        {/* Voice Q&A Narration */}
        <NarrationOverlay
          getScreenshot={getScreenshot}
          concept={concept}
          enabled={true}
        />

        {/* Show minimal UI while orchestration loads */}
        {orchestration && (
          <>
            <SubtitleOverlay
              subtitleLines={orchestration.subtitleLines}
              audioCurrentTime={audioCurrentTime}
              isPlaying={isAudioPlaying}
            />
            <EducationOverlay
              concept={orchestration.concept}
              learningObjectives={orchestration.learningObjectives}
              keyFacts={orchestration.keyFacts}
              callouts={orchestration.callouts}
              sources={orchestration.sources}
            />
          </>
        )}

        <div className="absolute top-6 right-6 flex gap-2 z-50">
          <motion.button
            onClick={() => setShowSaveModal(true)}
            className="glass px-4 py-2 rounded-full font-mono text-sm text-white hover:bg-white/30 transition-colors"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            save to library
          </motion.button>
          {onExit && (
            <motion.button
              onClick={onExit}
              className="glass px-4 py-2 rounded-full font-mono text-sm text-white hover:bg-white/30 transition-colors"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
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
            keyFacts: orchestration.keyFacts,
            narrationScript: orchestration.narrationScript,
            subtitleLines: orchestration.subtitleLines,
            callouts: orchestration.callouts,
            sources: orchestration.sources,
          } : null}
          onSaveComplete={() => {
            setShowSaveModal(false);
          }}
        />
      </div>
    );
  }

  // Waiting for orchestration
  if (!orchestration || !splatUrl) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <p className="font-mono text-white text-glow">
          {!splatUrl ? 'Loading 3D environment...' : 'Preparing educational content...'}
        </p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50">
      <FirstPersonScene
        ref={sceneRef}
        splatUrl={splatUrl}
        colliderMeshUrl={colliderMeshUrl}
        onSceneReady={handleSceneReady}
        onScreenshotCaptured={handleScreenshotCaptured}
      />

      {/* Voice Q&A Narration */}
      <NarrationOverlay
        getScreenshot={getScreenshot}
        concept={concept}
        enabled={true}
      />

      <SubtitleOverlay
        subtitleLines={orchestration.subtitleLines}
        audioCurrentTime={audioCurrentTime}
        isPlaying={isAudioPlaying}
      />

      <EducationOverlay
        concept={orchestration.concept}
        learningObjectives={orchestration.learningObjectives}
        keyFacts={orchestration.keyFacts}
        callouts={orchestration.callouts}
        sources={orchestration.sources}
      />

      <div className="absolute top-6 right-6 flex gap-2 z-50">
        <motion.button
          onClick={() => setShowSaveModal(true)}
          className="glass px-4 py-2 rounded-full font-mono text-sm text-white hover:bg-white/30 transition-colors"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          save to library
        </motion.button>
        {onExit && (
          <motion.button
            onClick={onExit}
            className="glass px-4 py-2 rounded-full font-mono text-sm text-white hover:bg-white/30 transition-colors"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
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
          keyFacts: orchestration.keyFacts,
          narrationScript: orchestration.narrationScript,
          subtitleLines: orchestration.subtitleLines,
          callouts: orchestration.callouts,
          sources: orchestration.sources,
        } : null}
        onSaveComplete={() => {
          setShowSaveModal(false);
        }}
      />
    </div>
  );
}
