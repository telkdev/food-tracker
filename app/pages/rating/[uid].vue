<script setup lang="ts">
import type { RatingPerson } from '~/utils/types'
import type { MsgKey } from '~/utils/i18n'
import { fmtDate } from '~/utils/format'

// Read-only view of one person's day in the Rating tab: what they ate and how the day scored.
const { t, n, locale } = useT()
const route = useRoute()
const requestFetch = useRequestFetch()
const uid = computed(() => String(route.params.uid))
const date = computed(() => typeof route.query.date === 'string' ? route.query.date : undefined)

const { data, pending, error, refresh } = await useAsyncData(() => `rating-${uid.value}`, () =>
  requestFetch<RatingPerson>(`/api/rating/${encodeURIComponent(uid.value)}`, { query: date.value ? { date: date.value } : {} }), { watch: [date] })

function tone(score: number | null) {
  if (score == null) return 'none'
  return score >= 80 ? 'good' : score >= 50 ? 'mid' : 'low'
}
const pct = (v: number, goal: number) => goal > 0 ? Math.min(100, v / goal * 100) : 0
const dayTitle = computed(() => {
  const d = data.value
  if (!d) return ''
  return d.date === d.today ? t('today') : fmtDate(locale.value, d.date, { weekday: 'long', day: 'numeric', month: 'long' })
})
const pick = (iso: string) => navigateTo({ path: route.path, query: iso === data.value?.today ? {} : { date: iso } }, { replace: true })

useHead({ title: () => `${data.value?.name ?? t('ratingTitle')} · ${t('appName')}` })
</script>

<template>
  <div class="person">
    <header class="top">
      <NuxtLink to="/rating" class="icon-btn" :aria-label="t('back')"><Icon name="back" /></NuxtLink>
      <h1 v-if="data">{{ data.name }}<span v-if="data.me" class="you">{{ t('ratingYou') }}</span></h1>
      <span v-if="data?.streak" class="streak num"><Icon name="flame" :size="16" />{{ data.streak }}</span>
    </header>

    <div v-if="error" class="card pad">
      <p>{{ t('loadFailed', { msg: error.statusMessage || error.message }) }}</p>
      <button class="btn" @click="refresh()">{{ t('retry') }}</button>
    </div>

    <template v-else-if="data">
      <nav class="strip card" :aria-label="t('weekTitle')">
        <button
          v-for="d in data.days" :key="d.date" type="button" class="sd" :class="[`t-${tone(d.score)}`, { on: d.date === data.date }]"
          :aria-pressed="d.date === data.date" :aria-label="`${fmtDate(locale, d.date, { weekday: 'long', day: 'numeric' })}: ${d.score ?? '—'}`"
          @click="pick(d.date)"
        >
          <span class="sw">{{ fmtDate(locale, d.date, { weekday: 'short' }).replace('.', '') }}</span>
          <span class="sn num">{{ fmtDate(locale, d.date, { day: 'numeric' }) }}</span>
          <span class="ss num">{{ d.score ?? '·' }}</span>
        </button>
      </nav>

      <section class="sum card" :class="[`t-${tone(data.score)}`, { pending }]">
        <div class="sum-h">
          <div>
            <p class="dt">{{ dayTitle }}</p>
            <p class="sl">{{ t('ratingDayScore') }}</p>
          </div>
          <span class="big num">{{ data.score ?? '—' }}</span>
        </div>
        <div class="bar-line">
          <span class="bl">{{ t('kcal') }}</span>
          <span class="mt"><span class="mf kc" :class="{ over: data.totals.kcal > data.goal.kcal * 1.05 }" :style="{ width: `${pct(data.totals.kcal, data.goal.kcal)}%` }" /></span>
          <span class="bv num">{{ n(data.totals.kcal) }} / {{ n(data.goal.kcal) }}</span>
        </div>
        <div class="bar-line">
          <span class="bl">{{ t('protein') }}</span>
          <span class="mt"><span class="mf pr" :style="{ width: `${pct(data.totals.p, data.goal.p)}%` }" /></span>
          <span class="bv num">{{ n(data.totals.p) }} / {{ n(data.goal.p) }} {{ t('g') }}</span>
        </div>
        <p v-if="data.goal.p_auto" class="note">{{ t('protein') }}: {{ t('ratingProteinAuto') }}</p>
        <p class="macros num">{{ t('fatShort') }} {{ n(data.totals.f) }} · {{ t('carbsShort') }} {{ n(data.totals.c) }} {{ t('g') }}</p>
      </section>

      <section class="foods" :class="{ pending }">
        <h2 class="section-title">{{ t('ratingFoods') }}</h2>
        <p v-if="!data.meals.length" class="muted empty card">{{ t('ratingNoFoods') }}</p>
        <div v-for="m in data.meals" :key="m.meal" class="meal card">
          <div class="mh"><b>{{ t(m.meal as MsgKey) }}</b><span class="num">{{ n(m.kcal) }} {{ t('kcal') }}</span></div>
          <div v-for="(e, i) in m.entries" :key="i" class="fe">
            <span class="fn">{{ e.name }}<small class="num"> · {{ n(e.grams) }} {{ t('g') }}<template v-if="e.estimate"> · ≈</template></small></span>
            <span class="fk num">{{ n(e.kcal) }}</span>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.person { display: grid; gap: var(--s-4); }
