<script setup lang="ts">
import type { Day, Entry, Meal, Per100 } from '~/utils/types'
import { errMsg } from '~/utils/format'

// "Rest of the day": portions of recently eaten foods that fit what's left. Fetched only on tap;
// nothing is logged until he taps + or "Log all". While open, it recalculates whenever the day
// changes (an entry added, edited or deleted here or from a Claude chat).
interface PlanItem { key: string, name: string, product_id: string | null, per100: Per100, source: string, grams: number, meal: Meal, kcal: number, p: number, f: number, c: number }
interface Plan {
  goal: { kcal: number, p: number | null, f: number | null, c: number | null }
  eaten: { kcal: number, p: number, f: number, c: number }
  left_now: { kcal: number, p: number | null, f: number | null, c: number | null }
  items: PlanItem[]
  plan: { kcal: number, p: number, f: number, c: number }
  left_after: { kcal: number, p: number | null, f: number | null, c: number | null }
  gaps: string[]
}

const props = defineProps<{ date: string, day: Day }>()
const emit = defineEmits<{ added: [Day, Entry[], string] }>()
const { t, n } = useT()
const toast = useToast()

const plan = ref<Plan | null>(null)
const open = ref(false)
const busy = ref(false)
/** foods he said he doesn't have: sent as both group key and name, so a food logged with and without a product goes too */
const gone = ref<{ key: string, name: string }[]>([])

// what is left right now, from the diary itself (shown before the first tap)
const leftKcal = computed(() => Math.round(props.day.goal.kcal - props.day.totals.kcal))
const leftP = computed(() => props.day.goal.p == null ? null : Math.round(props.day.goal.p - props.day.totals.p))

async function fetchPlan() {
  busy.value = true
  try {
    const exclude = gone.value.flatMap(g => [g.key, g.name.slice(0, 100)])
    plan.value = await $fetch<Plan>('/api/plan', { query: exclude.length ? { exclude } : {} })
  }
  catch (e) { toast.show(errMsg(e, t('somethingWrong'))) }
  finally { busy.value = false }
}

function openPlan() {
  open.value = true
  fetchPlan()
}
function close() {
  open.value = false
  plan.value = null
  gone.value = []
}

function dontHave(i: PlanItem) {
  gone.value.push({ key: i.key, name: i.name })
  // drop it right away so the tap feels instant, then refill with a replacement
  if (plan.value) plan.value = { ...plan.value, items: plan.value.items.filter(x => x.key !== i.key) }
  fetchPlan()
}

async function log(items: PlanItem[]) {
  if (!items.length) return
  busy.value = true
  try {
    const byMeal = new Map<Meal, PlanItem[]>()
    for (const i of items) byMeal.set(i.meal, [...(byMeal.get(i.meal) ?? []), i])
    let day: Day | null = null
    const created: Entry[] = []
    for (const [meal, list] of byMeal) {
      const r = await $fetch<{ created: Entry[], day: Day }>('/api/entries', {
        method: 'POST',
        body: {
          date: props.date, meal,
          items: list.map(i => i.product_id
            ? { name: i.name, grams: i.grams, product_id: i.product_id }
            : { name: i.name, grams: i.grams, per100: i.per100, source: i.source }),
        },
      })
      day = r.day
      created.push(...r.created)
    }
    emit('added', day!, created, items.length === 1 ? items[0]!.name : t('planLogged'))
    // the whole plan is in the diary now: nothing left to suggest
    if (items.length === plan.value?.items.length) close()
  }
  catch (e) { toast.show(errMsg(e, t('somethingWrong'))) }
  finally { busy.value = false }
}

// any change to the day (added, edited, deleted, here or from a chat) → recalculate the open plan
const stamp = computed(() => {
  const tt = props.day.totals
  const count = Object.values(props.day.meals).reduce((a, m) => a + m.entries.length, 0)
  return `${count}|${tt.kcal}|${tt.p}|${tt.f}|${tt.c}`
})
let timer: ReturnType<typeof setTimeout> | undefined
watch(stamp, () => {
  if (!open.value) return
  clearTimeout(timer)
  timer = setTimeout(fetchPlan, 250)
})
onBeforeUnmount(() => clearTimeout(timer))

