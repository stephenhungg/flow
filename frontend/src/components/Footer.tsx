/**
 * Footer component for hackathon submission
 * Glassmorphism aesthetic with team credits
 */

import { motion } from 'framer-motion';
import { Github, Trophy } from 'lucide-react';

interface FooterProps {
  /** Custom animation delay for staggered entrance */
  animationDelay?: number;
}

export function Footer({ animationDelay = 0 }: FooterProps) {
  return (
    <motion.footer
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, delay: animationDelay, ease: 'easeOut' }}
      className="relative z-10"
    >
      {/* Main Footer Content - Minimal, no glass */}
      <div className="border-t border-white/10 py-8 px-6">
        <div className="max-w-6xl mx-auto space-y-4">
          {/* Hackathon Credit */}
          <div className="flex items-center justify-center gap-2">
            <Trophy className="w-3.5 h-3.5 text-white/40" />
            <p className="font-mono text-xs text-white/50 tracking-wider">
              built at <span className="text-white/70">sb hacks xii</span>
            </p>
          </div>

          {/* Team & Links - Single Line */}
          <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-mono">
            <span className="text-white/30">team:</span>
            <span className="text-white/50">Stephen Hung</span>
            <span className="text-white/20">•</span>
            <span className="text-white/50">Matthew Kim</span>
            <span className="text-white/20">•</span>
            <span className="text-white/50">Janet Phee</span>
            <span className="text-white/20">•</span>
            <span className="text-white/50">Brandon So</span>

            <span className="text-white/20 hidden md:inline">|</span>

            {/* GitHub Link */}
            <motion.a
              href="https://github.com/stephenhungg/flow"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors"
              whileHover={{ x: 2 }}
            >
              <Github className="w-3.5 h-3.5" />
              <span>source</span>
            </motion.a>
          </div>

          {/* Tagline */}
          <p className="font-mono text-xs text-white/30 text-center tracking-wide">
            voice-guided 3d exploration powered by ai
          </p>
        </div>
      </div>
    </motion.footer>
  );
}