<script setup lang="ts">
// Horizontal bar: value against a target mark. 'cap' targets (fat, treats share) turn terracotta past the mark.
const props = withDefaults(defineProps<{ value: number, target: number, max?: number, kind?: 'floor' | 'cap', label?: string }>(), { kind: 'floor' })
const top = computed(() => props.max ?? Math.max(props.value, props.target) * 1.25)
const w = computed(() => Math.min(100, props.value / top.value * 100))
const t = computed(() => Math.min(100, props.target / top.value * 100))
const bad = computed(() => props.kind === 'cap' ? props.value > props.target : props.value < props.target * 0.9)
</script>

<template>
  <div class="m" role="img" :aria-label="label">
    <span class="fill" :class="{ bad, cap: kind === 'cap' }" :style="{ width: `${w}%` }" />
    <span class="mark" :style="{ left: `${t}%` }" />
  </div>
</template>

<style scoped>
.m { position: relative; height: 10px; border-radius: 5px; background: var(--track); }
.fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 5px; background: var(--accent); transition: width var(--dur-slow) var(--ease); }
.fill.bad { background: color-mix(in srgb, var(--accent) 40%, var(--surface)); }
.fill.cap.bad { background: var(--over); }
.mark { position: absolute; top: -4px; bottom: -4px; width: 2px; margin-left: -1px; border-radius: 1px; background: var(--ink); }
</style>