// "now → after the plan" for each number, so the effect of tapping + is visible
const rows = computed(() => {
  const p = plan.value
  if (!p) return []
  const g = p.goal
  const tot = (k: 'kcal' | 'p' | 'f' | 'c') => Math.round(p.eaten[k] + p.plan[k])
  return [
    { k: 'kcal', label: t('kcal'), now: Math.round(p.eaten.kcal), v: tot('kcal'), goal: g.kcal, cap: true, tol: g.kcal * 0.05 },
    { k: 'p', label: t('proteinShort'), now: Math.round(p.eaten.p), v: tot('p'), goal: g.p, cap: false, tol: 0 },
    { k: 'f', label: t('fatShort'), now: Math.round(p.eaten.f), v: tot('f'), goal: g.f, cap: true, tol: 2 },
    { k: 'c', label: t('carbsShort'), now: Math.round(p.eaten.c), v: tot('c'), goal: g.c, cap: false, tol: 0 },
  ].map(r => ({
    ...r,
    bad: r.goal != null && r.cap && r.v > r.goal + r.tol,
    short: r.goal != null && !r.cap && r.k === 'p' && r.v < r.goal - 10,
  }))
})
const proteinShort = computed(() => {
  const p = plan.value?.left_after.p
  return p != null && p > 10 ? Math.round(p) : 0
})
const fatFull = computed(() => (plan.value?.left_now.f ?? 1) <= 0)
</script>

<template>
  <section class="plan card" :class="{ open }" :aria-label="t('planTitle')">
    <!-- closed: one big tappable row with what's left, so it's clear what it will do -->
    <button v-if="!open" type="button" class="cta" @click="openPlan">
      <span class="badge" aria-hidden="true"><Icon name="sparkle" :size="22" /></span>
      <span class="ct">
        <span class="title">{{ t('planTitle') }}</span>
        <span class="hint num">
          <template v-if="leftKcal > 50">{{ t('planLeftNow', { kcal: n(leftKcal) }) }}<template v-if="leftP != null && leftP > 0"> · {{ t('proteinShort') }} {{ n(leftP) }} {{ t('g') }}</template> · {{ t('planHint') }}</template>
          <template v-else>{{ t('planNothingLeft') }}</template>
        </span>
      </span>
      <Icon name="right" :size="20" class="chev" />
    </button>

    <template v-else>
      <header class="ph">
        <span class="badge sm" aria-hidden="true"><Icon name="sparkle" :size="18" /></span>
        <h2>{{ t('planTitle') }}</h2>
        <button type="button" class="icon-btn" :aria-label="t('planHide')" @click="close"><Icon name="close" :size="20" /></button>
      </header>
      <p class="how">{{ t('planHow') }}</p>

      <p v-if="!plan && busy" class="hint pad">{{ t('planLoading') }}</p>
      <template v-else-if="plan">
        <p v-if="!plan.items.length" class="hint pad">{{ plan.left_now.kcal <= 50 ? t('planNothingLeft') : t('planEmpty') }}</p>
        <ul v-else class="items" :class="{ stale: busy }">
          <li v-for="i in plan.items" :key="i.key" class="item">
            <button type="button" class="icon-btn gone" :aria-label="t('planGone', { name: i.name })" :title="t('planGone', { name: i.name })" :disabled="busy" @click="dontHave(i)"><Icon name="close" :size="16" /></button>
            <div class="it">
              <span class="name">{{ i.name }}</span>
              <span class="sub num">{{ t(i.meal) }} · <b>{{ n(i.grams) }} {{ t('g') }}</b> · {{ n(Math.round(i.kcal)) }} {{ t('kcal') }} · {{ t('proteinShort') }} {{ n(i.p) }} · {{ t('fatShort') }} {{ n(i.f) }} · {{ t('carbsShort') }} {{ n(i.c) }}</span>
            </div>
            <button type="button" class="add" :aria-label="t('planLogOne', { name: i.name })" :title="t('planLogOne', { name: i.name })" :disabled="busy" @click="log([i])"><Icon name="plus" :size="20" /></button>
          </li>
        </ul>

        <div v-if="plan.items.length" class="foot">
          <p class="lbl">{{ t('planAfter') }}</p>
          <dl class="grid num">
            <div v-for="r in rows" :key="r.k" :class="{ bad: r.bad, short: r.short }">
              <dt>{{ r.label }}</dt>
              <dd><span class="was">{{ n(r.now) }}</span> → <b>{{ n(r.v) }}</b><template v-if="r.goal != null"><span class="of">/{{ n(r.goal) }}</span></template></dd>
            </div>
          </dl>
          <p v-if="proteinShort || fatFull" class="note">
            <template v-if="fatFull">{{ t('planFatFull') }} </template>
            <template v-if="proteinShort">{{ t('planProteinShort', { g: n(proteinShort) }) }}</template>
          </p>
          <button type="button" class="btn btn-primary all" :disabled="busy" @click="log(plan.items)">
            {{ plan.items.length > 1 ? t('planLogAll') : t('planLogOne', { name: plan.items[0]!.name }) }}
          </button>
        </div>
      </template>
    </template>
  </section>
