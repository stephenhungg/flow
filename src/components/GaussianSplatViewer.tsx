import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Viewer } from '@mkkellogg/gaussian-splats-3d';

interface GaussianSplatViewerProps {
  splatUrl: string;
  onLoaded?: () => void;
}

export const GaussianSplatViewer = ({ splatUrl, onLoaded }: GaussianSplatViewerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Movement state
  const keysPressed = useRef<Set<string>>(new Set());
  const velocity = useRef(new THREE.Vector3());
  const moveSpeed = 0.15;
  const animationFrameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    let viewer: Viewer | null = null;

    console.log('Initializing viewer with splat:', splatUrl);

    // Initialize viewer with simpler config

    // Create renderer and append to container
    const renderWidth = container.clientWidth || 800;
    const renderHeight = container.clientHeight || 600;
    
    const renderer = new THREE.WebGLRenderer({
      antialias: true
    });
    renderer.setSize(renderWidth, renderHeight);
    container.appendChild(renderer.domElement);

    // Create camera
    const camera = new THREE.PerspectiveCamera(75, renderWidth / renderHeight, 0.1, 1000);
    camera.position.set(0, 0, 5);
    
    // Initialize viewer with selfDrivenMode: false
    viewer = new Viewer({
      selfDrivenMode: false,
      renderer: renderer as any,
      camera: camera as any,
      useBuiltInControls: true,
    });


    // Initialize viewer
    viewer.init().then(() => {
      console.log('Viewer initialized');

      // Load the splat scene
      return viewer!
        .addSplatScene(splatUrl, {
          progressiveLoad: true,
        })
        .then(() => {
          console.log('Splat scene loaded successfully');
          setIsLoading(false);
          viewer!.start();
          if (onLoaded) onLoaded();
        })
        .catch((err: Error) => {
          console.error('Error loading splat scene:', err);
          setError(`Failed to load 3D scene: ${err.message}`);
          setIsLoading(false);
        });
    }).catch((err: Error) => {
      console.error('Error initializing viewer:', err);
      setError(`Failed to initialize viewer: ${err.message}`);
      setIsLoading(false);
    });

    // Keyboard controls for WASD movement
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current.add(e.key.toLowerCase());
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.key.toLowerCase());
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Animation loop for WASD movement
    const animate = () => {
      if (!viewer || !viewer.camera) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      const camera = viewer.camera;
      velocity.current.set(0, 0, 0);

      // Get camera direction vectors
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0; // Keep movement horizontal
      forward.normalize();

      const right = new THREE.Vector3();
      right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

      // WASD movement
      if (keysPressed.current.has('w')) {
        velocity.current.add(forward.multiplyScalar(moveSpeed));
      }
      if (keysPressed.current.has('s')) {
        velocity.current.add(forward.multiplyScalar(-moveSpeed));
      }
      if (keysPressed.current.has('a')) {
        velocity.current.add(right.multiplyScalar(-moveSpeed));
      }
      if (keysPressed.current.has('d')) {
        velocity.current.add(right.multiplyScalar(moveSpeed));
      }

      // Space/Shift for up/down
      if (keysPressed.current.has(' ')) {
        velocity.current.y += moveSpeed;
      }
      if (keysPressed.current.has('shift')) {
        velocity.current.y -= moveSpeed;
      }

      // Apply velocity to camera position
      if (velocity.current.length() > 0) {
        camera.position.add(velocity.current);
      }

      // Update viewer
      viewer.update();
      viewer.render();

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    // Handle window resize
    const handleResize = () => {
      if (viewer && container) {
        const rect = container.getBoundingClientRect();
        viewer.setRenderDimensions(rect.width, rect.height);
      }
    };

    window.addEventListener('resize', handleResize);

    // Initial size
    setTimeout(handleResize, 100);

    // Cleanup
    return () => {
      console.log('Cleaning up viewer');
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (viewer) {
        viewer.dispose();
      }
    };
  }, [splatUrl, onLoaded]);

  return (
    <div className="relative w-full h-screen bg-black">
      <div ref={containerRef} className="w-full h-full" />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-white text-lg">Loading 3D scene...</p>
            <p className="text-white text-sm mt-2 opacity-60">This may take a moment</p>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
          <div className="text-center text-white max-w-md px-4">
            <p className="text-xl mb-4">❌ {error}</p>
            <p className="text-sm text-gray-400">Check console for details</p>
            <p className="text-xs text-gray-500 mt-4">File: {splatUrl}</p>
          </div>
        </div>
      )}

      {/* Controls hint */}
      {!isLoading && !error && (
        <div className="absolute bottom-8 left-8 bg-black bg-opacity-70 backdrop-blur-sm px-6 py-4 rounded-lg z-10">
          <p className="text-white text-sm font-mono mb-2 font-bold">Controls:</p>
          <ul className="text-white text-xs font-mono space-y-1">
            <li>WASD - Move</li>
            <li>Mouse Drag - Look around</li>
            <li>Space - Up</li>
            <li>Shift - Down</li>
            <li>Scroll - Zoom</li>
          </ul>
        </div>
      )}
    </div>
  );
};
