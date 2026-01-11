/**
 * Calm nighttime cloud shader background for the library
 * Inspired by volumetric cloud techniques - original implementation
 */

import { useEffect, useRef } from 'react';

const vertexShader = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  
  uniform vec2 uResolution;
  uniform float uTime;
  
  // Hash function for noise
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  
  // Smooth 3D noise
  float noise(vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    
    return mix(
      mix(
        mix(hash(p + vec3(0,0,0)), hash(p + vec3(1,0,0)), f.x),
        mix(hash(p + vec3(0,1,0)), hash(p + vec3(1,1,0)), f.x),
        f.y
      ),
      mix(
        mix(hash(p + vec3(0,0,1)), hash(p + vec3(1,0,1)), f.x),
        mix(hash(p + vec3(0,1,1)), hash(p + vec3(1,1,1)), f.x),
        f.y
      ),
      f.z
    );
  }
  
  // Fractal Brownian Motion for cloud density
  float fbm(vec3 p) {
    float f = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    
    for(int i = 0; i < 5; i++) {
      f += amp * noise(p * freq);
      freq *= 2.02;
      amp *= 0.5;
    }
    
    return f;
  }
  
  // Cloud density function
  float cloudDensity(vec3 p) {
    // Very slow movement for calm feel (0.02 instead of 0.1)
    vec3 q = p - vec3(0.0, 0.0, uTime * 0.02);
    
    float density = fbm(q * 0.8);
    
    // Shape the clouds - higher = less dense
    density = density - 0.3 - p.y * 0.15;
    
    return clamp(density * 2.0, 0.0, 1.0);
  }
  
  // Raymarching through clouds
  vec4 raymarchClouds(vec3 ro, vec3 rd) {
    vec4 sum = vec4(0.0);
    float t = 0.0;
    
    // Night sky colors
    vec3 nightSky = vec3(0.02, 0.04, 0.08);
    vec3 cloudColorDark = vec3(0.08, 0.12, 0.18);
    vec3 cloudColorLight = vec3(0.15, 0.2, 0.3);
    
    // Subtle moonlight direction
    vec3 moonDir = normalize(vec3(0.5, 0.8, -0.3));
    
    for(int i = 0; i < 64; i++) {
      if(sum.a > 0.95) break;
      
      vec3 pos = ro + rd * t;
      
      // Only render in cloud layer
      if(pos.y < -2.0 || pos.y > 3.0) {
        t += 0.2;
        continue;
      }
      
      float den = cloudDensity(pos);
      
      if(den > 0.01) {
        // Simple lighting from moon
        float denOffset = cloudDensity(pos + moonDir * 0.3);
        float diff = clamp((den - denOffset) / 0.3, 0.0, 1.0);
        
        // Cloud color with subtle moonlight
        vec3 col = mix(cloudColorDark, cloudColorLight, diff * 0.5 + 0.2);
        
        // Add subtle blue rim light
        col += vec3(0.1, 0.15, 0.25) * diff * 0.3;
        
        // Fog/atmosphere
        col = mix(col, nightSky, 1.0 - exp(-0.02 * t));
        
        // Alpha based on density
        float a = den * 0.4;
        
        // Front-to-back compositing
        col *= a;
        sum += vec4(col, a) * (1.0 - sum.a);
      }
      
      t += max(0.1, 0.08 * t);
    }
    
    return sum;
  }
  
  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution.xy) / uResolution.y;
    
    // Camera setup - very slow subtle rotation
    float angle = uTime * 0.005; // Very slow rotation
    vec3 ro = vec3(sin(angle) * 4.0, 1.0 + sin(uTime * 0.01) * 0.2, cos(angle) * 4.0);
    vec3 ta = vec3(0.0, 0.5, 0.0);
    
    // Camera matrix
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = normalize(cross(uu, ww));
    
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.5 * ww);
    
    // Night sky gradient
    vec3 skyColor = vec3(0.01, 0.02, 0.05);
    skyColor += vec3(0.02, 0.03, 0.06) * (1.0 - abs(rd.y));
    
    // Subtle stars
    float stars = pow(hash(rd * 500.0), 20.0) * step(0.3, rd.y);
    skyColor += vec3(0.8, 0.85, 1.0) * stars * 0.3;
    
    // Moon glow
    vec3 moonDir = normalize(vec3(0.5, 0.6, -0.3));
    float moonGlow = pow(max(0.0, dot(rd, moonDir)), 64.0);
    skyColor += vec3(0.15, 0.18, 0.25) * moonGlow;
    
    // Subtle moon halo
    float moonHalo = pow(max(0.0, dot(rd, moonDir)), 8.0);
    skyColor += vec3(0.05, 0.08, 0.12) * moonHalo;
    
    // Raymarch clouds
    vec4 clouds = raymarchClouds(ro, rd);
    
    // Composite clouds over sky
    vec3 col = skyColor * (1.0 - clouds.a) + clouds.rgb;
    
    // Subtle vignette
    vec2 vUv = gl_FragCoord.xy / uResolution.xy;
    float vignette = 1.0 - 0.3 * length((vUv - 0.5) * 1.5);
    col *= vignette;
    
    // Very subtle color grading - add warmth
    col = pow(col, vec3(0.95, 0.97, 1.0));
    
    // Output with slight transparency for layering
    gl_FragColor = vec4(col, 0.95);
  }
`;

interface CloudBackgroundProps {
  className?: string;
}

export function CloudBackground({ className = '' }: CloudBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: false,
    });

    if (!gl) {
      console.warn('WebGL not supported for cloud background');
      return;
    }

    glRef.current = gl;

    // Compile shaders
    const compileShader = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = compileShader(gl.VERTEX_SHADER, vertexShader);
    const fs = compileShader(gl.FRAGMENT_SHADER, fragmentShader);

    if (!vs || !fs) return;

    // Create program
    const program = gl.createProgram();
    if (!program) return;

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return;
    }

    programRef.current = program;
    gl.useProgram(program);

    // Setup geometry (fullscreen quad)
    const vertices = new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1,
    ]);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Get uniform locations
    const resolutionLocation = gl.getUniformLocation(program, 'uResolution');
    const timeLocation = gl.getUniformLocation(program, 'uTime');

    // Resize handler
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 1.5); // Limit for performance
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    resize();
    window.addEventListener('resize', resize);

    // Animation loop
    const startTime = performance.now();

    const animate = () => {
      if (!gl || !program) return;

      const time = (performance.now() - startTime) / 1000;

      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
      gl.uniform1f(timeLocation, time);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationRef.current);
      
      if (gl && program) {
        gl.deleteProgram(program);
        if (vs) gl.deleteShader(vs);
        if (fs) gl.deleteShader(fs);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`fixed inset-0 w-full h-full pointer-events-none ${className}`}
      style={{ 
        zIndex: 0,
        background: 'linear-gradient(to bottom, #010208, #030610)',
      }}
    />
  );
}
