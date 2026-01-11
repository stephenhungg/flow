/**
 * TiltedCard - 3D perspective tilt effect on hover
 * Creates an immersive card experience with depth
 */

import type { SpringOptions } from 'framer-motion';
import { useRef, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

interface TiltedCardProps {
  imageSrc?: string;
  altText?: string;
  containerHeight?: React.CSSProperties['height'];
  containerWidth?: React.CSSProperties['width'];
  imageHeight?: React.CSSProperties['height'];
  imageWidth?: React.CSSProperties['width'];
  scaleOnHover?: number;
  rotateAmplitude?: number;
  showTooltip?: boolean;
  tooltipText?: string;
  overlayContent?: React.ReactNode;
  displayOverlayContent?: boolean;
  onClick?: () => void;
  className?: string;
}

const springValues: SpringOptions = {
  damping: 30,
  stiffness: 100,
  mass: 2
};

export function TiltedCard({
  imageSrc,
  altText = 'Card image',
  containerHeight = '100%',
  containerWidth = '100%',
  imageHeight = '100%',
  imageWidth = '100%',
  scaleOnHover = 1.05,
  rotateAmplitude = 12,
  showTooltip = false,
  tooltipText = '',
  overlayContent = null,
  displayOverlayContent = true,
  onClick,
  className = ''
}: TiltedCardProps) {
  const ref = useRef<HTMLElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useMotionValue(0), springValues);
  const rotateY = useSpring(useMotionValue(0), springValues);
  const scale = useSpring(1, springValues);
  const opacity = useSpring(0);
  const rotateFigcaption = useSpring(0, {
    stiffness: 350,
    damping: 30,
    mass: 1
  });

  const [lastY, setLastY] = useState(0);

  function handleMouse(e: React.MouseEvent<HTMLElement>) {
    if (!ref.current) return;

    const rect = ref.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - rect.width / 2;
    const offsetY = e.clientY - rect.top - rect.height / 2;

    const rotationX = (offsetY / (rect.height / 2)) * -rotateAmplitude;
    const rotationY = (offsetX / (rect.width / 2)) * rotateAmplitude;

    rotateX.set(rotationX);
    rotateY.set(rotationY);

    x.set(e.clientX - rect.left);
    y.set(e.clientY - rect.top);

    const velocityY = offsetY - lastY;
    rotateFigcaption.set(-velocityY * 0.6);
    setLastY(offsetY);
  }

  function handleMouseEnter() {
    scale.set(scaleOnHover);
    opacity.set(1);
  }

  function handleMouseLeave() {
    opacity.set(0);
    scale.set(1);
    rotateX.set(0);
    rotateY.set(0);
    rotateFigcaption.set(0);
  }

  return (
    <figure
      ref={ref}
      className={`relative w-full h-full [perspective:800px] flex flex-col items-center justify-center cursor-pointer ${className}`}
      style={{
        height: containerHeight,
        width: containerWidth
      }}
      onMouseMove={handleMouse}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
    >
      <motion.div
        className="relative [transform-style:preserve-3d] w-full h-full"
        style={{
          width: imageWidth,
          height: imageHeight,
          rotateX,
          rotateY,
          scale
        }}
      >
        {/* Image or placeholder */}
        {imageSrc ? (
          <motion.img
            src={imageSrc}
            alt={altText}
            className="absolute inset-0 w-full h-full object-cover rounded-xl will-change-transform [transform:translateZ(0)]"
          />
        ) : (
          <div className="absolute inset-0 w-full h-full rounded-xl bg-gradient-to-br from-blue-900/40 to-slate-900/40 flex items-center justify-center">
            <span className="font-mono text-xs text-white/20 tracking-widest uppercase">no preview</span>
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-black/90 via-black/40 to-transparent [transform:translateZ(1px)]" />

        {/* Content overlay - floats above */}
        {displayOverlayContent && overlayContent && (
          <motion.div 
            className="absolute inset-0 z-[2] will-change-transform [transform:translateZ(40px)] pointer-events-none"
          >
            {overlayContent}
          </motion.div>
        )}

        {/* Shine effect on hover */}
        <motion.div
          className="absolute inset-0 rounded-xl pointer-events-none [transform:translateZ(2px)]"
          style={{
            background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.1) 45%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.1) 55%, transparent 60%)',
            opacity
          }}
        />
      </motion.div>

      {/* Floating tooltip */}
      {showTooltip && tooltipText && (
        <motion.figcaption
          className="pointer-events-none absolute left-0 top-0 rounded-md bg-white/90 backdrop-blur-sm px-3 py-1.5 text-xs font-mono text-black/80 z-[3] hidden sm:block shadow-lg"
          style={{
            x,
            y,
            opacity,
            rotate: rotateFigcaption
          }}
        >
          {tooltipText}
        </motion.figcaption>
      )}
    </figure>
  );
}

