import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { SplatMesh } from '@sparkjsdev/spark';

interface FirstPersonSceneProps {
  splatUrl: string;
  onSceneReady?: () => void;
}

export function FirstPersonScene({ splatUrl, onSceneReady }: FirstPersonSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const splatObjectRef = useRef<THREE.Object3D | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!mountRef.current) return;

    // Clear existing content
    mountRef.current.innerHTML = '';

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    // Camera at ~1.7m height
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 1.7, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Make canvas focusable and request pointer lock on click
    renderer.domElement.style.cursor = 'crosshair';
    renderer.domElement.tabIndex = 0;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Load Gaussian Splat with SparkJS
    async function loadSplat() {
      try {
        setIsLoading(true);
        console.log('🔄 [SPARKJS] Loading splat from:', splatUrl);
        
        // First, verify the file exists and is accessible
        if (splatUrl.startsWith('/') || splatUrl.startsWith('./')) {
          try {
            const checkResponse = await fetch(splatUrl, { method: 'HEAD' });
            if (!checkResponse.ok) {
              throw new Error(`Splat file not found: ${splatUrl} (${checkResponse.status})`);
            }
            const contentType = checkResponse.headers.get('content-type');
            console.log('✅ [SPARKJS] File exists, content-type:', contentType);
          } catch (fetchError: any) {
            console.error('❌ [SPARKJS] Failed to verify splat file:', fetchError);
            throw new Error(`Cannot access splat file: ${splatUrl}. ${fetchError.message}`);
          }
        }
        
        // Create SplatMesh from SparkJS
        console.log('🔄 [SPARKJS] Creating SplatMesh...');
        const splat = new SplatMesh({ url: splatUrl });
        
        // Position and orient the splat
        // Default orientation, can be adjusted per scene
        splat.quaternion.set(1, 0, 0, 0);
        splat.position.set(0, 0, 0);
        
        scene.add(splat);
        splatObjectRef.current = splat;
        
        console.log('✅ [SPARKJS] Splat loaded successfully');
        setIsLoading(false);
        onSceneReady?.();
      } catch (error: any) {
        console.error('❌ [SPARKJS] Error loading splat:', error);
        console.error('❌ [SPARKJS] Error details:', error.message, error.stack);
        setIsLoading(false);
        
        // Check if it's a compression/format error
        if (error.message?.includes('compressed data') || error.message?.includes('header check')) {
          console.error('❌ [SPARKJS] Invalid or corrupted splat file. The file may be corrupted or not a valid .spz file.');
        }
        
        // Fallback: Create placeholder if splat fails to load
        console.log('🔄 [SPARKJS] Creating fallback placeholder...');
        const placeholderGeometry = new THREE.BoxGeometry(10, 10, 10);
        const placeholderMaterial = new THREE.MeshStandardMaterial({ 
          color: 0x4a90e2,
          wireframe: true,
          transparent: true,
          opacity: 0.3
        });
        const placeholder = new THREE.Mesh(placeholderGeometry, placeholderMaterial);
        placeholder.position.set(0, 5, -10);
        scene.add(placeholder);
        splatObjectRef.current = placeholder;
        
        onSceneReady?.();
      }
    }

    loadSplat();

    // Animation loop - just render, movement is handled by useFirstPersonControls hook
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!mountRef.current || !cameraRef.current || !rendererRef.current) return;
      const newWidth = mountRef.current.clientWidth;
      const newHeight = mountRef.current.clientHeight;
      
      cameraRef.current.aspect = newWidth / newHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(newWidth, newHeight);
    };
    window.addEventListener('resize', handleResize);

    // Click to lock pointer on canvas
    const handleCanvasClick = () => {
      if (!renderer.domElement) return;
      if (document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock();
      }
    };
    
    renderer.domElement.addEventListener('click', handleCanvasClick);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('click', handleCanvasClick);
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      if (mountRef.current && rendererRef.current?.domElement) {
        mountRef.current.removeChild(rendererRef.current.domElement);
      }
      rendererRef.current?.dispose();
      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock();
      }
    };
  }, [splatUrl, onSceneReady]);

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className="w-full h-full" />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <p className="font-mono text-white text-glow">Loading scene...</p>
        </div>
      )}
      <div className="absolute top-4 left-4 glass px-4 py-2 rounded font-mono text-xs text-white/80">
        Click to enter • WASD to move • Mouse to look
      </div>
    </div>
  );
}
