/**
 * Pipeline Status Overlay
 * Glass-morphism panel showing real-time pipeline progress
 */

import { motion, AnimatePresence } from 'framer-motion';
import type { PipelineStage, PipelineMessage } from '../hooks/usePipelineSocket';

interface PipelineStatusProps {
  stage: PipelineStage;
  progress: number;
  message: string;
  details: string;
  messages: PipelineMessage[];
}

const STAGE_INFO: Record<PipelineStage, { label: string; icon: string; color: string }> = {
  idle: { label: 'Ready', icon: '⏸️', color: '#6b7280' },
  orchestrating: { label: 'Orchestrating', icon: '🧠', color: '#8b5cf6' },
  generating_image: { label: 'Generating Image', icon: '🎨', color: '#ec4899' },
  creating_world: { label: 'Creating World', icon: '🌍', color: '#0ea5e9' },
  loading_splat: { label: 'Loading Scene', icon: '✨', color: '#10b981' },
  complete: { label: 'Complete', icon: '🎉', color: '#22c55e' },
  error: { label: 'Error', icon: '❌', color: '#ef4444' },
};

export function PipelineStatus({ stage, progress, message, details, messages }: PipelineStatusProps) {
  const stageInfo = STAGE_INFO[stage] || STAGE_INFO.idle;

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 w-full max-w-lg px-4">
      {/* Main status card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="backdrop-blur-xl bg-black/40 border border-white/10 rounded-2xl p-6 shadow-2xl"
      >
        {/* Progress ring */}
        <div className="flex items-center gap-6">
          <div className="relative w-20 h-20 flex-shrink-0">
            <svg className="w-full h-full transform -rotate-90">
              {/* Background circle */}
              <circle
                cx="40"
                cy="40"
                r="36"
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="6"
              />
              {/* Progress circle */}
              <motion.circle
                cx="40"
                cy="40"
                r="36"
                fill="none"
                stroke={stageInfo.color}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={226}
                strokeDashoffset={226 - (226 * progress) / 100}
                initial={{ strokeDashoffset: 226 }}
                animate={{ strokeDashoffset: 226 - (226 * progress) / 100 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                style={{
                  filter: `drop-shadow(0 0 8px ${stageInfo.color})`,
                }}
              />
            </svg>
            {/* Percentage */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold text-white font-mono">
                {Math.round(progress)}%
              </span>
            </div>
          </div>

          {/* Status text */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{stageInfo.icon}</span>
              <h3 
                className="text-lg font-semibold truncate"
                style={{ color: stageInfo.color }}
              >
                {stageInfo.label}
              </h3>
            </div>
            <AnimatePresence mode="wait">
              <motion.p
                key={message}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="text-white/80 text-sm truncate"
              >
                {message}
              </motion.p>
            </AnimatePresence>
            {details && (
              <p className="text-white/50 text-xs mt-1 truncate font-mono">
                {details}
              </p>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 h-1.5 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ 
              background: `linear-gradient(90deg, ${stageInfo.color}, #ffffff)`,
              boxShadow: `0 0 20px ${stageInfo.color}`,
            }}
            initial={{ width: '0%' }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>

        {/* Stage indicators */}
        <div className="mt-4 flex justify-between">
          {(['orchestrating', 'generating_image', 'creating_world', 'loading_splat'] as PipelineStage[]).map((s, i) => {
            const info = STAGE_INFO[s];
            const isActive = stage === s;
            const isPast = getStageIndex(stage) > i;
            
            return (
              <div 
                key={s}
                className="flex flex-col items-center gap-1"
              >
                <motion.div
                  className="w-3 h-3 rounded-full"
                  style={{
                    backgroundColor: isPast || isActive ? info.color : 'rgba(255,255,255,0.2)',
                    boxShadow: isActive ? `0 0 12px ${info.color}` : 'none',
                  }}
                  animate={isActive ? { scale: [1, 1.3, 1] } : {}}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                />
                <span className="text-[10px] text-white/40 font-mono">
                  {info.label.split(' ')[0]}
                </span>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Live message feed */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-3 backdrop-blur-lg bg-black/20 border border-white/5 rounded-xl p-3 max-h-24 overflow-hidden"
      >
        <div className="space-y-1">
          <AnimatePresence mode="popLayout">
            {messages.slice(-4).map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 text-xs"
              >
                <span 
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: STAGE_INFO[msg.stage]?.color || '#6b7280' }}
                />
                <span className="text-white/60 truncate font-mono">
                  {msg.message}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

function getStageIndex(stage: PipelineStage): number {
  const stages: PipelineStage[] = ['orchestrating', 'generating_image', 'creating_world', 'loading_splat', 'complete'];
  return stages.indexOf(stage);
}

