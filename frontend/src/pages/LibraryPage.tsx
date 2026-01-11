/**
 * Library page - Browse and manage community scenes
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { SceneCard } from '../components/SceneCard';
import { AuthButton } from '../components/AuthButton';
import { useAuth } from '../contexts/AuthContext';
import { listScenes, deleteScene, type Scene, type PaginatedScenes } from '../lib/api';

export function LibraryPage() {
  const { dbUser, getIdToken } = useAuth();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    loadScenes();
  }, [page]);

  const loadScenes = async () => {
    try {
      setLoading(true);
      setError(null);
      const data: PaginatedScenes = await listScenes(page, 20);
      if (page === 1) {
        setScenes(data.scenes);
      } else {
        setScenes(prev => [...prev, ...data.scenes]);
      }
      setHasMore(page < data.pagination.pages);
    } catch (err) {
      console.error('Failed to load scenes:', err);
      setError(err instanceof Error ? err.message : 'Failed to load scenes');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (sceneId: string) => {
    try {
      const token = await getIdToken();
      if (!token) {
        alert('You must be signed in to delete scenes');
        return;
      }

      await deleteScene(token, sceneId);
      setScenes(prev => prev.filter(s => s._id !== sceneId));
    } catch (err) {
      console.error('Failed to delete scene:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete scene');
    }
  };

  const handleBack = () => {
    window.location.hash = '';
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <motion.header
        className="glass border-b border-white/10 p-4 flex items-center justify-between"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-4">
          <motion.button
            onClick={handleBack}
            className="glass px-4 py-2 rounded-full font-mono text-sm text-white hover:bg-white/20 transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            ← back
          </motion.button>
          <h1 className="font-display text-2xl font-bold">library</h1>
        </div>
        <AuthButton />
      </motion.header>

      {/* Content */}
      <main className="max-w-7xl mx-auto p-6">
        {error && (
          <div className="glass border border-red-500/50 rounded-lg p-4 mb-6">
            <p className="font-mono text-sm text-red-400">Error: {error}</p>
          </div>
        )}

        {loading && scenes.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-4">
                <div className="w-2 h-2 bg-white/60 rounded-full animate-pulse" />
                <div className="w-2 h-2 bg-white/60 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                <div className="w-2 h-2 bg-white/60 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
              </div>
              <p className="font-mono text-sm text-white/60">Loading scenes...</p>
            </div>
          </div>
        ) : scenes.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <p className="font-mono text-lg text-white/60 mb-2">No scenes yet</p>
              <p className="font-mono text-sm text-white/40">Be the first to create a scene!</p>
            </div>
          </div>
        ) : (
          <>
            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {scenes.map((scene) => (
                <SceneCard
                  key={scene._id}
                  scene={scene}
                  onDelete={dbUser && scene.creatorId === dbUser._id ? handleDelete : undefined}
                  canDelete={!!(dbUser && scene.creatorId === dbUser._id)}
                />
              ))}
            </div>

            {/* Load More */}
            {hasMore && (
              <div className="flex justify-center mt-8">
                <motion.button
                  onClick={() => setPage(prev => prev + 1)}
                  disabled={loading}
                  className="glass px-6 py-3 rounded-full font-mono text-sm text-white hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  whileHover={{ scale: loading ? 1 : 1.05 }}
                  whileTap={{ scale: loading ? 1 : 0.95 }}
                >
                  {loading ? 'Loading...' : 'Load More'}
                </motion.button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

