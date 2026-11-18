<script setup lang="ts">
import type { Day } from '~/utils/types'
import { nutrientSources, sourceDigits, type SourceKey } from '~/utils/sources'

/**
 * Where a day's protein / fat / carbs / fiber / sugar / salt came from: one quiet row per food,
 * biggest first, with the grams it gave, its share and a hairline share bar.
 */
const props = defineProps<{ day: Day, nutrient: SourceKey | null }>()
const emit = defineEmits<{ close: [] }>()
const { t, n } = useT()

// keep the last key while the sheet slides out, so the content doesn't blank mid-animation
const shown = ref<SourceKey>('sugar')
watch(() => props.nutrient, (k) => { if (k) shown.value = k }, { immediate: true })

const META: Record<SourceKey, { icon: string, label: 'protein' | 'fat' | 'carbs' | 'fiber' | 'sugar' | 'salt', limit: boolean }> = {
  p: { icon: 'protein', label: 'protein', limit: false },
  f: { icon: 'fat', label: 'fat', limit: false },
  c: { icon: 'carbs', label: 'carbs', limit: false },
  fiber: { icon: 'fiber', label: 'fiber', limit: false },
  sugar: { icon: 'sugar', label: 'sugar', limit: true },
  salt: { icon: 'salt', label: 'salt', limit: true },
}
const meta = computed(() => META[shown.value])
const color = computed(() => `var(--${meta.value.icon})`)
const data = computed(() => nutrientSources(props.day, shown.value))
// header numbers match the cards on Today (server-rounded), the rows add up to the same thing
const total = computed(() => {
  const k = shown.value
  return k === 'p' || k === 'f' || k === 'c' ? props.day.totals[k] : props.day.extras?.[k].g ?? data.value.total
})
const goal = computed(() => {
  const k = shown.value
  return k === 'p' || k === 'f' || k === 'c' ? props.day.goal[k] : props.day.extras_goal?.[k] ?? null
})
const over = computed(() => meta.value.limit && goal.value != null && total.value > goal.value)
const digits = computed(() => shown.value === 'salt' ? 1 : total.value < 10 ? 1 : 0)
// bars are scaled to the biggest source so small rows still read; the % says the real share
const top = computed(() => data.value.items[0]?.g || 1)
const pct = (s: number) => s >= 0.995 ? '100%' : s < 0.01 ? '<1%' : `${Math.round(s * 100)}%`
</script>

<template>
  <BottomSheet :open="!!nutrient" :label="`${t(meta.label)}: ${t('srcFrom')}`" @close="emit('close')">
    <template #header>
      <div class="head">
        <span class="badge" aria-hidden="true" :style="{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }">
          <Icon :name="meta.icon" :size="18" />
        </span>
        <div class="ttl">
          <h2>{{ t(meta.label) }}</h2>
          <span class="tsub">{{ t('srcFrom') }}</span>
        </div>
        <span class="tot num" :class="{ over }">
          <b>{{ n(total, digits) }}</b><span class="of"><template v-if="goal != null"> / <template v-if="meta.limit">≤ </template>{{ n(goal) }}</template> {{ t('g') }}</span>
        </span>
        <button type="button" class="icon-btn" :aria-label="t('close')" @click="emit('close')"><Icon name="close" /></button>
      </div>
    </template>

    <div class="sheet">
      <p v-if="!data.items.length" class="empty">{{ t('srcEmpty') }}</p>
      <ol v-else class="items">
        <li v-for="it in data.items" :key="it.key" class="item">
          <span class="name">{{ it.name }}</span>
          <span class="amt num"><span v-if="it.estimate" class="approx">≈</span><b>{{ n(it.g, sourceDigits(shown, it.g)) }}</b> {{ t('g') }}</span>
          <span class="sub num">
            {{ it.meals.map(m => t(m)).join(', ') }} · {{ n(it.grams) }} {{ t('g') }}<template v-if="it.times > 1"> · ×{{ it.times }}</template>
          </span>
          <span class="share num">{{ pct(it.share) }}</span>
          <span class="bar" aria-hidden="true"><span :style="{ width: `${Math.max(2, it.g / top * 100)}%`, background: color }" /></span>
        </li>
      </ol>
      <p v-if="data.zero || data.unknown.count" class="note">
        <template v-if="data.zero">{{ t('srcZero', { n: data.zero }) }}</template>
        <template v-if="data.zero && data.unknown.count"> · </template>
        <template v-if="data.unknown.count">{{ t('srcUnknown', { kcal: n(data.unknown.kcal) }) }}</template>
      </p>
    </div>
  </BottomSheet>
</template>

<style scoped>
.head { display: flex; align-items: center; gap: var(--s-3); }
.badge { flex: none; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; }
.ttl { flex: 1; min-width: 0; display: grid; line-height: 1.2; }
.ttl h2 { margin: 0; font-size: var(--fs-lg); font-weight: var(--fw-bold); }
.tsub { font-size: var(--fs-xs); color: var(--ink-3); }
.tot { flex: none; font-size: var(--fs-sm); white-space: nowrap; }
.tot b { font-size: var(--fs-lg); font-weight: var(--fw-medium); letter-spacing: -0.01em; }
.tot.over b { color: var(--over); }
.of { color: var(--ink-3); }
.sheet { display: grid; gap: var(--s-3); padding-bottom: var(--s-2); }
.items { list-style: none; margin: 0; padding: 0; }
.item {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto auto 3px;
  column-gap: var(--s-3); row-gap: 2px; padding: 10px 0;
}
.name { font-weight: var(--fw-book); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.amt { justify-self: end; font-size: var(--fs-sm); color: var(--ink-3); white-space: nowrap; }
.amt b { font-size: var(--fs-md); font-weight: var(--fw-medium); color: var(--ink); }
.sub { font-size: var(--fs-xs); color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.share { justify-self: end; font-size: var(--fs-xs); color: var(--ink-3); }
.bar { grid-column: 1 / -1; margin-top: 5px; height: 3px; border-radius: 2px; background: var(--track); overflow: hidden; }
.bar span { display: block; height: 100%; border-radius: 2px; transform-origin: left center; animation: grow var(--dur-slow) var(--ease) both; }
@keyframes grow { from { transform: scaleX(0); } }
.approx { color: var(--estimate); margin-right: 1px; }
.empty, .note { margin: 0; font-size: var(--fs-xs); color: var(--ink-3); }
.empty { padding: var(--s-4) 0; font-size: var(--fs-sm); }
@media (prefers-reduced-motion: reduce) { .bar span { animation: none; } }
</style>
