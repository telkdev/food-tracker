<script setup lang="ts">
// 3D snowfall for the New Year theme (three.js, loaded only when this component mounts).
// Crystal flakes tumble in 3D and shimmer through icy hues; soft bokeh dots add depth.
// Cheap by design: ~80 instances in two draw calls, capped at 40 fps, paused while the tab is hidden,
// not started at all with prefers-reduced-motion, never catches taps (pointer-events: none).
// Elements marked data-snow-clear (the big kcal number) get a clear hole in the snow via a CSS mask.
import type * as THREE_NS from 'three'

const canvas = ref<HTMLCanvasElement | null>(null)
let stop: (() => void) | null = null
let disposed = false

function crystalTexture(THREE: typeof THREE_NS) {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S
  const x = c.getContext('2d')!
  x.translate(S / 2, S / 2)
  x.strokeStyle = '#fff'; x.lineCap = 'round'
  x.shadowColor = 'rgba(60, 90, 130, .55)'; x.shadowBlur = 6
  const R = S * 0.4
  for (let k = 0; k < 6; k++) {
    x.rotate(Math.PI / 3)
    x.lineWidth = 6
    x.beginPath(); x.moveTo(0, 0); x.lineTo(0, R)
    x.moveTo(0, R * 0.5); x.lineTo(R * 0.24, R * 0.72); x.moveTo(0, R * 0.5); x.lineTo(-R * 0.24, R * 0.72)
    x.moveTo(0, R * 0.25); x.lineTo(R * 0.14, R * 0.38); x.moveTo(0, R * 0.25); x.lineTo(-R * 0.14, R * 0.38)
    x.stroke()
  }
  x.beginPath(); x.arc(0, 0, 7, 0, Math.PI * 2); x.fillStyle = '#fff'; x.fill()
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}

function dotTexture(THREE: typeof THREE_NS) {
  const S = 64, c = document.createElement('canvas'); c.width = c.height = S
  const x = c.getContext('2d')!
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)')
  x.fillStyle = g; x.fillRect(0, 0, S, S)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}

