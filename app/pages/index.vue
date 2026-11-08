<script setup lang="ts">
import type { Day, Entry, Meal, Pickable, Settings } from '~/utils/types'
import { MEALS } from '~/utils/types'
import { addDays, diffDays, errMsg, fmtDate, mealNow } from '~/utils/format'

const { t, n, locale } = useT()
const toast = useToast()
const route = useRoute()
const router = useRouter()
const { settings } = useSettings()
const recent = useRecent()
const usual = useSavedMeals()
const requestFetch = useRequestFetch()

const isIso = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
const qdate = computed(() => isIso(route.query.date) ? route.query.date : undefined)

// first paint (SSR): settings + the requested day in one round trip
const { data: initial, error: initError, refresh: retryInit } = await useAsyncData('today-initial', async () => {
  const [s, d] = await Promise.all([
    requestFetch<Settings>('/api/settings'),
    requestFetch<Day>('/api/day', { query: qdate.value ? { date: qdate.value } : {} }),
  ])
  return { s, d }
})
if (initial.value) settings.value = initial.value.s

const cache = useState<Record<string, Day>>('day-cache', () => ({}))
const day = ref<Day | null>(initial.value?.d ?? null)
if (day.value) cache.value[day.value.date] = day.value
const loading = ref(false)
const loadError = ref('')

const today = computed(() => settings.value?.today ?? initial.value?.d.date ?? '')
const current = computed(() => qdate.value ?? today.value)

async function load(date: string, opts: { quiet?: boolean } = {}) {
  const cached = cache.value[date]
  if (cached) day.value = cached
  else if (!opts.quiet) loading.value = true
  try {
    const d = await $fetch<Day>('/api/day', { query: { date } })
    cache.value[d.date] = d
    if (current.value === d.date) { day.value = d; loadError.value = '' }
  }
  catch (e) { if (!opts.quiet) loadError.value = errMsg(e) }
  finally { loading.value = false }
}
function prefetch(date: string) {
  if (cache.value[date]) return
  $fetch<Day>('/api/day', { query: { date } }).then((d) => { cache.value[d.date] = d }).catch(() => {})
}
function setDay(d: Day) {
  cache.value[d.date] = d
  if (d.date === current.value) day.value = d
}

watch(current, (d) => { if (d && d !== day.value?.date) load(d) })
watch(() => day.value?.date, (d) => {
  if (!d || !import.meta.client) return
  prefetch(addDays(d, -1))
  if (d < today.value) prefetch(addDays(d, 1))
})

function go(date: string) {
  if (date > today.value) return
  router.replace({ query: date === today.value ? {} : { date } })
}
const shift = (k: number) => go(addDays(current.value, k))

// swipe left/right on the page to change day
let sx = 0, sy = 0, st = 0
function touchStart(e: TouchEvent) { const p = e.touches[0]!; sx = p.clientX; sy = p.clientY; st = Date.now() }
function touchEnd(e: TouchEvent) {
  const p = e.changedTouches[0]!
  const dx = p.clientX - sx, dy = p.clientY - sy
  if (Date.now() - st < 600 && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) shift(dx < 0 ? 1 : -1)
}

// ---------- header ----------
const rel = computed(() => today.value ? diffDays(current.value, today.value) : 0)
const title = computed(() => {
  if (rel.value === 0) return t('today')
  if (rel.value === -1) return t('yesterday')
  return fmtDate(locale.value, current.value, { weekday: 'long' })
})
const eyebrow = computed(() => current.value ? fmtDate(locale.value, current.value, { weekday: rel.value >= -1 ? 'long' : undefined, day: 'numeric', month: 'long' }) : '')

// ---------- streak (as of today; shown only on the Today view) ----------
const streak = computed(() => rel.value === 0 && day.value?.streak?.days ? day.value.streak : null)
const streakText = computed(() => {
  const k = streak.value?.days ?? 0
  const m10 = k % 10, m100 = k % 100
  const key = locale.value !== 'ru' ? 'streakMany'
    : m10 === 1 && m100 !== 11 ? 'streakOne'
      : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'streakFew' : 'streakMany'
  return t(key, { n: n(k) })
})

