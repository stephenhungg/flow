import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, X, ExternalLink } from 'lucide-react';
import type { KeyFact, Callout, Source } from '../lib/orchestrateConcept';

interface EducationOverlayProps {
  concept: string;
  learningObjectives: string[];
  keyFacts: KeyFact[];
  callouts: Callout[];
  sources: Source[];
}

export function EducationOverlay({
  concept,
  learningObjectives,
  keyFacts,
  callouts,
  sources
}: EducationOverlayProps) {
  const [showSources, setShowSources] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  return (
    <>
      <motion.div
        className="fixed top-6 left-6 z-40 max-w-md max-h-[calc(100vh-48px)] flex flex-col"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="glass-strong rounded-lg p-4 backdrop-blur-md overflow-hidden flex flex-col">
          {!isMinimized ? (
            <>
              <div className="flex items-start justify-between mb-3 flex-shrink-0">
                <h2 className="font-display text-xl text-white text-glow pr-4">
                  {concept}
                </h2>
                <button
                  onClick={() => setIsMinimized(true)}
                  className="text-white/70 hover:text-white transition-colors flex-shrink-0"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                {/* Learning Objectives */}
                <div>
                  <h3 className="font-mono text-xs text-white/80 mb-2 uppercase tracking-wider">
                    Learning Objectives
                  </h3>
                  <ul className="space-y-1">
                    {learningObjectives.map((obj, i) => (
                      <li key={i} className="font-mono text-sm text-white flex items-start">
                        <span className="text-white/60 mr-2">•</span>
                        <span>{obj}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Key Facts */}
                <div>
                  <h3 className="font-mono text-xs text-white/80 mb-2 uppercase tracking-wider">
                    Key Facts
                  </h3>
                  <ul className="space-y-2">
                    {keyFacts.map((fact, i) => (
                      <li key={i} className="font-mono text-xs text-white/95">
                        <span>{fact.text}</span>
                        <span className="text-white/60 ml-2">— {fact.source}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Sources Button */}
                {sources.length > 0 && (
                  <button
                    onClick={() => setShowSources(true)}
                    className="w-full glass-strong rounded px-3 py-2 flex items-center justify-center gap-2 font-mono text-xs text-white hover:bg-white/20 transition-colors"
                  >
                    <BookOpen size={14} />
                    View Sources ({sources.length})
                  </button>
                )}
              </div>
            </>
          ) : (
            <button
              onClick={() => setIsMinimized(false)}
              className="text-white/60 hover:text-white transition-colors"
            >
              <BookOpen size={20} />
            </button>
          )}
        </div>
      </motion.div>

      {/* Callouts - disabled to prevent stray text overlays */}

      {/* Sources Modal */}
      <AnimatePresence>
        {showSources && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSources(false)}
          >
            <motion.div
              className="glass rounded-lg p-6 max-w-2xl max-h-[80vh] overflow-y-auto"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-xl text-white text-glow">
                  Sources
                </h3>
                <button
                  onClick={() => setShowSources(false)}
                  className="text-white/60 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <ul className="space-y-3">
                {sources.map((source, i) => (
                  <li key={i} className="font-mono text-sm">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/90 hover:text-white flex items-center gap-2 transition-colors"
                    >
                      <span>{source.label}</span>
                      <ExternalLink size={14} className="text-white/40" />
                    </a>
                  </li>
                ))}
              </ul>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