async function start(el: HTMLCanvasElement) {
  const THREE = await import('three')
  if (disposed) return () => {}
  const dark = matchMedia('(prefers-color-scheme: dark)')
  const renderer = new THREE.WebGLRenderer({ canvas: el, alpha: true, antialias: false, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75))
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 50)
  camera.position.z = 10

  const mkLayer = (count: number, tex: THREE_NS.Texture, size: [number, number], opacity: number) => {
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity })
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, count)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.frustumCulled = false
    const items = Array.from({ length: count }, () => ({
      x: 0, y: 0, z: -7 + Math.random() * 11,
      s: size[0] + Math.random() * (size[1] - size[0]),
      vy: 0.35 + Math.random() * 0.55,
      sway: 0.2 + Math.random() * 0.5, phase: Math.random() * Math.PI * 2,
      rx: (Math.random() - 0.5) * 2.2, ry: (Math.random() - 0.5) * 2.2, rz: (Math.random() - 0.5) * 1.4,
      hue: Math.random(),
    }))
    scene.add(mesh)
    return { mesh, mat, items }
  }
  const crystals = mkLayer(30, crystalTexture(THREE), [0.22, 0.5], 0.95)
  const dots = mkLayer(46, dotTexture(THREE), [0.05, 0.14], 0.9)

  // visible half-height/half-width at depth z
  let aspect = 1
  const halfH = (z: number) => Math.tan((camera.fov * Math.PI) / 360) * (camera.position.z - z)
  const seed = (p: { x: number, y: number, z: number }, anywhere: boolean) => {
    const h = halfH(p.z)
    p.x = (Math.random() * 2 - 1) * h * aspect * 1.1
    p.y = anywhere ? (Math.random() * 2 - 1) * h : h + Math.random() * 1.5
  }

  function resize() {
    const w = innerWidth, h = innerHeight
    renderer.setSize(w, h, false)
    aspect = w / h
    camera.aspect = aspect; camera.updateProjectionMatrix()
  }
  resize()
  for (const l of [crystals, dots]) for (const p of l.items) seed(p, true)

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color()
  let t = 0, last = performance.now(), raf = 0, running = true

  function frame(now: number) {
    raf = requestAnimationFrame(frame)
    const dt = (now - last) / 1000
    if (dt < 1 / 40) return // cap at ~40 fps
    last = now
    const step = Math.min(dt, 0.1)
    t += step
    const isDark = dark.matches
    for (const [li, l] of [crystals, dots].entries()) {
      l.items.forEach((p, i) => {
        p.y -= p.vy * step * (li ? 0.8 : 1)
        p.x += Math.sin(t * 0.7 + p.phase) * p.sway * step
        if (p.y < -halfH(p.z) - 0.6) seed(p, false)
        e.set(p.rx * t, p.ry * t, p.rz * t)
        q.setFromEuler(li ? e.set(0, 0, 0) : e)
        m.compose(v.set(p.x, p.y, p.z), q, sc.set(p.s, p.s, p.s))
        l.mesh.setMatrixAt(i, m)
        // shimmer: icy blue → lilac → white, slowly per flake; crystals also flash as they turn
        const glint = li ? 0.5 + 0.5 * Math.sin(t * 1.3 + p.phase) : Math.abs(Math.cos(p.rx * t)) * Math.abs(Math.cos(p.ry * t))
        const hue = 0.55 + 0.12 * Math.sin(t * 0.35 + p.hue * 6.28)
        if (isDark) col.setHSL(hue, 0.6, 0.72 + 0.26 * glint)
        else col.setHSL(hue, 0.45, 0.62 + 0.2 * glint)
        l.mesh.setColorAt(i, col)
      })
      l.mesh.instanceMatrix.needsUpdate = true
      if (l.mesh.instanceColor) l.mesh.instanceColor.needsUpdate = true
    }
    renderer.render(scene, camera)
  }

  // clear hole over [data-snow-clear] so the big number is never covered
  function updateMask() {
    const holes = [...document.querySelectorAll<HTMLElement>('[data-snow-clear]')]
      .map(n => n.getBoundingClientRect()).filter(r => r.bottom > 0 && r.top < innerHeight && r.width)
    const mask = holes.length
      ? holes.map(r => `radial-gradient(${Math.round(r.width / 2 + 8)}px ${Math.round(r.height / 2 + 8)}px at ${Math.round(r.left + r.width / 2)}px ${Math.round(r.top + r.height / 2)}px, transparent 70%, #000 100%)`).join(', ')
      : ''
    el.style.maskImage = mask
    el.style.webkitMaskImage = mask
    el.style.maskComposite = holes.length > 1 ? 'intersect' : ''
    el.style.setProperty('-webkit-mask-composite', holes.length > 1 ? 'source-in' : '')
  }
  let maskRaf = 0
  const queueMask = () => { if (!maskRaf) maskRaf = requestAnimationFrame(() => { maskRaf = 0; updateMask() }) }
  const maskTimer = setInterval(updateMask, 600) // content can move without a scroll (data loads, day swipe)

  function onVis() {
    if (document.hidden && running) { cancelAnimationFrame(raf); running = false }
    else if (!document.hidden && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame) }
  }
  const onResize = () => { resize(); queueMask() }
  addEventListener('resize', onResize)
  addEventListener('scroll', queueMask, { passive: true })
  document.addEventListener('visibilitychange', onVis)
  updateMask()
  raf = requestAnimationFrame(frame)

  return () => {
    cancelAnimationFrame(raf); cancelAnimationFrame(maskRaf); clearInterval(maskTimer)
    removeEventListener('resize', onResize)
    removeEventListener('scroll', queueMask)
    document.removeEventListener('visibilitychange', onVis)
    for (const l of [crystals, dots]) { l.mesh.geometry.dispose(); l.mat.map?.dispose(); l.mat.dispose() }
    renderer.dispose()
  }
}

onMounted(async () => {
  const el = canvas.value
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !el) return
  try {
    stop = await start(el)
    if (disposed) { stop(); stop = null }
  }
  catch (e) { console.warn('[snow] WebGL unavailable', e) } // no WebGL: simply no snow
})
onBeforeUnmount(() => { disposed = true; stop?.(); stop = null })
</script>

<template>
  <canvas ref="canvas" class="snow" aria-hidden="true" />
</template>

<style scoped>
.snow { position: fixed; inset: 0; width: 100vw; height: 100dvh; pointer-events: none; z-index: 35; }
</style>
