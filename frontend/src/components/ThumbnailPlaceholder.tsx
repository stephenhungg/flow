/**
 * Thumbnail Placeholder - Used when a scene has no thumbnail image
 * Creates a visually appealing gradient background with the concept text
 */

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

interface ThumbnailPlaceholderProps {
  concept: string;
  className?: string;
  onGenerate?: () => void;
  isGenerating?: boolean;
}

export function ThumbnailPlaceholder({ concept, className = '', onGenerate, isGenerating = false }: ThumbnailPlaceholderProps) {
  // Generate a unique gradient based on the concept text
  const getGradientColors = (text: string) => {
    const hash = text.split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);

    const gradients = [
      'from-blue-900/60 via-purple-900/60 to-pink-900/60',
      'from-cyan-900/60 via-blue-900/60 to-indigo-900/60',
      'from-violet-900/60 via-purple-900/60 to-fuchsia-900/60',
      'from-indigo-900/60 via-blue-900/60 to-cyan-900/60',
      'from-purple-900/60 via-pink-900/60 to-rose-900/60',
      'from-teal-900/60 via-cyan-900/60 to-blue-900/60',
    ];

    return gradients[Math.abs(hash) % gradients.length];
  };

  const gradientClass = getGradientColors(concept);

  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`}>
      {/* Animated gradient background */}
      <motion.div
        className={`absolute inset-0 bg-gradient-to-br ${gradientClass}`}
        animate={{
          backgroundPosition: ['0% 0%', '100% 100%'],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          repeatType: 'reverse',
        }}
        style={{
          backgroundSize: '200% 200%',
        }}
      />

      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />

      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-white/10"
            style={{
              width: `${4 + Math.random() * 6}px`,
              height: `${4 + Math.random() * 6}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [0, -30, 0],
              x: [0, Math.random() * 20 - 10, 0],
              opacity: [0.2, 0.5, 0.2],
              scale: [1, 1.2, 1],
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      {/* Radial gradient overlay for depth */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.4) 100%)',
        }}
      />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="space-y-3"
        >
          <Sparkles className="w-8 h-8 text-white/40 mx-auto" />
          <p className="text-white/90 font-light text-lg leading-tight max-w-xs">
            {concept}
          </p>
          <p className="text-white/30 font-mono text-[10px] uppercase tracking-widest">
            ai generated world
          </p>
        </motion.div>
        {onGenerate && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onGenerate();
            }}
            disabled={isGenerating}
            className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/30 transition-all font-mono text-xs text-white/80 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isGenerating ? (
              <>
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles size={12} />
                Generate thumbnail
              </>
            )}
          </button>
        )}
      </div>

      {/* Bottom gradient for text readability */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent" />
    </div>
  );
}
