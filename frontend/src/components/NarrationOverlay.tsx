import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Loader2, Volume2 } from 'lucide-react';
import { useNarration, type NarrationStatus } from '../hooks/useNarration';

interface NarrationOverlayProps {
  getScreenshot: () => string | null;
  concept: string;
  enabled?: boolean;
}

const statusConfig: Record<NarrationStatus, { 
  icon: typeof Mic; 
  text: string; 
  iconClass: string;
  pulseClass: string;
}> = {
  idle: { 
    icon: Mic, 
    text: 'Press T to ask', 
    iconClass: 'text-white/50',
    pulseClass: ''
  },
  listening: { 
    icon: Mic, 
    text: 'Listening... (T to send)', 
    iconClass: 'text-red-400',
    pulseClass: 'animate-pulse'
  },
  thinking: { 
    icon: Loader2, 
    text: 'Thinking...', 
    iconClass: 'text-blue-400 animate-spin',
    pulseClass: ''
  },
  speaking: { 
    icon: Volume2, 
    text: 'Speaking...', 
    iconClass: 'text-green-400',
    pulseClass: 'animate-pulse'
  },
};

export function NarrationOverlay({ getScreenshot, concept, enabled = true }: NarrationOverlayProps) {
  const narration = useNarration({ getScreenshot, concept });
  
  // T key to toggle listening
  useEffect(() => {
    if (!enabled) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (e.code === 'KeyT' && !e.repeat) {
        e.preventDefault();
        
        if (narration.status === 'idle') {
          narration.startListening();
        } else if (narration.status === 'listening') {
          // Press T again to SEND the question
          narration.stopAndSend();
        } else if (narration.status === 'speaking') {
          narration.interrupt();
        }
      }
      
      // Escape to interrupt anything
      if (e.code === 'Escape') {
        narration.interrupt();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, narration]);
  
  const config = statusConfig[narration.status];
  const Icon = config.icon;
  
  const handleClick = () => {
    if (narration.status === 'idle') {
      narration.startListening();
    } else if (narration.status === 'listening') {
      // Click to SEND the question
      narration.stopAndSend();
    } else if (narration.status === 'speaking' || narration.status === 'thinking') {
      narration.interrupt();
    }
  };
  
  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
      {/* Status indicator button */}
      <motion.button
        onClick={handleClick}
        className={`
          relative px-6 py-3 rounded-full flex items-center gap-3 cursor-pointer
          bg-black/60 backdrop-blur-md border border-white/10
          hover:bg-black/70 hover:border-white/20 transition-colors
          ${config.pulseClass}
        `}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Listening ring effect */}
        {narration.status === 'listening' && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-red-400/50"
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: 1.2, opacity: 0 }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
        
        <Icon className={`w-5 h-5 ${config.iconClass}`} />
        
        <span className="font-mono text-sm text-white/80 max-w-[300px] truncate">
          {narration.status === 'listening' && narration.transcript 
            ? `"${narration.transcript}"`
            : config.text}
        </span>
        
        {/* Keyboard hint */}
        <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-[10px] font-mono bg-white/10 rounded text-white/40">
          T
        </kbd>
      </motion.button>
      
      {/* Response subtitle */}
      <AnimatePresence>
        {narration.response && narration.status === 'speaking' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.3 }}
            className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 w-[600px] max-w-[90vw]"
          >
            <div className="bg-black/80 backdrop-blur-md px-6 py-4 rounded-lg border border-white/10 shadow-xl">
              <p className="font-mono text-sm text-white text-center leading-relaxed">
                {narration.response}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Error display - show above the button */}
      <AnimatePresence>
        {narration.error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 max-w-[90vw]"
          >
            <div className="bg-red-500/20 backdrop-blur-md px-4 py-3 rounded-lg border border-red-500/30 shadow-xl">
              <p className="font-mono text-xs text-red-300 text-center">
                ⚠️ {narration.error}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

