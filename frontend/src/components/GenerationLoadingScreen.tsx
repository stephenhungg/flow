/**
 * Generation Loading Screen
 * WebGL light pillars + contextual AI messages
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PipelineStage } from '../hooks/usePipelineSocket';

interface GenerationLoadingScreenProps {
  stage: PipelineStage;
  progress: number;
  message: string;
  concept: string;
  onComplete?: (splatUrl: string) => void;
  splatUrl?: string | null;
  generatedImage?: string | null; // Base64 of AI-generated image
  generatedImageMime?: string | null;
  error?: string | null;
  onRetry?: () => void;
  onExit?: () => void;
}

// User-friendly error messages
function getReadableError(errorMsg: string): { title: string; detail: string; suggestion: string } {
  const msg = errorMsg.toLowerCase();
  
  if (msg.includes('api key') || msg.includes('not configured')) {
    return {
      title: 'Configuration Error',
      detail: 'Missing API credentials for world generation',
      suggestion: 'Please contact support or check your API keys'
    };
  }
  if (msg.includes('marble') || msg.includes('world generation')) {
    return {
      title: 'World Generation Failed',
      detail: 'The 3D world engine encountered an issue',
      suggestion: 'Try a simpler concept or wait a moment and retry'
    };
  }
  if (msg.includes('gemini') || msg.includes('image')) {
    return {
      title: 'Image Generation Failed',
      detail: 'Could not create the visual representation',
      suggestion: 'Try rephrasing your concept or retry'
    };
  }
  if (msg.includes('timeout')) {
    return {
      title: 'Generation Timeout',
      detail: 'The world took too long to generate',
      suggestion: 'Try a simpler scene or retry later'
    };
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return {
      title: 'Connection Error',
      detail: 'Lost connection to the generation server',
      suggestion: 'Check your internet and retry'
    };
  }
  if (msg.includes('bucket') || msg.includes('storage') || msg.includes('upload')) {
    return {
      title: 'Storage Error',
      detail: 'Could not save the generated world',
      suggestion: 'Retry saving or contact support'
    };
  }
  
  return {
    title: 'Generation Error',
    detail: errorMsg.slice(0, 100),
    suggestion: 'Please try again or use a different concept'
  };
}

export function GenerationLoadingScreen({
  stage,
  progress,
  message,
  concept,
  onComplete,
  splatUrl,
  generatedImage,
  generatedImageMime,
  error,
  onRetry,
  onExit,
}: GenerationLoadingScreenProps) {
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [glitchText, setGlitchText] = useState(concept);
  const [startTime] = useState(Date.now());
  
  // Calculate estimated time remaining based on progress
  const getEstimatedTime = () => {
    if (progress === 0) return '~2-3 minutes';
    const elapsed = (Date.now() - startTime) / 1000; // seconds
    const totalEstimate = (elapsed / progress) * 100; // total estimated seconds
    const remaining = Math.max(0, totalEstimate - elapsed);
    if (remaining < 60) return `~${Math.ceil(remaining)}s`;
    return `~${Math.ceil(remaining / 60)}m`;
  };

  // Glitch effect
  useEffect(() => {
    const chars = '░▒▓█▀▄■□';
    let interval: NodeJS.Timeout;

    if (stage !== 'complete') {
      interval = setInterval(() => {
        if (Math.random() > 0.7) {
          const glitched = concept.split('').map((char) =>
            Math.random() > 0.9 ? chars[Math.floor(Math.random() * chars.length)] : char
          ).join('');
          setGlitchText(glitched);
          setTimeout(() => setGlitchText(concept), 100);
        }
      }, 2000);
    }

    return () => clearInterval(interval);
  }, [concept, stage]);

  // Update terminal with real pipeline message
  useEffect(() => {
    if (message) {
      setTerminalLines(prev => [...prev.slice(-5), message]);
    }
  }, [message]);

  // Completion trigger
  useEffect(() => {
    if (stage === 'complete' && splatUrl && onComplete) {
      const timer = setTimeout(() => onComplete(splatUrl), 2000);
      return () => clearTimeout(timer);
    }
  }, [stage, splatUrl, onComplete]);

  const stageIndex = ['orchestrating', 'generating_image', 'creating_world', 'loading_splat', 'complete'].indexOf(stage);

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">

      {/* Radial gradient breathing animation */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at center, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0.05) 40%, transparent 70%)',
          animation: 'radialBreath 4s ease-in-out infinite',
          opacity: 0.8,
        }}
      />

      {/* Floating particles effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => {
          return (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                width: `${2 + Math.random() * 2}px`,
                height: `${2 + Math.random() * 2}px`,
                background: 'rgba(59, 130, 246, 0.3)',
                left: `${45 + Math.random() * 10}%`,
                bottom: `${Math.random() * 100}%`,
                animation: `particleRise ${10 + Math.random() * 8}s linear infinite`,
                animationDelay: `${Math.random() * 10}s`,
                boxShadow: '0 0 4px rgba(59, 130, 246, 0.4)',
              }}
            />
          );
        })}
      </div>

      {/* Subtle grid overlay */}
      <div 
        className="absolute inset-0 opacity-[0.02] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(59, 130, 246, 0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59, 130, 246, 0.3) 1px, transparent 1px)
          `,
          backgroundSize: '80px 80px',
        }}
      />

      {/* Main content */}
      <div className="relative z-10 h-full flex items-center px-6 lg:px-14">
        <div className="w-full max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-10 items-start">
            {/* Left column: text + progress + terminal */}
            <div className="flex flex-col gap-8">
              {/* Concept display */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                className="text-left space-y-3"
              >
                <motion.p 
                  className="text-white/30 text-xs uppercase tracking-[0.3em] font-mono"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  constructing reality
                </motion.p>
                <h1 
                  className="text-4xl md:text-5xl lg:text-6xl font-light text-white tracking-tight font-mono leading-tight"
                >
                  {glitchText}
                </h1>
                <p className="text-white/50 font-mono text-sm max-w-xl">
                  Sit tight while we render your immersive world. We’ll keep you posted in real time.
                </p>
              </motion.div>

              {/* Progress section */}
              <motion.div
                initial={{ opacity: 0, scaleX: 0 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ delay: 0.4, duration: 0.8 }}
                className="w-full"
              >
                {/* Progress bar */}
                <div className="h-[3px] bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ 
                      background: 'linear-gradient(90deg, #60a5fa, #c084fc)',
                      boxShadow: '0 0 20px rgba(96,165,250,0.5)',
                    }}
                    initial={{ width: '0%' }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <div className="flex flex-wrap justify-between items-center mt-3 font-mono text-xs gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-white/40">{Math.round(progress)}%</span>
                    <span className="text-white/30">•</span>
                    <span className="text-white/40">{getEstimatedTime()} remaining</span>
                  </div>
                  <span className="text-white/60">{message || 'initializing...'}</span>
                </div>
                
                {/* Stay on page warning */}
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8 }}
                  className="mt-3 text-left"
                >
                  <p className="text-yellow-400/70 text-[11px] font-mono">
                    ⚠️ Stay on this page while we generate your world.
                  </p>
                </motion.div>
              </motion.div>

              {/* Terminal */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="w-full"
              >
                <div
                  className="rounded-xl p-5 font-mono text-xs backdrop-blur-md"
                  style={{
                    background: 'rgba(0, 0, 0, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                  }}
                >
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/10">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                    <span className="text-white/40 ml-2 text-[11px]">generation_pipeline.log</span>
                    <div className="ml-auto flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-white/30 text-[10px]">live</span>
                    </div>
                  </div>
                  <div className="space-y-1.5 h-36 overflow-hidden">
                    <AnimatePresence mode="popLayout">
                      {terminalLines.map((line, i) => (
                        <motion.div
                          key={`${line}-${i}`}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0 }}
                          className="flex items-start gap-2 leading-relaxed"
                        >
                          <span className="text-blue-400/80">›</span>
                          <span className="text-white/70 flex-1">{line}</span>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-white/40">›</span>
                      <span
                        className="inline-block w-1.5 h-3.5 bg-blue-400/90"
                        style={{
                          animation: 'cursorBlink 1s step-end infinite',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Right column: preview */}
            <div className="w-full">
              <AnimatePresence>
                {generatedImage ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="relative"
                  >
                    <motion.div 
                      className="absolute -top-6 left-1/2 -translate-x-1/2 z-10"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25 }}
                    >
                      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-200/80 bg-black/60 px-3 py-1 rounded-full backdrop-blur-sm border border-blue-500/20">
                        ai generated scene
                      </span>
                    </motion.div>

                    <div 
                      className="relative rounded-2xl overflow-hidden"
                      style={{
                        boxShadow: '0 30px 90px rgba(59, 130, 246, 0.15), 0 0 60px rgba(59, 130, 246, 0.12)',
                        border: '1px solid rgba(59, 130, 246, 0.25)',
                      }}
                    >
                      <img
                        src={`data:${generatedImageMime || 'image/png'};base64,${generatedImage}`}
                        alt="Generated scene"
                        className="w-full aspect-video object-cover"
                        style={{
                          filter: stageIndex >= 2 ? 'brightness(0.78) saturate(1.15)' : 'none',
                        }}
                      />
                      
                      {/* Processing overlay when creating world */}
                      {stageIndex >= 2 && stageIndex < 4 && (
                        <motion.div 
                          className="absolute inset-0 flex items-center justify-center"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                        >
                          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/40 to-transparent" />
                          <motion.div 
                            className="relative z-10 flex flex-col items-center gap-3"
                            animate={{ y: [0, -4, 0] }}
                            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                          >
                            <div className="w-10 h-10 rounded-full border-2 border-blue-400/50 border-t-blue-400 animate-spin" />
                            <span className="font-mono text-xs text-white/85 tracking-wide">building 3d world...</span>
                          </motion.div>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-md h-full min-h-[320px] flex items-center justify-center text-white/40 font-mono text-xs"
                  >
                    generating preview...
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* Completion overlay */}
      <AnimatePresence>
        {stage === 'complete' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center"
            style={{ background: 'rgba(5, 10, 20, 0.95)' }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 20 }}
              className="text-center"
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: 100 }}
                transition={{ duration: 0.5 }}
                className="h-[2px] bg-blue-500 mx-auto mb-8"
                style={{ boxShadow: '0 0 20px rgba(59, 130, 246, 0.5)' }}
              />
              <h2 className="text-3xl font-light text-white mb-3 tracking-tight font-mono">
                world ready
              </h2>
              <p className="text-white/40 font-mono text-sm">
                entering immersive view...
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error overlay */}
      <AnimatePresence>
        {(stage === 'error' || error) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center px-6"
            style={{ background: 'rgba(5, 10, 20, 0.98)' }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: 'spring', damping: 25 }}
              className="text-center max-w-md"
            >
              {/* Error icon */}
              <div className="w-16 h-16 mx-auto mb-6 relative">
                <div 
                  className="absolute inset-0 rounded-full"
                  style={{ 
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '2px solid rgba(239, 68, 68, 0.3)'
                  }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-3xl text-red-400">
                  ×
                </span>
              </div>

              {(() => {
                const parsed = getReadableError(error || message || 'Unknown error');
                return (
                  <>
                    <h2 className="text-2xl font-light text-white mb-2 tracking-tight font-mono">
                      {parsed.title}
                    </h2>
                    <p className="text-white/60 font-mono text-sm mb-2">
                      {parsed.detail}
                    </p>
                    <p className="text-white/40 font-mono text-xs mb-8">
                      {parsed.suggestion}
                    </p>
                  </>
                );
              })()}

              <div className="flex gap-3 justify-center">
                {onRetry && (
                  <button
                    onClick={onRetry}
                    className="px-6 py-2.5 rounded-lg font-mono text-sm text-white transition-all hover:scale-105"
                    style={{
                      background: 'rgba(59, 130, 246, 0.2)',
                      border: '1px solid rgba(59, 130, 246, 0.4)',
                    }}
                  >
                    Try Again
                  </button>
                )}
                {onExit && (
                  <button
                    onClick={onExit}
                    className="px-6 py-2.5 rounded-lg font-mono text-sm text-white/60 transition-all hover:text-white hover:scale-105"
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    Go Back
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CSS Keyframes */}
      <style>{`
        @keyframes radialBreath {
          0%, 100% {
            opacity: 0.5;
            transform: scale(1);
          }
          50% {
            opacity: 0.8;
            transform: scale(1.1);
          }
        }
        @keyframes particleRise {
          0% { transform: translateY(0) translateX(0); opacity: 0; }
          10% { opacity: 0.6; }
          90% { opacity: 0.6; }
          100% { transform: translateY(-100vh) translateX(20px); opacity: 0; }
        }
        @keyframes cursorBlink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
