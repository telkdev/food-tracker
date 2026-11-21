<script setup lang="ts">
/**
 * Hair care («Волосы»): routines with a weekly frequency, one check a day, this week's progress, streak and a report.
 * Only for shared/hair.ts HAIR_USERS for now; /api/hair answers 404 to everyone else.
 */
import { intlTag, type MsgKey } from '~/utils/i18n'
import { errMsg } from '~/utils/format'
import { hasHair } from '~~/shared/hair'

definePageMeta({
  middleware: () => {
    if (!hasHair((useUserSession().user.value as { id?: string } | null)?.id)) return navigateTo('/')
  },
})

interface Routine {
  id: string, name: string, per_week: number, duration_min: number | null, duration_max: number | null, note: string | null
  created_on: string, done_today: boolean, week_done: number
}
interface ReportRoutine { id: string, name: string, per_week: number, done: number, planned: number, pct: number | null }
interface Hair {
  today: string
  routines: Routine[]
  week: { from: string, to: string, done: number, target: number, pct: number }
  streak: { days: number, today_done: boolean }
  report: { from: string, to: string, period_days: number, care_days: number, checks: number, pct: number | null, routines: ReportRoutine[], days: { date: string, checks: number }[] }
}

const { t, n, locale } = useT()
const toast = useToast()
const requestFetch = useRequestFetch()

const span = useCookie<7 | 30 | 90>('hair-span', { default: () => 30, sameSite: 'lax' })
const { data, error, refresh } = await useAsyncData('hair', () => requestFetch<Hair>('/api/hair', { query: { days: span.value } }), { watch: [span] })

const mood = computed(() => {
  const p = data.value?.week.pct ?? 0
  return t((p >= 100 ? 'hairMood3' : p >= 50 ? 'hairMood2' : p > 0 ? 'hairMood1' : 'hairMood0') as MsgKey)
})
const freq = (k: number) => k >= 7 ? t('hairDaily') : t('hairPerWeek', { n: k })
const dur = (r: { duration_min: number | null, duration_max: number | null }) =>
  r.duration_min == null ? null : t('hairMin', { v: r.duration_max ? `${r.duration_min}–${r.duration_max}` : String(r.duration_min) })
// a weekly routine whose target is already met this week (and not done today) steps back a little
const weekMet = (r: Routine) => r.per_week < 7 && r.week_done >= r.per_week && !r.done_today

// ---------- check / uncheck ----------
const busy = ref<string | null>(null)
async function toggle(r: Routine) {
  if (busy.value || !data.value) return
  busy.value = r.id
  const done = !r.done_today
  // optimistic
  r.done_today = done
  r.week_done += done ? 1 : -1
  try {
    await $fetch('/api/hair/check', { method: 'PUT', body: { routine_id: r.id, done } })
    if (done) toast.show(t('hairDoneToast', { name: r.name }), { action: { label: t('undo'), run: () => { const cur = data.value?.routines.find(x => x.id === r.id); if (cur?.done_today) toggle(cur) } } })
    await refresh()
  }
  catch (e) {
    r.done_today = !done
    r.week_done += done ? -1 : 1
    toast.show(errMsg(e, t('somethingWrong')))
  }
  finally { busy.value = null }
}

// ---------- add / edit sheet ----------
const FREQS = [7, 5, 3, 2, 1]
// a template may add several routines at once (serum: a morning and an evening one, each daily)
const TEMPLATES: { key: MsgKey, per_week: number, duration_min: number, duration_max: number | null, parts?: MsgKey[] }[] = [
  { key: 'hairTpl_serum', per_week: 7, duration_min: 1, duration_max: null, parts: ['hairTpl_serumAm', 'hairTpl_serumPm'] },
  { key: 'hairTpl_oil', per_week: 7, duration_min: 1, duration_max: 2 },
  { key: 'hairTpl_massage', per_week: 3, duration_min: 5, duration_max: 10 },
  { key: 'hairTpl_hydration', per_week: 3, duration_min: 3, duration_max: 5 },
  { key: 'hairTpl_mask', per_week: 1, duration_min: 15, duration_max: 20 },
  { key: 'hairTpl_protect', per_week: 3, duration_min: 1, duration_max: null },
]
const sheet = ref(false)
const editing = ref<Routine | null>(null)
const form = reactive({ name: '', per_week: 7, from: '', to: '', note: '' })
const saving = ref(false)

