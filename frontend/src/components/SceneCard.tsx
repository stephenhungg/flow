/**
 * Scene card component for library display
 * Matches the app's blue/glass aesthetic with animated hover previews
 */

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Eye, Heart, Share2, Trash2 } from 'lucide-react';
import type { Scene } from '../lib/api';

interface SceneCardProps {
  scene: Scene;
  onDelete?: (sceneId: string) => void;
  canDelete?: boolean;
}

export function SceneCard({ scene, onDelete, canDelete = false }: SceneCardProps) {
  const [showAnimated, setShowAnimated] = useState(false);
  const [gifLoaded, setGifLoaded] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Preload animated GIF on mount for smooth transitions
  useEffect(() => {
    if (scene.animatedThumbnailUrl) {
      const img = new Image();
      img.onload = () => {
        setGifLoaded(true);
      };
      img.src = scene.animatedThumbnailUrl;
    }
  }, [scene.animatedThumbnailUrl]);

  const handleClick = () => {
    window.location.hash = `#explore?q=${encodeURIComponent(scene.concept)}&sceneId=${scene._id}`;
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete && confirm(`Delete "${scene.title}"?`)) {
      onDelete(scene._id);
    }
  };

  const handleMouseEnter = () => {
    // Start timer for delayed animation reveal
    if (scene.animatedThumbnailUrl && gifLoaded) {
      hoverTimerRef.current = setTimeout(() => {
        setShowAnimated(true);
      }, 1000); // 1 second delay
    }
  };

  const handleMouseLeave = () => {
    // Clear timer and reset to static image
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setShowAnimated(false);
  };

  // Determine which image to show
  const imageUrl = showAnimated && scene.animatedThumbnailUrl 
    ? scene.animatedThumbnailUrl 
    : scene.thumbnailUrl;

  return (
    <motion.div
      className="relative rounded-xl overflow-hidden cursor-pointer group bg-black/40 border border-white/5 hover:border-white/20 transition-all duration-300"
      whileHover={{ 
        y: -4,
        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
      }}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Thumbnail Image - Full Height Background Effect */}
      <div className="aspect-[4/3] w-full overflow-hidden relative">
        {imageUrl ? (
          <>
            <img
              src={imageUrl}
              alt={scene.title}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
              onError={(e) => {
                // Fallback if image fails to load
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            {/* Animated indicator */}
            {showAnimated && scene.animatedThumbnailUrl && (
              <div className="absolute top-3 left-3 px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm">
                <span className="text-[10px] font-mono text-white/80 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  PREVIEW
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-blue-900/40 to-slate-900/40 flex items-center justify-center">
            <div className="font-mono text-xs text-white/20 tracking-widest uppercase">no preview</div>
          </div>
        )}
        
        {/* Gradient Overlay for Text Readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />
        
        {/* Top Right Actions (Hidden until hover) */}
        <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform translate-y-2 group-hover:translate-y-0">
          <button className="p-2 rounded-full bg-white/10 backdrop-blur-md hover:bg-white/20 text-white transition-colors">
            <Heart size={14} />
          </button>
          <button className="p-2 rounded-full bg-white/10 backdrop-blur-md hover:bg-white/20 text-white transition-colors">
            <Share2 size={14} />
          </button>
          {canDelete && onDelete && (
            <button 
              onClick={handleDelete}
              className="p-2 rounded-full bg-red-500/20 backdrop-blur-md hover:bg-red-500/40 text-red-200 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Content Overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-4">
        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 h-0 group-hover:h-auto overflow-hidden">
          {scene.tags.slice(0, 2).map((tag, i) => (
            <span
              key={i}
              className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 backdrop-blur-sm text-white/80 border border-white/5"
            >
              #{tag}
            </span>
          ))}
        </div>

        {/* Title & Description */}
        <h3 className="font-display text-lg font-bold text-white mb-1 leading-tight text-shadow-sm group-hover:text-blue-200 transition-colors">
          {scene.title}
        </h3>
        
        {/* Metadata Row */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
          <div className="flex items-center gap-2">
            {/* User Avatar Placeholder */}
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-[8px] font-bold text-white">
              {scene.creatorName.charAt(0).toUpperCase()}
            </div>
            <span className="font-mono text-xs text-white/60 group-hover:text-white/90 transition-colors">
              {scene.creatorName}
            </span>
          </div>
          
          <div className="flex items-center gap-3 text-xs font-mono text-white/40">
            <div className="flex items-center gap-1 group-hover:text-blue-300 transition-colors">
              <Eye size={12} />
              <span>{scene.viewCount}</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
