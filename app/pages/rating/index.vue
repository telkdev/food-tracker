<script setup lang="ts">
import type { Rating, RatingPeriod, RatingUser } from '~/utils/types'
import { errMsg, fmtDate } from '~/utils/format'

// Everyone who shares their diary, ranked by how well they kept to their OWN goals (server/utils/rating.ts).
const { t, n, locale } = useT()
const toast = useToast()
const requestFetch = useRequestFetch()
const period = useCookie<RatingPeriod>('rating-period', { default: () => 'today', sameSite: 'lax' })
if (!['today', 'yesterday', 'week'].includes(period.value)) period.value = 'today'

const { data, pending, error, refresh } = await useAsyncData('rating', () =>
  requestFetch<Rating>('/api/rating', { query: { period: period.value } }), { watch: [period] })

const others = computed(() => (data.value?.users ?? []).filter(u => !u.me).length)
const range = computed(() => {
  const d = data.value
  if (!d) return ''
  const f = (iso: string) => fmtDate(locale.value, iso, { day: 'numeric', month: 'short' })
  if (d.period === 'week') return t('ratingWeekRange', { from: f(d.from), to: f(d.to) })
  return fmtDate(locale.value, d.from, { weekday: 'long', day: 'numeric', month: 'long' })
})

function tone(score: number | null) {
  if (score == null) return 'none'
  return score >= 80 ? 'good' : score >= 50 ? 'mid' : 'low'
}
const pct = (v: number, goal: number) => goal > 0 ? Math.min(100, v / goal * 100) : 0
const kcalOver = (u: RatingUser) => u.kcal > u.kcal_goal * 1.05
const initial = (name: string) => name.trim().charAt(0).toUpperCase() || '?'
const dayOf = (iso: string) => fmtDate(locale.value, iso, { weekday: 'narrow' })

/** A person's page opens on the day shown here (for the week: yesterday). */
function personLink(u: RatingUser) {
  const d = data.value
  const date = !d || d.period === 'today' ? undefined : d.to
  return { path: `/rating/${u.id}`, query: date ? { date } : {} }
}

const how = ref(false)
const showing = ref(false)
async function showMe() {
  showing.value = true
  try {
    await $fetch('/api/settings', { method: 'PATCH', body: { show_in_rating: true } })
    useSettings().settings.value = null
    await refresh()
    toast.show(t('ratingSettingOn'))
  }
  catch (e) { toast.show(errMsg(e, t('somethingWrong'))) }
  finally { showing.value = false }
}

useHead({ title: () => `${t('ratingTitle')} · ${t('appName')}` })
</script>

