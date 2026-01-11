/**
 * Neural Network 3D Loading Scene
 * Three.js visualization of a neural network with firing neurons
 */

import { useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import type { PipelineStage } from '../hooks/usePipelineSocket';

interface NeuralLoadingSceneProps {
  stage: PipelineStage;
  progress?: number;
}

// Neural network configuration
const NEURON_COUNT = 80;
const CONNECTION_DENSITY = 0.15;
const NEURON_LAYERS = 5;

interface Neuron {
  position: THREE.Vector3;
  mesh: THREE.Mesh;
  baseIntensity: number;
  currentIntensity: number;
  targetIntensity: number;
  layer: number;
  connections: number[];
}

export function NeuralLoadingScene({ stage }: NeuralLoadingSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const neuronsRef = useRef<Neuron[]>([]);
  const connectionsRef = useRef<THREE.Line[]>([]);
  const particlesRef = useRef<THREE.Points | null>(null);
  const frameRef = useRef<number>(0);
  const timeRef = useRef<number>(0);

  // Activity level based on stage
  const activityLevel = useMemo(() => {
    switch (stage) {
      case 'orchestrating': return 0.3;
      case 'generating_image': return 0.5;
      case 'creating_world': return 0.8;
      case 'loading_splat': return 1.0;
      case 'complete': return 0.2;
      default: return 0.1;
    }
  }, [stage]);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.set(0, 0, 15);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Create neurons
    const neurons: Neuron[] = [];
    const neuronGeometry = new THREE.IcosahedronGeometry(0.15, 2);
    
    for (let i = 0; i < NEURON_COUNT; i++) {
      const layer = Math.floor(i / (NEURON_COUNT / NEURON_LAYERS));
      const layerOffset = (layer - NEURON_LAYERS / 2) * 4;
      
      // Spread neurons in a spherical/brain-like shape
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 3 + Math.random() * 3;
      
      const position = new THREE.Vector3(
        radius * Math.sin(phi) * Math.cos(theta) + layerOffset * 0.3,
        radius * Math.sin(phi) * Math.sin(theta) * 0.6,
        radius * Math.cos(phi) * 0.8
      );

      const neuronMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0x0ea5e9),
        transparent: true,
        opacity: 0.6,
      });

      const mesh = new THREE.Mesh(neuronGeometry, neuronMaterial);
      mesh.position.copy(position);
      scene.add(mesh);

      neurons.push({
        position,
        mesh,
        baseIntensity: 0.3 + Math.random() * 0.3,
        currentIntensity: 0.3,
        targetIntensity: 0.3,
        layer,
        connections: [],
      });
    }
    neuronsRef.current = neurons;

    // Create connections
    const connections: THREE.Line[] = [];
    const connectionMaterial = new THREE.LineBasicMaterial({
      color: 0x7c3aed,
      transparent: true,
      opacity: 0.2,
    });

    for (let i = 0; i < neurons.length; i++) {
      for (let j = i + 1; j < neurons.length; j++) {
        const dist = neurons[i].position.distanceTo(neurons[j].position);
        if (dist < 4 && Math.random() < CONNECTION_DENSITY) {
          const geometry = new THREE.BufferGeometry().setFromPoints([
            neurons[i].position,
            neurons[j].position,
          ]);
          const line = new THREE.Line(geometry, connectionMaterial.clone());
          scene.add(line);
          connections.push(line);
          neurons[i].connections.push(j);
          neurons[j].connections.push(i);
        }
      }
    }
    connectionsRef.current = connections;

    // Create particle system for "data flow"
    const particleCount = 500;
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 12;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 15;
      
      // Cyan to purple gradient
      const t = Math.random();
      colors[i * 3] = 0.05 + t * 0.4;     // R
      colors[i * 3 + 1] = 0.65 - t * 0.4; // G
      colors[i * 3 + 2] = 0.9;             // B
      
      sizes[i] = Math.random() * 2 + 0.5;
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const particleMaterial = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);
    particlesRef.current = particles;

    // Animation loop
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      timeRef.current += 0.016;
      frameRef.current++;

      const time = timeRef.current;
      const activity = activityLevel;

      // Rotate camera slowly
      camera.position.x = Math.sin(time * 0.1) * 15;
      camera.position.z = Math.cos(time * 0.1) * 15;
      camera.position.y = Math.sin(time * 0.05) * 3;
      camera.lookAt(0, 0, 0);

      // Update neurons
      neurons.forEach((neuron) => {
        // Random firing based on activity level
        if (Math.random() < activity * 0.05) {
          neuron.targetIntensity = 1;
          // Propagate to connected neurons
          neuron.connections.forEach(j => {
            setTimeout(() => {
              if (neurons[j]) {
                neurons[j].targetIntensity = 0.8;
              }
            }, 100 + Math.random() * 200);
          });
        }

        // Lerp intensity
        neuron.currentIntensity += (neuron.targetIntensity - neuron.currentIntensity) * 0.1;
        neuron.targetIntensity += (neuron.baseIntensity - neuron.targetIntensity) * 0.02;

        // Update material
        const material = neuron.mesh.material as THREE.MeshBasicMaterial;
        const intensity = neuron.currentIntensity;
        
        // Color shift from cyan to white when firing
        material.color.setRGB(
          0.05 + intensity * 0.95,
          0.65 + intensity * 0.35,
          0.91 + intensity * 0.09
        );
        material.opacity = 0.4 + intensity * 0.6;

        // Scale pulse
        const scale = 1 + intensity * 0.5;
        neuron.mesh.scale.setScalar(scale);
      });

      // Update connections
      connections.forEach((line, idx) => {
        const material = line.material as THREE.LineBasicMaterial;
        const pulse = Math.sin(time * 3 + idx * 0.5) * 0.5 + 0.5;
        material.opacity = 0.1 + pulse * activity * 0.3;
      });

      // Update particles
      if (particles) {
        const positions = particles.geometry.attributes.position.array as Float32Array;
        for (let i = 0; i < positions.length; i += 3) {
          positions[i] += (Math.random() - 0.5) * activity * 0.1;
          positions[i + 1] += activity * 0.02;
          positions[i + 2] += (Math.random() - 0.5) * activity * 0.05;
          
          // Wrap around
          if (positions[i + 1] > 6) positions[i + 1] = -6;
          if (positions[i] > 10) positions[i] = -10;
          if (positions[i] < -10) positions[i] = 10;
        }
        particles.geometry.attributes.position.needsUpdate = true;
        particles.rotation.y += 0.001;
      }

      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update activity level when it changes
  useEffect(() => {
    // Activity is accessed in animation loop via closure
  }, [activityLevel]);

  return (
    <div 
      ref={containerRef} 
      className="absolute inset-0 z-0"
      style={{ background: 'transparent' }}
    />
  );
}

