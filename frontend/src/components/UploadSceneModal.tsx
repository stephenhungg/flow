/**
 * Modal for uploading a .spz file to create a new scene
 */

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { createScene } from '../lib/api';
import { X, Upload, Tag } from 'lucide-react';

interface UploadSceneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete?: () => void;
}

export function UploadSceneModal({
  isOpen,
  onClose,
  onUploadComplete
}: UploadSceneModalProps) {
  const { dbUser, getIdToken } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [concept, setConcept] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const fileName = file.name.toLowerCase();
      if (fileName.endsWith('.spz')) {
        setSelectedFile(file);
        setError(null);
        // Auto-fill title if empty
        if (!title) {
          setTitle(file.name.replace(/\.spz$/i, ''));
        }
      } else {
        setError('Please select a .spz file');
        setSelectedFile(null);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const fileName = file.name.toLowerCase();
      if (fileName.endsWith('.spz')) {
        setSelectedFile(file);
        setError(null);
        // Auto-fill title if empty
        if (!title) {
          setTitle(file.name.replace(/\.spz$/i, ''));
        }
      } else {
        setError('Please select a .spz file');
        setSelectedFile(null);
      }
    }
  };

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
      setError('You must be signed in to upload scenes');
      return;
    }

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    if (!concept.trim()) {
      setError('Concept is required');
      return;
    }

    if (!selectedFile) {
      setError('Please select a .spz file');
      return;
    }

    try {
      setUploading(true);
      setError(null);

      const token = await getIdToken();
      if (!token) {
        throw new Error('Not authenticated - please sign in again');
      }

      await createScene(token, {
        title: title.trim(),
        concept: concept.trim(),
        description: description.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        isPublic,
        splatFile: selectedFile,
      });

      // Reset form
      setTitle('');
      setConcept('');
      setDescription('');
      setTags([]);
      setTagInput('');
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      onUploadComplete?.();
      onClose();
    } catch (err) {
      console.error('Failed to upload scene:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload scene');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (!uploading) {
      setTitle('');
      setConcept('');
      setDescription('');
      setTags([]);
      setTagInput('');
      setSelectedFile(null);
      setError(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-md z-40"
            onClick={handleClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full max-w-2xl max-h-[90vh] bg-black/60 backdrop-blur-2xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-white/10">
                <h2 className="text-2xl font-light text-white">Upload Scene</h2>
                <button
                  onClick={handleClose}
                  disabled={uploading}
                  className="flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full h-10 w-10 border border-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <X className="h-5 w-5 text-white" />
                </button>
              </div>

              {/* Content */}
              <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-6">
                {/* Error */}
                {error && (
                  <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                    <p className="font-mono text-sm text-red-400">{error}</p>
                  </div>
                )}

                {/* File Upload */}
                <div className="mb-6">
                  <label className="block text-sm font-mono text-white/70 mb-2">
                    .spz File *
                  </label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center cursor-pointer hover:border-white/30 transition-colors"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".spz,application/octet-stream"
                      onChange={handleFileSelect}
                      className="hidden"
                      disabled={uploading}
                    />
                    <Upload className="w-12 h-12 text-white/40 mx-auto mb-4" />
                    {selectedFile ? (
                      <div>
                        <p className="font-mono text-sm text-white">{selectedFile.name}</p>
                        <p className="font-mono text-xs text-white/50 mt-1">
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="font-mono text-sm text-white/60">
                          Click to select a .spz file
                        </p>
                        <p className="font-mono text-xs text-white/40 mt-1">
                          or drag and drop
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Title */}
                <div className="mb-4">
                  <label className="block text-sm font-mono text-white/70 mb-2">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={uploading}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-white/30 focus:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="Enter scene title"
                  />
                </div>

                {/* Concept */}
                <div className="mb-4">
                  <label className="block text-sm font-mono text-white/70 mb-2">
                    Concept *
                  </label>
                  <input
                    type="text"
                    value={concept}
                    onChange={(e) => setConcept(e.target.value)}
                    disabled={uploading}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-white/30 focus:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="e.g., ancient ruins, cyberpunk city"
                  />
                </div>

                {/* Description */}
                <div className="mb-4">
                  <label className="block text-sm font-mono text-white/70 mb-2">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={uploading}
                    rows={3}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-white/30 focus:bg-white/10 transition-colors resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="Optional description"
                  />
                </div>

                {/* Tags */}
                <div className="mb-4">
                  <label className="block text-sm font-mono text-white/70 mb-2 flex items-center gap-2">
                    <Tag className="w-4 h-4" />
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
                      disabled={uploading}
                      className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-white/30 focus:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      placeholder="Add a tag"
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      disabled={uploading}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white font-mono text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Add
                    </button>
                  </div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 border border-white/20 rounded-full text-xs font-mono text-white/80"
                        >
                          #{tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            disabled={uploading}
                            className="hover:text-white transition-colors disabled:opacity-50"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Public/Private */}
                <div className="mb-6 flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="isPublic"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    disabled={uploading}
                    className="w-5 h-5 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <label htmlFor="isPublic" className="font-mono text-sm text-white/70 cursor-pointer">
                    Make this scene public
                  </label>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={uploading || !selectedFile || !title.trim() || !concept.trim()}
                  className="w-full px-6 py-4 rounded-xl font-mono text-sm font-light bg-blue-500 hover:bg-blue-400 text-white transition-colors flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      Upload Scene
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