</template>

<style scoped>
.plan { overflow: hidden; }
.cta {
  width: 100%; display: flex; align-items: center; gap: var(--s-3); text-align: left; border: 0; background: none; color: inherit;
  padding: var(--s-3) var(--s-3) var(--s-3) var(--s-4); min-height: 64px; cursor: pointer; font: inherit;
}
.cta:active { background: var(--accent-soft); }
.badge {
  flex: none; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center;
  background: var(--accent); color: var(--accent-ink);
}
.badge.sm { width: 30px; height: 30px; }
.ct { flex: 1; min-width: 0; display: grid; gap: 2px; }
.title { font-size: var(--fs-md); font-weight: var(--fw-bold); }
.hint { font-size: var(--fs-xs); color: var(--ink-2); }
.chev { flex: none; color: var(--ink-3); }
.ph { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-2) var(--s-2) 0 var(--s-4); min-height: 52px; }
.ph h2 { flex: 1; font-size: var(--fs-md); font-weight: var(--fw-bold); }
.how { font-size: var(--fs-xs); color: var(--ink-2); padding: 0 var(--s-4) var(--s-3); margin: 0; }
.pad { padding: 0 var(--s-4) var(--s-4); }
.items { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); transition: opacity .15s; }
.items.stale { opacity: .5; }
.item { display: flex; align-items: center; gap: var(--s-1); padding: var(--s-2) var(--s-2) var(--s-2) var(--s-1); }
.item + .item { border-top: 1px solid var(--line); }
.gone { flex: none; color: var(--ink-3); }
.it { flex: 1; min-width: 0; display: grid; gap: 2px; }
.name { font-weight: var(--fw-book); overflow-wrap: anywhere; }
.sub { font-size: var(--fs-xs); color: var(--ink-3); }
.sub b { color: var(--ink); font-weight: var(--fw-medium); }
.add {
  flex: none; width: var(--tap); height: var(--tap); display: grid; place-items: center; border: 0; border-radius: 50%;
  background: radial-gradient(circle, var(--accent-soft) 15.5px, transparent 16px); color: var(--accent-soft-ink);
}
.add:active { background: radial-gradient(circle, var(--accent) 15.5px, transparent 16px); color: var(--accent-ink); }
.foot { border-top: 1px solid var(--line); padding: var(--s-3) var(--s-4) var(--s-4); display: grid; gap: var(--s-2); }
.foot .lbl { font-size: var(--fs-xs); color: var(--ink-2); margin: 0; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-2) var(--s-4); margin: 0; }
.grid div { min-width: 0; }
.grid div { display: flex; align-items: baseline; gap: var(--s-2); }
.grid dt { font-size: var(--fs-xs); color: var(--ink-3); min-width: 2.2em; }
.grid dd { margin: 0; font-size: var(--fs-sm); white-space: nowrap; }
.grid .was { color: var(--ink-3); }
.grid .of { color: var(--ink-3); font-size: var(--fs-xs); }
.grid .bad b { color: var(--over); }
.grid .short b { color: var(--ink-2); }
.note { font-size: var(--fs-xs); color: var(--ink-2); margin: 0; }
.all { width: 100%; }
</style>
