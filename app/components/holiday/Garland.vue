<script setup lang="ts">
// A string of lights across the top of the page. Pure SVG + CSS: the bulbs twinkle slowly,
// glow only in the dark theme, and stay still when the system asks for reduced motion.
const el = ref<HTMLElement | null>(null)
const width = ref(360)
const H = 34
const COLORS = ['#d9473f', '#e8a93a', '#3f8f5c', '#4b86c4', '#e8a93a', '#c9568f']

let ro: ResizeObserver | null = null
onMounted(() => {
  if (!el.value) return
  width.value = el.value.clientWidth || 360
  ro = new ResizeObserver(([e]) => { if (e) width.value = Math.round(e.contentRect.width) })
  ro.observe(el.value)
})
onBeforeUnmount(() => ro?.disconnect())

// Quadratic sags between hooks; bulbs sit at even steps along x on the curve.
const sags = computed(() => Math.max(2, Math.round(width.value / 140)))
const path = computed(() => {
  const w = width.value, seg = w / sags.value
  let d = 'M 0 3'
  for (let i = 0; i < sags.value; i++) d += ` Q ${seg * i + seg / 2} 27 ${seg * (i + 1)} 3`
  return d
})
const bulbs = computed(() => {
  const w = width.value, seg = w / sags.value, perSag = 6, out = []
  for (let i = 0; i < sags.value; i++) {
    for (let k = 0; k < perSag; k++) {
      const t = (k + 0.5) / perSag
      const x0 = seg * i, cx = x0 + seg / 2, x1 = x0 + seg
      const x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1
      const y = (1 - t) ** 2 * 3 + 2 * (1 - t) * t * 27 + t * t * 3
      const n = i * perSag + k
      out.push({ x, y, c: COLORS[n % COLORS.length], delay: `${((n * 0.37) % 2.4).toFixed(2)}s` })
    }
  }
  return out
})
</script>

<template>
  <div ref="el" class="garland" aria-hidden="true">
    <svg :width="width" :height="H" :viewBox="`0 0 ${width} ${H}`">
      <path :d="path" class="wire" />
      <g v-for="(b, i) in bulbs" :key="i" :transform="`translate(${b.x.toFixed(1)} ${(b.y + 1).toFixed(1)})`" class="bulb" :style="{ '--c': b.c, animationDelay: b.delay }">
        <rect x="-2.2" y="-1" width="4.4" height="3.5" rx="1" class="cap" />
        <ellipse cx="0" cy="7.5" rx="3.8" ry="5.4" class="glass" />
        <ellipse cx="-1.2" cy="5.6" rx="1" ry="1.8" fill="#fff" opacity=".55" />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.garland { height: 34px; margin: calc(-1 * var(--s-2)) 0 var(--s-1); pointer-events: none; overflow: visible; }
svg { display: block; overflow: visible; }
.wire { fill: none; stroke: #4a4337; stroke-width: 1.2; opacity: .7; }
.cap { fill: #6d665a; }
.glass { fill: var(--c); }
.bulb { animation: twinkle 3.2s ease-in-out infinite; }
@keyframes twinkle { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
@media (prefers-color-scheme: dark) {
  .wire { stroke: #6b6558; }
  .glass { filter: drop-shadow(0 0 4px var(--c)) drop-shadow(0 0 9px var(--c)); }
}
@media (prefers-reduced-motion: reduce) { .bulb { animation: none; } }
</style>
