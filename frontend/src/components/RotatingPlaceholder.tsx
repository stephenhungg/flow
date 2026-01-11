/**
 * RotatingPlaceholder - Cycles through example inputs with upward spinning animation
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const VOICE_EXAMPLES = [
  'show me ancient rome',
  'take me to the pyramids',
  'explore a space station',
  'walk through medieval europe',
  'visit the great wall of china',
  'journey to ancient greece',
  'discover underwater worlds',
  'experience the renaissance',
];

const TEXT_EXAMPLES = [
  'ancient rome',
  'pyramids of giza',
  'space station',
  'medieval europe',
  'great wall of china',
  'ancient greece',
  'underwater world',
  'renaissance italy',
];

interface RotatingPlaceholderProps {
  mode: 'voice' | 'text';
  className?: string;
  interval?: number; // time in ms between rotations
}

export function RotatingPlaceholder({ 
  mode, 
  className = '',
  interval = 3000 
}: RotatingPlaceholderProps) {
  const examples = mode === 'voice' ? VOICE_EXAMPLES : TEXT_EXAMPLES;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [key, setKey] = useState(0); // key to force remount for animation

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % examples.length);
      setKey((prev) => prev + 1); // Force remount for fresh animation
    }, interval);

    return () => clearInterval(timer);
  }, [examples.length, interval]);

  const currentExample = examples[currentIndex];
  const prefix = mode === 'voice' ? 'try saying "' : '';

  return (
    <div className={`relative inline-block overflow-hidden ${className}`}>
      <AnimatePresence mode="wait">
        <motion.span
          key={key}
          initial={{ opacity: 0, y: 20, rotateX: 90 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          exit={{ opacity: 0, y: -20, rotateX: -90 }}
          transition={{ 
            duration: 0.5,
            ease: [0.16, 1, 0.3, 1]
          }}
          style={{ 
            perspective: 1000,
            transformStyle: 'preserve-3d',
            display: 'inline-block'
          }}
          className="font-mono text-base text-white/60 inline-block"
        >
          {prefix}
          <span className="text-white/80">{currentExample}</span>
          {mode === 'voice' ? '"' : ''}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

