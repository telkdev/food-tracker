<script setup lang="ts">
import type { ExtraKey, Extras } from '~/utils/types'

/**
 * Fiber, sugar and salt for the day. Fiber is a minimum to reach; sugar and salt are limits.
 * Values are only known for part of the food (old entries and estimates have none), so the
 * coverage line says how much of the day's kcal the numbers are based on.
 */
const props = defineProps<{ extras: Extras, goal: Record<ExtraKey, number>, kcal: number }>()
const emit = defineEmits<{ open: [key: ExtraKey] }>()
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
// collapsed by default to one summary row; the choice is remembered on this device
const openKey = 'extras-open'
const open = ref(false)
onMounted(() => { try { open.value = localStorage.getItem(openKey) === '1' } catch {} })
function toggle() {
  open.value = !open.value
  try { localStorage.setItem(openKey, open.value ? '1' : '0') } catch {}
}
</script>

<template>
  <section class="extras card" :class="{ open }" :aria-label="t('fssTitle')">
    <button type="button" class="sum" :aria-expanded="open" :aria-label="t('fssTitle')" @click="toggle">
      <span v-for="r in rows" :key="r.key" class="si num" :class="{ over: r.over }">
        <Icon :name="r.key" :size="18" :style="{ color: `var(--${r.key})` }" />
        <b>{{ n(r.g, r.digits) }}</b><span class="of">/{{ n(r.goal) }}</span>
      </span>
      <Icon name="right" :size="18" class="chev" />
    </button>
    <ul v-if="open" class="rows">
      <li v-for="r in rows" :key="r.key">
        <button type="button" class="row" :aria-label="t('srcOpen', { name: t(r.key) })" @click="emit('open', r.key)">
        <Icon :name="r.key" :size="22" class="ico" :style="{ color: `var(--${r.key})` }" />
        <span class="lbl">
          {{ t(r.key) }}
          <small v-if="r.key === 'sugar'" class="sub">{{ t('sugarHint') }}</small>
        </span>
        <span class="val num" :class="{ over: r.over }">
          <b>{{ n(r.g, r.digits) }}</b><span class="of"> / <template v-if="r.limit">≤ </template>{{ n(r.goal) }} {{ t('g') }}</span>
        </span>
        <Icon name="right" :size="16" class="go" />
        <span class="bar" :class="{ empty: none }"><span :style="{ width: `${r.frac * 100}%`, background: r.over ? 'var(--over)' : `var(--${r.key})` }" /></span>
        </button>
      </li>
    </ul>
    <p v-if="open" class="note">
      <template v-if="none">{{ t('extrasNone') }}</template>
      <template v-else-if="coverage < 0.995"><span class="approx">≈</span> {{ t('extrasCoverage', { n: Math.round(coverage * 100) }) }}</template>
      <template v-else>{{ t('extrasNorm') }}</template>
    </p>
  </section>
</template>

<style scoped>
.extras { padding: 0 var(--s-5) 0 var(--s-4); display: grid; gap: var(--s-3); }
.extras.open { padding-bottom: var(--s-4); }
.sum { display: flex; align-items: center; gap: var(--s-3); min-height: 48px; padding: 0; border: 0; background: none; color: inherit; text-align: left; }
.si { flex: 1; display: inline-flex; align-items: center; gap: 4px; font-size: var(--fs-xs); white-space: nowrap; min-width: 0; }
.si b { font-size: var(--fs-sm); font-weight: var(--fw-medium); }
.si.over b { color: var(--over); }
.chev { flex: none; color: var(--ink-3); transition: transform var(--dur-fast) var(--ease); }
.open .chev { transform: rotate(90deg); }
.rows { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-3); }
.row {
  width: 100%; display: grid; grid-template-columns: 22px minmax(0, 1fr) auto 16px; grid-template-rows: auto 4px; column-gap: var(--s-3); row-gap: 6px; align-items: center;
  margin: -6px -8px; padding: 6px 8px; box-sizing: content-box; border: 0; border-radius: var(--r-sm); background: none; color: inherit; font: inherit; text-align: left; cursor: pointer;
  -webkit-tap-highlight-color: transparent; transition: background var(--dur-fast) var(--ease);
}
.row:active { background: var(--surface-2); }
@media (hover: hover) { .row:hover { background: var(--surface-2); } }
.go { color: var(--ink-3); opacity: .7; }
.ico { grid-row: 1; }
.lbl { font-size: var(--fs-md); font-weight: var(--fw-regular); color: var(--ink); display: grid; line-height: 1.25; min-width: 0; }
.sub { font-size: var(--fs-2xs); color: var(--ink-3); }
.val { font-size: var(--fs-sm); white-space: nowrap; }
.val b { font-size: var(--fs-md); font-weight: var(--fw-medium); }
.val.over b { color: var(--over); }
.of { color: var(--ink-3); }
.bar { grid-column: 2 / -2; height: 4px; border-radius: 2px; background: var(--track); overflow: hidden; }
.bar span { display: block; height: 100%; border-radius: 2px; transition: width var(--dur-slow) var(--ease); }
.note { margin: 0; font-size: var(--fs-xs); color: var(--ink-3); }
.approx { color: var(--estimate); }
</style>
