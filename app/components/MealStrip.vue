<script setup lang="ts">
import { MEALS, type Meal, type Totals } from '~/utils/types'

/**
 * Compact overview of the four meals right under the calorie card, so they are visible
 * without scrolling. The ring shows the meal's share of the daily goal; tapping it adds food,
 * tapping the name jumps to that meal's list below.
 */
const props = defineProps<{ meals: Record<Meal, { totals: Totals, entries: { source: string }[] }>, goal: number }>()
defineEmits<{ add: [Meal], jump: [Meal] }>()
const { t, n } = useT()
const items = computed(() => MEALS.map(m => ({
  m,
  kcal: props.meals[m].totals.kcal,
  count: props.meals[m].entries.length,
  approx: props.meals[m].entries.some(e => e.source === 'estimate'),
})))
</script>

<template>
  <section class="strip card" :aria-label="t('tabToday')">
    <div v-for="i in items" :key="i.m" class="tile">
      <button type="button" class="ringbtn" :aria-label="t('addTo', { meal: t(i.m) })" @click="$emit('add', i.m)">
        <ProgressRing :value="i.kcal" :max="goal" :size="52" :stroke="3">
          <Icon name="plus" :size="20" class="plus" />
        </ProgressRing>
      </button>
      <button type="button" class="lbl" :disabled="!i.count" @click="$emit('jump', i.m)">
        <span class="name">{{ t(i.m) }}</span>
        <span class="kcal num" :class="{ empty: !i.count }">{{ i.count ? `${i.approx ? '≈' : ''}${n(i.kcal)}` : '—' }}<small v-if="i.count">&nbsp;{{ t('kcal') }}</small></span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); padding: var(--s-3) var(--s-2) var(--s-2); }
.tile { display: grid; justify-items: center; gap: 2px; min-width: 0; }
.ringbtn { padding: 0; border: 0; background: none; border-radius: 50%; color: var(--accent); }
.ringbtn :deep(.track) { stroke: var(--track); }
.ringbtn:active { transform: scale(.94); }
.plus { color: var(--accent); }
.lbl {
  display: grid; justify-items: center; gap: 0; width: 100%; min-height: var(--tap); padding: 2px 0;
  border: 0; background: none; color: inherit; border-radius: var(--r-sm);
}
.lbl:disabled { cursor: default; }
.name { font-size: var(--fs-sm); font-weight: var(--fw-book); max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kcal { font-size: var(--fs-xs); color: var(--ink-2); }
.kcal.empty { color: var(--ink-3); }
.kcal small { font-size: var(--fs-2xs); color: var(--ink-3); }
</style>
