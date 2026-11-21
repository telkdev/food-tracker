<script setup lang="ts">
import type { Range, Settings } from '~/utils/types'
import { addDays, fmtDate } from '~/utils/format'

const { t, n, locale } = useT()
const { settings } = useSettings()
const requestFetch = useRequestFetch()

const span = useCookie<7 | 30>('week-span', { default: () => 7, sameSite: 'lax' })

const { data, pending, error, refresh } = await useAsyncData('week', async () => {
  const s = settings.value ?? await requestFetch<Settings>('/api/settings')
  settings.value = s
  const to = s.today
  const from = addDays(to, -(Number(span.value) - 1))
  const r = await requestFetch<Range>('/api/range', { query: { from, to } })
  return { today: to, range: r }
}, { watch: [span] })

const days = computed(() => {
  if (!data.value) return []
  const { today, range } = data.value
  const by = new Map(range.days.map(d => [d.date, d]))
  return Array.from({ length: Number(span.value) }, (_, i) => {
    const iso = addDays(today, i - (Number(span.value) - 1))
    const d = by.get(iso)
    return { iso, kcal: d?.kcal ?? 0, logged: !!d, p: d?.p ?? 0, f: d?.f ?? 0, c: d?.c ?? 0, isToday: iso === today }
  })
})
const goal = computed(() => data.value?.range.goal_kcal ?? settings.value?.kcalGoal ?? 2500)
const max = computed(() => Math.max(goal.value * 1.25, ...days.value.map(d => d.kcal)))
const avg = computed(() => data.value?.range.avg_kcal_logged_days ?? null)
const logged = computed(() => data.value?.range.logged_days ?? 0)
const withinGoal = computed(() => days.value.filter(d => d.logged && d.kcal <= goal.value * 1.05).length)
const goalPct = computed(() => goal.value / max.value * 100)

const short = (iso: string) => Number(span.value) === 7
  ? fmtDate(locale.value, iso, { weekday: 'short' }).replace('.', '')
  : fmtDate(locale.value, iso, { day: 'numeric' })
const rowLabel = (iso: string) => fmtDate(locale.value, iso, { weekday: 'short', day: 'numeric', month: 'short' })
const dayLink = (iso: string) => iso === data.value?.today ? '/' : { path: '/', query: { date: iso } }
const list = computed(() => [...days.value].reverse())
const showLabel = (i: number) => Number(span.value) === 7 || i % 5 === 4 || i === days.value.length - 1

const reportOpen = ref(false)

useHead({ title: () => `${t('weekTitle')} · ${t('appName')}` })
</script>

<template>
  <div class="week">
    <header class="top">
      <h1>{{ t('weekTitle') }}</h1>
      <button type="button" class="pdf" :disabled="!data" :aria-label="t('reportTitle')" :title="t('reportTitle')" @click="reportOpen = true">
        <Icon name="file" :size="16" />PDF
      </button>
      <div class="seg span" role="group" :aria-label="t('weekTitle')">
        <button type="button" :aria-pressed="Number(span) === 7" @click="span = 7">{{ t('days7') }}</button>
        <button type="button" :aria-pressed="Number(span) === 30" @click="span = 30">{{ t('days30') }}</button>
      </div>
    </header>

    <div v-if="error" class="card pad">
      <p>{{ t('loadFailed', { msg: error.statusMessage || error.message }) }}</p>
      <button class="btn" @click="refresh()">{{ t('retry') }}</button>
    </div>

    <template v-else-if="data">
      <section class="stats">
        <div class="stat card">
          <span class="sl">{{ t('avgLogged') }}</span>
          <span class="sv num">{{ avg != null ? n(avg) : '—' }} <small>{{ t('kcal') }}</small></span>
          <span class="sh">{{ t('avgHint', { n: logged }) }}</span>
        </div>
        <div class="stat card">
          <span class="sl">{{ t('onTarget') }}</span>
          <span class="sv num">{{ withinGoal }}<small> / {{ logged }}</small></span>
          <span class="sh">{{ t('goalLine', { kcal: n(goal) }) }}</span>
        </div>
      </section>

      <NuxtLink to="/tips" class="tips-link card">
        <span class="tl-ic"><Icon name="tips" :size="20" /></span>
        <span class="tl-tx"><strong>{{ t('tipsTitle') }}</strong><span>{{ t('tipsOpenHint') }}</span></span>
        <Icon name="right" :size="20" class="tl-chev" />
      </NuxtLink>

      <section class="chart card" :class="{ dense: Number(span) === 30, pending }" :aria-label="t('weekTitle')">
        <div class="plot">
          <div class="goal" :style="{ bottom: `${goalPct}%` }"><span class="num">{{ n(goal) }}</span></div>
          <NuxtLink
            v-for="(d, i) in days" :key="d.iso" :to="dayLink(d.iso)" class="col" :class="{ today: d.isToday }"
            :aria-label="`${rowLabel(d.iso)}: ${d.logged ? `${n(d.kcal)} ${t('kcal')}` : t('notLogged')}`"
          >
            <span class="bar" :class="{ over: d.kcal > goal * 1.05, none: !d.logged }" :style="{ height: d.logged ? `${Math.max(2, d.kcal / max * 100)}%` : '3px' }" />
            <span class="x" :class="{ hide: !showLabel(i) }">{{ short(d.iso) }}</span>
          </NuxtLink>
        </div>
      </section>

      <p v-if="!logged" class="muted empty">{{ t('noDataRange') }}</p>

      <section class="list card">
        <NuxtLink v-for="d in list" :key="d.iso" :to="dayLink(d.iso)" class="row">
          <span class="rl">{{ d.isToday ? t('today') : rowLabel(d.iso) }}</span>
          <span class="rbar"><span :class="{ over: d.kcal > goal * 1.05 }" :style="{ width: `${Math.min(100, d.kcal / goal * 100)}%` }" /></span>
          <span class="rv num" :class="{ none: !d.logged, over: d.kcal > goal * 1.05 }">{{ d.logged ? n(d.kcal) : '—' }}</span>
          <Icon name="right" :size="18" class="chev" />
        </NuxtLink>
      </section>
    </template>

    <ReportSheet v-if="data" :open="reportOpen" :today="data.today" @close="reportOpen = false" />
  </div>
