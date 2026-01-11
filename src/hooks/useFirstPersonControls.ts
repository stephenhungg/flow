import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export interface FirstPersonControls {
  moveForward: boolean;
  moveBackward: boolean;
  moveLeft: boolean;
  moveRight: boolean;
  canJump: boolean;
  velocity: THREE.Vector3;
  direction: THREE.Vector3;
}

export function useFirstPersonControls(
  camera: THREE.PerspectiveCamera | null,
  enabled: boolean
) {
  const controlsRef = useRef<FirstPersonControls>({
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    canJump: false,
    velocity: new THREE.Vector3(),
    direction: new THREE.Vector3(),
  });

  const eulerRef = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
  const isSprintingRef = useRef(false);
  const PI_2 = Math.PI / 2;

  useEffect(() => {
    if (!camera || !enabled) return;

    const controls = controlsRef.current;
    const euler = eulerRef.current;

    // Pointer lock - check if pointer is locked to any element
    const onPointerLockChange = () => {
      const isLocked = document.pointerLockElement !== null;
      if (!isLocked) {
        // Reset movement when unlocked
        controls.moveForward = false;
        controls.moveBackward = false;
        controls.moveLeft = false;
        controls.moveRight = false;
      }
    };

    const onPointerLockError = () => {
      console.error('Pointer lock error');
    };

    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('pointerlockerror', onPointerLockError);

    // Mouse movement - works when pointer is locked to any element
    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== null && camera) {
        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;

        euler.setFromQuaternion(camera.quaternion);
        euler.y -= movementX * 0.002;
        euler.x -= movementY * 0.002;
        euler.x = Math.max(-PI_2, Math.min(PI_2, euler.x));
        camera.quaternion.setFromEuler(euler);
      }
    };

    document.addEventListener('mousemove', onMouseMove);

    // Keyboard controls
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.shiftKey) {
        isSprintingRef.current = true;
      }
      
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          controls.moveForward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          controls.moveBackward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          controls.moveLeft = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          controls.moveRight = true;
          break;
        case 'Space':
          if (controls.canJump === true) {
            controls.velocity.y += 350;
          }
          controls.canJump = false;
          break;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
        isSprintingRef.current = false;
      }
      
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          controls.moveForward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          controls.moveBackward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          controls.moveLeft = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          controls.moveRight = false;
          break;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Note: Pointer lock is now handled by the canvas element in FirstPersonScene
    // This hook just responds to pointer lock events

    // Movement update function
    const updateMovement = () => {
      if (!camera || document.pointerLockElement === null) return;

      const velocity = controls.velocity;
      const direction = controls.direction;
      const prevTime = performance.now();

      const update = () => {
        const time = performance.now();
        const delta = (time - prevTime) / 1000;

        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        velocity.y -= 9.8 * 100.0 * delta; // gravity

        direction.z = Number(controls.moveForward) - Number(controls.moveBackward);
        direction.x = Number(controls.moveRight) - Number(controls.moveLeft);
        direction.normalize();

        const speed = 200.0;
        const sprintMultiplier = isSprintingRef.current ? 1.5 : 1.0;

        if (controls.moveForward) velocity.z -= direction.z * speed * sprintMultiplier * delta;
        if (controls.moveBackward) velocity.z -= direction.z * speed * sprintMultiplier * delta;
        if (controls.moveLeft) velocity.x -= direction.x * speed * sprintMultiplier * delta;
        if (controls.moveRight) velocity.x -= direction.x * speed * sprintMultiplier * delta;

        // Apply movement
        camera.translateX(velocity.x * delta);
        camera.translateY(velocity.y * delta);
        camera.translateZ(velocity.z * delta);

        // Keep camera at ~1.7m height
        if (camera.position.y < 1.7) {
          velocity.y = 0;
          camera.position.y = 1.7;
          controls.canJump = true;
        }

        requestAnimationFrame(update);
      };

      update();
    };

    updateMovement();

    return () => {
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('pointerlockerror', onPointerLockError);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    };
  }, [camera, enabled]);

  return controlsRef.current;
}
