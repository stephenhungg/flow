import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Type, ArrowRight, ChevronDown, Sparkles } from 'lucide-react';
import { ShaderBackground } from '../components/ShaderBackground';
import { DecryptedText } from '../components/DecryptedText';
import { Footer } from '../components/Footer';
import { TechStack } from '../components/TechStack';
import { NavBar } from '../components/NavBar';

type InputMode = 'voice' | 'text';
type QualityMode = 'quick' | 'standard' | 'premium';

export function LandingPage() {
  const [inputMode, setInputMode] = useState<InputMode>('voice');
  const [isListening, setIsListening] = useState(false);
  const [typedText, setTypedText] = useState('');
  const [textInput, setTextInput] = useState('');
  const fullText = "ancient rome";
  const [showFullText, setShowFullText] = useState(false);
  const [isZooming, setIsZooming] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);

  // Advanced options
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [qualityMode, setQualityMode] = useState<QualityMode>('standard');

  useEffect(() => {
    if (isListening && !showFullText) {
      let i = 0;
      const typingInterval = setInterval(() => {
        setTypedText(fullText.substring(0, i));
        i++;
        if (i > fullText.length) {
          clearInterval(typingInterval);
          setShowFullText(true);
        }
      }, 100);
      return () => clearInterval(typingInterval);
    } else if (!isListening) {
      setTypedText('');
      setShowFullText(false);
    }
  }, [isListening, showFullText]);

  const handleMicClick = () => {
    if (isListening && showFullText) {
      // User clicked mic again after text is complete - submit
      const query = fullText.trim();
      console.log('Voice submitted:', query);

      // Stage 1: Start zoom animation (t=0ms)
      setIsZooming(true);

      // Stage 3: Start black overlay fade in (t=800ms)
      setTimeout(() => {
        setShowOverlay(true);
      }, 800);

      // Store quality mode
      sessionStorage.setItem('qualityMode', qualityMode);

      // Clear any stored images
      sessionStorage.removeItem('customImage');
      sessionStorage.removeItem('customImageName');

      // Stage 4: Navigate to explore page (t=2300ms)
      setTimeout(() => {
        const params = new URLSearchParams();
        params.set('q', query);
        params.set('quality', qualityMode);
        window.location.hash = `#explore?${params.toString()}`;
      }, 2300);
    } else {
      setIsListening(!isListening);
    }
  };


  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (textInput.trim()) {
      const query = textInput.trim();
      console.log('Text submitted:', query);

      // Stage 1: Start zoom animation (t=0ms)
      setIsZooming(true);

      // Stage 3: Start black overlay fade in (t=800ms)
      setTimeout(() => {
        setShowOverlay(true);
      }, 800);

      // Store quality mode
      sessionStorage.setItem('qualityMode', qualityMode);

      // Clear any stored images
      sessionStorage.removeItem('customImage');
      sessionStorage.removeItem('customImageName');

      // Stage 4: Navigate to explore page (t=2300ms)
      setTimeout(() => {
        const params = new URLSearchParams();
        params.set('q', query);
        params.set('quality', qualityMode);
        window.location.hash = `#explore?${params.toString()}`;
      }, 2300);
    }
  };

  const handleModeSwitch = (mode: InputMode) => {
    console.log('Mode switched to:', mode);
    setInputMode(mode);
    setIsListening(false);
    setTypedText('');
    setShowFullText(false);
    setTextInput('');
  };

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      {/* Shader Background - zooms in when transitioning */}
      <ShaderBackground scale={isZooming ? 8 : 1} />

      {/* Vignette */}
      <motion.div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.4) 70%, rgba(0,0,0,0.9) 100%)',
          zIndex: 1
        }}
        animate={{ opacity: isZooming ? 0 : 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />

      {/* Navigation Bar */}
      <motion.div
        animate={{ opacity: isZooming ? 0 : 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        <NavBar currentPage="home" />
      </motion.div>

      {/* Main Content - fades out when zooming */}
      <motion.div
        className="relative z-10 h-full flex flex-col items-center justify-center px-6 pb-32"
        animate={{ opacity: isZooming ? 0 : 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        {/* Tech Stack - Above Title */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.05, ease: 'easeOut' }}
          className="mb-4"
        >
          <TechStack />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="text-center max-w-3xl"
        >
          <h1
            className="font-display text-7xl md:text-9xl leading-tight text-stroke"
            style={{
              letterSpacing: '0.2em',
              textShadow: `
                0 0 20px rgba(255, 255, 255, 0.5),
                0 0 40px rgba(255, 255, 255, 0.4),
                0 0 60px rgba(255, 255, 255, 0.3),
                0 0 80px rgba(255, 255, 255, 0.2),
                0 0 100px rgba(255, 255, 255, 0.1),
                0 4px 8px rgba(0, 0, 0, 0.6),
                0 8px 16px rgba(0, 0, 0, 0.4)
              `,
              filter: 'drop-shadow(0 0 15px rgba(255, 255, 255, 0.4)) drop-shadow(0 0 30px rgba(255, 255, 255, 0.3)) drop-shadow(0 4px 8px rgba(0, 0, 0, 0.6))'
            }}
          >
            <DecryptedText text="flow" speed={80} delay={300} />
          </h1>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mt-3 text-sm md:text-base text-white/80 max-w-xl mx-auto text-glow"
            style={{ letterSpacing: '0.02em', marginTop: '0.75rem' }}
          >
            voice-guided 3d exploration.
          </motion.p>

          {/* Mode Toggle */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mt-8 flex items-center justify-center gap-3 z-20 relative"
            style={{ marginTop: '2rem' }}
          >
            <motion.button
              onClick={() => handleModeSwitch('voice')}
              className={`glass rounded-full px-5 py-2.5 text-sm font-mono transition-all duration-300 flex items-center gap-2 cursor-pointer ${
                inputMode === 'voice' 
                  ? 'glass-strong text-white border-2 border-white/60 shadow-lg' 
                  : 'text-white/70 hover:text-white hover:bg-white/20 hover:shadow-md'
              }`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Mic className={`w-4 h-4 ${inputMode === 'voice' ? 'text-white' : 'text-white/70'}`} />
              <span>voice</span>
            </motion.button>
            <motion.button
              onClick={() => handleModeSwitch('text')}
              className={`glass rounded-full px-5 py-2.5 text-sm font-mono transition-all duration-300 flex items-center gap-2 cursor-pointer ${
                inputMode === 'text' 
                  ? 'glass-strong text-white border-2 border-white/60 shadow-lg' 
                  : 'text-white/70 hover:text-white hover:bg-white/20 hover:shadow-md'
              }`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Type className={`w-4 h-4 ${inputMode === 'text' ? 'text-white' : 'text-white/70'}`} />
              <span>text</span>
            </motion.button>
          </motion.div>

          {/* Voice Input */}
          {inputMode === 'voice' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="mt-12 flex items-center justify-center gap-4"
            >
              <motion.div
                className={`relative flex items-center justify-center w-14 h-14 rounded-full cursor-pointer transition-all duration-300 ${isListening ? 'glass-strong' : 'glass hover:bg-white/20'}`}
                onClick={handleMicClick}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Mic className={`w-6 h-6 ${isListening ? 'text-black' : 'text-white'}`} />
                {isListening && (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1.5, opacity: 0 }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="absolute inset-0 rounded-full border-2 border-white"
                  />
                )}
              </motion.div>

              <div className="glass rounded-full px-6 py-3 min-w-[280px] md:min-w-[320px]">
                {isListening ? (
                  <span className="font-mono text-sm text-white/90 text-glow">
                    <span className="text-white">{typedText}</span>
                    <motion.span
                      className="inline-block w-0.5 h-4 bg-white ml-1"
                      animate={{ opacity: [0, 1, 0] }}
                      transition={{ duration: 0.8, repeat: Infinity }}
                    />
                  </span>
                ) : (
                  <span className="font-mono text-sm text-white/60">try saying "show me ancient rome"</span>
                )}
              </div>
            </motion.div>
          )}

          {/* Text Input */}
          {inputMode === 'text' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="mt-12"
            >
              <form onSubmit={handleTextSubmit} className="flex items-center justify-center">
                <div className="glass rounded-full px-6 py-3 min-w-[280px] md:min-w-[400px] flex items-center gap-3 shadow-lg">
                  <Type className="w-5 h-5 text-white/60 flex-shrink-0" />
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder='type a concept, e.g. "ancient rome"'
                    className="flex-1 bg-transparent border-none outline-none font-mono text-sm text-white placeholder-white/50 text-glow"
                    style={{ letterSpacing: '0.02em' }}
                    autoFocus
                  />
                  <motion.button
                    type="submit"
                    disabled={!textInput.trim()}
                    className={`flex-shrink-0 transition-all duration-300 ${
                      textInput.trim()
                        ? 'text-white cursor-pointer hover:text-white/80'
                        : 'text-white/30 cursor-not-allowed'
                    }`}
                    whileHover={textInput.trim() ? { scale: 1.1, x: 2 } : {}}
                    whileTap={textInput.trim() ? { scale: 0.95 } : {}}
                  >
                    <ArrowRight className="w-5 h-5" />
                  </motion.button>
                </div>
              </form>
            </motion.div>
          )}

          {/* Advanced Options Toggle - Shows for both modes */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 flex flex-col items-center relative z-30"
          >
            <motion.button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors font-mono text-xs"
              whileHover={{ scale: 1.02 }}
            >
              <Sparkles className="w-3 h-3" />
              <span>advanced options</span>
              <motion.div
                animate={{ rotate: showAdvanced ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="w-3 h-3" />
              </motion.div>
            </motion.button>

            {/* Advanced Options Panel */}
            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="mt-4 overflow-hidden w-full"
                >
                  <div className="glass rounded-xl p-5 max-w-md mx-auto space-y-6 shadow-xl">
                      {/* Quality Mode Selection */}
                      <div>
                        <p className="font-mono text-xs text-white/60 mb-3">
                          generation quality
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            {
                              mode: 'quick' as QualityMode,
                              label: 'quick',
                              desc: 'text-to-3d only',
                              cost: 'free'
                            },
                            {
                              mode: 'standard' as QualityMode,
                              label: 'standard',
                              desc: 'tight spaces',
                              cost: '$'
                            },
                            {
                              mode: 'premium' as QualityMode,
                              label: 'premium',
                              desc: 'wide vistas',
                              cost: '$$'
                            },
                          ].map(({ mode, label, desc, cost }) => (
                            <motion.button
                              key={mode}
                              type="button"
                              onClick={() => setQualityMode(mode)}
                              className={`relative rounded-lg p-3 text-left transition-all ${
                                qualityMode === mode
                                  ? 'glass-strong border-2 border-white/60'
                                  : 'glass border border-white/20 hover:border-white/40'
                              }`}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                            >
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center justify-between">
                                  <span className={`font-mono text-xs font-semibold ${
                                    qualityMode === mode ? 'text-white' : 'text-white/70'
                                  }`}>
                                    {label}
                                  </span>
                                  <span className="font-mono text-[10px] text-white/40">
                                    {cost}
                                  </span>
                                </div>
                                <span className="font-mono text-[9px] text-white/40 leading-tight">
                                  {desc}
                                </span>
                              </div>
                              {qualityMode === mode && (
                                <motion.div
                                  layoutId="quality-indicator"
                                  className="absolute -top-1 -right-1 w-3 h-3 bg-blue-400 rounded-full"
                                  style={{ boxShadow: '0 0 8px rgba(59, 130, 246, 0.6)' }}
                                />
                              )}
                            </motion.button>
                          ))}
                        </div>
                      </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </motion.div>


      {/* Black Overlay - fades in at t=800ms */}
      <AnimatePresence>
        {showOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.5 }}
            className="fixed inset-0 bg-black z-50 pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* Footer - Fixed at bottom */}
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-20"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: isZooming ? 0 : 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
      >
        <Footer />
      </motion.div>
    </div>
  );
}

