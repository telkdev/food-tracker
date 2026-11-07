<script setup lang="ts">
const props = withDefaults(defineProps<{ value: number, max: number, size?: number, stroke?: number, label?: string }>(), { size: 156, stroke: 14 })
const r = computed(() => (props.size - props.stroke) / 2)
const C = computed(() => 2 * Math.PI * r.value)
const frac = computed(() => props.max > 0 ? Math.max(0, props.value / props.max) : 0)
const over = computed(() => frac.value > 1)
// over the goal: full ring in terracotta; the overshoot is drawn as a second lap on top
const main = computed(() => C.value * (1 - Math.min(1, frac.value)))
const extra = computed(() => C.value * (1 - Math.min(1, Math.max(0, frac.value - 1))))
</script>

<template>
  <div class="ring" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg :viewBox="`0 0 ${size} ${size}`" :width="size" :height="size" role="img" :aria-label="label">
      <circle :cx="size / 2" :cy="size / 2" :r="r" fill="none" class="track" :stroke-width="stroke" />
      <circle
        :cx="size / 2" :cy="size / 2" :r="r" fill="none" class="arc" :class="{ over }" :stroke-width="stroke" stroke-linecap="round"
        :stroke-dasharray="C" :stroke-dashoffset="main" :transform="`rotate(-90 ${size / 2} ${size / 2})`"
      />
      <circle
        v-if="over" :cx="size / 2" :cy="size / 2" :r="r" fill="none" class="arc lap" :stroke-width="stroke" stroke-linecap="round"
        :stroke-dasharray="C" :stroke-dashoffset="extra" :transform="`rotate(-90 ${size / 2} ${size / 2})`"
      />
    </svg>
    <div class="center"><slot /></div>
  </div>
</template>

<style scoped>
.ring { position: relative; flex: none; }
.track { stroke: var(--surface-2); }
.arc { stroke: var(--accent); transition: stroke-dashoffset var(--dur-slow) var(--ease), stroke var(--dur); }
.arc.over { stroke: var(--over); opacity: .45; }
.arc.lap { stroke: var(--over); opacity: 1; }
.center { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; }
</style>
