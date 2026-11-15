<script setup lang="ts">
// Weight over time: a line with dots, x by date (gaps stay gaps), y padded around min/max.
const props = withDefaults(defineProps<{ points: { date: string, kg: number }[], height?: number }>(), { height: 56 })
const W = 300
const geo = computed(() => {
  const pts = props.points
  if (!pts.length) return null
  const xs = pts.map(p => Date.parse(`${p.date}T12:00:00Z`))
  const x0 = Math.min(...xs), x1 = Math.max(...xs)
  const lo = Math.min(...pts.map(p => p.kg)) - 0.5, hi = Math.max(...pts.map(p => p.kg)) + 0.5
  const H = props.height, pad = 6
  const xy = pts.map((p, i) => ({ x: x1 === x0 ? W / 2 : pad + (xs[i]! - x0) / (x1 - x0) * (W - 2 * pad), y: pad + (hi - p.kg) / (hi - lo) * (H - 2 * pad) }))
  return { xy, d: xy.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') }
})
</script>

<template>
  <div v-if="geo" class="wrap" :style="{ height: `${height}px` }" aria-hidden="true">
    <svg class="sp" :viewBox="`0 0 ${W} ${height}`" preserveAspectRatio="none">
      <path :d="geo.d" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
    </svg>
    <span v-for="(p, i) in geo.xy" :key="i" class="dot" :class="{ last: i === geo.xy.length - 1 }" :style="{ left: `${p.x / W * 100}%`, top: `${p.y}px` }" />
  </div>
</template>

<style scoped>
.wrap { position: relative; }
.sp { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.dot { position: absolute; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%; background: var(--surface); border: 1.5px solid var(--accent); }
.dot.last { width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; background: var(--accent); }
</style>
