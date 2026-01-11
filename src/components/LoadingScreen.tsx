import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import NoiseOrb from './NoiseOrb';

interface LoadingScreenProps {
  onComplete: () => void;
  minDuration?: number;
}

export function LoadingScreen({ onComplete, minDuration = 2000 }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const startTime = Date.now();

    const interval = setInterval(() => {
      const elapsedTime = Date.now() - startTime;
      const newProgress = Math.min(100, (elapsedTime / minDuration) * 100);
      setProgress(newProgress);

      if (newProgress === 100) {
        clearInterval(interval);
        // Start fade out
        setIsExiting(true);
        // Complete after fade animation
        setTimeout(() => {
          onComplete();
        }, 800); // Match fade duration
      }
    }, 50);

    return () => clearInterval(interval);
  }, [onComplete, minDuration]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: isExiting ? 0 : 1 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 flex flex-col items-center justify-center z-50"
      style={{ background: '#000000' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative"
      >
        {/* Glow behind orb */}
        <div
          className="absolute inset-0 rounded-full blur-3xl opacity-30"
          style={{
            background: 'radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)',
            transform: 'scale(1.5)',
          }}
        />
        <NoiseOrb size={256} />
      </motion.div>

      {/* Progress bar */}
      <motion.div
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: '200px', opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="w-52 h-0.5 bg-white/10 rounded-full mt-8 overflow-hidden"
      >
        <motion.div
          style={{ width: `${progress}%` }}
          className="h-full rounded-full bg-white/60"
        />
      </motion.div>
    </motion.div>
  );
}