<template>
  <div class="rating">
    <header class="top">
      <div class="tt">
        <h1>{{ t('ratingTitle') }}</h1>
        <p v-if="data" class="sub">{{ range }}</p>
      </div>
    </header>

    <div class="seg" role="group" :aria-label="t('ratingTitle')">
      <button type="button" :aria-pressed="period === 'today'" @click="period = 'today'">{{ t('ratingToday') }}</button>
      <button type="button" :aria-pressed="period === 'yesterday'" @click="period = 'yesterday'">{{ t('ratingYesterday') }}</button>
      <button type="button" :aria-pressed="period === 'week'" @click="period = 'week'">{{ t('ratingWeek') }}</button>
    </div>

    <div v-if="error" class="card pad">
      <p>{{ t('loadFailed', { msg: error.statusMessage || error.message }) }}</p>
      <button class="btn" @click="refresh()">{{ t('retry') }}</button>
    </div>

    <template v-else-if="data">
      <div v-if="data.hidden_me" class="hidden card">
        <Icon name="eyeOff" :size="20" />
        <p>{{ t('ratingHiddenMe') }}</p>
        <button type="button" class="btn" :disabled="showing" @click="showMe">{{ t('ratingShowMe') }}</button>
      </div>

      <p v-if="data.period === 'today'" class="live muted">{{ t('ratingLive') }}</p>

      <ol class="board" :class="{ pending }">
        <li v-for="u in data.users" :key="u.id">
          <NuxtLink :to="personLink(u)" class="row card" :class="[{ me: u.me }, `t-${tone(u.score)}`]">
            <span class="rank num" :class="u.rank && u.rank <= 3 ? `r${u.rank}` : ''">{{ u.rank ?? '–' }}</span>

            <span class="who">
              <span class="name-line">
                <span class="ava" aria-hidden="true">{{ initial(u.name) }}</span>
                <b class="name">{{ u.name }}</b>
                <span v-if="u.me" class="you">{{ t('ratingYou') }}</span>
                <span v-if="u.streak" class="streak num" :class="{ cold: !u.today_logged }" :title="t('streakTitle')"><Icon name="flame" :size="13" />{{ u.streak }}</span>
              </span>

              <template v-if="u.score != null">
                <span class="meter">
                  <span class="mt"><span class="mf kc" :class="{ over: kcalOver(u) }" :style="{ width: `${pct(u.kcal, u.kcal_goal)}%` }" /></span>
                  <span class="ml num">{{ t('ratingKcalOf', { v: n(u.kcal), goal: n(u.kcal_goal) }) }}</span>
                </span>
                <span class="meter">
                  <span class="mt"><span class="mf pr" :style="{ width: `${pct(u.p, u.p_goal)}%` }" /></span>
                  <span class="ml num">{{ t('ratingProteinOf', { v: n(u.p), goal: n(u.p_goal) }) }}</span>
                </span>
                <span v-if="data.period === 'week' && u.days" class="week-dots" :aria-label="`${t('ratingLoggedDays', { n: u.logged_days ?? 0 })}, ${t('ratingOnTarget', { n: u.on_target_days ?? 0 })}`">
                  <span v-for="d in u.days" :key="d.date" class="wd" :class="`t-${tone(d.score)}`" :title="`${fmtDate(locale, d.date, { weekday: 'short', day: 'numeric' })}: ${d.score ?? '—'}`">
                    <span class="wb" :style="{ height: d.score != null ? `${Math.max(12, d.score)}%` : '12%' }" />
                    <span class="wl">{{ dayOf(d.date) }}</span>
                  </span>
                </span>
                <span v-if="u.top.length" class="foods">{{ u.top.join(' · ') }}</span>
              </template>
              <span v-else class="foods none">{{ t('ratingNoData') }}</span>
            </span>

            <span class="score" :aria-label="`${u.score ?? '—'} ${t('ratingScore')}`">
              <svg viewBox="0 0 44 44" width="52" height="52" aria-hidden="true">
                <circle cx="22" cy="22" r="19" class="st" />
                <circle cx="22" cy="22" r="19" class="sa" :stroke-dasharray="119.4" :stroke-dashoffset="119.4 * (1 - (u.score ?? 0) / 100)" transform="rotate(-90 22 22)" />
              </svg>
              <span class="sv num">{{ u.score ?? '—' }}</span>
            </span>
          </NuxtLink>
        </li>
      </ol>

      <p v-if="!others" class="muted empty">{{ t('ratingNobody') }}</p>

      <section class="how card">
        <button type="button" class="how-h" :aria-expanded="how" @click="how = !how">
          <Icon name="info" :size="18" /><span>{{ t('ratingHowTitle') }}</span><Icon name="right" :size="16" class="chev" :class="{ open: how }" />
        </button>
        <div v-if="how" class="how-b">
          <p>{{ t('ratingHowBody') }}</p>
          <p class="muted">{{ t('ratingPrivacy') }}</p>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.rating { display: grid; gap: var(--s-4); }
.top { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); padding-top: var(--s-2); min-height: 56px; }
.top h1 { font-size: var(--fs-2xl); font-weight: var(--fw-black); letter-spacing: -0.025em; }
.sub { font-size: var(--fs-sm); color: var(--ink-2); }
.sub::first-letter { text-transform: uppercase; }
.pad { padding: var(--s-4); display: grid; gap: var(--s-3); justify-items: start; }
.live { font-size: var(--fs-xs); margin-top: calc(-1 * var(--s-2)); }

.hidden { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-3) var(--s-4); color: var(--ink-2); font-size: var(--fs-sm); }
.hidden p { flex: 1; }
.hidden .btn { min-height: 36px; flex: none; }

