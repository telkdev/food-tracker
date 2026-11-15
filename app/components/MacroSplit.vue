<script setup lang="ts">
import { macroEnergySplit } from '~/utils/format'
const props = defineProps<{ p: number | null, f: number | null, c: number | null }>()
const { t, n } = useT()
// bar = share of energy; text = grams of each macro in this portion
const s = computed(() => macroEnergySplit(props.p, props.f, props.c))
const g = (v: number | null) => n(Math.max(0, v ?? 0), (v ?? 0) < 10 ? 1 : 0)
const label = computed(() => s.value
  ? `${t('protein')} ${g(props.p)} ${t('g')}, ${t('fat')} ${g(props.f)} ${t('g')}, ${t('carbs')} ${g(props.c)} ${t('g')}`
  : '')
</script>

<template>
  <span v-if="s" class="split" :title="label" :aria-label="label" role="img">
    <span class="bar" aria-hidden="true">
      <i v-if="s.p" class="p" :style="{ flexGrow: s.p }" />
      <i v-if="s.f" class="f" :style="{ flexGrow: s.f }" />
      <i v-if="s.c" class="c" :style="{ flexGrow: s.c }" />
    </span>
    <span class="pct num" aria-hidden="true">
      <span class="tp">{{ t('proteinShort') }} {{ g(p) }}</span>
      <span class="tf">{{ t('fatShort') }} {{ g(f) }}</span>
      <span class="tc">{{ t('carbsShort') }} {{ g(c) }} {{ t('g') }}</span>
    </span>
  </span>
</template>

<style scoped>
.split { display: flex; align-items: center; gap: var(--s-2); min-width: 0; }
.bar { flex: 1; display: flex; gap: 1px; height: 3px; min-width: 40px; max-width: 200px; border-radius: 2px; overflow: hidden; background: var(--track); }
.bar i { display: block; flex-basis: 0; height: 100%; min-width: 0; }
.p { background: var(--protein); } .f { background: var(--fat); } .c { background: var(--carbs); }
.pct { flex: none; display: inline-flex; gap: 6px; font-size: var(--fs-2xs); color: var(--ink-3); white-space: nowrap; }
/* letters identify the macros; colour stays on the bar only */
.tp, .tf, .tc { color: inherit; }
</style>
