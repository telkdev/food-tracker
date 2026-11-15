<script setup lang="ts">
import type { ExtraKey, Extras } from '~/utils/types'

/**
 * Fiber, sugar and salt for the day. Fiber is a minimum to reach; sugar and salt are limits.
 * Values are only known for part of the food (old entries and estimates have none), so the
 * coverage line says how much of the day's kcal the numbers are based on.
 */
const props = defineProps<{ extras: Extras, goal: Record<ExtraKey, number>, kcal: number }>()
const { t, n } = useT()

const rows = computed(() => (['fiber', 'sugar', 'salt'] as const).map((k) => {
  const g = props.extras[k].g
  const goal = props.goal[k]
  const limit = k !== 'fiber'
  return {
    key: k, g, goal, limit,
    digits: k === 'salt' ? 1 : 0,
    frac: Math.min(1, goal ? g / goal : 0),
    over: limit && g > goal,
  }
}))
// one honest number: the lowest coverage of the three (they usually move together)
const coverage = computed(() => Math.min(...rows.value.map(r => props.extras[r.key].coverage)))
const none = computed(() => rows.value.every(r => !props.extras[r.key].coverage))
</script>

<template>
  <section class="extras card" :aria-label="t('fssTitle')">
    <ul class="rows">
      <li v-for="r in rows" :key="r.key" class="row">
        <Icon :name="r.key" :size="22" class="ico" :style="{ color: `var(--${r.key})` }" />
        <span class="lbl">
          {{ t(r.key) }}
          <small v-if="r.key === 'sugar'" class="sub">{{ t('sugarHint') }}</small>
        </span>
        <span class="val num" :class="{ over: r.over }">
          <b>{{ n(r.g, r.digits) }}</b><span class="of"> / <template v-if="r.limit">≤ </template>{{ n(r.goal) }} {{ t('g') }}</span>
        </span>
        <span class="bar" :class="{ empty: none }"><span :style="{ width: `${r.frac * 100}%`, background: r.over ? 'var(--over)' : `var(--${r.key})` }" /></span>
      </li>
    </ul>
    <p class="note">
      <template v-if="none">{{ t('extrasNone') }}</template>
      <template v-else-if="coverage < 0.995"><span class="approx">≈</span> {{ t('extrasCoverage', { n: Math.round(coverage * 100) }) }}</template>
      <template v-else>{{ t('extrasNorm') }}</template>
    </p>
  </section>
</template>

<style scoped>
.extras { padding: var(--s-4) var(--s-5); display: grid; gap: var(--s-3); }
.rows { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-3); }
.row { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; grid-template-rows: auto 4px; column-gap: var(--s-3); row-gap: 6px; align-items: center; }
.ico { grid-row: 1; }
.lbl { font-size: var(--fs-md); font-weight: var(--fw-regular); color: var(--ink); display: grid; line-height: 1.25; min-width: 0; }
.sub { font-size: var(--fs-2xs); color: var(--ink-3); }
.val { font-size: var(--fs-sm); white-space: nowrap; }
.val b { font-size: var(--fs-md); font-weight: var(--fw-medium); }
.val.over b { color: var(--over); }
.of { color: var(--ink-3); }
.bar { grid-column: 2 / -1; height: 4px; border-radius: 2px; background: var(--track); overflow: hidden; }
.bar span { display: block; height: 100%; border-radius: 2px; transition: width var(--dur-slow) var(--ease); }
.note { margin: 0; font-size: var(--fs-xs); color: var(--ink-3); }
.approx { color: var(--estimate); }
</style>
