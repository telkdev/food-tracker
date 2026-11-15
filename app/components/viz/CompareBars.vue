<script setup lang="ts">
// Two (or more) labelled horizontal bars on one scale: weekdays vs weekend, before vs now, goal vs estimate.
const props = defineProps<{ rows: { label: string, value: number, text: string, hl?: boolean }[] }>()
const max = computed(() => Math.max(1, ...props.rows.map(r => r.value)))
</script>

<template>
  <div class="cb">
    <div v-for="r in rows" :key="r.label" class="row">
      <span class="l">{{ r.label }}</span>
      <span class="bar"><span :class="{ hl: r.hl }" :style="{ width: `${Math.max(2, r.value / max * 100)}%` }" /></span>
      <span class="v num" :class="{ hl: r.hl }">{{ r.text }}</span>
    </div>
  </div>
</template>

<style scoped>
.cb { display: grid; gap: var(--s-2); }
.row { display: grid; grid-template-columns: 6.5em 1fr auto; align-items: center; gap: var(--s-2); }
.l { font-size: var(--fs-xs); color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bar { height: 10px; border-radius: 5px; background: var(--track); overflow: hidden; }
.bar span { display: block; height: 100%; border-radius: 5px; background: color-mix(in srgb, var(--accent) 40%, var(--surface)); transition: width var(--dur-slow) var(--ease); }
.bar span.hl { background: var(--accent); }
.v { font-size: var(--fs-sm); color: var(--ink-2); min-width: 3.5em; text-align: right; }
.v.hl { color: var(--ink); font-weight: var(--fw-medium); }
</style>
