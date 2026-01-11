import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { FirstPersonScene } from './FirstPersonScene';
import { SubtitleOverlay } from './SubtitleOverlay';
import { EducationOverlay } from './EducationOverlay';
import { orchestrateConcept, type GeminiOrchestrationResponse } from '../lib/orchestrateConcept';
import { generateImageWithGemini } from '../lib/generateImage';
import { convertImageToSplat } from '../lib/generateSplat';
import { findSceneByConcept } from '../lib/sceneRegistry';

type SceneMode = 'idle' | 'listening' | 'processing' | 'loading_scene' | 'in_scene';

interface EducationalSceneProps {
  concept: string;
  onExit?: () => void;
}

export function EducationalScene({ concept, onExit }: EducationalSceneProps) {
  const [mode, setMode] = useState<SceneMode>('processing');
  const [orchestration, setOrchestration] = useState<GeminiOrchestrationResponse | null>(null);
  const [splatUrl, setSplatUrl] = useState<string>('');
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [pipelineStep, setPipelineStep] = useState<string>('Initializing...');
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Step 1: Full pipeline - Orchestrate → Generate Image → Convert to Splat → Load Scene
  useEffect(() => {
    let cancelled = false;

    async function generateAndLoadScene() {
      try {
        setMode('processing');
        console.log('🚀 [PIPELINE] Starting full pipeline for concept:', concept);
        console.log('💰 [COST] Pipeline: Deepgram → Gemini Image → Marble → SparkJS');
        
        // Step 1a: Orchestrate with Gemini (get educational content)
        setPipelineStep('Generating educational content with Gemini...');
        console.log('📚 [PIPELINE] Step 1/4: Orchestrating educational content...');
        const result = await orchestrateConcept(concept);
        
        if (cancelled) return;
        setOrchestration(result);
        console.log('✅ [PIPELINE] Step 1/4 complete: Educational content generated');
        
        // Step 1b: Check if splat exists in LOCAL library first (FREE - no API cost)
        // Only check LOCAL files (/scenes/), not external demo URLs
        console.log('🔍 [PIPELINE] Step 2/4: Checking LOCAL library for existing splat...');
        const scene = findSceneByConcept(concept);
        if (scene && scene.splatLowUrl) {
          // Only use library if it's a LOCAL file (starts with /scenes/)
          // External URLs (like demo scenes) should NOT skip generation
          const isLocalFile = scene.splatLowUrl.startsWith('/scenes/');
          
          if (isLocalFile) {
            // Check if the LOCAL splat file exists and is valid
            try {
              const checkResponse = await fetch(scene.splatLowUrl, { method: 'HEAD' });
              if (checkResponse.ok) {
                const contentType = checkResponse.headers.get('content-type');
                const contentLength = checkResponse.headers.get('content-length');
                console.log('✅ [PIPELINE] Found LOCAL splat in library (FREE):', scene.splatLowUrl);
                console.log('📦 [PIPELINE] File size:', contentLength, 'bytes, type:', contentType);
                
                // Verify it's not empty
                if (contentLength && parseInt(contentLength) < 100) {
                  console.warn('⚠️ [PIPELINE] File seems too small, may be invalid');
                  throw new Error('File too small');
                }
                
                console.log('💰 [COST] Skipping API calls - using LOCAL library splat');
                setSplatUrl(scene.splatLowUrl);
                setMode('loading_scene');
                return;
              }
            } catch (e: any) {
              console.log('⚠️ [PIPELINE] LOCAL splat not found in library or invalid:', e.message);
              console.log('💰 [COST] Will use Gemini Image + Marble APIs (costs money)');
            }
          } else {
            // External URL (demo scene) - don't use as library, generate new one
            console.log('⚠️ [PIPELINE] Scene has external URL (demo/fallback), not using as library');
            console.log('💰 [COST] Will generate new splat via Gemini Image + Marble APIs (costs money)');
          }
        }
        
        // Step 1c: Generate image with Gemini (COSTS MONEY)
        setPipelineStep('Creating image with Gemini...');
        console.log('🎨 [PIPELINE] Step 2/4: Generating image with Gemini...');
        console.log('💰 [COST] Gemini image generation API call - this will charge your account');
        const imageUrl = await generateImageWithGemini(concept);
        
        if (cancelled) return;
        console.log('✅ [PIPELINE] Step 2/4 complete: Image generated:', imageUrl);
        
        // Step 1d: Convert image to Gaussian Splat with Marble (COSTS MONEY)
        setPipelineStep('Converting to 3D Gaussian Splat with Marble...');
        console.log('🔄 [PIPELINE] Step 3/4: Converting image to 3D Gaussian Splat with Marble...');
        console.log('💰 [COST] Marble API call - this will charge your account');
        console.log('⏳ [PIPELINE] World generation takes ~5 minutes - please wait...');
        const splatUrl = await convertImageToSplat(imageUrl, concept);
        
        if (cancelled) return;
        console.log('✅ [PIPELINE] Step 3/4 complete: Splat generated:', splatUrl);
        
        // Step 1e: Load scene with SparkJS (FREE - client-side rendering)
        console.log('🎮 [PIPELINE] Step 4/4: Loading scene with SparkJS...');
        setSplatUrl(splatUrl);
        setMode('loading_scene');
        console.log('✅ [PIPELINE] All steps complete! Scene loading...');
        console.log('💰 [COST] Total API costs: Gemini Image + Marble (check your account)');
      } catch (error: any) {
        console.error('Pipeline error:', error);
        if (!cancelled) {
          setError(error?.message || 'Failed to load scene');
          // Fallback: Use pre-existing scene from registry
          const scene = findSceneByConcept(concept);
          if (scene && scene.splatLowUrl) {
            console.log('🔄 Falling back to registry scene:', scene.splatLowUrl);
            setSplatUrl(scene.splatLowUrl);
            setMode('loading_scene');
          } else {
            // Ultimate fallback: butterfly demo scene
            console.log('🔄 Using fallback demo scene');
            setSplatUrl('https://sparkjs.dev/assets/splats/butterfly.spz');
            setMode('loading_scene');
          }
          // Still try to get orchestration for educational content
          try {
            const result = await orchestrateConcept(concept);
            if (!cancelled) {
              setOrchestration(result);
            }
          } catch (orchError) {
            console.error('Orchestration fallback error:', orchError);
          }
        }
      }
    }

    generateAndLoadScene();

    return () => {
      cancelled = true;
    };
  }, [concept]);

  // Step 2: Generate and play narration (ElevenLabs)
  useEffect(() => {
    if (!orchestration || mode !== 'loading_scene') return;

    async function generateAndPlayNarration() {
      try {
        // NOTE: ElevenLabs integration needs API key
        // For now, we'll use Web Speech API as fallback
        // When ElevenLabs is available, replace with:
        // const audioUrl = await generateElevenLabsAudio(orchestration.narrationScript);
        // audioRef.current = new Audio(audioUrl);
        
        // Fallback: Use Web Speech API
        if (!orchestration) return;
        const utterance = new SpeechSynthesisUtterance(orchestration.narrationScript);
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;
        
        // Track audio time for subtitles
        const startTime = Date.now();
        const updateTime = () => {
          if (speechSynthesis.speaking) {
            const elapsed = (Date.now() - startTime) / 1000;
            setAudioCurrentTime(elapsed);
            requestAnimationFrame(updateTime);
          } else {
            setIsAudioPlaying(false);
          }
        };

        utterance.onstart = () => {
          setIsAudioPlaying(true);
          setMode('in_scene');
          updateTime();
        };

        utterance.onend = () => {
          setIsAudioPlaying(false);
        };

        speechSynthesis.speak(utterance);
      } catch (error) {
        console.error('Narration error:', error);
        setMode('in_scene');
      }
    }

    generateAndPlayNarration();

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      speechSynthesis.cancel();
    };
  }, [orchestration, mode]);

  const handleSceneReady = () => {
    // Scene is loaded, ready for narration
  };

  if (mode === 'processing') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center max-w-md"
        >
          <p className="font-mono text-white text-glow mb-4 text-xl">
            Processing "{concept}"...
          </p>
          <p className="font-mono text-sm text-white/60 mb-2">
            {pipelineStep}
          </p>
          {error && (
            <p className="text-red-400 text-xs font-mono mt-2 max-w-md text-center">
              Error: {error}
            </p>
          )}
          <div className="flex items-center justify-center gap-2 mt-4">
            <div className="w-2 h-2 bg-white/60 rounded-full animate-pulse" />
            <div className="w-2 h-2 bg-white/60 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
            <div className="w-2 h-2 bg-white/60 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
          </div>
          <p className="font-mono text-xs text-white/40 mt-6">
            Pipeline: Deepgram → Gemini Image → Marble → SparkJS
          </p>
        </motion.div>
      </div>
    );
  }

  if (mode === 'loading_scene') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <p className="font-mono text-white text-glow mb-4">
            Loading 3D environment...
          </p>
        </motion.div>
      </div>
    );
  }

  if (!orchestration || !splatUrl) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <p className="font-mono text-white text-glow">
          Error loading scene
        </p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50">
      <FirstPersonScene 
        splatUrl={splatUrl} 
        onSceneReady={handleSceneReady}
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

      {onExit && (
        <motion.button
          onClick={onExit}
          className="absolute top-6 right-6 glass px-4 py-2 rounded-full font-mono text-sm text-white hover:bg-white/30 transition-colors z-50"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          exit
        </motion.button>
      )}
    </div>
  );
}
