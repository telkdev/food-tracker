<script setup lang="ts">
const props = defineProps<{ label: string, value: number, goal: number | null, color: string, energyShare: number }>()
const { t, n } = useT()
const frac = computed(() => props.goal ? Math.min(1, props.value / props.goal) : Math.min(1, props.energyShare))
const over = computed(() => !!props.goal && props.value > props.goal * 1.05)
</script>

<template>
  <div class="macro">
    <div class="top">
      <span class="label">{{ label }}</span>
    </div>
    <div class="val num">
      <b>{{ n(value) }}</b><span v-if="goal" class="of"> / {{ n(goal) }}</span> <span class="unit">{{ t('g') }}</span>
    </div>
    <div class="bar" :class="{ nogoal: !goal }"><span :style="{ width: `${frac * 100}%`, background: over ? 'var(--over)' : color }" /></div>
    <div v-if="!goal" class="hint num">{{ t('ofEnergy', { n: Math.round(energyShare * 100) }) }}</div>
  </div>
</template>

<style scoped>
.macro { display: grid; gap: 6px; min-width: 0; }
.label { font-size: var(--fs-xs); color: var(--ink-2); font-weight: var(--fw-regular); }
.val { font-size: var(--fs-sm); white-space: nowrap; }
.val b { font-size: var(--fs-lg); font-weight: var(--fw-medium); letter-spacing: -0.01em; }
.of, .unit { color: var(--ink-3); }
.bar { height: 4px; border-radius: 2px; background: var(--track); overflow: hidden; }
.bar span { display: block; height: 100%; border-radius: 2px; transform-origin: left center; transition: width var(--dur-slow) var(--ease); animation: bar-in var(--dur-slow) var(--ease) both; }
@keyframes bar-in { from { transform: scaleX(0); } }
.bar.nogoal span { opacity: .5; }
.hint { font-size: var(--fs-2xs); color: var(--ink-3); }
</style>
