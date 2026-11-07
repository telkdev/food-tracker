<script setup lang="ts">
import type { Entry, Meal, Totals } from '~/utils/types'
const props = defineProps<{ meal: Meal, data: { totals: Totals, entries: Entry[] } }>()
defineEmits<{ add: [Meal], open: [Entry, Meal], save: [Meal] }>()
const { t, n } = useT()
const hasEstimate = computed(() => props.data.entries.some(e => e.source === 'estimate'))
</script>

<template>
  <section class="meal card" :aria-labelledby="`meal-${meal}`">
    <header class="mh">
      <div class="mt">
        <h2 :id="`meal-${meal}`">{{ t(meal) }}</h2>
        <span v-if="data.entries.length" class="mk num">{{ hasEstimate ? '≈ ' : '' }}{{ n(data.totals.kcal) }} {{ t('kcal') }}</span>
        <span v-else class="mk empty">{{ t('nothingYet') }}</span>
      </div>
      <button v-if="data.entries.length" type="button" class="save" :aria-label="t('saveAsUsual')" :title="t('saveAsUsual')" @click="$emit('save', meal)"><Icon name="bookmark" :size="20" /></button>
      <button type="button" class="add" :aria-label="t('addTo', { meal: t(meal) })" @click="$emit('add', meal)"><Icon name="plus" :size="22" /></button>
    </header>
    <div v-if="data.entries.length" class="entries">
      <EntryRow v-for="e in data.entries" :key="e.id" :entry="e" @open="$emit('open', $event, meal)" />
    </div>
  </section>
</template>

<style scoped>
.meal { overflow: hidden; }
.mh { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-2) var(--s-2) var(--s-2) var(--s-4); min-height: 60px; }
.mt { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: var(--s-2); flex-wrap: wrap; }
.mt h2 { font-size: var(--fs-lg); }
.mk { font-size: var(--fs-sm); color: var(--ink-2); font-weight: var(--fw-medium); }
.mk.empty { color: var(--ink-3); font-weight: var(--fw-regular); }
.add {
  flex: none; width: var(--tap); height: var(--tap); display: grid; place-items: center; border: 0; border-radius: 50%;
  background: var(--accent-soft); color: var(--accent-soft-ink); transition: transform var(--dur-fast), background var(--dur-fast);
}
.save {
  flex: none; width: var(--tap); height: var(--tap); display: grid; place-items: center; border: 0; border-radius: 50%;
  background: transparent; color: var(--ink-2);
}
.save:active { background: var(--surface-2); }
.add:active { transform: scale(.92); background: var(--accent); color: var(--accent-ink); }
.entries { border-top: 1px solid var(--line); display: grid; }
.entries > :deep(.entry + .entry) { border-top: 1px solid var(--line); }
</style>
