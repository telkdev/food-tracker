<script setup lang="ts">
import type { EntrySource, Per100 } from '~/utils/types'
import { preview } from '~/utils/format'
const props = defineProps<{ per100: Per100, grams: number, source: EntrySource }>()
const { t, n } = useT()
const v = computed(() => preview(props.per100, props.grams))
const approx = computed(() => props.source === 'estimate')
</script>

<template>
  <div class="pv" :class="{ approx }" aria-live="polite">
    <div class="kcal num"><span v-if="approx">≈ </span>{{ n(v.kcal) }} <small>{{ t('kcal') }}</small></div>
    <div class="m num">
      <span><i class="dot p" />{{ t('proteinShort') }} {{ n(v.p, 1) }}</span>
      <span><i class="dot f" />{{ t('fatShort') }} {{ n(v.f, 1) }}</span>
      <span><i class="dot c" />{{ t('carbsShort') }} {{ n(v.c, 1) }}</span>
    </div>
    <p v-if="approx" class="hint">{{ t('estimateHint') }}</p>
  </div>
</template>

<style scoped>
.pv { display: grid; justify-items: center; gap: 4px; padding: var(--s-3); border-radius: var(--r-md); background: var(--surface-2); }
.pv.approx { background: var(--estimate-soft); }
.kcal { font-size: var(--fs-2xl); font-weight: var(--fw-black); letter-spacing: -0.02em; }
.kcal small { font-size: var(--fs-sm); font-weight: var(--fw-medium); color: var(--ink-2); }
.approx .kcal { color: var(--estimate); }
.m { display: flex; gap: var(--s-4); font-size: var(--fs-sm); color: var(--ink-2); }
.m span { display: inline-flex; align-items: center; gap: 5px; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot.p { background: var(--protein); } .dot.f { background: var(--fat); } .dot.c { background: var(--carbs); }
.hint { font-size: var(--fs-xs); color: var(--estimate); }
</style>
