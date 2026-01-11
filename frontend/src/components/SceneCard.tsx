/**
 * Scene card component for library display
 */

import { motion } from 'framer-motion';
import type { Scene } from '../lib/api';

interface SceneCardProps {
  scene: Scene;
  onDelete?: (sceneId: string) => void;
  canDelete?: boolean;
}

export function SceneCard({ scene, onDelete, canDelete = false }: SceneCardProps) {
  const handleClick = () => {
    window.location.hash = `#explore?q=${encodeURIComponent(scene.concept)}&sceneId=${scene._id}`;
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete && confirm(`Delete "${scene.title}"?`)) {
      onDelete(scene._id);
    }
  };

  return (
    <motion.div
      className="glass rounded-lg overflow-hidden cursor-pointer hover:bg-white/10 transition-colors relative"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleClick}
    >
      {/* Thumbnail */}
      {scene.thumbnailBase64 ? (
        <div className="w-full h-48 bg-black/20 flex items-center justify-center overflow-hidden">
          <img
            src={`data:image/png;base64,${scene.thumbnailBase64}`}
            alt={scene.title}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="w-full h-48 bg-gradient-to-br from-blue-900/30 to-purple-900/30 flex items-center justify-center">
          <div className="text-white/40 font-mono text-sm">No thumbnail</div>
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        <h3 className="font-mono text-white font-semibold mb-1 truncate">{scene.title}</h3>
        {scene.description && (
          <p className="font-mono text-sm text-white/60 mb-2 line-clamp-2">{scene.description}</p>
        )}
        <div className="flex items-center gap-2 flex-wrap mb-2">
          {scene.tags.slice(0, 3).map((tag, i) => (
            <span
              key={i}
              className="font-mono text-xs px-2 py-1 bg-white/10 text-white/70 rounded"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs font-mono text-white/50">
          <span>by {scene.creatorName}</span>
          <span>{scene.viewCount} views</span>
        </div>
      </div>

      {/* Delete button (if can delete) */}
      {canDelete && onDelete && (
        <button
          onClick={handleDelete}
          className="absolute top-2 right-2 glass px-2 py-1 rounded font-mono text-xs text-red-400 hover:bg-red-500/20 transition-colors"
        >
          delete
        </button>
      )}
    </motion.div>
  );
}

