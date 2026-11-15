<script setup lang="ts">
import { messages, type MsgKey } from '~/utils/i18n'

// Rule-based advice from the last 14 days (server/utils/insights.ts). Read-only.
type Level = 'warn' | 'tip' | 'good' | 'info'
interface Food { name: string, grams: number, kcal: number, p: number, f: number }
interface Insight { id: string, level: Level, params: Record<string, string | number>, foods?: Food[] }
interface Insights {
  today: string
  goal: { kcal: number, p: number | null, f: number | null, c: number | null }
  goal_type: 'recomp' | 'cut' | 'bulk'
  stats: {
    window_days: number, complete_days: number, avg_kcal: number | null, avg_p: number | null,
    p_target: number | null, kcal_ok_days: number
  }
  insights: Insight[]
}

const { t, n } = useT()
const requestFetch = useRequestFetch()
const { data, error, refresh, pending } = await useAsyncData('insights', () => requestFetch<Insights>('/api/insights'))

const has = (k: string): k is MsgKey => k in messages.en
// meal codes in params ("breakfast") are shown translated
const params = (i: Insight) => Object.fromEntries(Object.entries(i.params).map(([k, v]) => [k, k === 'meal' && has(String(v)) ? t(v as MsgKey).toLowerCase() : typeof v === 'number' ? n(v, 1) : v]))
const list = computed(() => (data.value?.insights ?? []).filter(i => has(`ins_${i.id}_t`)))
// tips that point at foods to add vs foods to look at
const ADD = new Set(['proteinLow', 'proteinDrop'])

useHead({ title: () => `${t('tipsTitle')} · ${t('appName')}` })
</script>

<template>
  <div class="tips">
    <header class="top">
      <h1>{{ t('tipsTitle') }}</h1>
      <p v-if="data" class="sub">{{ t('tipsWindow', { days: data.stats.window_days, goal: t(`goal_${data.goal_type}` as MsgKey) }) }}</p>
    </header>

    <div v-if="error" class="card pad">
      <p>{{ t('loadFailed', { msg: error.statusMessage || error.message }) }}</p>
      <button class="btn" @click="refresh()">{{ t('retry') }}</button>
    </div>

    <template v-else-if="data">
      <section v-if="data.stats.complete_days" class="stats" :class="{ pending }">
        <div class="stat card">
          <span class="sl">{{ t('tipsAvgKcal') }}</span>
          <span class="sv num">{{ data.stats.avg_kcal != null ? n(data.stats.avg_kcal) : '—' }}</span>
          <span class="sh num">{{ t('tipsGoalOf', { n: n(data.goal.kcal) }) }}</span>
        </div>
        <div class="stat card">
          <span class="sl">{{ t('tipsAvgP') }}</span>
          <span class="sv num">{{ data.stats.avg_p != null ? n(data.stats.avg_p) : '—' }}<small> {{ t('g') }}</small></span>
          <span class="sh num">{{ data.stats.p_target != null ? t('tipsGoalOf', { n: n(data.stats.p_target) }) : t('tipsNoGoal') }}</span>
        </div>
        <div class="stat card">
          <span class="sl">{{ t('tipsDaysOn') }}</span>
          <span class="sv num">{{ data.stats.kcal_ok_days }}<small> / {{ data.stats.complete_days }}</small></span>
          <span class="sh">{{ t('tipsDaysOnHint', { n: data.stats.complete_days }) }}</span>
        </div>
      </section>

      <section class="list">
        <article v-for="i in list" :key="i.id" class="ins card" :class="i.level">
          <header class="th">
            <span class="dot" aria-hidden="true" />
            <span class="lvl">{{ t(`tipsLevel_${i.level}` as MsgKey) }}</span>
          </header>
          <h2>{{ t(`ins_${i.id}_t` as MsgKey, params(i)) }}</h2>
          <p class="body">{{ t(`ins_${i.id}_b` as MsgKey, params(i)) }}</p>
          <div v-if="i.foods?.length" class="foods">
            <p class="fl">{{ ADD.has(i.id) ? t('tipsFoodsAdd') : t('tipsFoodsTop') }}</p>
            <ul>
              <li v-for="f in i.foods" :key="f.name">
                <span class="fn">{{ f.name }}</span>
                <span class="fv num">{{ n(f.grams) }} {{ t('g') }} · {{ n(f.kcal) }} {{ t('kcal') }} · {{ t('proteinShort') }} {{ n(f.p) }}<template v-if="i.id === 'fatOver'"> · {{ t('fatShort') }} {{ n(f.f) }}</template></span>
              </li>
            </ul>
          </div>
        </article>
      </section>

      <p class="muted foot">{{ t('tipsRules') }}</p>
    </template>
  </div>
</template>

<style scoped>
.tips { display: grid; gap: var(--s-4); }
.top { padding-top: var(--s-2); min-height: 56px; display: grid; align-content: center; gap: 2px; }
.top h1 { font-size: var(--fs-2xl); font-weight: var(--fw-black); letter-spacing: -0.025em; }
.sub { font-size: var(--fs-xs); color: var(--ink-2); }
.pad { padding: var(--s-4); display: grid; gap: var(--s-3); justify-items: start; }

.stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-2); transition: opacity var(--dur); }
.stats.pending { opacity: .6; }
.stat { padding: var(--s-3); display: grid; gap: 4px; min-width: 0; }
.sl { font-size: var(--fs-2xs); color: var(--ink-2); }
.sv { font-size: var(--fs-xl); font-weight: var(--fw-regular); letter-spacing: -0.02em; }
.sv small { font-size: var(--fs-xs); color: var(--ink-3); letter-spacing: 0; }
.sh { font-size: var(--fs-2xs); color: var(--ink-3); }

.list { display: grid; gap: var(--s-3); }
.ins { padding: var(--s-4); display: grid; gap: var(--s-2); --dot: var(--ink-3); }
.ins.warn { --dot: var(--over); }
.ins.tip { --dot: var(--accent); }
.ins.good { --dot: color-mix(in srgb, var(--accent) 55%, var(--surface)); }
.th { display: flex; align-items: center; gap: var(--s-2); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--dot); }
.lvl { font-size: var(--fs-2xs); color: var(--ink-3); text-transform: uppercase; letter-spacing: .06em; font-weight: var(--fw-medium); }
.ins h2 { font-size: var(--fs-lg); font-weight: var(--fw-bold); letter-spacing: -0.01em; }
.body { font-size: var(--fs-sm); color: var(--ink-2); line-height: 1.5; }
.ins.info h2 { font-weight: var(--fw-medium); }

.foods { border-top: 1px solid var(--line); padding-top: var(--s-2); display: grid; gap: var(--s-1); }
.fl { font-size: var(--fs-xs); color: var(--ink-3); }
.foods ul { list-style: none; margin: 0; padding: 0; display: grid; }
.foods li { display: grid; gap: 1px; padding: 6px 0; }
.foods li + li { border-top: 1px solid var(--line); }
.fn { font-size: var(--fs-sm); overflow-wrap: anywhere; }
.fv { font-size: var(--fs-xs); color: var(--ink-3); }
.foot { text-align: center; font-size: var(--fs-xs); padding-bottom: var(--s-4); }
</style>
