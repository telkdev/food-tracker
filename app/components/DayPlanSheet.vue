<script setup lang="ts">
import type { Day, Entry, Meal } from '~/utils/types'
import { errMsg } from '~/utils/format'
import type { PlanFrom, PlanItem } from '~/composables/useDayPlan'

// "Fill the rest of the day": whole meals he ate before, sized to what is left, plus a top-up. Opened from the
// row on the calorie card. Nothing is logged until he taps + or "Log all". The plan itself lives in useDayPlan
// (shared with that row) and is recalculated by the page whenever the day changes.
const props = defineProps<{ open: boolean, date: string, day: Day }>()
const emit = defineEmits<{ close: [], added: [Day, Entry[], string] }>()
const { t, n } = useT()
const toast = useToast()
const { plan, busy: fetching, fetchPlan, dontHave: drop, another: next } = useDayPlan()
const logging = ref(false)
const busy = computed(() => fetching.value || logging.value)

watch(() => props.open, (o) => { if (o && !plan.value) fetchPlan().catch(e => toast.show(errMsg(e, t('somethingWrong')))) })

const dontHave = (i: PlanItem) => drop(i).catch(e => toast.show(errMsg(e, t('somethingWrong'))))
const another = () => next().catch(e => toast.show(errMsg(e, t('somethingWrong'))))

