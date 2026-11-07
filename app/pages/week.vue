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

useHead({ title: () => `${t('weekTitle')} · ${t('appName')}` })
</script>

<template>
  <div class="week">
    <header class="top">
      <h1>{{ t('weekTitle') }}</h1>
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
  </div>
</template>

<style scoped>
.week { display: grid; gap: var(--s-4); }
.top { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); padding-top: var(--s-2); min-height: 56px; }
.top h1 { font-size: var(--fs-2xl); font-weight: var(--fw-black); letter-spacing: -0.02em; }
.span { width: 190px; }
.pad { padding: var(--s-4); display: grid; gap: var(--s-3); justify-items: start; }

.stats { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); }
.stat { padding: var(--s-4); display: grid; gap: 2px; }
.sl { font-size: var(--fs-xs); color: var(--ink-2); font-weight: var(--fw-medium); }
.sv { font-size: var(--fs-2xl); font-weight: var(--fw-black); letter-spacing: -0.02em; }
.sv small { font-size: var(--fs-sm); color: var(--ink-2); font-weight: var(--fw-medium); letter-spacing: 0; }
.sh { font-size: var(--fs-xs); color: var(--ink-3); }

.chart { padding: var(--s-5) var(--s-3) var(--s-3); transition: opacity var(--dur); }
.chart.pending { opacity: .6; }
.plot { position: relative; height: 190px; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 6px; padding-bottom: 24px; }
.dense .plot { gap: 2px; }
.goal { position: absolute; left: 0; right: 0; margin-bottom: 24px; border-top: 1.5px dashed var(--ink-3); pointer-events: none; z-index: 1; }
.goal span { position: absolute; right: 0; bottom: 2px; font-size: var(--fs-2xs); color: var(--ink-2); background: var(--surface); padding: 0 4px; border-radius: 4px; }
.col { position: relative; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; text-decoration: none; color: var(--ink-2); border-radius: var(--r-sm); min-width: 0; }
.bar { width: min(100%, 28px); border-radius: 6px 6px 3px 3px; background: var(--accent); transition: height var(--dur-slow) var(--ease); }
.dense .bar { border-radius: 3px 3px 1px 1px; }
.bar.over { background: var(--over); }
.bar.none { background: var(--surface-3); }
.x { position: absolute; bottom: -22px; font-size: var(--fs-2xs); white-space: nowrap; }
.x::first-letter, .rl::first-letter { text-transform: uppercase; }
.x.hide { visibility: hidden; }
.col.today .x { color: var(--ink); font-weight: var(--fw-bold); }
.col.today .bar:not(.none) { box-shadow: 0 0 0 2px var(--surface), 0 0 0 3.5px var(--accent); }
.col:focus-visible { outline-offset: 0; }

.empty { text-align: center; font-size: var(--fs-sm); }

.list { display: grid; overflow: hidden; }
.row { display: grid; grid-template-columns: 7.5em 1fr 4.2em 18px; align-items: center; gap: var(--s-3); min-height: 48px; padding: 0 var(--s-3) 0 var(--s-4); color: var(--ink); text-decoration: none; }
.row + .row { border-top: 1px solid var(--line); }
.row:active { background: var(--surface-2); }
.rl { display: block; font-size: var(--fs-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rbar { height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
.rbar span { display: block; height: 100%; background: var(--accent); border-radius: 3px; }
.rbar span.over { background: var(--over); }
.rv { text-align: right; font-weight: var(--fw-bold); font-size: var(--fs-sm); }
.rv.none { color: var(--ink-3); font-weight: var(--fw-regular); }
.rv.over { color: var(--over); }
.chev { color: var(--ink-3); }
</style>