.board { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-2); transition: opacity var(--dur); }
.board.pending { opacity: .6; }
.row {
  display: grid; grid-template-columns: 28px 1fr auto; align-items: center; gap: var(--s-3);
  padding: var(--s-3) var(--s-3) var(--s-3) var(--s-3); color: var(--ink); text-decoration: none;
}
.row:active { background: color-mix(in srgb, var(--ink) 4%, var(--surface)); }
.row.me { box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--accent) 55%, transparent); }

.rank { align-self: start; margin-top: 4px; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; font-size: var(--fs-sm); font-weight: var(--fw-bold); color: var(--ink-3); }
.rank.r1 { background: color-mix(in srgb, var(--fat) 22%, var(--surface)); color: var(--fat); }
.rank.r2 { background: var(--surface-2); color: var(--ink-2); }
.rank.r3 { background: color-mix(in srgb, var(--over) 16%, var(--surface)); color: var(--over); }

.who { min-width: 0; display: grid; gap: 6px; }
.name-line { display: flex; align-items: center; gap: 6px; min-width: 0; }
.ava { flex: none; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-soft-ink); font-size: var(--fs-xs); font-weight: var(--fw-bold); }
.name { font-weight: var(--fw-bold); font-size: var(--fs-md); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.you { flex: none; font-size: var(--fs-2xs); color: var(--accent-soft-ink); background: var(--accent-soft); padding: 1px 6px; border-radius: var(--r-pill); }
.streak { flex: none; display: inline-flex; align-items: center; gap: 2px; font-size: var(--fs-xs); color: var(--over); font-weight: var(--fw-medium); }
.streak.cold { color: var(--ink-3); }

.meter { display: grid; grid-template-columns: 56px 1fr; align-items: center; gap: var(--s-2); }
.mt { height: 4px; border-radius: 2px; background: var(--track); overflow: hidden; }
.mf { display: block; height: 100%; border-radius: 2px; transition: width var(--dur-slow) var(--ease); }
.mf.kc { background: var(--accent); }
.mf.kc.over { background: var(--over); }
.mf.pr { background: var(--protein); }
.ml { font-size: var(--fs-xs); color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.week-dots { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; max-width: 220px; margin-top: 2px; }
.wd { display: grid; gap: 2px; justify-items: center; }
.wb { display: block; width: 100%; max-width: 18px; border-radius: 3px; background: var(--track); align-self: end; }
.wd { height: 34px; grid-template-rows: 1fr auto; }
.wd.t-good .wb { background: var(--accent); }
.wd.t-mid .wb { background: var(--fat); }
.wd.t-low .wb { background: var(--over); }
.wl { font-size: 10px; line-height: 1; color: var(--ink-3); text-transform: uppercase; }

.foods { font-size: var(--fs-xs); color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.foods.none { font-style: normal; }

.score { position: relative; display: grid; place-items: center; width: 52px; height: 52px; }
.score svg { position: absolute; inset: 0; }
.st { fill: none; stroke: var(--track); stroke-width: 4; }
.sa { fill: none; stroke-width: 4; stroke-linecap: round; transition: stroke-dashoffset var(--dur-slow) var(--ease); stroke: var(--ink-3); }
.t-good .sa { stroke: var(--accent); }
.t-mid .sa { stroke: var(--fat); }
.t-low .sa { stroke: var(--over); }
.t-none .sa { stroke: transparent; }
.sv { font-size: var(--fs-lg); font-weight: var(--fw-bold); letter-spacing: -0.02em; }
.t-none .sv { color: var(--ink-3); font-weight: var(--fw-regular); }

.empty { text-align: center; font-size: var(--fs-sm); }

.how { overflow: hidden; }
.how-h { display: flex; align-items: center; gap: var(--s-2); width: 100%; min-height: 48px; padding: 0 var(--s-4); background: none; border: 0; color: var(--ink-2); font: inherit; font-size: var(--fs-sm); text-align: left; }
.how-h span { flex: 1; }
.chev { transition: transform var(--dur-fast); color: var(--ink-3); }
.chev.open { transform: rotate(90deg); }
.how-b { display: grid; gap: var(--s-2); padding: 0 var(--s-4) var(--s-4); font-size: var(--fs-sm); line-height: var(--lh); }
</style>
