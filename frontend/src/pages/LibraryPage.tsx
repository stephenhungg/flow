/**
 * Library page - Browse and manage community scenes
 * Tilted 3D cards with expandable detail view
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NavBar } from '../components/NavBar';
import { useAuth } from '../contexts/AuthContext';
import { listScenes, deleteScene, getMyScenes, generateSceneDescription, generateSceneThumbnail, type Scene, type PaginatedScenes } from '../lib/api';
import { Search, Grid, User, Sparkles, X, Play, Eye, Calendar, Trash2, Upload } from 'lucide-react';
import { CloudBackground } from '../components/CloudBackground';
import { useOutsideClick } from '../hooks/useOutsideClick';
import { TiltedCard } from '../components/TiltedCard';
import { UploadSceneModal } from '../components/UploadSceneModal';
import { ThumbnailPlaceholder } from '../components/ThumbnailPlaceholder';

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
  const expandedRef = useRef<HTMLDivElement>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Expandable card state
  const [activeScene, setActiveScene] = useState<Scene | null>(null);
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [generatingThumbnails, setGeneratingThumbnails] = useState<Set<string>>(new Set());
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Add class to body for cloud shader background
  useEffect(() => {
    document.body.classList.add('has-cloud-bg');
    return () => {
      document.body.classList.remove('has-cloud-bg');
    };
  }, []);

  // Generate description when card is expanded
  useEffect(() => {
    if (activeScene && !activeScene.description && !generatingDescription) {
      generateDescription(activeScene._id);
    }
  }, [activeScene]);

  // Handle escape key and body scroll lock
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setActiveScene(null);
      }
    }

    if (activeScene) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeScene]);

  const generateDescription = async (sceneId: string) => {
    if (generatingDescription) return;
    
    try {
      setGeneratingDescription(true);
      console.log(`📝 [LIBRARY] Generating description for scene: ${sceneId}`);
      
      const description = await generateSceneDescription(sceneId);
      
      // Update active scene with new description
      if (activeScene && activeScene._id === sceneId) {
        setActiveScene({ ...activeScene, description });
      }
      
      // Update in scenes list
      setPublicScenes(prev => prev.map(s => s._id === sceneId ? { ...s, description } : s));
      setMyScenes(prev => prev.map(s => s._id === sceneId ? { ...s, description } : s));
      
      console.log(`✅ [LIBRARY] Description generated: ${description.substring(0, 50)}...`);
    } catch (err) {
      console.error('Failed to generate description:', err);
      // Don't show error to user, just silently fail
    } finally {
      setGeneratingDescription(false);
    }
  };

  const generateThumbnail = async (sceneId: string) => {
    if (generatingThumbnails.has(sceneId)) return;
    
    try {
      setGeneratingThumbnails(prev => new Set(prev).add(sceneId));
      console.log(`🎨 [LIBRARY] Generating thumbnail for scene: ${sceneId}`);
      
      const thumbnailUrl = await generateSceneThumbnail(sceneId);
      
      // Update active scene with new thumbnail
      if (activeScene && activeScene._id === sceneId) {
        setActiveScene({ ...activeScene, thumbnailUrl });
      }
      
      // Update in scenes list
      setPublicScenes(prev => prev.map(s => s._id === sceneId ? { ...s, thumbnailUrl } : s));
      setMyScenes(prev => prev.map(s => s._id === sceneId ? { ...s, thumbnailUrl } : s));
      
      console.log(`✅ [LIBRARY] Thumbnail generated`);
    } catch (err) {
      console.error('Failed to generate thumbnail:', err);
      // Don't show error to user, just silently fail
    } finally {
      setGeneratingThumbnails(prev => {
        const next = new Set(prev);
        next.delete(sceneId);
        return next;
      });
    }
  };

  // Close on outside click
  useOutsideClick(expandedRef, () => setActiveScene(null));

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
      setActiveScene(null);
    } catch (err) {
      console.error('Failed to delete scene:', err);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setSearchQuery(suggestion);
    setShowSuggestions(false);
  };

  const handleEnterWorld = (scene: Scene) => {
    window.location.hash = `#explore?q=${encodeURIComponent(scene.concept)}&sceneId=${scene._id}`;
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

  // Card overlay content
  const CardOverlay = ({ scene }: { scene: Scene }) => (
    <div className="absolute inset-0 p-4 flex flex-col justify-end pointer-events-none">
      {/* Title & info */}
      <div>
        <h3 className="text-lg font-light text-white mb-0.5 leading-tight drop-shadow-lg">
          {scene.title}
        </h3>
        <p className="text-white/70 text-xs font-mono truncate drop-shadow">
          {scene.concept}
        </p>
        
        {/* Meta row */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/20">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-white/80 drop-shadow">
              {scene.creatorName}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs font-mono text-white/60">
            <Eye size={12} />
            <span>{scene.viewCount}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div 
      className="min-h-screen text-white relative"
      style={{ background: 'transparent' }}
    >
      {/* Cloud Background */}
      <CloudBackground />
      
      {/* Enhanced gradient overlay for depth */}
      <div 
        className="fixed inset-0 pointer-events-none z-[1]"
        style={{
          background: `
            radial-gradient(ellipse at top, rgba(139, 92, 246, 0.08) 0%, transparent 50%),
            radial-gradient(ellipse at bottom, rgba(59, 130, 246, 0.06) 0%, transparent 50%),
            linear-gradient(180deg, transparent 0%, rgba(10, 11, 26, 0.3) 100%)
          `
        }}
      />

      {/* NavBar Pill */}
      <NavBar currentPage="library" />

      {/* Backdrop for expanded card */}
      <AnimatePresence>
        {activeScene && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-md h-full w-full z-40"
          />
        )}
      </AnimatePresence>

      {/* Expanded Card Modal */}
      <AnimatePresence>
        {activeScene && (
          <div className="fixed inset-0 grid place-items-center z-50 p-4">
            {/* Close button */}
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute top-6 right-6 flex items-center justify-center bg-white/10 backdrop-blur-md rounded-full h-12 w-12 border border-white/20 hover:bg-white/20 transition-colors z-50"
              onClick={() => setActiveScene(null)}
            >
              <X className="h-6 w-6 text-white" />
            </motion.button>

            <motion.div
              ref={expandedRef}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full max-w-[700px] max-h-[90vh] flex flex-col bg-black/60 backdrop-blur-2xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
            >
              {/* Image */}
              <div className="relative h-72 md:h-80">
                {activeScene.thumbnailUrl ? (
                  <img
                    src={activeScene.thumbnailUrl}
                    alt={activeScene.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ThumbnailPlaceholder concept={activeScene.concept} />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
                
                {/* Title overlay on image */}
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <h2 className="text-3xl md:text-4xl font-light text-white mb-1 drop-shadow-lg">
                    {activeScene.title}
                  </h2>
                  <p className="text-white/70 font-mono text-sm">
                    {activeScene.concept}
                  </p>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 flex-1 overflow-auto">
                {/* Action buttons */}
                <div className="flex gap-3 mb-6">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleEnterWorld(activeScene)}
                    className="flex-1 px-6 py-4 rounded-xl font-mono text-sm font-light bg-blue-500 hover:bg-blue-400 text-white transition-colors flex items-center justify-center gap-3"
                  >
                    <Play className="w-5 h-5 fill-white" />
                    Enter World
                  </motion.button>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-6 py-4 px-4 bg-white/5 rounded-xl mb-6">
                  <div className="flex items-center gap-3 text-white/80">
                    <span className="font-mono text-sm">{activeScene.creatorName}</span>
                  </div>
                  <div className="h-6 w-px bg-white/20" />
                  <div className="flex items-center gap-2 text-white/60">
                    <Eye className="w-4 h-4" />
                    <span className="font-mono text-sm">{activeScene.viewCount}</span>
                  </div>
                  <div className="h-6 w-px bg-white/20" />
                  <div className="flex items-center gap-2 text-white/60">
                    <Calendar className="w-4 h-4" />
                    <span className="font-mono text-sm">
                      {new Date(activeScene.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Tags */}
                {activeScene.tags && activeScene.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-6">
                    {activeScene.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="text-xs font-mono px-4 py-2 rounded-full bg-white/5 text-white/70 border border-white/10"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Description */}
                {generatingDescription ? (
                  <div className="mb-6 py-4">
                    <div className="flex items-center gap-3 text-white/50">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span className="font-mono text-xs">Generating description...</span>
                    </div>
                  </div>
                ) : activeScene.description ? (
                  <p className="text-white/60 text-sm leading-relaxed mb-6">
                    {activeScene.description}
                  </p>
                ) : (
                  <div className="mb-6 py-4 text-white/40 font-mono text-xs">
                    No description available
                  </div>
                )}

                {/* Delete button for owner */}
                {dbUser && activeScene.creatorId === dbUser._id && (
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${activeScene.title}"?`)) {
                        handleDelete(activeScene._id);
                      }
                    }}
                    className="flex items-center gap-2 text-red-400/70 hover:text-red-400 text-sm font-mono transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete this world
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
            <h1 className="text-3xl md:text-4xl font-light mb-3 tracking-tight">
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

        {/* Divider Line */}
        <div className="px-6 mb-8">
          <div className="max-w-7xl mx-auto">
            <div className="h-px bg-white/10" />
          </div>
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
              <>
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
                {tab === 'my-scenes' && (
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="px-5 py-2.5 rounded-full text-sm font-mono transition-all flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white border border-blue-400"
                  >
                    <Upload size={14} />
                    upload .spz
                  </button>
                )}
              </>
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
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
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

                  {/* Tilted Card Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {scenes.map((scene, index) => (
                      <motion.div
                        key={scene._id}
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05, duration: 0.5 }}
                        className="group"
                      >
                        <TiltedCard
                          imageSrc={scene.thumbnailUrl || undefined}
                          altText={scene.title}
                          containerHeight="280px"
                          containerWidth="100%"
                          imageHeight="100%"
                          imageWidth="100%"
                          scaleOnHover={1.05}
                          rotateAmplitude={10}
                          showTooltip={true}
                          tooltipText={`Enter ${scene.title}`}
                          displayOverlayContent={true}
                          overlayContent={<CardOverlay scene={scene} />}
                          placeholderContent={!scene.thumbnailUrl ? (
                            <ThumbnailPlaceholder 
                              concept={scene.concept} 
                              onGenerate={() => generateThumbnail(scene._id)}
                              isGenerating={generatingThumbnails.has(scene._id)}
                            />
                          ) : undefined}
                          onClick={() => setActiveScene(scene)}
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

      {/* Upload Modal */}
      <UploadSceneModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploadComplete={() => {
          if (tab === 'my-scenes' && dbUser) {
            loadMyScenes();
          }
        }}
      />
    </div>
  );
}
