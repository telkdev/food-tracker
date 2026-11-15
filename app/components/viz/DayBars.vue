<script setup lang="ts">
// Mini bar chart, one bar per day of the window: target line, optional ±band, partial and empty days muted.
const props = withDefaults(defineProps<{
  days: { date: string, value: number | null, partial?: boolean }[]
  target?: number | null
  band?: number
  /** 'floor': at or above target is good (protein); 'range': inside ±band is good (kcal) */
  mode?: 'floor' | 'range'
  height?: number
  label?: string
}>(), { target: null, band: 0.1, mode: 'floor', height: 64 })

const max = computed(() => Math.max(1, (props.target ?? 0) * 1.3, ...props.days.map(d => d.value ?? 0)))
const pct = (v: number) => Math.min(100, v / max.value * 100)
function state(d: { value: number | null, partial?: boolean }) {
  if (d.value == null) return 'none'
  if (d.partial) return 'partial'
  const t = props.target
  if (t == null) return 'ok'
  if (props.mode === 'floor') return d.value >= t * 0.9 ? 'ok' : 'low'
  return d.value > t * (1 + props.band) ? 'over' : d.value < t * (1 - props.band) ? 'low' : 'ok'
}
</script>

<template>
  <div class="db" :style="{ height: `${height}px` }" role="img" :aria-label="label">
    <div v-if="target && mode === 'range'" class="band" :style="{ bottom: `${pct(target * (1 - band))}%`, height: `${pct(target * (1 + band)) - pct(target * (1 - band))}%` }" />
    <div v-if="target" class="tline" :style="{ bottom: `${pct(target)}%` }" />
    <span v-for="d in days" :key="d.date" class="b" :class="state(d)" :style="{ height: d.value == null ? '2px' : `${Math.max(3, pct(d.value))}%` }" :title="`${d.date}: ${d.value ?? '—'}`" />
  </div>
</template>

<style scoped>
.db { position: relative; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 3px; align-items: end; }
.b { display: block; border-radius: 3px 3px 1px 1px; background: var(--accent); transition: height var(--dur-slow) var(--ease); min-width: 0; }
.b.low { background: color-mix(in srgb, var(--accent) 35%, var(--surface)); }
.b.over { background: var(--over); }
.b.partial { background: repeating-linear-gradient(-45deg, var(--track), var(--track) 2px, transparent 2px, transparent 4px); }
.b.none { background: var(--track); }
.tline { position: absolute; left: 0; right: 0; border-top: 1px dashed var(--ink-3); opacity: .7; pointer-events: none; }
.band { position: absolute; left: 0; right: 0; background: color-mix(in srgb, var(--accent) 9%, transparent); border-radius: 2px; pointer-events: none; }
</style>
