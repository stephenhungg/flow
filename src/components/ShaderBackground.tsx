import { useEffect, useRef } from 'react'

const vertexShader = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`

const fragmentShader = `
  precision highp float;
  uniform float iTime;
  uniform vec2 iResolution;

  // Shader by Frostbyte - Licensed under CC BY-NC-SA 4.0
  // Color modified for blue/white palette (no pink)

  vec2 r(vec2 v, float t) {
    float s = sin(t), c = cos(t);
    return mat2(c, -s, s, c) * v;
  }

  // ACES tonemap
  vec3 a(vec3 c) {
    mat3 m1 = mat3(
      0.59719, 0.07600, 0.02840,
      0.35458, 0.90834, 0.13383,
      0.04823, 0.01566, 0.83777
    );
    mat3 m2 = mat3(
      1.60475, -0.10208, -0.00327,
      -0.53108, 1.10813, -0.07276,
      -0.07367, -0.00605, 1.07602
    );
    vec3 v = m1 * c;
    vec3 aa = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return m2 * (aa / b);
  }

  // Xor's Dot Noise
  float n(vec3 p) {
    const float PHI = 1.618033988;
    const mat3 GOLD = mat3(
      -0.571464913, +0.814921382, +0.096597072,
      -0.278044873, -0.303026659, +0.911518454,
      +0.772087367, +0.494042493, +0.399753815
    );
    return dot(cos(GOLD * p), sin(PHI * p * GOLD));
  }

  void main() {
    vec2 u = gl_FragCoord.xy;
    float i, s, t = iTime * 0.35;
    vec3 p, l, b, d;
    p.z = t;
    d = normalize(vec3(2.0 * u - iResolution.xy, iResolution.y));
    
    for(float j = 0.0; j < 10.0; j++) {
      i = j;
      b = p;
      b.xy = r(sin(b.xy), t * 1.5 + b.z * 3.0);
      s = 0.001 + abs(n(b * 12.0) / 12.0 - n(b)) * 0.4;
      s = max(s, 2.0 - length(p.xy));
      s += abs(p.y * 0.75 + sin(p.z + t * 0.1 + p.x * 1.5)) * 0.2;
      p += d * s;
      // Original color accumulation
      l += (1.0 + sin(i + length(p.xy * 0.1) + vec3(3.0, 1.5, 1.0))) / s;
    }
    
    vec3 color = a(l * l / 600.0);
    
    // Convert to grayscale and tint blue
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    // Deep blue tint with white highlights
    vec3 blue = vec3(0.1, 0.15, 0.3) + luma * vec3(0.7, 0.8, 1.0);
    
    gl_FragColor = vec4(blue, 1.0);
  }
`

interface ShaderBackgroundProps {
  scale?: number;
}

export function ShaderBackground({ scale = 1 }: ShaderBackgroundProps = { scale: 1 }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(null)
  const startTimeRef = useRef<number>(Date.now())

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', { 
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false,
    })
    if (!gl) {
      console.error('WebGL not supported')
      return
    }

    // Compile shaders
    const compileShader = (source: string, type: number) => {
      const shader = gl.createShader(type)
      if (!shader) return null
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader))
        gl.deleteShader(shader)
        return null
      }
      return shader
    }

    const vs = compileShader(vertexShader, gl.VERTEX_SHADER)
    const fs = compileShader(fragmentShader, gl.FRAGMENT_SHADER)
    if (!vs || !fs) return

    const program = gl.createProgram()
    if (!program) return
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program))
      return
    }

    gl.useProgram(program)

    // Set up geometry (fullscreen quad)
    const positions = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      1, 1,
    ])

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)

    const positionLocation = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

    // Get uniform locations
    const timeLocation = gl.getUniformLocation(program, 'iTime')
    const resolutionLocation = gl.getUniformLocation(program, 'iResolution')

    // Handle resize
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2)
      const width = window.innerWidth
      const height = window.innerHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      gl.viewport(0, 0, canvas.width, canvas.height)
    }

    resize()
    window.addEventListener('resize', resize)

    // Animation loop
    const render = () => {
      const time = (Date.now() - startTimeRef.current) / 1000
      gl.uniform1f(timeLocation, time)
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      animationRef.current = requestAnimationFrame(render)
    }

    render()

    return () => {
      window.removeEventListener('resize', resize)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      gl.deleteBuffer(buffer)
    }
  }, [])

  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.style.transform = `scale(${scale})`;
      canvasRef.current.style.transformOrigin = 'center center';
      canvasRef.current.style.transition = 'transform 2.3s cubic-bezier(0.16, 1, 0.3, 1)';
    }
  }, [scale])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full"
      style={{ zIndex: 0 }}
    />
  )
}

