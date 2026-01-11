import { useEffect, useRef, useState } from 'react';

interface Logo {
  node?: React.ReactNode;
  title?: string;
  href?: string;
}

interface LogoLoopProps {
  logos: Logo[];
  speed?: number;
  direction?: 'left' | 'right';
  logoHeight?: number;
  gap?: number;
  fadeOut?: boolean;
  fadeOutColor?: string;
}

export function LogoLoop({
  logos,
  speed = 30,
  direction = 'left',
  logoHeight = 32,
  gap = 60,
  fadeOut = false,
  fadeOutColor = '#000000',
}: LogoLoopProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const animationRef = useRef<number>();

  const itemWidth = logoHeight;
  const totalItemWidth = itemWidth + gap;
  const loopWidth = logos.length * totalItemWidth;

  useEffect(() => {
    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      const deltaTime = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      setOffset((prev) => {
        const newOffset = prev + (direction === 'left' ? -1 : 1) * speed * deltaTime;
        return newOffset % loopWidth;
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [speed, direction, loopWidth]);

  const duplicatedLogos = [...logos, ...logos, ...logos];

  const trackStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: `${gap}px`,
    transform: `translateX(${offset}px)`,
    willChange: 'transform',
  };

  const fadeGradient = fadeOut
    ? {
        background: `linear-gradient(to right, ${fadeOutColor}, transparent 15%, transparent 85%, ${fadeOutColor})`,
      }
    : {};

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden" style={{ background: "transparent" }}
      style={{ height: `${logoHeight}px` }}
    >
      {fadeOut && (
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={fadeGradient}
        />
      )}
      <div style={trackStyle}>
        {duplicatedLogos.map((logo, index) => {
          const item = (
            <div
              key={index}
              className="flex items-center justify-center text-white/60 hover:text-white transition-colors"
              style={{ height: `${logoHeight}px`, width: `${logoHeight}px` }}
            >
              {logo.node}
            </div>
          );

          if (logo.href) {
            return (
              <a
                key={index}
                href={logo.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                {item}
              </a>
            );
          }

          return item;
        })}
      </div>
    </div>
  );
}