/** items by meal, each meal with "like on 13.11" when it is a meal he ate before */
const groups = computed(() => {
  const out: { key: string, meal: Meal, asOn?: string, topUp: boolean, items: PlanItem[] }[] = []
  const items = plan.value?.items ?? []
  for (const i of items) {
    // a past meal and the single foods added to the same meal are shown apart: "Ужин · как 16.11", "Ужин · добавка"
    const key = `${i.meal}|${i.as_on ?? ''}`
    let g = out.find(x => x.key === key)
    if (!g) out.push(g = { key, meal: i.meal, asOn: i.as_on, topUp: !i.as_on && items.some(x => x.meal === i.meal && x.as_on), items: [] })
    g.items.push(i)
  }
  return out
})
const MACROS = [
  { k: 'p', icon: 'protein', color: 'var(--protein)', label: 'protein', short: 'proteinShort' },
  { k: 'f', icon: 'fat', color: 'var(--fat)', label: 'fat', short: 'fatShort' },
  { k: 'c', icon: 'carbs', color: 'var(--carbs)', label: 'carbs', short: 'carbsShort' },
] as const
const ddmm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`

async function log(items: PlanItem[]) {
  if (!items.length) return
  logging.value = true
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
    if (items.length === plan.value?.items.length) emit('close')
  }
  catch (e) { toast.show(errMsg(e, t('somethingWrong'))) }
  finally { logging.value = false }
}

// "now → after the plan" for each number, so the effect of tapping + is visible
const rows = computed(() => {
  const p = plan.value
  if (!p) return []
  const g = p.goal
  const tot = (k: 'kcal' | 'p' | 'f' | 'c') => Math.round(p.eaten[k] + p.plan[k])
  return [
    { k: 'kcal', icon: 'flame', color: 'var(--ink-3)', label: t('kcal'), now: Math.round(p.eaten.kcal), v: tot('kcal'), goal: g.kcal, cap: true, tol: g.kcal * 0.05 },
    { k: 'p', icon: 'protein', color: 'var(--protein)', label: t('protein'), now: Math.round(p.eaten.p), v: tot('p'), goal: g.p, cap: false, tol: 0 },
    { k: 'f', icon: 'fat', color: 'var(--fat)', label: t('fat'), now: Math.round(p.eaten.f), v: tot('f'), goal: g.f, cap: true, tol: 2 },
    { k: 'c', icon: 'carbs', color: 'var(--carbs)', label: t('carbs'), now: Math.round(p.eaten.c), v: tot('c'), goal: g.c, cap: false, tol: 0 },
  ].map(r => ({
    ...r,
    bad: r.goal != null && r.cap && r.v > r.goal + r.tol,
    ok: r.goal != null && !r.cap && r.v >= r.goal - 10,
  }))
})
const proteinShort = computed(() => {
  const p = plan.value?.left_after.p
  return p != null && p > 10 ? Math.round(p) : 0
})
const fatFull = computed(() => (plan.value?.left_now.f ?? 1) <= 0)
const fromLabel = (f: PlanFrom) => f === 'history' ? t('planFromHistory') : f === 'products' ? t('planFromProducts') : f === 'staple' ? t('planFromStaple') : ''
</script>

<template>
  <BottomSheet :open="open" :label="t('planTitle')" tall @close="emit('close')">
    <template #header>
      <div class="head">
        <span class="badge" aria-hidden="true"><Icon name="sparkle" :size="18" /></span>
        <h2>{{ t('planTitle') }}</h2>
        <button type="button" class="icon-btn" :aria-label="t('close')" @click="emit('close')"><Icon name="close" /></button>
      </div>
    </template>

    <div class="sheet">
      <p class="how">{{ t('planHow') }}</p>

      <p v-if="!plan && busy" class="hint">{{ t('planLoading') }}</p>
      <template v-else-if="plan">
        <p v-if="!plan.items.length" class="hint">{{ plan.left_now.kcal <= 50 ? t('planNothingLeft') : t('planEmpty') }}</p>
        <div v-else class="groups" :class="{ stale: busy }">
          <section v-for="g in groups" :key="g.key" class="group">
            <h3 class="gtitle">{{ t(g.meal) }}<span v-if="g.asOn" class="ason"> · {{ t('planAsOn', { date: ddmm(g.asOn) }) }}</span><span v-else-if="g.topUp" class="ason"> · {{ t('planTopUp') }}</span></h3>
            <ul class="items card">
              <li v-for="i in g.items" :key="i.key" class="item">
                <div class="it">
                  <span class="name">{{ i.name }}<span v-if="i.from !== 'recent' && !i.as_on" class="tag">{{ fromLabel(i.from) }}</span></span>
                  <span class="sub num"><b>{{ n(i.grams) }} {{ t('g') }}</b> · {{ n(Math.round(i.kcal)) }} {{ t('kcal') }}
                    <!-- same macro icons and colours as the calorie card -->
                    <span v-for="m in MACROS" :key="m.k" class="mac" :title="t(m.label)"><Icon :name="m.icon" :size="13" :style="{ color: m.color }" /><span class="sr">{{ t(m.short) }}</span>{{ n(i[m.k]) }}</span>
                  </span>
                </div>
                <!-- ✕ and + side by side on the right: one thumb, no reaching across the row -->
                <div class="acts">
                  <button type="button" class="act gone" :aria-label="t('planGone', { name: i.name })" :title="t('planGone', { name: i.name })" :disabled="busy" @click="dontHave(i)"><Icon name="close" :size="18" /></button>
                  <button type="button" class="act add" :aria-label="t('planLogOne', { name: i.name })" :title="t('planLogOne', { name: i.name })" :disabled="busy" @click="log([i])"><Icon name="plus" :size="22" /></button>
                </div>
              </li>
            </ul>
          </section>
        </div>

        <div v-if="plan.items.length" class="foot">
          <p class="lbl">{{ t('planAfter') }}</p>
          <dl class="grid num">
            <div v-for="r in rows" :key="r.k" :class="{ bad: r.bad, ok: r.ok }">
              <dt :title="r.label"><template v-if="r.k === 'kcal'">{{ r.label }}</template><template v-else><Icon :name="r.icon" :size="16" :style="{ color: r.color }" /><span class="sr">{{ r.label }}</span></template></dt>
              <dd><span class="was">{{ n(r.now) }}</span> → <b>{{ n(r.v) }}</b><template v-if="r.goal != null"><span class="of">/{{ n(r.goal) }}</span></template></dd>
            </div>
          </dl>
          <button v-if="plan.variants > 1" type="button" class="btn another" :disabled="busy" @click="another"><Icon name="refresh" :size="16" />{{ t('planAnother') }} <span class="num of">{{ plan.variant + 1 }}/{{ plan.variants }}</span></button>
          <p v-if="proteinShort || fatFull" class="note">
            <template v-if="fatFull">{{ t('planFatFull') }} </template>
            <template v-if="proteinShort">{{ t('planProteinShort', { g: n(proteinShort) }) }}</template>
          </p>
        </div>
      </template>
    </div>

    <template v-if="plan?.items.length" #footer>
      <button type="button" class="btn btn-primary btn-lg btn-block" :disabled="busy" @click="log(plan.items)">
        {{ plan.items.length > 1 ? t('planLogAll') : t('planLogOne', { name: plan.items[0]!.name }) }}
      </button>
    </template>
  </BottomSheet>
</template>

<style scoped>
.head { display: flex; align-items: center; gap: var(--s-3); }
.head h2 { flex: 1; font-size: var(--fs-lg); font-weight: var(--fw-bold); }
.badge { flex: none; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent-soft-ink); }
.sheet { display: grid; gap: var(--s-3); padding-bottom: var(--s-2); }
.how, .hint { font-size: var(--fs-sm); color: var(--ink-2); margin: 0; }
.groups { display: grid; gap: var(--s-4); transition: opacity .15s; }
.groups.stale { opacity: .5; }
.group { display: grid; gap: var(--s-2); }
.gtitle { font-size: var(--fs-sm); font-weight: var(--fw-bold); margin: 0; }
.ason { font-weight: var(--fw-regular); color: var(--ink-3); }
.items { list-style: none; margin: 0; padding: 0; overflow: hidden; }
.item { display: flex; align-items: center; gap: var(--s-2); padding: var(--s-2) var(--s-1) var(--s-2) var(--s-4); }
.item + .item { border-top: 1px solid var(--line); }
.it { flex: 1; min-width: 0; display: grid; gap: 2px; }
.name { font-weight: var(--fw-book); overflow-wrap: anywhere; }
.tag {
  display: inline-block; margin-left: var(--s-2); padding: 0 6px; border-radius: var(--r-pill); vertical-align: 1px;
  font-size: var(--fs-xs); font-weight: var(--fw-medium); background: var(--accent-soft); color: var(--accent-soft-ink); white-space: nowrap;
}
.sub { font-size: var(--fs-xs); color: var(--ink-3); }
.sub b { color: var(--ink); font-weight: var(--fw-medium); }
.mac { display: inline-flex; align-items: center; gap: 2px; margin-left: var(--s-2); white-space: nowrap; vertical-align: -2px; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.grid dt { display: flex; align-items: center; }
.acts { flex: none; display: flex; align-items: center; gap: 2px; }
.act {
  width: var(--tap); height: var(--tap); display: grid; place-items: center; border: 0; padding: 0; border-radius: 50%;
  background: transparent; color: var(--ink-3);
}
/* the visible circle is 32px; the 44px box is the tap target */
/* ✕ is quiet (outline), + is the action: a solid green circle, bigger */
.act.gone { color: var(--ink-3); background: radial-gradient(circle, transparent 15px, var(--line-strong) 15.5px, var(--line-strong) 16.5px, transparent 17px); }
.act.gone:active { background: radial-gradient(circle, var(--surface-2) 16.5px, transparent 17px); }
.act.add { color: var(--accent-ink); background: radial-gradient(circle, var(--accent) 18.5px, transparent 19px); }
.act.add :deep(svg) { stroke-width: 2.4; }
.act.add:active { background: radial-gradient(circle, var(--accent-hover) 18.5px, transparent 19px); }
.another { justify-self: start; display: inline-flex; align-items: center; gap: var(--s-2); }
.another .of { color: var(--ink-3); font-size: var(--fs-xs); }
.foot { display: grid; gap: var(--s-2); }
.foot .lbl { font-size: var(--fs-xs); color: var(--ink-2); margin: 0; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-2) var(--s-4); margin: 0; }
.grid div { min-width: 0; display: flex; align-items: baseline; gap: var(--s-2); }
.grid dt { font-size: var(--fs-xs); color: var(--ink-3); min-width: 2.2em; }
.grid dd { margin: 0; font-size: var(--fs-sm); white-space: nowrap; }
.grid .was { color: var(--ink-3); }
.grid .of { color: var(--ink-3); font-size: var(--fs-xs); }
.grid .bad b { color: var(--over); }
.grid .ok b { color: var(--accent); }
.note { font-size: var(--fs-xs); color: var(--ink-2); margin: 0; }
</style>
