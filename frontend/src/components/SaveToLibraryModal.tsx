/**
 * Modal for saving a scene to the library
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { createScene } from '../lib/api';

interface SaveToLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  concept: string;
  splatUrl: string;
  onSaveComplete?: () => void;
}

export function SaveToLibraryModal({ 
  isOpen, 
  onClose, 
  concept, 
  splatUrl,
  onSaveComplete 
}: SaveToLibraryModalProps) {
  const { dbUser, getIdToken } = useAuth();
  const [title, setTitle] = useState(concept);
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!dbUser) {
      alert('You must be signed in to save scenes');
      return;
    }

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const token = await getIdToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      // Download the splat file
      const response = await fetch(splatUrl);
      if (!response.ok) {
        throw new Error('Failed to download splat file');
      }

      const blob = await response.blob();
      const file = new File([blob], `${concept}.spz`, { type: 'application/octet-stream' });

      // Create scene
      await createScene(token, {
        title: title.trim(),
        description: description.trim() || undefined,
        concept,
        tags: tags.length > 0 ? tags : undefined,
        isPublic,
        splatFile: file,
      });

      onSaveComplete?.();
      onClose();
    } catch (err) {
      console.error('Failed to save scene:', err);
      setError(err instanceof Error ? err.message : 'Failed to save scene');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  if (!dbUser) {
    return (
      <AnimatePresence>
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="glass rounded-lg p-6 max-w-md w-full mx-4"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-xl font-bold mb-4">Sign In Required</h2>
            <p className="font-mono text-sm text-white/70 mb-4">
              You must be signed in to save scenes to the library.
            </p>
            <button
              onClick={onClose}
              className="glass px-4 py-2 rounded-full font-mono text-sm text-white hover:bg-white/20 transition-colors"
            >
              Close
            </button>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.form
          className="glass rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          onSubmit={handleSubmit}
        >
          <h2 className="font-display text-xl font-bold mb-4">Save to Library</h2>

          {error && (
            <div className="mb-4 p-3 rounded bg-red-500/20 border border-red-500/50">
              <p className="font-mono text-sm text-red-400">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="block font-mono text-sm text-white/80 mb-2">
                Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full glass rounded px-4 py-2 font-mono text-sm text-white placeholder-white/40 bg-white/10 border border-white/20 focus:border-white/40 focus:outline-none"
                placeholder="Scene title"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block font-mono text-sm text-white/80 mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full glass rounded px-4 py-2 font-mono text-sm text-white placeholder-white/40 bg-white/10 border border-white/20 focus:border-white/40 focus:outline-none resize-none"
                placeholder="Optional description"
                rows={3}
              />
            </div>

            {/* Tags */}
            <div>
              <label className="block font-mono text-sm text-white/80 mb-2">
                Tags
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  className="flex-1 glass rounded px-4 py-2 font-mono text-sm text-white placeholder-white/40 bg-white/10 border border-white/20 focus:border-white/40 focus:outline-none"
                  placeholder="Add tag"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="glass px-4 py-2 rounded font-mono text-sm text-white hover:bg-white/20 transition-colors"
                >
                  Add
                </button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/10 text-white/80 font-mono text-xs"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-white"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Public/Private */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isPublic"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <label htmlFor="isPublic" className="font-mono text-sm text-white/80">
                Make public (others can see and use this scene)
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 glass px-4 py-2 rounded-full font-mono text-sm text-white hover:bg-white/20 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="flex-1 glass px-4 py-2 rounded-full font-mono text-sm text-white hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </motion.form>
      </motion.div>
    </AnimatePresence>
  );
}

