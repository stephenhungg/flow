import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface DecryptedTextProps {
  text: string;
  speed?: number;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}

const chars = 'abcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';

export function DecryptedText({ 
  text, 
  speed = 50, 
  delay = 0,
  className = '',
  style 
}: DecryptedTextProps) {
  const [displayText, setDisplayText] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    setIsComplete(false);
    setDisplayText('');
    
    const startTime = Date.now();
    let currentIndex = 0;
    let scrambleCount = 0;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      
      if (elapsed < delay) {
        return;
      }

      if (currentIndex < text.length) {
        // Scramble phase - reduced to 2 scrambles for speed
        if (scrambleCount < 2) {
          const scrambled = text
            .split('')
            .map((char, i) => {
              if (i < currentIndex) return text[i];
              if (i === currentIndex) return chars[Math.floor(Math.random() * chars.length)];
              return char === ' ' ? ' ' : chars[Math.floor(Math.random() * chars.length)];
            })
            .join('');
          setDisplayText(scrambled);
          scrambleCount++;
        } else {
          // Reveal phase
          const revealed = text.substring(0, currentIndex + 1);
          const scrambled = text
            .substring(currentIndex + 1)
            .split('')
            .map(char => char === ' ' ? ' ' : chars[Math.floor(Math.random() * chars.length)])
            .join('');
          setDisplayText(revealed + scrambled);
          currentIndex++;
          scrambleCount = 0;
        }
      } else {
        setDisplayText(text);
        setIsComplete(true);
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed, delay]);

  return (
    <motion.span
      className={className}
      style={style}
      animate={isComplete ? {} : {}}
    >
      {displayText || text}
    </motion.span>
  );
}

