/**
 * TechStack component for displaying the scrolling logos
 */

import { motion } from 'framer-motion';
import {
  SiReact,
  SiTypescript,
  SiThreedotjs,
  SiVite,
  SiTailwindcss,
  SiFirebase,
  SiGoogle,
  SiMongodb,
  SiSocketdotio,
  SiVultr,
  SiVercel,
} from 'react-icons/si';
import { Sparkles, Wand2, Waves, Mic } from 'lucide-react';

const techStack = [
  { icon: SiReact, title: 'React', href: 'https://react.dev', color: '#61DAFB' },
  { icon: SiThreedotjs, title: 'Three.js', href: 'https://threejs.org', color: '#FFFFFF' },
  { icon: SiTypescript, title: 'TypeScript', href: 'https://www.typescriptlang.org', color: '#3178C6' },
  { icon: SiVite, title: 'Vite', href: 'https://vitejs.dev', color: '#646CFF' },
  { icon: SiTailwindcss, title: 'Tailwind CSS', href: 'https://tailwindcss.com', color: '#06B6D4' },
  { icon: SiFirebase, title: 'Firebase', href: 'https://firebase.google.com', color: '#FFCA28' },
  { icon: SiGoogle, title: 'Gemini AI', href: 'https://deepmind.google/technologies/gemini/', color: '#4285F4' },
  { icon: SiMongodb, title: 'MongoDB', href: 'https://www.mongodb.com', color: '#47A248' },
  { icon: SiVultr, title: 'Vultr', href: 'https://www.vultr.com', color: '#007BFC' },
  { icon: SiVercel, title: 'Vercel', href: 'https://vercel.com', color: '#FFFFFF' },
  { icon: SiSocketdotio, title: 'Socket.IO', href: 'https://socket.io', color: '#010101' },
  { icon: Wand2, title: 'World Labs', href: 'https://www.worldlabs.ai', color: '#FF6B6B' },
    {icon: Sparkles, title: 'Spark.js', href: 'https://sparkjs.dev', color: '#FFD700'},
    {icon: Waves, title: 'ElevenLabs', href: 'https://elevenlabs.io', color: '#A855F7'},
    {icon: Mic, title: 'Deepgram', href: 'https://deepgram.com', color: '#13EF95'},
  ];

export function TechStack() {
  return (
    <div className="flex flex-col items-center mb-8">
      <p className="font-mono text-xs text-white/40 text-glow mb-4" style={{ letterSpacing: '0.1em' }}>
        built with:
      </p>

      {/* Scrolling Container */}
      <div 
        className="relative w-full max-w-3xl overflow-hidden" 
        style={{ 
          height: '40px',
          maskImage: 'linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)'
        }}
      >
        {/* Scrolling Track */}
        <div className="flex gap-8 animate-scroll h-full items-center">
          {/* First set of icons */}
          {techStack.map((tech, i) => (
            <motion.a
              key={`${tech.title}-1`}
              href={tech.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/50 hover:text-white transition-all duration-300 group relative flex-shrink-0"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1 + i * 0.05, duration: 0.5 }}
              whileHover={{ scale: 1.15, y: -2 }}
              style={{
                filter: 'grayscale(1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'grayscale(0)';
                e.currentTarget.style.color = tech.color;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = 'grayscale(1)';
                e.currentTarget.style.color = '';
              }}
            >
              <tech.icon size={22} />
              {/* Tooltip */}
              <span className="absolute top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 font-mono text-[10px] text-white/80 whitespace-nowrap pointer-events-none z-20">
                {tech.title}
              </span>
            </motion.a>
          ))}
          {/* Duplicate set for seamless loop */}
          {techStack.map((tech) => (
            <a
              key={`${tech.title}-2`}
              href={tech.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/50 hover:text-white transition-all duration-300 group relative flex-shrink-0"
              style={{
                filter: 'grayscale(1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'grayscale(0)';
                e.currentTarget.style.color = tech.color;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = 'grayscale(1)';
                e.currentTarget.style.color = '';
              }}
            >
              <tech.icon size={22} />
              {/* Tooltip */}
              <span className="absolute top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 font-mono text-[10px] text-white/80 whitespace-nowrap pointer-events-none z-20">
                {tech.title}
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