.top { display: flex; align-items: center; gap: var(--s-2); padding-top: var(--s-2); min-height: 56px; margin-left: calc(-1 * var(--s-2)); }
.top h1 { flex: 1; min-width: 0; font-size: var(--fs-2xl); font-weight: var(--fw-black); letter-spacing: -0.025em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: var(--s-2); }
.you { font-size: var(--fs-xs); font-weight: var(--fw-medium); letter-spacing: 0; color: var(--accent-soft-ink); background: var(--accent-soft); padding: 2px 8px; border-radius: var(--r-pill); }
.streak { display: inline-flex; align-items: center; gap: 3px; color: var(--over); font-weight: var(--fw-medium); }
.pad { padding: var(--s-4); display: grid; gap: var(--s-3); justify-items: start; }
.pending { opacity: .6; transition: opacity var(--dur); }

.strip { display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; padding: var(--s-2); }
.sd { display: grid; justify-items: center; gap: 2px; padding: 6px 0; border: 0; border-radius: var(--r-md); background: none; color: var(--ink-2); font: inherit; min-width: 0; }
.sd.on { background: var(--surface-2); color: var(--ink); }
.sw { font-size: var(--fs-2xs); text-transform: capitalize; }
.sn { font-size: var(--fs-md); font-weight: var(--fw-medium); }
.ss { font-size: var(--fs-2xs); font-weight: var(--fw-bold); min-width: 24px; padding: 1px 4px; border-radius: var(--r-pill); color: var(--ink-3); }
.sd.t-good .ss { background: var(--accent-soft); color: var(--accent-soft-ink); }
.sd.t-mid .ss { background: color-mix(in srgb, var(--fat) 20%, var(--surface)); color: var(--fat); }
.sd.t-low .ss { background: var(--over-soft); color: var(--over); }

.sum { padding: var(--s-4); display: grid; gap: var(--s-3); }
.sum-h { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); }
.dt { font-weight: var(--fw-bold); }
.dt::first-letter { text-transform: uppercase; }
.sl { font-size: var(--fs-xs); color: var(--ink-2); }
.big { font-size: var(--fs-hero); font-weight: var(--fw-light); letter-spacing: -0.04em; line-height: 1; color: var(--ink-3); }
.t-good .big { color: var(--accent); }
.t-mid .big { color: var(--fat); }
.t-low .big { color: var(--over); }
.bar-line { display: grid; grid-template-columns: 5.5em 1fr auto; align-items: center; gap: var(--s-3); font-size: var(--fs-sm); }
.bl { color: var(--ink-2); }
.bv { color: var(--ink-2); white-space: nowrap; }
.mt { height: 6px; border-radius: 3px; background: var(--track); overflow: hidden; }
.mf { display: block; height: 100%; border-radius: 3px; transition: width var(--dur-slow) var(--ease); }
.mf.kc { background: var(--accent); }
.mf.kc.over { background: var(--over); }
.mf.pr { background: var(--protein); }
.note, .macros { font-size: var(--fs-xs); color: var(--ink-3); }

.foods { display: grid; gap: var(--s-2); }
.foods .section-title { padding: 0 var(--s-1); }
.empty { padding: var(--s-4); text-align: center; font-size: var(--fs-sm); }
.meal { padding: var(--s-3) var(--s-4); display: grid; }
.mh { display: flex; justify-content: space-between; align-items: baseline; padding-bottom: var(--s-2); }
.mh b { font-weight: var(--fw-bold); }
.mh span { font-size: var(--fs-sm); color: var(--ink-2); }
.fe { display: flex; justify-content: space-between; align-items: baseline; gap: var(--s-3); padding: var(--s-2) 0; border-top: 1px solid var(--line); }
.fn { min-width: 0; font-weight: var(--fw-book); font-size: var(--fs-md); overflow-wrap: anywhere; }
.fn small { color: var(--ink-3); font-size: var(--fs-xs); font-weight: var(--fw-regular); }
.fk { flex: none; font-size: var(--fs-sm); color: var(--ink-2); }
</style>