</template>

<style scoped>
.week { display: grid; gap: var(--s-4); }
.top { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); padding-top: var(--s-2); min-height: 56px; }
.top h1 { font-size: var(--fs-2xl); font-weight: var(--fw-black); letter-spacing: -0.025em; }
.span { width: 168px; flex: none; }
.top h1 { flex: 1; min-width: 0; }
.pdf { display: inline-flex; align-items: center; gap: 4px; min-height: 36px; padding: 0 10px 0 8px; border: 1px solid var(--line-strong); border-radius: var(--r-pill); background: transparent; color: var(--ink-2); font-size: var(--fs-xs); font-weight: var(--fw-medium); flex: none; }
.pdf:active { background: var(--surface-2); }
.pad { padding: var(--s-4); display: grid; gap: var(--s-3); justify-items: start; }

.tips-link { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-3) var(--s-4); text-decoration: none; color: var(--ink); }
.tl-ic { flex: none; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent-soft-ink); }
.tl-tx { flex: 1; min-width: 0; display: grid; gap: 2px; }
.tl-tx strong { font-weight: var(--fw-bold); font-size: var(--fs-md); }
.tl-tx span { font-size: var(--fs-xs); color: var(--ink-2); }
.tl-chev { color: var(--ink-3); }
.stats { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); }
.stat { padding: var(--s-4); display: grid; gap: 4px; }
.sl { font-size: var(--fs-xs); color: var(--ink-2); font-weight: var(--fw-regular); }
.sv { font-size: var(--fs-2xl); font-weight: var(--fw-regular); letter-spacing: -0.025em; }
.sv small { font-size: var(--fs-sm); color: var(--ink-3); font-weight: var(--fw-regular); letter-spacing: 0; }
.sh { font-size: var(--fs-xs); color: var(--ink-3); }

.chart { padding: var(--s-5) var(--s-4) var(--s-3); transition: opacity var(--dur); }
.chart.pending { opacity: .6; }
.plot { position: relative; height: 190px; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 6px; padding-bottom: 24px; }
.dense .plot { gap: 2px; }
.goal { position: absolute; left: 0; right: 0; margin-bottom: 24px; border-top: 1px dashed var(--line-strong); pointer-events: none; z-index: 1; }
.goal span { position: absolute; right: 0; bottom: 2px; font-size: var(--fs-2xs); color: var(--ink-3); background: var(--surface); padding: 0 4px; border-radius: 4px; }
.col { position: relative; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; text-decoration: none; color: var(--ink-2); border-radius: var(--r-sm); min-width: 0; }
.bar { width: min(100%, 20px); border-radius: 4px 4px 2px 2px; background: color-mix(in srgb, var(--accent) 50%, var(--surface)); transition: height var(--dur-slow) var(--ease); }
.dense .bar { border-radius: 3px 3px 1px 1px; }
.col.today .bar { background: var(--accent); }
.bar.over { background: color-mix(in srgb, var(--over) 55%, var(--surface)); }
.col.today .bar.over { background: var(--over); }
.bar.none, .col.today .bar.none { background: var(--track); }
.x { position: absolute; bottom: -22px; font-size: var(--fs-2xs); color: var(--ink-3); white-space: nowrap; }
.x::first-letter, .rl::first-letter { text-transform: uppercase; }
.x.hide { visibility: hidden; }
.col.today .x { color: var(--ink); font-weight: var(--fw-bold); }
.col:focus-visible { outline-offset: 0; }

.empty { text-align: center; font-size: var(--fs-sm); }

.list { display: grid; overflow: hidden; }
.row { display: grid; grid-template-columns: 7.5em 1fr 4.2em 18px; align-items: center; gap: var(--s-3); min-height: 52px; padding: 0 var(--s-3) 0 var(--s-4); color: var(--ink); text-decoration: none; }
.row + .row { border-top: 1px solid var(--line); }
.row:active { background: color-mix(in srgb, var(--ink) 5%, transparent); }
.rl { display: block; font-size: var(--fs-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rbar { height: 4px; border-radius: 2px; background: var(--track); overflow: hidden; }
.rbar span { display: block; height: 100%; background: var(--accent); border-radius: 2px; }
.rbar span.over { background: var(--over); }
.rv { text-align: right; font-weight: var(--fw-medium); font-size: var(--fs-sm); }
.rv.none { color: var(--ink-3); font-weight: var(--fw-regular); }
.rv.over { color: var(--over); }
.chev { color: var(--ink-3); }
</style>