// ---------- hero ----------
const eaten = computed(() => day.value?.totals.kcal ?? 0)
const goal = computed(() => day.value?.goal.kcal ?? settings.value?.kcalGoal ?? 2500)
const remaining = computed(() => day.value?.remaining_kcal ?? goal.value)
const over = computed(() => remaining.value < 0)
const anyEstimate = computed(() => !!day.value && MEALS.some(m => day.value!.meals[m].entries.some(e => e.source === 'estimate')))
// share of the day's kcal that comes from guesses: how much to trust the total
const estimatePct = computed(() => {
  const est = day.value?.estimate_kcal ?? 0
  return est > 0 && eaten.value > 0 ? Math.round(est / eaten.value * 100) : 0
})
const anyOff = computed(() => !!day.value && MEALS.some(m => day.value!.meals[m].entries.some(e => e.source === 'off')))
const macros = computed(() => {
  const tt = day.value?.totals ?? { kcal: 0, p: 0, f: 0, c: 0 }
  const g = day.value?.goal
  const energy = tt.p * 4 + tt.f * 9 + tt.c * 4 || 1
  return [
    { key: 'p', label: t('protein'), value: tt.p, goal: g?.p ?? null, color: 'var(--protein)', share: tt.p * 4 / energy },
    { key: 'f', label: t('fat'), value: tt.f, goal: g?.f ?? null, color: 'var(--fat)', share: tt.f * 9 / energy },
    { key: 'c', label: t('carbs'), value: tt.c, goal: g?.c ?? null, color: 'var(--carbs)', share: tt.c * 4 / energy },
  ]
})

// ---------- add ----------
const addOpen = ref(false)
const addMeal = ref<Meal>('breakfast')
const initialPick = ref<Pickable | null>(null)
const pendingPick = useState<Pickable | null>('pending-pick', () => null)

function openAdd(meal?: Meal) {
  addMeal.value = meal ?? (rel.value === 0 ? mealNow(settings.value?.timezone) : 'dinner')
  initialPick.value = null
  addOpen.value = true
  if (today.value) recent.load(today.value)
}

function onAdded(d: Day, created: Entry[], name: string) {
  setDay(d)
  recent.invalidate()
  if (today.value) recent.load(today.value, true)
  toast.show(t('added', { name }), {
    action: {
      label: t('undo'),
      run: async () => {
        let last: Day | null = null
        for (const c of created) last = (await $fetch<{ day: Day }>(`/api/entries/${c.id}`, { method: 'DELETE' })).day
        if (last) setDay(last)
        recent.invalidate()
      },
    },
  })
}

// ---------- save a meal as "my usual" ----------
async function saveUsual(meal: Meal) {
  const name = window.prompt(t('usualNamePrompt'), t(meal))?.trim()
  if (!name) return
  try {
    const m = await usual.saveFromDiary(name, current.value, meal)
    toast.show(t('usualSaved', { name: m.name }))
  }
  catch (e) { toast.show(errMsg(e, t('somethingWrong'))) }
}

// ---------- edit / delete with undo ----------
const editing = ref<Entry | null>(null)
const editingMeal = ref<Meal | null>(null)
function openEdit(e: Entry, meal: Meal) { editing.value = e; editingMeal.value = meal }
function closeEdit() { editing.value = null }

async function onSaved() {
  closeEdit()
  await load(current.value, { quiet: true })
  toast.show(t('saved'))
}

async function onDelete(e: Entry) {
  closeEdit()
  try {
    const res = await $fetch<{ deleted: Entry, day: Day }>(`/api/entries/${e.id}`, { method: 'DELETE' })
    setDay(res.day)
    toast.show(t('deleted', { name: e.name }), {
      action: {
        label: t('undo'),
        run: async () => {
          const r = await restoreEntry(res.deleted)
          setDay(r.day)
          toast.show(t('restored'))
        },
      },
    })
  }
  catch (err) { toast.show(errMsg(err, t('somethingWrong'))) }
}

