/**
 * Library page - Browse and manage community scenes
 * Clean, minimal design with centered search
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SceneCard } from '../components/SceneCard';
import { NavBar } from '../components/NavBar';
import { useAuth } from '../contexts/AuthContext';
import { listScenes, deleteScene, getMyScenes, type Scene, type PaginatedScenes } from '../lib/api';
import { Search, Grid, User, Sparkles } from 'lucide-react';
import { CloudBackground } from '../components/CloudBackground';

type Tab = 'public' | 'my-scenes';

// Suggested search terms
const SUGGESTIONS = [
  'ancient ruins',
  'cyberpunk city',
  'underwater world',
  'space station',
  'enchanted forest',
  'mountain peaks',
  'desert oasis',
  'floating islands',
];

export function LibraryPage() {
  const { dbUser, getIdToken } = useAuth();
  const searchRef = useRef<HTMLInputElement>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Add class to body to make background transparent for cloud shader
  useEffect(() => {
    document.body.classList.add('has-cloud-bg');
    return () => {
      document.body.classList.remove('has-cloud-bg');
    };
  }, []);

  const [tab, setTab] = useState<Tab>('public');
  const [publicScenes, setPublicScenes] = useState<Scene[]>([]);
  const [myScenes, setMyScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (tab === 'public') {
      loadPublicScenes();
    }
  }, [page, tab]);

  useEffect(() => {
    if (tab === 'my-scenes' && dbUser) {
      loadMyScenes();
    }
  }, [tab, dbUser]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadPublicScenes = async () => {
    try {
      setLoading(true);
      setError(null);
      const data: PaginatedScenes = await listScenes(page, 20);
      if (page === 1) {
        setPublicScenes(data.scenes);
      } else {
        setPublicScenes(prev => [...prev, ...data.scenes]);
      }
      setHasMore(page < data.pagination.pages);
    } catch (err) {
      console.error('Failed to load scenes:', err);
      setError(err instanceof Error ? err.message : 'Failed to load scenes');
    } finally {
      setLoading(false);
    }
  };

  const loadMyScenes = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getIdToken();
      if (!token) {
        setError('Please sign in to view your scenes');
        return;
      }
      const scenes = await getMyScenes(token);
      setMyScenes(scenes);
    } catch (err) {
      console.error('Failed to load my scenes:', err);
      setError(err instanceof Error ? err.message : 'Failed to load your scenes');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (sceneId: string) => {
    try {
      const token = await getIdToken();
      if (!token) return;
      await deleteScene(token, sceneId);
      setPublicScenes(prev => prev.filter(s => s._id !== sceneId));
      setMyScenes(prev => prev.filter(s => s._id !== sceneId));
    } catch (err) {
      console.error('Failed to delete scene:', err);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setSearchQuery(suggestion);
    setShowSuggestions(false);
  };

  // Filter scenes based on search
  const scenes = (tab === 'public' ? publicScenes : myScenes).filter(scene => 
    searchQuery === '' || 
    scene.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    scene.concept.toLowerCase().includes(searchQuery.toLowerCase()) ||
    scene.creatorName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter suggestions based on input
  const filteredSuggestions = searchQuery 
    ? SUGGESTIONS.filter(s => s.toLowerCase().includes(searchQuery.toLowerCase()))
    : SUGGESTIONS;

  return (
    <div 
      className="min-h-screen text-white relative"
      style={{ background: 'transparent' }}
    >
      {/* Cloud Background */}
      <CloudBackground />

      {/* NavBar Pill */}
      <NavBar currentPage="library" />

      {/* Main Content */}
      <div className="relative z-10 min-h-screen flex flex-col pt-24">
        
        {/* Centered Search Section */}
        <div className="px-6 pt-8 pb-12">
          <motion.div 
            className="max-w-2xl mx-auto text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h1 className="text-3xl md:text-4xl font-bold mb-3 tracking-tight">
              explore worlds
            </h1>
            <p className="text-white/50 text-sm font-mono mb-8">
              {publicScenes.length} immersive environments to discover
            </p>

            {/* Large Search Bar */}
            <div className="relative" ref={searchRef}>
              <div className="relative">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                <input 
                  type="text" 
                  placeholder="search worlds, creators, concepts..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setShowSuggestions(true)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl pl-14 pr-6 py-4 text-base font-mono text-white placeholder-white/30 focus:outline-none focus:bg-white/10 focus:border-white/20 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Suggestions Dropdown */}
              <AnimatePresence>
                {showSuggestions && filteredSuggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-full left-0 right-0 mt-2 bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden z-50"
                  >
                    <div className="p-2">
                      <p className="px-3 py-2 text-[10px] font-mono text-white/40 uppercase tracking-wider">
                        {searchQuery ? 'suggestions' : 'popular searches'}
                      </p>
                      {filteredSuggestions.slice(0, 6).map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-mono text-white/70 hover:text-white hover:bg-white/10 transition-all"
                        >
                          <Sparkles size={14} className="text-white/30" />
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        {/* Tabs */}
        <div className="px-6 mb-6">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-2">
            <button
              onClick={() => { setTab('public'); setPage(1); }}
              className={`px-5 py-2.5 rounded-full text-sm font-mono transition-all flex items-center gap-2 ${
                tab === 'public' 
                  ? 'bg-white/10 text-white border border-white/20' 
                  : 'text-white/40 hover:text-white/60 border border-transparent hover:border-white/10'
              }`}
            >
              <Grid size={14} />
              all worlds
            </button>
            
            {dbUser && (
              <button
                onClick={() => setTab('my-scenes')}
                className={`px-5 py-2.5 rounded-full text-sm font-mono transition-all flex items-center gap-2 ${
                  tab === 'my-scenes' 
                    ? 'bg-white/10 text-white border border-white/20' 
                    : 'text-white/40 hover:text-white/60 border border-transparent hover:border-white/10'
                }`}
              >
                <User size={14} />
                my worlds
                <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full">
                  {myScenes.length}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 px-6 pb-20">
          <div className="max-w-7xl mx-auto">
            
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-8"
              >
                <p className="font-mono text-sm text-red-400 text-center">{error}</p>
              </motion.div>
            )}

            <AnimatePresence mode="wait">
              {loading && scenes.length === 0 ? (
                <motion.div 
                  key="loading"
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {[...Array(8)].map((_, i) => (
                    <div 
                      key={i} 
                      className="aspect-[4/3] rounded-xl bg-white/5 animate-pulse"
                      style={{ animationDelay: `${i * 100}ms` }}
                    />
                  ))}
                </motion.div>
              ) : scenes.length === 0 ? (
                <motion.div 
                  key="empty"
                  className="flex flex-col items-center justify-center py-24"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6">
                    <Grid className="w-8 h-8 text-white/20" />
                  </div>
                  <p className="font-mono text-white/40 text-sm">
                    {searchQuery ? `no results for "${searchQuery}"` : "no worlds yet"}
                  </p>
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="mt-4 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-white/50 hover:text-white hover:bg-white/10 transition-all"
                    >
                      clear search
                    </button>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="content"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {/* Results count */}
                  {searchQuery && (
                    <p className="text-center text-xs font-mono text-white/40 mb-6">
                      {scenes.length} result{scenes.length !== 1 ? 's' : ''} for "{searchQuery}"
                    </p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {scenes.map((scene, index) => (
                      <motion.div
                        key={scene._id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03, duration: 0.4 }}
                      >
                        <SceneCard
                          scene={scene}
                          onDelete={dbUser && scene.creatorId === dbUser._id ? handleDelete : undefined}
                          canDelete={!!(dbUser && scene.creatorId === dbUser._id)}
                        />
                      </motion.div>
                    ))}
                  </div>

                  {/* Load More */}
                  {tab === 'public' && hasMore && !searchQuery && (
                    <div className="flex justify-center mt-12">
                      <button
                        onClick={() => setPage(prev => prev + 1)}
                        disabled={loading}
                        className="px-6 py-2.5 rounded-full bg-white/5 border border-white/10 text-sm font-mono text-white/60 hover:text-white hover:bg-white/10 transition-all disabled:opacity-50"
                      >
                        {loading ? 'loading...' : 'load more'}
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        {/* Minimal Footer */}
        <footer className="px-6 py-6 mt-auto">
          <div className="max-w-7xl mx-auto text-center">
            <p className="font-mono text-[10px] text-white/20">
              flow © 2026
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
