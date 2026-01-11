import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic } from 'lucide-react';
import { SiReact, SiTypescript, SiThreedotjs, SiGoogle, SiMongodb } from 'react-icons/si';
import { ShaderBackground } from './components/ShaderBackground';
import { LoadingScreen } from './components/LoadingScreen';
import { DecryptedText } from './components/DecryptedText';
import { EducationalScene } from './components/EducationalScene';
import { useDeepgram } from './hooks/useDeepgram';

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [commandDetected, setCommandDetected] = useState<string | null>(null);
  const [showEducationalScene, setShowEducationalScene] = useState(false);

  const {
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
  } = useDeepgram({
    onCommandDetected: (command) => {
      console.log('Command detected:', command);
      setCommandDetected(command);
      // Stop listening and launch educational scene
      stopListening();
      // Small delay for smooth transition
      setTimeout(() => {
        setShowEducationalScene(true);
      }, 500);
    },
  });

  const handleMicClick = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  if (isLoading) {
    return <LoadingScreen onComplete={() => setIsLoading(false)} minDuration={1500} />;
  }

  // Show educational scene when command is detected
  if (showEducationalScene && commandDetected) {
    return (
      <EducationalScene 
        concept={commandDetected}
        onExit={() => {
          setShowEducationalScene(false);
          setCommandDetected(null);
        }}
      />
    );
  }

  return (
    <motion.div 
      className="h-screen w-screen overflow-hidden relative"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <ShaderBackground />

      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.4) 70%, rgba(0,0,0,0.9) 100%)',
          zIndex: 1
        }}
      />

      <div className="relative z-10 h-full flex flex-col items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="text-center max-w-3xl"
        >
          <h1 
            className="font-display text-5xl md:text-7xl leading-tight text-stroke"
            style={{ letterSpacing: '0.2em' }}
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

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="mt-12 flex items-center justify-center gap-4"
          >
            <motion.div 
              className={`relative flex items-center justify-center w-14 h-14 rounded-full cursor-pointer transition-all duration-300
                ${isListening ? 'glass-strong' : 'glass hover:bg-white/20'}`}
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
                  {transcript ? (
                    <span className="text-white">{transcript}</span>
                  ) : (
                    <span className="text-white/60">listening...</span>
                  )}
                  <motion.span
                    className="inline-block w-0.5 h-4 bg-white ml-1"
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                  />
                </span>
              ) : commandDetected ? (
                <span className="font-mono text-sm text-white text-glow">
                  showing {commandDetected}...
                </span>
              ) : transcript ? (
                <span className="font-mono text-sm text-white/80 text-glow">
                  {transcript}
                </span>
              ) : (
                <span className="font-mono text-sm text-white/60">try saying "show me ancient rome"</span>
              )}
              {error && (
                <span className="font-mono text-xs text-red-400 block mt-1">{error}</span>
              )}
            </div>
          </motion.div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="absolute bottom-24 left-0 right-0 z-10 flex flex-col items-center"
      >
        <p className="font-mono text-xs text-white/40 text-glow mb-4 text-center" style={{ letterSpacing: '0.1em' }}>
          built with:
        </p>
        <div className="flex items-center gap-12">
          <motion.a href="https://react.dev" target="_blank" rel="noopener noreferrer" className="text-white/50 hover:text-white transition-colors duration-200" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.0, duration: 0.5 }} title="React"><SiReact size={28} /></motion.a>
          <motion.a href="https://threejs.org" target="_blank" rel="noopener noreferrer" className="text-white/50 hover:text-white transition-colors duration-200" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1, duration: 0.5 }} title="Three.js"><SiThreedotjs size={28} /></motion.a>
          <motion.a href="https://www.typescriptlang.org" target="_blank" rel="noopener noreferrer" className="text-white/50 hover:text-white transition-colors duration-200" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2, duration: 0.5 }} title="TypeScript"><SiTypescript size={28} /></motion.a>
          <motion.a href="https://deepmind.google/technologies/gemini/" target="_blank" rel="noopener noreferrer" className="text-white/50 hover:text-white transition-colors duration-200" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.3, duration: 0.5 }} title="Gemini"><SiGoogle size={28} /></motion.a>
          <motion.a href="https://www.mongodb.com" target="_blank" rel="noopener noreferrer" className="text-white/50 hover:text-white transition-colors duration-200" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4, duration: 0.5 }} title="MongoDB"><SiMongodb size={28} /></motion.a>
        </div>
      </motion.div>

      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 1, ease: [0.16, 1, 0.3, 1] }}
        className="absolute bottom-0 left-0 right-0 z-10 py-6 text-center"
      >
        <p className="font-mono text-xs text-white/40 text-glow" style={{ letterSpacing: '0.1em' }}>
          speak a concept. explore immersive 3d environments.
        </p>
      </motion.footer>
    </motion.div>
  );
}