function openNew() {
  editing.value = null
  Object.assign(form, { name: '', per_week: 7, from: '', to: '', note: '' })
  sheet.value = true
}
function openEdit(r: Routine) {
  editing.value = r
  Object.assign(form, { name: r.name, per_week: r.per_week, from: r.duration_min?.toString() ?? '', to: r.duration_max?.toString() ?? '', note: r.note ?? '' })
  sheet.value = true
}
const mins = (s: string) => { const v = Math.round(Number(s.replace(',', '.'))); return s.trim() && v >= 1 && v <= 240 ? v : null }
const formOk = computed(() => form.name.trim().length > 0 && form.name.trim().length <= 80
  && (!form.from.trim() || mins(form.from) != null) && (!form.to.trim() || mins(form.to) != null))

async function save() {
  if (!formOk.value || saving.value) return
  saving.value = true
  const body = { name: form.name.trim(), per_week: form.per_week, duration_min: mins(form.from), duration_max: mins(form.to), note: form.note.trim() || null }
  try {
    if (editing.value) await $fetch(`/api/hair/routines/${editing.value.id}`, { method: 'PATCH', body })
    else await $fetch('/api/hair/routines', { method: 'POST', body })
    sheet.value = false
    toast.show(t('hairSaved'))
    await refresh()
  }
  catch (e) { toast.show(errMsg(e, t('somethingWrong'))) }
  finally { saving.value = false }
}
async function remove() {
  const r = editing.value
  if (!r || !confirm(t('hairRemoveConfirm', { name: r.name }))) return
  try {
    await $fetch(`/api/hair/routines/${r.id}`, { method: 'DELETE' })
    sheet.value = false
    toast.show(t('hairRemoved'))
    await refresh()
  }
  catch (e) { toast.show(errMsg(e, t('somethingWrong'))) }
}
const adding = ref<string | null>(null)
async function addTemplate(tp: typeof TEMPLATES[number]) {
  if (adding.value) return
  adding.value = tp.key
  try {
    const have = new Set((data.value?.routines ?? []).map(r => r.name.toLowerCase()))
    for (const name of (tp.parts ?? [tp.key]).map(k => t(k)).filter(nm => !have.has(nm.toLowerCase()))) {
      await $fetch('/api/hair/routines', { method: 'POST', body: { name, per_week: tp.per_week, duration_min: tp.duration_min, duration_max: tp.duration_max } })
    }
    await refresh()
  }
  catch (e) { toast.show(errMsg(e, t('somethingWrong'))) }
  finally { adding.value = null }
}
const freeTemplates = computed(() => {
  const have = new Set((data.value?.routines ?? []).map(r => r.name.toLowerCase()))
  return TEMPLATES.filter(tp => (tp.parts ?? [tp.key]).some(k => !have.has(t(k).toLowerCase())))
})

// ---------- report ----------
const rep = computed(() => data.value?.report)
const maxChecks = computed(() => Math.max(1, data.value?.routines.length ?? 1, ...(rep.value?.days.map(d => d.checks) ?? [0])))
const cols = computed(() => Math.min(15, rep.value?.days.length ?? 7))
const cellTitle = (d: { date: string, checks: number }) =>
  `${new Date(`${d.date}T12:00:00Z`).toLocaleDateString(intlTag[locale.value], { day: 'numeric', month: 'short' })}: ${d.checks}`

useHead({ title: () => `${t('tabHair')} · ${t('appName')}` })
</script>