// ---------- lifecycle ----------
onMounted(() => {
  if (today.value) setTimeout(() => recent.load(today.value), 600)
  if (pendingPick.value) {
    initialPick.value = pendingPick.value
    pendingPick.value = null
    addMeal.value = rel.value === 0 ? mealNow(settings.value?.timezone) : 'dinner'
    addOpen.value = true
  }
  // entries logged from a Claude chat show up when you come back to the app
  const onVis = async () => {
    if (document.visibilityState !== 'visible') return
    try { settings.value = await $fetch<Settings>('/api/settings') }
    catch { /* offline */ }
    load(current.value, { quiet: true })
  }
  document.addEventListener('visibilitychange', onVis)
  onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVis))
  // returning to the tab after other screens: show fresh data
  if (day.value) load(day.value.date, { quiet: true })
})

useHead({ title: () => `${title.value} · ${t('appName')}` })
</script>

<template>
  <div class="today" @touchstart.passive="touchStart" @touchend.passive="touchEnd">
    <header class="top">
      <div class="when">
        <p class="eyebrow">{{ eyebrow }}</p>
        <div class="trow">
          <h1>{{ title }}</h1>
          <button v-if="rel !== 0" type="button" class="todaypill" @click="go(today)">{{ t('today') }}</button>
        </div>
        <p v-if="streak" class="streak" :class="{ milestone: streak.milestone, open: !streak.today_logged }" :title="streak.today_logged ? undefined : t('streakOpen')">
          <span class="num">{{ streakText }}</span><template v-if="!streak.today_logged"> · {{ t('streakOpenShort') }}</template>
        </p>
      </div>
      <div class="nav">
        <button type="button" class="icon-btn" :aria-label="t('prevDay')" @click="shift(-1)"><Icon name="left" /></button>
        <button type="button" class="icon-btn" :aria-label="t('nextDay')" :disabled="rel >= 0" @click="shift(1)"><Icon name="right" /></button>
        <NuxtLink to="/settings" class="icon-btn" :aria-label="t('settings')"><Icon name="settings" /></NuxtLink>
      </div>
    </header>

    <div v-if="initError && !day" class="card errcard">
      <p>{{ t('loadFailed', { msg: initError.statusMessage || initError.message }) }}</p>
      <button class="btn" @click="retryInit()">{{ t('retry') }}</button>
    </div>
    <p v-else-if="loadError" class="loaderr">{{ t('loadFailed', { msg: loadError }) }}</p>

    <template v-if="day">
      <div class="content" :class="{ stale: loading }">
        <section class="hero card" :aria-label="t('kcalLeft')">
          <div class="hero-top">
            <ProgressRing :value="eaten" :max="goal" :size="152" :stroke="12" :label="`${n(eaten)} / ${n(goal)} ${t('kcal')}`">
              <span class="big num" :class="{ over }"><span v-if="anyEstimate" class="approx">≈</span>{{ n(Math.abs(remaining)) }}</span>
              <span class="biglbl">{{ over ? t('kcalOver') : t('kcalLeft') }}</span>
            </ProgressRing>
            <dl class="stats">
              <div><dt>{{ t('eaten') }}</dt><dd class="num">{{ n(eaten) }}</dd></div>
              <div><dt>{{ t('goal') }}</dt><dd class="num">{{ n(goal) }}</dd></div>
              <p v-if="estimatePct" class="estpct">{{ t('estimateShare', { n: estimatePct }) }}</p>
            </dl>
          </div>
          <div class="macros">
            <MacroBar v-for="m in macros" :key="m.key" :label="m.label" :value="m.value" :goal="m.goal" :color="m.color" :energy-share="m.share" />
          </div>
        </section>

        <DayPlanCard v-if="rel === 0" :date="current" :stamp="`${day.totals.kcal}`" @added="onAdded" />

        <MealSection v-for="m in MEALS" :key="m" :meal="m" :data="day.meals[m]" @add="openAdd" @open="openEdit" @save="saveUsual" />

        <p v-if="anyOff" class="attribution foot">{{ t('offAttribution') }}</p>
      </div>
    </template>

    <!-- room for the floating button so the last meal (Snack) is never under it -->
    <div class="fab-room" aria-hidden="true" />
    <button type="button" class="fab" @click="openAdd()">
      <Icon name="plus" :size="24" /><span>{{ t('addFood') }}</span>
    </button>

    <AddFoodSheet :open="addOpen" :date="current" :meal="addMeal" :initial-pick="initialPick" @close="addOpen = false" @added="onAdded" />
    <EditEntrySheet :entry="editing" :meal="editingMeal" @close="closeEdit" @saved="onSaved" @delete="onDelete" />
  </div>
