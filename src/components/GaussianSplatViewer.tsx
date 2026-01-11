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
  const moveSpeed = 0.1;

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    // Initialize viewer
    const viewer = new Viewer({
      selfDrivenMode: false,
      renderer: {
        antialias: true,
        alpha: false,
      },
      camera: {
        fov: 75,
        near: 0.1,
        far: 1000,
        position: [0, 1.6, 5], // Eye-level height, back a bit
      },
      controls: {
        enabled: true,
        enableRotate: true,
        enablePan: false,
        enableZoom: false,
        rotateSpeed: 0.5,
        mouseRotateSpeed: 0.003,
        pointerLockMode: true, // FPS-style mouse look
      },
      useBuiltInControls: false, // We'll handle movement manually
    });

    viewerRef.current = viewer;

    // Add to DOM
    viewer.init().then(() => {
      if (container.firstChild) {
        container.removeChild(container.firstChild);
      }
      container.appendChild(viewer.rootElement);

      // Load the splat scene
      viewer
        .addSplatScene(splatUrl, {
          progressiveLoad: true,
          rotation: [0, 0, 0, 1], // Quaternion
          position: [0, 0, 0],
          scale: [1, 1, 1],
        })
        .then(() => {
          setIsLoading(false);
          viewer.start();
          if (onLoaded) onLoaded();
        })
        .catch((err: Error) => {
          console.error('Error loading splat:', err);
          setError('Failed to load 3D scene');
          setIsLoading(false);
        });
    });

    // Keyboard controls
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
      if (!viewer || !viewer.camera) return;

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

      requestAnimationFrame(animate);
    };

    animate();

    // Handle window resize
    const handleResize = () => {
      if (viewer) {
        const rect = container.getBoundingClientRect();
        viewer.setRenderDimensions(rect.width, rect.height);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    // Cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', handleResize);
      if (viewer) {
        viewer.dispose();
      }
    };
  }, [splatUrl, onLoaded]);

  return (
    <div className="relative w-full h-screen">
      <div ref={containerRef} className="w-full h-full" />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-white text-lg">Loading 3D scene...</p>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 bg-black bg-opacity-90 flex items-center justify-center">
          <div className="text-center text-white">
            <p className="text-xl mb-4">❌ {error}</p>
            <p className="text-sm text-gray-400">Check console for details</p>
          </div>
        </div>
      )}

      {/* Controls hint */}
      {!isLoading && !error && (
        <div className="absolute bottom-8 left-8 bg-black bg-opacity-60 backdrop-blur-sm px-6 py-4 rounded-lg">
          <p className="text-white text-sm font-mono mb-2">Controls:</p>
          <ul className="text-white text-xs font-mono space-y-1">
            <li>WASD - Move</li>
            <li>Mouse - Look around</li>
            <li>Space - Up</li>
            <li>Shift - Down</li>
          </ul>
        </div>
      )}
    </div>
  );
};
