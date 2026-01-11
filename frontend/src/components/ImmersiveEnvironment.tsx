import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { motion } from 'framer-motion';

interface ImmersiveEnvironmentProps {
  sceneName: string;
  onExit?: () => void;
}

export function ImmersiveEnvironment({ sceneName, onExit }: ImmersiveEnvironmentProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    animationId: number | undefined;
  } | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // Clear any existing content
    mountRef.current.innerHTML = '';

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0);
    mountRef.current.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);

    // Create a basic environment based on scene name
    // For "ancient rome" - create columns and architecture
    if (sceneName.toLowerCase().includes('rome') || sceneName.toLowerCase().includes('ancient')) {
      // Create Roman columns
      const columnGeometry = new THREE.CylinderGeometry(0.3, 0.3, 4, 16);
      const columnMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xd4a574,
        roughness: 0.7,
        metalness: 0.1
      });

      // Create multiple columns
      for (let i = 0; i < 8; i++) {
        const column = new THREE.Mesh(columnGeometry, columnMaterial);
        const angle = (i / 8) * Math.PI * 2;
        const radius = 5;
        column.position.set(
          Math.cos(angle) * radius,
          0,
          Math.sin(angle) * radius
        );
        scene.add(column);
      }

      // Add a base/floor
      const floorGeometry = new THREE.CircleGeometry(8, 32);
      const floorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x8b7355,
        roughness: 0.9
      });
      const floor = new THREE.Mesh(floorGeometry, floorMaterial);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -2;
      scene.add(floor);

      // Add some atmospheric particles
      const particleGeometry = new THREE.BufferGeometry();
      const particleCount = 500;
      const positions = new Float32Array(particleCount * 3);
      
      for (let i = 0; i < particleCount * 3; i++) {
        positions[i] = (Math.random() - 0.5) * 20;
      }
      
      particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const particleMaterial = new THREE.PointsMaterial({
        color: 0xffd700,
        size: 0.1,
        transparent: true,
        opacity: 0.6
      });
      const particles = new THREE.Points(particleGeometry, particleMaterial);
      scene.add(particles);
    } else {
      // Default environment - abstract geometric shapes
      const geometry = new THREE.BoxGeometry(2, 2, 2);
      const material = new THREE.MeshStandardMaterial({ color: 0x4a90e2 });
      const cube = new THREE.Mesh(geometry, material);
      cube.position.set(0, 0, -5);
      scene.add(cube);
    }

    // Camera position
    camera.position.set(0, 2, 8);
    camera.lookAt(0, 0, 0);

    // Animation loop
    let animationId: number | undefined = undefined;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      
      // Rotate scene slowly
      scene.rotation.y += 0.005;
      
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!mountRef.current) return;
      const newWidth = mountRef.current.clientWidth;
      const newHeight = mountRef.current.clientHeight;
      
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener('resize', handleResize);

    // Store refs for cleanup
    sceneRef.current = {
      scene,
      camera,
      renderer,
      animationId
    };

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [sceneName]);

  return (
    <motion.div
      className="fixed inset-0 z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1 }}
    >
      <div ref={mountRef} className="w-full h-full" />
      
      {/* Exit button */}
      {onExit && (
        <motion.button
          onClick={onExit}
          className="absolute bottom-6 right-6 glass px-4 py-2 rounded-full font-mono text-sm text-white hover:bg-white/30 transition-colors"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          exit
        </motion.button>
      )}

      {/* Scene name overlay */}
      <motion.div
        className="absolute bottom-24 left-0 right-0 text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <p className="font-mono text-lg text-white/80 text-glow">
          exploring: {sceneName}
        </p>
      </motion.div>
    </motion.div>
  );
}