</template>

<style scoped>
.today { display: grid; gap: var(--s-4); min-height: 70dvh; }
.top { display: flex; align-items: flex-end; gap: var(--s-2); padding-top: var(--s-2); }
.when { flex: 1; min-width: 0; }
.eyebrow { font-size: var(--fs-sm); color: var(--ink-2); font-weight: var(--fw-medium); }
.eyebrow::first-letter, .trow h1::first-letter { text-transform: uppercase; }
.trow { display: flex; align-items: center; gap: var(--s-2); flex-wrap: wrap; }
.trow h1 { font-size: var(--fs-2xl); font-weight: var(--fw-black); letter-spacing: -0.02em; }
.todaypill {
  min-height: 32px; padding: 0 var(--s-3); border: 0; border-radius: var(--r-pill);
  background: var(--accent-soft); color: var(--accent-soft-ink); font-size: var(--fs-sm); font-weight: var(--fw-bold); position: relative;
}
.todaypill::after { content: ''; position: absolute; inset: -6px -2px; }
.streak { margin-top: 2px; font-size: var(--fs-sm); color: var(--ink-2); font-weight: var(--fw-medium); justify-self: start; width: fit-content; }
.streak .num { font-weight: var(--fw-bold); color: var(--ink); }
.streak.open .num { color: var(--ink-2); }
/* quiet mark on 10, 20, 30, 50, 100 … days: a soft pill, nothing more */
.streak.milestone { padding: 2px var(--s-2); margin-left: calc(-1 * var(--s-2)); border-radius: var(--r-pill); background: var(--accent-soft); color: var(--accent-soft-ink); }
.streak.milestone .num { color: inherit; }
.nav { display: flex; gap: 0; margin-right: calc(-1 * var(--s-2)); }
.nav .icon-btn:disabled { opacity: .3; }

.content { display: grid; gap: var(--s-3); transition: opacity var(--dur); }
.content.stale { opacity: .55; }

.hero { padding: var(--s-5) var(--s-4) var(--s-4); display: grid; gap: var(--s-5); }
.hero-top { display: flex; align-items: center; gap: var(--s-5); }
.big .approx { font-size: .6em; font-weight: var(--fw-bold); color: var(--ink-2); margin-right: 1px; vertical-align: .18em; }
.big { font-size: 2rem; font-weight: var(--fw-black); letter-spacing: -0.03em; line-height: 1; }
.big.over { color: var(--over); }
.biglbl { font-size: var(--fs-xs); color: var(--ink-2); margin-top: 4px; font-weight: var(--fw-medium); }
.stats { flex: 1; min-width: 0; margin: 0; display: grid; gap: var(--s-3); }
.stats div { display: grid; gap: 1px; }
.stats dt { font-size: var(--fs-xs); color: var(--ink-2); font-weight: var(--fw-medium); }
.stats dd { margin: 0; font-size: var(--fs-xl); font-weight: var(--fw-bold); }
.estpct { margin: 0; font-size: var(--fs-xs); color: var(--estimate); font-weight: var(--fw-medium); }
.macros { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-4); }

.errcard { padding: var(--s-4); display: grid; gap: var(--s-3); justify-items: start; }
.loaderr { color: var(--danger); font-size: var(--fs-sm); }
.foot { text-align: center; padding-top: var(--s-2); }

.fab {
  position: fixed; z-index: 30;
  right: max(var(--s-4), calc((100vw - var(--page-max)) / 2 + var(--s-4)));
  bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom) + var(--s-4));
  display: inline-flex; align-items: center; gap: var(--s-2); height: 56px; padding: 0 var(--s-5) 0 var(--s-4);
  border: 0; border-radius: var(--r-pill); background: var(--accent); color: var(--accent-ink);
  font-weight: var(--fw-bold); font-size: var(--fs-md); box-shadow: var(--shadow-2);
  transition: transform var(--dur-fast);
}
.fab:active { transform: scale(.96); }
/* FAB is 56px tall at tabbar + 16px; the layout already pads tabbar + 32px, so 56px more leaves a 16px gap */
.fab-room { height: 56px; }
@media (max-width: 359px) { .hero-top { gap: var(--s-3); } .stats dd { font-size: var(--fs-lg); } }
</style>
