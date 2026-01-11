/**
 * TypingTagline - Rotating education-focused taglines with typing animation
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const TAGLINES = [
  'immersive 3D educational experiences.',
  'explore history in virtual worlds.',
  'learn through interactive exploration.',
  'walk through time and space.',
  'experience education like never before.',
];

interface TypingTaglineProps {
  className?: string;
  speed?: number; // typing speed in ms per character
  pauseDuration?: number; // how long to pause before deleting (ms)
  deleteSpeed?: number; // deleting speed in ms per character
}

export function TypingTagline({ 
  className = '', 
  speed = 80,
  pauseDuration = 2000,
  deleteSpeed = 40 
}: TypingTaglineProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    const currentTagline = TAGLINES[currentIndex];
    
    if (isPaused) {
      const pauseTimer = setTimeout(() => {
        setIsPaused(false);
        setIsDeleting(true);
      }, pauseDuration);
      return () => clearTimeout(pauseTimer);
    }

    if (isDeleting) {
      if (displayText === '') {
        // Move to next tagline
        setCurrentIndex((prev) => (prev + 1) % TAGLINES.length);
        setIsDeleting(false);
        return;
      }
      
      const deleteTimer = setTimeout(() => {
        setDisplayText(currentTagline.substring(0, displayText.length - 1));
      }, deleteSpeed);
      
      return () => clearTimeout(deleteTimer);
    }

    if (displayText === currentTagline) {
      // Finished typing, pause then delete
      setIsPaused(true);
      return;
    }

    const typingTimer = setTimeout(() => {
      setDisplayText(currentTagline.substring(0, displayText.length + 1));
    }, speed);

    return () => clearTimeout(typingTimer);
  }, [displayText, currentIndex, isDeleting, isPaused, speed, pauseDuration, deleteSpeed]);

  return (
    <span className={className}>
      {displayText}
      <motion.span
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.8, repeat: Infinity, repeatType: 'reverse' }}
        className="inline-block w-0.5 h-[1em] bg-current ml-1 align-middle"
      />
    </span>
  );
}