<template>
  <div class="hair">
    <header class="top">
      <div>
        <h1>{{ t('tabHair') }}</h1>
        <p class="sub">{{ t('hairTitle') }}</p>
      </div>
      <button type="button" class="add-btn" @click="openNew"><Icon name="plus" :size="18" /><span>{{ t('hairAdd') }}</span></button>
    </header>

    <div v-if="error" class="card pad">
      <p>{{ t('loadFailed', { msg: error.statusMessage || error.message }) }}</p>
      <button class="btn" @click="refresh()">{{ t('retry') }}</button>
    </div>

    <template v-else-if="data">
      <!-- this week -->
      <section v-if="data.routines.length" class="wk card" :aria-label="t('hairWeek')">
        <div class="wk-h">
          <h2>{{ t('hairWeek') }}</h2>
          <span v-if="data.streak.days" class="streak num" :title="t('hairStreakHint')"><Icon name="flame" :size="15" />{{ t('hairStreak', { n: data.streak.days }) }}</span>
        </div>
        <p class="mood">{{ mood }}</p>
        <div class="bar" role="meter" :aria-valuemin="0" :aria-valuemax="100" :aria-valuenow="data.week.pct" :aria-label="t('hairWeek')">
          <i :style="{ transform: `scaleX(${Math.min(1, data.week.pct / 100)})` }" />
        </div>
        <p class="wk-of num">{{ t('hairWeekOf', { done: data.week.done, target: data.week.target, pct: data.week.pct }) }}</p>
      </section>

      <!-- routines -->
      <section class="rt card">
        <h2 class="rt-h">{{ t('hairToday') }}</h2>
        <p v-if="!data.routines.length" class="empty muted">{{ t('hairEmpty') }}</p>
        <ul v-else class="rows">
          <li v-for="r in data.routines" :key="r.id" class="row" :class="{ done: r.done_today, met: weekMet(r) }">
            <button type="button" class="body" @click="openEdit(r)">
              <span class="nm">{{ r.name }}</span>
              <span class="meta">
                <span class="tag"><Icon name="today" :size="13" />{{ freq(r.per_week) }}</span>
                <span v-if="dur(r)" class="tag"><Icon name="clock" :size="13" />{{ dur(r) }}</span>
                <span v-if="r.per_week < 7" class="cnt num">{{ r.week_done >= r.per_week ? t('hairWeekDone') : t('hairWeekCount', { done: r.week_done, target: r.per_week }) }}</span>
              </span>
            </button>
            <button
              type="button" class="tick" :aria-pressed="r.done_today" :aria-label="t('hairMark', { name: r.name })"
              :disabled="busy === r.id" @click="toggle(r)"
            >
              <Icon name="check" :size="18" />
            </button>
          </li>
        </ul>
        <div v-if="freeTemplates.length && data.routines.length < 4" class="tpl">
          <span class="tpl-h">{{ t('hairTemplates') }}</span>
          <div class="chips">
            <button v-for="tp in freeTemplates" :key="tp.key" type="button" class="chip" :disabled="!!adding" @click="addTemplate(tp)">
              <Icon name="plus" :size="14" />{{ t(tp.key) }}
            </button>
          </div>
        </div>
      </section>

      <!-- report -->
      <section v-if="data.routines.length || rep?.checks" class="rp card" :aria-label="t('hairReport')">
        <div class="rp-h">
          <h2>{{ t('hairReport') }}</h2>
          <div class="seg" role="group" :aria-label="t('hairReport')">
            <button type="button" :aria-pressed="Number(span) === 7" @click="span = 7">{{ t('days7') }}</button>
            <button type="button" :aria-pressed="Number(span) === 30" @click="span = 30">{{ t('days30') }}</button>
            <button type="button" :aria-pressed="Number(span) === 90" @click="span = 90">{{ t('hairDays90') }}</button>
          </div>
        </div>
        <template v-if="rep && rep.checks">
          <div class="stats">
            <div><b class="num">{{ rep.pct != null ? `${rep.pct}%` : '—' }}</b><span>{{ t('hairReportPlan') }}</span></div>
            <div><b class="num">{{ rep.care_days }}<small>/{{ rep.period_days }}</small></b><span>{{ t('hairReportDays') }}</span></div>
            <div><b class="num">{{ rep.checks }}</b><span>{{ t('hairReportChecks') }}</span></div>
          </div>
          <div class="heat" :style="{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }" aria-hidden="true">
            <span v-for="d in rep.days" :key="d.date" :title="cellTitle(d)" :style="{ '--a': d.checks ? 0.25 + 0.75 * d.checks / maxChecks : 0 }" :class="{ today: d.date === data.today }" />
          </div>
          <ul class="per">
            <li v-for="r in rep.routines" :key="r.id">
              <span class="pn">{{ r.name }}</span>
              <span class="pv num">{{ t('hairReportOf', { done: r.done, planned: n(r.planned, r.planned % 1 ? 1 : 0) }) }}</span>
              <span class="pb"><i :style="{ transform: `scaleX(${(r.pct ?? 0) / 100})` }" /></span>
            </li>
          </ul>
        </template>
        <p v-else class="muted empty">{{ t('hairReportNone') }}</p>
      </section>

      <p class="muted foot">{{ t('hairChatHint') }}</p>
    </template>

    <BottomSheet :open="sheet" :label="t('hairEdit')" @close="sheet = false">
      <template #header>
        <div class="head">
          <h2>{{ editing ? editing.name : t('hairAdd') }}</h2>
          <button type="button" class="icon-btn" :aria-label="t('close')" @click="sheet = false"><Icon name="close" /></button>
        </div>
      </template>
      <form class="form" @submit.prevent="save">
        <label class="field">
          <span>{{ t('hairName') }}</span>
          <input v-model="form.name" class="input" maxlength="80" :placeholder="t('hairNamePh')">
        </label>
        <div class="field">
          <span>{{ t('hairFreq') }}</span>
          <div class="chips">
            <button v-for="f in FREQS" :key="f" type="button" class="chip" :aria-pressed="form.per_week === f" @click="form.per_week = f">{{ freq(f) }}</button>
          </div>
        </div>
        <div class="field">
          <span>{{ t('hairDuration') }}</span>
          <div class="dur">
            <input v-model="form.from" class="input num" inputmode="numeric" :placeholder="t('hairFrom')" :aria-label="`${t('hairDuration')} ${t('hairFrom')}`">
            <span>–</span>
            <input v-model="form.to" class="input num" inputmode="numeric" :placeholder="t('hairTo')" :aria-label="`${t('hairDuration')} ${t('hairTo')}`">
          </div>
        </div>
        <label class="field">
          <span>{{ t('hairNote') }}</span>
          <input v-model="form.note" class="input" maxlength="300" :placeholder="t('hairNotePh')">
        </label>
        <button type="submit" class="btn btn-primary btn-lg btn-block" :disabled="!formOk || saving">{{ t('save') }}</button>
        <button v-if="editing" type="button" class="btn btn-danger btn-block" @click="remove"><Icon name="trash" :size="18" />{{ t('hairRemove') }}</button>
      </form>
    </BottomSheet>
  </div>
