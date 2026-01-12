import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { SplatMesh } from '@sparkjsdev/spark';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

interface FirstPersonSceneProps {
  splatUrl: string;
  colliderMeshUrl?: string;
  onSceneReady?: () => void;
  onScreenshotCaptured?: (screenshotDataUrl: string) => void;
}

export interface FirstPersonSceneHandle {
  captureScreenshot: () => string | null;
}

// Movement constants - Minecraft creative mode style
const MOVE_ACCELERATION = 15; // How fast you build up speed
const MOVE_MAX_SPEED = 2.0; // Maximum movement speed
const MOVE_SPRINT_MULTIPLIER = 1.8; // Sprint speed boost
const MOVE_DAMPING = 0.88; // Horizontal friction (0-1, lower = more friction)
const MOVE_VERTICAL_DAMPING = 0.85; // Vertical friction
const PLAYER_RADIUS = 0.3; // Collision radius
const GROUND_LEVEL = -0.5; // Minimum Y position (approximate ground)
const USE_GROUND_FALLBACK = true; // Enable ground collision even without collider mesh

export const FirstPersonScene = forwardRef<FirstPersonSceneHandle, FirstPersonSceneProps>(
  ({ splatUrl, colliderMeshUrl, onSceneReady, onScreenshotCaptured }, ref) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const colliderRef = useRef<THREE.Object3D | null>(null);
  const colliderMeshesRef = useRef<THREE.Mesh[]>([]);
  const raycasterRef = useRef(new THREE.Raycaster());
  const [isLoading, setIsLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  
  // Movement state
  const keysRef = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    sprint: false,
  });
  
  const velocityRef = useRef(new THREE.Vector3());
  const eulerRef = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));

  // Request pointer lock
  const requestLock = useCallback(() => {
    if (rendererRef.current?.domElement) {
      rendererRef.current.domElement.requestPointerLock();
    }
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;

    // Clear existing content
    mountRef.current.innerHTML = '';

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);
    sceneRef.current = scene;

    // Camera - start at origin, will auto-position after splat loads
    const camera = new THREE.PerspectiveCamera(70, width / height, 0.01, 1000);
    camera.position.set(0, 0, 2); // Start 2 units back from origin
    cameraRef.current = camera;

    // Renderer with better quality settings
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Make canvas focusable
    renderer.domElement.style.cursor = 'pointer';
    renderer.domElement.tabIndex = 0;

    // Subtle ambient light (splats have baked lighting but this helps)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    // Load Gaussian Splat
    async function loadSplat() {
      try {
        setIsLoading(true);
        console.log('🔄 [SPARKJS] Loading splat from:', splatUrl);
        
        // Verify file exists for local files
        if (splatUrl.startsWith('/') || splatUrl.startsWith('./')) {
          try {
            const checkResponse = await fetch(splatUrl, { method: 'HEAD' });
            if (!checkResponse.ok) {
              throw new Error(`Splat file not found: ${splatUrl}`);
            }
          } catch (fetchError: any) {
            console.error('❌ [SPARKJS] Failed to verify splat file:', fetchError);
            throw fetchError;
          }
        }
        
        // Create SplatMesh
        console.log('🔄 [SPARKJS] Creating SplatMesh...');
        const splat = new SplatMesh({ url: splatUrl });
        
        // Default positioning - splat at origin
        splat.position.set(0, 0, 0);
        // Rotate to correct orientation - Marble splats are upside down
        // Rotate 180° around X-axis to flip right-side up
        splat.rotation.set(Math.PI, 0, 0);
        
        scene.add(splat);
        
        // Wait a bit for splat to initialize, then position camera
        setTimeout(() => {
          // Position camera to view the splat nicely
          // For most splats, starting slightly back and at eye level works well
          camera.position.set(0, 0, 3);
          camera.lookAt(0, 0, 0);
        }, 500);
        
        console.log('✅ [SPARKJS] Splat loaded successfully');
        setIsLoading(false);
        onSceneReady?.();
      } catch (error: any) {
        console.error('❌ [SPARKJS] Error loading splat:', error);
        setIsLoading(false);
        
        // Fallback placeholder
        const geo = new THREE.IcosahedronGeometry(1, 1);
        const mat = new THREE.MeshBasicMaterial({ 
          color: 0x4a90e2,
          wireframe: true,
          transparent: true,
          opacity: 0.5
        });
        const placeholder = new THREE.Mesh(geo, mat);
        scene.add(placeholder);
        
        camera.position.set(0, 0, 5);
        camera.lookAt(0, 0, 0);
        
        onSceneReady?.();
      }
    }

    loadSplat();

    // Clear any previous collider meshes
    colliderMeshesRef.current = [];
    
    // Load collider mesh if provided
    async function loadCollider() {
      if (!colliderMeshUrl) {
        console.log('⚠️ [COLLIDER] No collider mesh URL provided - free movement enabled');
        return;
      }
      
      try {
        console.log('🔄 [COLLIDER] Loading collider mesh:', colliderMeshUrl);
        const loader = new GLTFLoader();
        const gltf = await loader.loadAsync(colliderMeshUrl);
        
        // Create a group to hold all collider geometry with proper rotation
        const colliderGroup = new THREE.Group();
        // Apply OpenCV to OpenGL coordinate transform (Y and Z inverted)
        // Same as splat rotation
        colliderGroup.rotation.set(Math.PI, 0, 0);
        
        // Collect ALL meshes from the GLTF
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            // Clone the mesh for collision
            const colliderMesh = child.clone();
            // Make collider visible for debugging (set to false in production)
            colliderMesh.material = new THREE.MeshBasicMaterial({ 
              visible: false, // Set to true for debugging collision geometry
              wireframe: true,
              color: 0xff0000,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0.3
            });
            // Update world matrix for proper raycasting
            colliderMesh.updateMatrixWorld(true);
            colliderMeshesRef.current.push(colliderMesh);
            colliderGroup.add(colliderMesh);
          }
        });
        
        if (colliderMeshesRef.current.length > 0) {
          scene.add(colliderGroup);
          // Force update world matrices for all children
          colliderGroup.updateMatrixWorld(true);
          colliderRef.current = colliderGroup;
          console.log(`✅ [COLLIDER] Loaded ${colliderMeshesRef.current.length} collider meshes - collision enabled`);
        } else {
          console.warn('⚠️ [COLLIDER] No meshes found in collider GLB');
        }
      } catch (error) {
        console.warn('⚠️ [COLLIDER] Failed to load collider:', error);
      }
    }
    loadCollider();

    // Pointer lock events
    const onPointerLockChange = () => {
      const locked = document.pointerLockElement === renderer.domElement;
      setIsLocked(locked);
      if (!locked) {
        // Reset movement when unlocked
        keysRef.current = {
          forward: false,
          backward: false,
          left: false,
          right: false,
          up: false,
          down: false,
          sprint: false,
        };
      }
    };
    document.addEventListener('pointerlockchange', onPointerLockChange);

    // Mouse look
    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement || !camera) return;
      
      const sensitivity = 0.002;
      const euler = eulerRef.current;
      
      euler.setFromQuaternion(camera.quaternion);
      euler.y -= event.movementX * sensitivity;
      euler.x -= event.movementY * sensitivity;
      // Clamp vertical look
      euler.x = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, euler.x));
      camera.quaternion.setFromEuler(euler);
    };
    document.addEventListener('mousemove', onMouseMove);

    // Keyboard controls
    // Debug mode toggle for seeing collider
    let debugMode = false;
    
    const onKeyDown = (event: KeyboardEvent) => {
      // Handle Escape key even when pointer is not locked (to prevent fullscreen exit)
      if (event.code === 'Escape') {
        if (document.pointerLockElement === renderer.domElement) {
          event.preventDefault();
          event.stopPropagation();
          document.exitPointerLock();
        }
        return;
      }
      
      if (document.pointerLockElement !== renderer.domElement) return;
      
      const keys = keysRef.current;
      switch (event.code) {
        case 'KeyW': case 'ArrowUp': keys.forward = true; break;
        case 'KeyS': case 'ArrowDown': keys.backward = true; break;
        case 'KeyA': case 'ArrowLeft': keys.left = true; break;
        case 'KeyD': case 'ArrowRight': keys.right = true; break;
        case 'Space': keys.up = true; break;
        case 'ShiftLeft': case 'ShiftRight': keys.sprint = true; break;
        case 'ControlLeft': case 'KeyC': keys.down = true; break;
        case 'KeyP': // Toggle debug mode
          debugMode = !debugMode;
          colliderMeshesRef.current.forEach(mesh => {
            if (mesh.material instanceof THREE.MeshBasicMaterial) {
              mesh.material.visible = debugMode;
            }
          });
          console.log(`🔧 [DEBUG] Collider visibility: ${debugMode}`);
          break;
      }
    };
    
    const onKeyUp = (event: KeyboardEvent) => {
      const keys = keysRef.current;
      switch (event.code) {
        case 'KeyW': case 'ArrowUp': keys.forward = false; break;
        case 'KeyS': case 'ArrowDown': keys.backward = false; break;
        case 'KeyA': case 'ArrowLeft': keys.left = false; break;
        case 'KeyD': case 'ArrowRight': keys.right = false; break;
        case 'Space': keys.up = false; break;
        case 'ShiftLeft': case 'ShiftRight': keys.sprint = false; break;
        case 'ControlLeft': case 'KeyC': keys.down = false; break;
      }
    };
    
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Click to lock
    const onClick = () => {
      if (document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock();
      }
    };
    renderer.domElement.addEventListener('click', onClick);

    // Sphere collision detection using multiple raycasts
    const checkSphereCollision = (
      position: THREE.Vector3, 
      movement: THREE.Vector3,
      radius: number = PLAYER_RADIUS
    ): { blocked: boolean; safePosition: THREE.Vector3 } => {
      const meshes = colliderMeshesRef.current;
      
      // No collider = no collision
      if (!colliderRef.current || meshes.length === 0) {
        return { blocked: false, safePosition: position.clone().add(movement) };
      }
      
      const raycaster = raycasterRef.current;
      const targetPos = position.clone().add(movement);
      const moveDir = movement.clone().normalize();
      const moveDist = movement.length();
      
      if (moveDist < 0.0001) {
        return { blocked: false, safePosition: targetPos };
      }
      
      // Cast rays in movement direction from multiple points (sphere approximation)
      const rayOffsets = [
        new THREE.Vector3(0, 0, 0),         // Center
        new THREE.Vector3(radius, 0, 0),     // Right
        new THREE.Vector3(-radius, 0, 0),    // Left
        new THREE.Vector3(0, radius * 0.8, 0),     // Top (slightly smaller to avoid ceiling clips)
        new THREE.Vector3(0, -radius * 0.8, 0),    // Bottom
        new THREE.Vector3(0, 0, radius),     // Front
        new THREE.Vector3(0, 0, -radius),    // Back
        new THREE.Vector3(radius * 0.7, radius * 0.5, 0),   // Diagonal top-right
        new THREE.Vector3(-radius * 0.7, radius * 0.5, 0),  // Diagonal top-left
        new THREE.Vector3(radius * 0.7, -radius * 0.5, 0),  // Diagonal bottom-right
        new THREE.Vector3(-radius * 0.7, -radius * 0.5, 0), // Diagonal bottom-left
      ];
      
      let nearestHitDist = Infinity;
      
      for (const offset of rayOffsets) {
        const rayOrigin = position.clone().add(offset);
        raycaster.set(rayOrigin, moveDir);
        raycaster.far = moveDist + radius;
        
        // Raycast against the collider GROUP (which contains all meshes)
        const intersects = raycaster.intersectObject(colliderRef.current, true);
        
        if (intersects.length > 0) {
          const hitDist = intersects[0].distance - radius * 0.5; // Buffer
          if (hitDist < nearestHitDist) {
            nearestHitDist = hitDist;
          }
        }
      }
      
      // If we hit something
      if (nearestHitDist < moveDist) {
        if (nearestHitDist > 0.01) {
          // Move partway to the wall
          const safeMovement = moveDir.clone().multiplyScalar(Math.max(0, nearestHitDist - 0.05));
          return { 
            blocked: true, 
            safePosition: position.clone().add(safeMovement) 
          };
        } else {
          // Too close, don't move at all
          return { blocked: true, safePosition: position.clone() };
        }
      }
      
      return { blocked: false, safePosition: targetPos };
    };

    // Animation loop with momentum-based movement (Minecraft creative style)
    let lastTime = performance.now();
    let animationId: number;
    
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      
      const now = performance.now();
      const delta = Math.min((now - lastTime) / 1000, 0.1); // Cap delta to prevent huge jumps
      lastTime = now;
      
      // Movement (only when locked)
      if (document.pointerLockElement === renderer.domElement && camera) {
        const keys = keysRef.current;
        const velocity = velocityRef.current;
        
        // Get movement direction vectors (horizontal only for WASD)
        const forward = new THREE.Vector3();
        const right = new THREE.Vector3();
        
        camera.getWorldDirection(forward);
        forward.y = 0; // Keep horizontal
        forward.normalize();
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
        
        // Calculate target acceleration based on input
        const inputDir = new THREE.Vector3();
        if (keys.forward) inputDir.add(forward);
        if (keys.backward) inputDir.sub(forward);
        if (keys.left) inputDir.sub(right);
        if (keys.right) inputDir.add(right);
        
        // Normalize diagonal movement
        if (inputDir.length() > 0) {
          inputDir.normalize();
        }
        
        // Calculate max speed (with sprint)
        const maxSpeed = keys.sprint ? MOVE_MAX_SPEED * MOVE_SPRINT_MULTIPLIER : MOVE_MAX_SPEED;
        
        // Apply acceleration (momentum buildup)
        const accel = MOVE_ACCELERATION * delta;
        velocity.x += inputDir.x * accel;
        velocity.z += inputDir.z * accel;
        
        // Vertical movement (up/down)
        if (keys.up) velocity.y += accel * 0.8;
        if (keys.down) velocity.y -= accel * 0.8;
        
        // Clamp horizontal speed to max
        const horizontalVel = new THREE.Vector2(velocity.x, velocity.z);
        if (horizontalVel.length() > maxSpeed) {
          horizontalVel.normalize().multiplyScalar(maxSpeed);
          velocity.x = horizontalVel.x;
          velocity.z = horizontalVel.y;
        }
        
        // Clamp vertical speed
        velocity.y = Math.max(-maxSpeed * 0.6, Math.min(maxSpeed * 0.6, velocity.y));
        
        // Apply damping (friction) - different for horizontal vs vertical
        velocity.x *= MOVE_DAMPING;
        velocity.z *= MOVE_DAMPING;
        velocity.y *= MOVE_VERTICAL_DAMPING;
        
        // Stop tiny movements
        if (Math.abs(velocity.x) < 0.001) velocity.x = 0;
        if (Math.abs(velocity.y) < 0.001) velocity.y = 0;
        if (Math.abs(velocity.z) < 0.001) velocity.z = 0;
        
        // Calculate movement
        const movement = velocity.clone().multiplyScalar(delta);
        
        // Use sphere collision if colliders exist
        if (colliderRef.current && colliderMeshesRef.current.length > 0) {
          // Check horizontal movement (X + Z combined)
          const horizontalMovement = new THREE.Vector3(movement.x, 0, movement.z);
          if (horizontalMovement.length() > 0.0001) {
            const { blocked, safePosition } = checkSphereCollision(
              camera.position, 
              horizontalMovement
            );
            if (blocked) {
              // Try sliding along walls - check X and Z separately
              const xMove = new THREE.Vector3(movement.x, 0, 0);
              const zMove = new THREE.Vector3(0, 0, movement.z);
              
              const xResult = checkSphereCollision(camera.position, xMove);
              const zResult = checkSphereCollision(camera.position, zMove);
              
              // Apply whichever axes are free
              if (!xResult.blocked) {
                camera.position.x = xResult.safePosition.x;
              } else {
                velocity.x *= -0.1; // Small bounce
              }
              if (!zResult.blocked) {
                camera.position.z = zResult.safePosition.z;
              } else {
                velocity.z *= -0.1; // Small bounce
              }
            } else {
              camera.position.x = safePosition.x;
              camera.position.z = safePosition.z;
            }
          }
          
          // Check vertical movement (Y) separately
          if (Math.abs(movement.y) > 0.0001) {
            const verticalMovement = new THREE.Vector3(0, movement.y, 0);
            const { blocked, safePosition } = checkSphereCollision(
              camera.position, 
              verticalMovement
            );
            if (blocked) {
              velocity.y = 0;
              // Still allow position to move to safe point (just above floor)
              camera.position.y = safePosition.y;
            } else {
              camera.position.y = safePosition.y;
            }
          }
        } else {
          // No collider - free movement with ground fallback
          camera.position.add(movement);
          
          // Fallback ground collision (prevents falling through floor)
          if (USE_GROUND_FALLBACK && camera.position.y < GROUND_LEVEL) {
            camera.position.y = GROUND_LEVEL;
            velocity.y = 0;
          }
        }
        
        // Always enforce ground level as safety net (even with colliders)
        if (USE_GROUND_FALLBACK && camera.position.y < GROUND_LEVEL - 5) {
          // Teleport back if fell way too far
          console.warn('⚠️ [COLLISION] Player fell too far, resetting position');
          camera.position.y = GROUND_LEVEL + 1;
          velocity.set(0, 0, 0);
        }
      }
      
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      if (!mountRef.current || !camera || !renderer) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      cancelAnimationFrame(animationId);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      renderer.domElement.removeEventListener('click', onClick);
      window.removeEventListener('resize', handleResize);
      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock();
      }
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [splatUrl, onSceneReady]);

  // Screenshot capture function
  const captureScreenshot = useCallback((): string | null => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) {
      console.warn('⚠️ [SCREENSHOT] Cannot capture - scene not ready');
      return null;
    }

    try {
      console.log('📸 [SCREENSHOT] Capturing screenshot...');

      // Render one frame to ensure latest state
      rendererRef.current.render(sceneRef.current, cameraRef.current);

      // Get canvas data as base64 PNG
      const dataUrl = rendererRef.current.domElement.toDataURL('image/png', 0.9);

      console.log('✅ [SCREENSHOT] Screenshot captured successfully');
      return dataUrl;
    } catch (error) {
      console.error('❌ [SCREENSHOT] Failed to capture screenshot:', error);
      return null;
    }
  }, []);

  // Expose captureScreenshot method via ref
  useImperativeHandle(ref, () => ({
    captureScreenshot
  }), [captureScreenshot]);

  // Auto-capture screenshot 2 seconds after scene loads
  useEffect(() => {
    if (!isLoading && onScreenshotCaptured) {
      const timer = setTimeout(() => {
        const screenshot = captureScreenshot();
        if (screenshot) {
          console.log('📸 [SCREENSHOT] Auto-captured thumbnail on load');
          onScreenshotCaptured(screenshot);
        }
      }, 2000); // Wait 2 seconds for scene to stabilize

      return () => clearTimeout(timer);
    }
  }, [isLoading, captureScreenshot, onScreenshotCaptured]);

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className="w-full h-full" />
      
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="w-2 h-2 bg-white/60 rounded-full animate-pulse" />
              <div className="w-2 h-2 bg-white/60 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
              <div className="w-2 h-2 bg-white/60 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>
            <p className="font-mono text-white text-sm">loading 3d scene...</p>
          </div>
        </div>
      )}
      
      {/* Controls hint */}
      <div 
        className={`absolute bottom-6 right-6 glass px-4 py-3 rounded-lg font-mono text-xs transition-opacity duration-300 ${isLocked ? 'opacity-30 hover:opacity-80' : 'opacity-100'}`}
      >
        <div className="text-white/90 mb-2 font-medium">
          {isLocked ? '🎮 controls active' : '👆 click to enter'}
        </div>
        <div className="text-white/60 space-y-1">
          <div>wasd — move (hold for momentum)</div>
          <div>mouse — look around</div>
          <div>space/ctrl — fly up/down</div>
          <div>shift — sprint faster</div>
          <div>p — debug collider</div>
          <div>esc — release cursor</div>
        </div>
      </div>
      
      {/* Lock prompt when not locked */}
      {!isLocked && !isLoading && (
        <div 
          className="absolute inset-0 flex items-center justify-center cursor-pointer"
          onClick={requestLock}
        >
          <div className="glass px-8 py-6 rounded-xl text-center animate-pulse">
            <p className="font-mono text-white text-lg mb-2">👆 click anywhere to explore</p>
            <p className="font-mono text-white/50 text-sm">press esc to exit at any time</p>
          </div>
        </div>
      )}
    </div>
  );
});
