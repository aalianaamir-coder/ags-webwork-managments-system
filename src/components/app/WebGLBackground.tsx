'use client'

// AGS WEBWORKS — interactive WebGL shader background (raw WebGL, no deps).
// Flowing brand-colored aurora that reacts to pointer movement. Used on the
// login screen and the creator page.

import { useEffect, useRef } from 'react'

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uIntensity;

// hash + noise
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes.xy;
  vec2 p = uv * vec2(uRes.x / uRes.y, 1.0);

  // mouse influence
  vec2 m = uMouse * vec2(uRes.x / uRes.y, 1.0);
  float md = length(p - m);
  float mouseGlow = exp(-md * 3.0) * uIntensity;

  // domain-warped flow
  float t = uTime * 0.09;
  vec2 q = vec2(noise(p * 1.6 + t), noise(p * 1.6 + vec2(5.2, 1.3) - t));
  vec2 r = vec2(noise(p * 2.2 + q * 2.0 + vec2(1.7, 9.2) + t * 0.6),
                noise(p * 2.2 + q * 2.0 + vec2(8.3, 2.8) - t * 0.4));
  float f = noise(p * 2.4 + r * 1.8);

  // calm professional palette: deep charcoal-navy with muted blue currents
  vec3 c1 = vec3(0.028, 0.037, 0.058);   // deep navy charcoal
  vec3 c2 = vec3(0.18, 0.35, 0.62);      // muted steel blue
  vec3 c3 = vec3(0.10, 0.22, 0.45);      // deep blue
  vec3 c4 = vec3(0.16, 0.28, 0.52);      // slate blue

  float band1 = smoothstep(0.25, 0.9, f + q.x * 0.35);
  float band2 = smoothstep(0.45, 1.0, r.y + f * 0.4);
  float band3 = smoothstep(0.6, 1.05, q.y + r.x * 0.5);

  vec3 col = c1;
  col = mix(col, c3, band1 * 0.30);
  col = mix(col, c2, band2 * 0.20);
  col = mix(col, c4, band3 * 0.22);

  // gentle pointer glow
  col += c2 * mouseGlow * 0.20;

  // vignette
  float vig = smoothstep(1.25, 0.35, length(uv - 0.5));
  col *= 0.45 + vig * 0.8;

  // subtle film grain
  col += (hash(gl_FragCoord.xy + uTime) - 0.5) * 0.025;

  gl_FragColor = vec4(col, 1.0);
}
`

export default function WebGLBackground({
  className = '',
  intensity = 1,
}: {
  className?: string
  intensity?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouse = useRef({ x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false })
    if (!gl) {
      canvas.style.background = 'linear-gradient(135deg, #0b0e14 0%, #0d1526 60%, #101a30 100%)'
      return
    }

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(prog, 'uRes')
    const uTime = gl.getUniformLocation(prog, 'uTime')
    const uMouse = gl.getUniformLocation(prog, 'uMouse')
    const uIntensity = gl.getUniformLocation(prog, 'uIntensity')

    let raf = 0
    const start = performance.now()
    let running = true

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = canvas.clientWidth * dpr
      canvas.height = canvas.clientHeight * dpr
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    resize()
    window.addEventListener('resize', resize)

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouse.current.tx = (e.clientX - rect.left) / rect.width
      mouse.current.ty = 1 - (e.clientY - rect.top) / rect.height
    }
    window.addEventListener('pointermove', onMove, { passive: true })

    const onVis = () => {
      running = document.visibilityState === 'visible'
      if (running) frame()
    }
    document.addEventListener('visibilitychange', onVis)

    const frame = () => {
      if (!running) return
      // ease mouse for a fluid feel
      mouse.current.x += (mouse.current.tx - mouse.current.x) * 0.06
      mouse.current.y += (mouse.current.ty - mouse.current.y) * 0.06
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uTime, (performance.now() - start) / 1000)
      gl.uniform2f(uMouse, mouse.current.x, mouse.current.y)
      gl.uniform1f(uIntensity, intensity)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      raf = requestAnimationFrame(frame)
    }
    frame()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('visibilitychange', onVis)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [intensity])

  return <canvas ref={canvasRef} className={`fixed inset-0 w-full h-full -z-10 ${className}`} aria-hidden="true" />
}