</template>

<style scoped>
.hair { display: grid; gap: var(--s-4); }
.top { padding-top: var(--s-2); min-height: 56px; display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); }
.top h1 { font-size: var(--fs-2xl); font-weight: var(--fw-black); letter-spacing: -0.025em; }
.sub { font-size: var(--fs-xs); color: var(--ink-2); }
.add-btn {
  display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px 0 10px; border: 0; border-radius: var(--r-pill);
  background: var(--accent-soft); color: var(--accent-soft-ink); font: inherit; font-size: var(--fs-sm); font-weight: var(--fw-medium); white-space: nowrap; cursor: pointer;
}
.pad { padding: var(--s-4); display: grid; gap: var(--s-3); justify-items: start; }
h2 { font-size: var(--fs-lg); font-weight: var(--fw-bold); letter-spacing: -0.01em; }

/* week */
.wk { padding: var(--s-4); display: grid; gap: var(--s-2); }
.wk-h { display: flex; align-items: center; justify-content: space-between; gap: var(--s-2); }
.streak { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px 3px 8px; border-radius: var(--r-pill); background: var(--estimate-soft); color: var(--estimate); font-size: var(--fs-xs); font-weight: var(--fw-medium); }
.mood { font-size: var(--fs-md); font-weight: var(--fw-book); }
.bar { height: 6px; border-radius: 3px; background: var(--track); overflow: hidden; }
.bar i { display: block; height: 100%; background: var(--accent); transform-origin: left; transition: transform var(--dur-slow) var(--ease); }
.wk-of { font-size: var(--fs-xs); color: var(--ink-2); }

