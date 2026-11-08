<script setup lang="ts">
import type { Day, Entry, Meal, Per100 } from '~/utils/types'
import { errMsg } from '~/utils/format'

// "Rest of the day": portions of recently eaten foods that fit what's left. Fetched only on tap;
// nothing is logged until he taps + or "Log all".
interface PlanItem { key: string, name: string, product_id: string | null, per100: Per100, source: string, grams: number, meal: Meal, kcal: number, p: number, f: number, c: number }
interface Plan {
  goal: { kcal: number, p: number | null, f: number | null, c: number | null }
  eaten: { kcal: number, p: number, f: number, c: number }
  items: PlanItem[]
  plan: { kcal: number, p: number, f: number, c: number }
  left_after: { kcal: number, p: number | null, f: number | null, c: number | null }
  gaps: string[]
}

const props = defineProps<{ date: string, stamp: string }>()
const emit = defineEmits<{ added: [Day, Entry[], string] }>()
const { t, n } = useT()
const toast = useToast()

const plan = ref<Plan | null>(null)
const busy = ref(false)
const exclude = ref<string[]>([])
const logged = ref(new Set<string>())

async function suggest() {
  busy.value = true
  try {
    plan.value = await $fetch<Plan>('/api/plan', { query: exclude.value.length ? { exclude: exclude.value.join(',') } : {} })
    logged.value = new Set()
  }
  catch (e) { toast.show(errMsg(e, t('somethingWrong'))) }
  finally { busy.value = false }
}

function gone(i: PlanItem) {
  exclude.value.push(i.product_id ?? i.name.replace(/,/g, ' '))
  suggest()
}

const pending = computed(() => plan.value?.items.filter(i => !logged.value.has(i.key)) ?? [])

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
      for (const i of list) logged.value.add(i.key)
    }
    logged.value = new Set(logged.value)
    emit('added', day!, created, items.length === 1 ? items[0]!.name : t('planLogged'))
    if (!pending.value.length) plan.value = null
  }
  catch (e) { toast.show(errMsg(e, t('somethingWrong'))) }
  finally { busy.value = false }
}

// a new entry (from the app or a Claude chat) makes the old plan stale
watch(() => props.stamp, () => { if (plan.value && !busy.value) plan.value = null })

const after = computed(() => {
  const p = plan.value
  if (!p) return []
  const g = p.goal
  const tot = (k: 'kcal' | 'p' | 'f' | 'c') => Math.round(p.eaten[k] + p.plan[k])
  return [
    { k: 'kcal', label: t('kcal'), v: tot('kcal'), goal: g.kcal, cap: false },
    { k: 'p', label: t('proteinShort'), v: tot('p'), goal: g.p, cap: false },
    { k: 'f', label: t('fatShort'), v: tot('f'), goal: g.f, cap: true },
    { k: 'c', label: t('carbsShort'), v: tot('c'), goal: g.c, cap: false },
  ]
})
</script>

<template>
  <section class="plan card" :aria-label="t('planTitle')">
    <header class="ph">
      <div class="pt">
        <h2>{{ t('planTitle') }}</h2>
        <p v-if="!plan" class="hint">{{ t('planHint') }}</p>
      </div>
      <button v-if="!plan" type="button" class="btn btn-ghost sug" :disabled="busy" @click="suggest">{{ t('planSuggest') }}</button>
      <button v-else type="button" class="icon-btn" :aria-label="t('planHide')" @click="plan = null"><Icon name="close" :size="20" /></button>
    </header>

    <template v-if="plan">
      <p v-if="!plan.items.length" class="hint pad">{{ t('planEmpty') }}</p>
      <ul v-else class="items">
        <li v-for="i in plan.items" :key="i.key" class="item" :class="{ done: logged.has(i.key) }">
          <div class="it">
            <span class="name">{{ i.name }}</span>
            <span class="sub num">{{ t(i.meal) }} · {{ n(i.grams) }} {{ t('g') }} · {{ n(Math.round(i.kcal)) }} {{ t('kcal') }} · {{ t('proteinShort') }} {{ n(i.p) }} · {{ t('fatShort') }} {{ n(i.f) }} · {{ t('carbsShort') }} {{ n(i.c) }}</span>
          </div>
          <template v-if="!logged.has(i.key)">
            <button type="button" class="icon-btn" :aria-label="t('planGone', { name: i.name })" :title="t('planGone', { name: i.name })" :disabled="busy" @click="gone(i)"><Icon name="close" :size="18" /></button>
            <button type="button" class="add" :aria-label="t('planLogOne', { name: i.name })" :disabled="busy" @click="log([i])"><Icon name="plus" :size="20" /></button>
          </template>
          <Icon v-else name="check" :size="20" class="ok" />
        </li>
      </ul>
      <div v-if="plan.items.length" class="foot">
        <p class="after num">
          <span class="lbl">{{ t('planAfter') }}:</span>
          <span v-for="a in after" :key="a.k" :class="{ bad: a.goal != null && (a.cap ? a.v > a.goal + 2 : a.k === 'kcal' ? a.v > a.goal * 1.05 : false) }">
            {{ a.label }} {{ n(a.v) }}<template v-if="a.goal != null">/{{ n(a.goal) }}</template>
          </span>
        </p>
        <button v-if="pending.length > 1" type="button" class="btn btn-primary" :disabled="busy" @click="log(pending)">{{ t('planLogAll') }}</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.plan { overflow: hidden; }
.ph { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-2) var(--s-2) var(--s-2) var(--s-4); min-height: 60px; }
.pt { flex: 1; min-width: 0; }
.pt h2 { font-size: var(--fs-lg); }
.hint { font-size: var(--fs-xs); color: var(--ink-2); }
.pad { padding: 0 var(--s-4) var(--s-4); }
.sug { color: var(--accent-soft-ink); background: var(--accent-soft); }
.items { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
.item { display: flex; align-items: center; gap: var(--s-1); padding: var(--s-2) var(--s-2) var(--s-2) var(--s-4); }
.item + .item { border-top: 1px solid var(--line); }
.item.done { opacity: .55; }
.it { flex: 1; min-width: 0; display: grid; gap: 2px; }
.name { font-weight: var(--fw-medium); overflow-wrap: anywhere; }
.sub { font-size: var(--fs-xs); color: var(--ink-2); }
.add {
  flex: none; width: var(--tap); height: var(--tap); display: grid; place-items: center; border: 0; border-radius: 50%;
  background: var(--accent-soft); color: var(--accent-soft-ink);
}
.add:active { background: var(--accent); color: var(--accent-ink); }
.ok { color: var(--accent); margin: 0 var(--s-3); }
.foot { border-top: 1px solid var(--line); padding: var(--s-3) var(--s-4); display: flex; align-items: center; gap: var(--s-3); flex-wrap: wrap; }
.after { flex: 1; min-width: 0; margin: 0; font-size: var(--fs-sm); display: flex; gap: var(--s-2); flex-wrap: wrap; }
.after .lbl { color: var(--ink-2); }
.after .bad { color: var(--over); font-weight: var(--fw-bold); }
</style>
