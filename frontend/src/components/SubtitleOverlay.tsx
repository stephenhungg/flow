import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type SubtitleLine = {
  t: number;
  text: string;
};

interface SubtitleOverlayProps {
  subtitleLines: SubtitleLine[];
  audioCurrentTime: number;
  isPlaying: boolean;
}

export function SubtitleOverlay({ 
  subtitleLines, 
  audioCurrentTime, 
  isPlaying 
}: SubtitleOverlayProps) {
  const [currentSubtitle, setCurrentSubtitle] = useState<string | null>(null);

  useEffect(() => {
    if (!isPlaying || subtitleLines.length === 0) {
      setCurrentSubtitle(null);
      return;
    }

    // Find the current subtitle based on audio time
    let activeSubtitle: SubtitleLine | null = null;
    
    for (let i = 0; i < subtitleLines.length; i++) {
      const line = subtitleLines[i];
      const nextLine = subtitleLines[i + 1];
      
      if (audioCurrentTime >= line.t) {
        if (!nextLine || audioCurrentTime < nextLine.t) {
          activeSubtitle = line;
          break;
        }
      }
    }

    setCurrentSubtitle(activeSubtitle?.text || null);
  }, [audioCurrentTime, subtitleLines, isPlaying]);

  return (
    <div className="fixed bottom-24 left-0 right-0 z-50 pointer-events-none">
      <div className="flex justify-center">
        <AnimatePresence>
          {currentSubtitle && (
            <motion.div
              key={currentSubtitle}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="glass px-6 py-3 rounded-lg max-w-2xl"
            >
              <p className="font-mono text-base text-white text-center text-glow">
                {currentSubtitle}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