/* routines */
.rt { padding: var(--s-4) var(--s-4) var(--s-2); display: grid; gap: var(--s-2); }
.rows { list-style: none; margin: 0; padding: 0; }
.row { display: flex; align-items: center; gap: var(--s-3); min-height: 64px; border-top: 1px solid var(--line); }
.body { flex: 1; min-width: 0; display: grid; gap: 4px; padding: var(--s-2) 0; border: 0; background: none; text-align: left; font: inherit; color: inherit; cursor: pointer; }
.nm { font-size: var(--fs-md); font-weight: var(--fw-book); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: color var(--dur); }
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px 2px 6px; border-radius: var(--r-pill); background: var(--surface-2); color: var(--ink-2); font-size: var(--fs-2xs); }
.cnt { font-size: var(--fs-2xs); color: var(--ink-3); }
.row.done .nm { color: var(--ink-3); text-decoration: line-through; text-decoration-color: var(--ink-3); }
.row.met .nm { color: var(--ink-2); }
.tick {
  flex: none; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; cursor: pointer;
  border: 1.5px solid var(--line-strong); background: none; color: transparent; transition: background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast);
}
.tick[aria-pressed='true'] { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.row.met .tick:not([aria-pressed='true']) { border-style: dashed; }
.empty { font-size: var(--fs-sm); padding: var(--s-1) 0 var(--s-2); }
.tpl { display: grid; gap: var(--s-2); padding: var(--s-2) 0 var(--s-2); border-top: 1px solid var(--line); }
.tpl-h { font-size: var(--fs-xs); color: var(--ink-2); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chips .chip { display: inline-flex; align-items: center; gap: 4px; min-height: 36px; padding: 0 var(--s-3); font-size: var(--fs-sm); }

/* report */
.rp { padding: var(--s-4); display: grid; gap: var(--s-3); }
.rp-h { display: flex; align-items: center; justify-content: space-between; gap: var(--s-2); flex-wrap: wrap; }
.rp-h .seg { min-width: 220px; }
.stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-2); }
.stats div { display: grid; gap: 2px; }
.stats b { font-size: var(--fs-xl); font-weight: var(--fw-medium); letter-spacing: -0.02em; }
.stats small { font-size: var(--fs-sm); color: var(--ink-3); font-weight: var(--fw-regular); }
.stats span { font-size: var(--fs-xs); color: var(--ink-2); }
.heat { display: grid; gap: 3px; }
.heat span { aspect-ratio: 1; border-radius: 3px; background: color-mix(in srgb, var(--accent) calc(var(--a) * 100%), var(--track)); }
.heat span.today { outline: 1.5px solid var(--ink-3); outline-offset: 1px; }
.per { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-3); }
.per li { display: grid; grid-template-columns: 1fr auto; gap: 4px var(--s-2); }
.pn { font-size: var(--fs-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pv { font-size: var(--fs-xs); color: var(--ink-2); }
.pb { grid-column: 1 / -1; height: 4px; border-radius: 2px; background: var(--track); overflow: hidden; }
.pb i { display: block; height: 100%; background: var(--accent); transform-origin: left; transition: transform var(--dur-slow) var(--ease); }
.foot { font-size: var(--fs-xs); text-align: center; padding: 0 var(--s-4); }

/* sheet */
.head { display: flex; align-items: center; gap: var(--s-2); padding: 6px 0 var(--s-2); }
.head h2 { flex: 1; font-size: var(--fs-xl); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.form { display: grid; gap: var(--s-4); padding-bottom: var(--s-4); }
.dur { display: flex; align-items: center; gap: var(--s-2); }
.dur .input { flex: 1; min-width: 0; }
.dur span { color: var(--ink-3); }
.btn-danger { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
</style>
