<script setup lang="ts">
import { macroEnergySplit } from '~/utils/format'
const props = defineProps<{ p: number | null, f: number | null, c: number | null }>()
const { t } = useT()
const s = computed(() => macroEnergySplit(props.p, props.f, props.c))
const label = computed(() => s.value
  ? `${t('protein')} ${s.value.p}%, ${t('fat')} ${s.value.f}%, ${t('carbs')} ${s.value.c}% ${t('kcal')}`
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
      <span class="tp">{{ t('proteinShort') }} {{ s.p }}</span>
      <span class="tf">{{ t('fatShort') }} {{ s.f }}</span>
      <span class="tc">{{ t('carbsShort') }} {{ s.c }}%</span>
    </span>
  </span>
</template>

<style scoped>
.split { display: flex; align-items: center; gap: var(--s-2); min-width: 0; }
.bar { flex: 1; display: flex; gap: 1px; height: 4px; min-width: 40px; max-width: 220px; border-radius: 2px; overflow: hidden; background: var(--surface-2); }
.bar i { display: block; flex-basis: 0; height: 100%; min-width: 0; }
.p { background: var(--protein); } .f { background: var(--fat); } .c { background: var(--carbs); }
.pct { flex: none; display: inline-flex; gap: 6px; font-size: var(--fs-2xs); color: var(--ink-3); white-space: nowrap; }
.tp { color: var(--protein); } .tf { color: var(--fat); } .tc { color: var(--carbs); }
</style>
