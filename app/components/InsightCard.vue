<script setup lang="ts">
import { messages, type MsgKey } from '~/utils/i18n'
import { addDays, fmtDate } from '~/utils/format'
import type { Insight, InsightsData } from '~/utils/insights'

// One tip, read top to bottom: icon + verdict, the headline, one big number, a picture of the numbers,
// foods to act on, and the explanation folded under "Why".
const props = defineProps<{ i: Insight, data: InsightsData }>()
const { t, n, locale } = useT()

const has = (k: string): k is MsgKey => k in messages.en
const params = computed(() => Object.fromEntries(Object.entries(props.i.params).map(([k, v]) =>
  [k, k === 'meal' && has(String(v)) ? t(v as MsgKey).toLowerCase() : typeof v === 'number' ? n(v, 1) : v])))
const P = (k: string) => Number(props.i.params[k] ?? 0)
const id = computed(() => props.i.id)
const base = computed(() => id.value.replace(/_(recomp|cut|bulk)$/, ''))

const ICON: Record<string, string> = {
  proteinLow: 'egg', proteinOk: 'egg', proteinDrop: 'trendDown', proteinNoGoal: 'egg', proteinSpread: 'egg',
  proteinGoalHigh: 'target', proteinGoalLow: 'target', kcalGoalHigh: 'target', kcalGoalLow: 'target',
  kcalOver: 'flame', kcalUnder: 'flame', kcalOk: 'flame', kcalSwing: 'flame', kcalUpTrend: 'trendUp', kcalDownTrend: 'trendDown',
  weekend: 'today', fatOver: 'drop', treats: 'cookie', veg: 'leaf', vegOk: 'leaf', late: 'moon', estimates: 'eye',
  gaps: 'today', streak: 'check', noData: 'info', fewDays: 'info', basics: 'dumbbell', noWeight: 'scale',
  weightOk: 'scale', weightDown: 'trendDown', weightUp: 'trendUp', weighIn: 'scale', weighMore: 'scale',
}
const icon = computed(() => ICON[base.value] ?? ICON[id.value.split('_')[0]!] ?? 'info')

// every day of the window, logged or not, for the day charts and the calendar
const window = computed(() => {
  const s = props.data.stats
  const by = new Map(s.days.map(d => [d.date, d]))
  return Array.from({ length: s.window_days }, (_, k) => {
    const date = addDays(s.from, k)
    return { date, d: by.get(date) ?? null }
  })
})
const pDays = computed(() => window.value.map(({ date, d }) => ({ date, value: d ? d.p : null, partial: d?.partial })))
const kDays = computed(() => window.value.map(({ date, d }) => ({ date, value: d ? d.kcal : null, partial: d?.partial })))
const g = (v: number) => `${n(v)} ${t('g')}`
const kc = (v: number) => `${n(v)} ${t('kcal')}`

type Viz =
  | { kind: 'pDays' } | { kind: 'kDays' } | { kind: 'meals' } | { kind: 'gaps' } | { kind: 'weight' }
  | { kind: 'meter', value: number, target: number, cap?: boolean, max?: number }
  | { kind: 'compare', rows: { label: string, value: number, text: string, hl?: boolean }[] }
  | null

const view = computed<{ big?: string, small?: string, viz: Viz }>(() => {
  switch (base.value) {
    case 'proteinLow': case 'proteinOk':
      return { big: n(P('avg')), small: `/ ${g(P('target'))}`, viz: { kind: 'pDays' } }
    case 'proteinNoGoal':
      return { big: n(P('avg')), small: t('g'), viz: { kind: 'pDays' } }
    case 'proteinDrop':
      return { big: n(P('now')), small: `← ${g(P('before'))}`, viz: { kind: 'compare', rows: [
        { label: t('tipsBefore'), value: P('before'), text: g(P('before')) },
        { label: t('tipsNow'), value: P('now'), text: g(P('now')), hl: true }] } }
    case 'proteinSpread':
      return { big: n(P('meals'), 1), small: t('tipsMealsOf'), viz: { kind: 'meals' } }
    case 'kcalOver': case 'kcalUnder': case 'kcalOk':
      return { big: n(P('avg')), small: `/ ${kc(P('goal'))}`, viz: { kind: 'kDays' } }
    case 'kcalSwing':
      return { big: `${n(P('ok'))}`, small: `/ ${n(P('days'))} ${t('tipsDaysShort')}`, viz: { kind: 'kDays' } }
    case 'kcalUpTrend': case 'kcalDownTrend':
      return { big: n(P('now')), small: t('kcal'), viz: { kind: 'compare', rows: [
        { label: t('tipsBefore'), value: P('before'), text: kc(P('before')) },
        { label: t('tipsNow'), value: P('now'), text: kc(P('now')), hl: true }] } }
    case 'weekend':
      return { big: `+${n(P('diff'))}`, small: t('kcal'), viz: { kind: 'compare', rows: [
        { label: t('tipsWeekdays'), value: P('weekday'), text: kc(P('weekday')) },
        { label: t('tipsWeekend'), value: P('weekend'), text: kc(P('weekend')), hl: true }] } }
    case 'fatOver':
      return { big: n(P('avg')), small: `/ ${g(P('goal'))}`, viz: { kind: 'meter', value: P('avg'), target: P('goal'), cap: true } }
    case 'treats':
      return { big: `${n(P('share'))}%`, small: `≈ ${kc(P('perDay'))}`, viz: { kind: 'meter', value: P('share'), target: 15, cap: true, max: 50 } }
    case 'veg': case 'vegOk':
      return { big: n(P('grams')), small: `/ 400 ${t('g')}`, viz: { kind: 'meter', value: P('grams'), target: 400, max: 500 } }
    case 'late':
      return { big: `${n(P('share'))}%`, small: t('tipsAfter21'), viz: { kind: 'meter', value: P('share'), target: 25, cap: true, max: 60 } }
    case 'estimates':
      return { big: `${n(P('share'))}%`, small: t('tipsByEye'), viz: { kind: 'meter', value: P('share'), target: 30, cap: true, max: 100 } }
    case 'gaps':
      return { big: n(P('missed') + P('partial')), small: `/ ${n(P('days'))} ${t('tipsDaysShort')}`, viz: { kind: 'gaps' } }
    case 'streak':
      return { big: n(P('days')), small: t('tipsDaysShort'), viz: null }
    case 'proteinGoalHigh': case 'proteinGoalLow':
      return { big: n(P('perKg'), 1), small: t('tipsGPerKg'), viz: { kind: 'compare', rows: [
        { label: t('tipsYourGoal'), value: P('goal'), text: g(P('goal')) },
        { label: t('tipsEstimate'), value: P('rec'), text: g(P('rec')), hl: true }] } }
    case 'kcalGoalHigh': case 'kcalGoalLow':
      return { viz: { kind: 'compare', rows: [
        { label: t('tipsYourGoal'), value: P('goal'), text: kc(P('goal')) },
        { label: t('tipsEstimate'), value: P('rec'), text: kc(P('rec')), hl: true }] } }
    case 'weightOk': case 'weightDown': case 'weightUp':
      return { big: `${P('kg') > 0 ? '+' : ''}${n(P('kg'), 2)}`, small: t('tipsKgWeek'), viz: { kind: 'weight' } }
    default:
      return { viz: null }
  }
})
const dayLabel = (iso: string) => fmtDate(locale.value, iso, { weekday: 'short', day: 'numeric' })
const quiet = computed(() => props.i.level === 'info')
const open = ref(false)
</script>

<template>
  <article class="ins card" :class="[i.level, { quiet }]">
    <header class="th">
      <span class="ic"><Icon :name="icon" :size="20" /></span>
      <span class="lvl">{{ t(`tipsLevel_${i.level}` as MsgKey) }}</span>
    </header>
    <h2>{{ t(`ins_${i.id}_t` as MsgKey, params) }}</h2>

    <p v-if="view.big" class="big num">{{ view.big }} <small>{{ view.small }}</small></p>

    <template v-if="view.viz">
      <div v-if="view.viz.kind === 'pDays'" class="viz">
        <VizDayBars :days="pDays" :target="data.stats.p_target" mode="floor" :label="t('protein')" />
        <p class="axis"><span>{{ dayLabel(data.stats.from) }}</span><span class="tl">— — {{ data.stats.p_target != null ? g(data.stats.p_target) : '' }}</span><span>{{ dayLabel(data.stats.to) }}</span></p>
      </div>
      <div v-else-if="view.viz.kind === 'kDays'" class="viz">
        <VizDayBars :days="kDays" :target="data.goal.kcal" mode="range" :label="t('kcal')" />
        <p class="axis"><span>{{ dayLabel(data.stats.from) }}</span><span class="tl">— — {{ kc(data.goal.kcal) }} ±10%</span><span>{{ dayLabel(data.stats.to) }}</span></p>
      </div>
      <div v-else-if="view.viz.kind === 'meals'" class="viz meals">
        <div v-for="(v, m) in data.stats.meal_p" :key="m" class="mcol">
          <span class="mv num" :class="{ ok: v >= 25 }">{{ n(v) }}</span>
          <span class="mbar"><span :class="{ ok: v >= 25 }" :style="{ height: `${Math.min(100, v / 50 * 100)}%` }" /><i class="m25" /></span>
          <span class="ml">{{ t(m as MsgKey) }}</span>
        </div>
      </div>
      <div v-else-if="view.viz.kind === 'meter'" class="viz">
        <VizMeter :value="view.viz.value" :target="view.viz.target" :max="view.viz.max" :kind="view.viz.cap ? 'cap' : 'floor'" />
      </div>
      <div v-else-if="view.viz.kind === 'compare'" class="viz">
        <VizCompareBars :rows="view.viz.rows" />
      </div>
      <div v-else-if="view.viz.kind === 'gaps'" class="viz">
        <div class="cal">
          <span v-for="w in window" :key="w.date" :class="w.d ? (w.d.partial ? 'partial' : 'ok') : 'miss'" :title="w.date" />
        </div>
        <p class="legend"><span class="ok" />{{ t('tipsLogged') }}<span class="partial" />{{ t('tipsPartial') }}<span class="miss" />{{ t('tipsMissed') }}</p>
      </div>
      <div v-else-if="view.viz.kind === 'weight'" class="viz">
        <VizSparkline :points="data.weights" />
      </div>
    </template>

    <div v-if="i.foods?.length" class="foods">
      <p class="fl">{{ ['proteinLow', 'proteinDrop'].includes(i.id) ? t('tipsFoodsAdd') : t('tipsFoodsTop') }}</p>
      <ul>
        <li v-for="f in i.foods" :key="f.name">
          <span class="fn">{{ f.name }}</span>
          <span class="fv num">{{ n(f.grams) }} {{ t('g') }}</span>
          <span class="fchip num" :class="{ p: ['proteinLow', 'proteinDrop'].includes(i.id) }">
            <template v-if="['proteinLow', 'proteinDrop'].includes(i.id)">+{{ n(f.p) }} {{ t('proteinShort') }}</template>
            <template v-else-if="i.id === 'fatOver'">{{ n(f.f) }} {{ t('fatShort') }}</template>
            <template v-else>{{ n(f.kcal) }} {{ t('kcal') }}</template>
          </span>
        </li>
      </ul>
    </div>

    <button type="button" class="why" :aria-expanded="open" @click="open = !open">
      {{ t('tipsWhy') }} <Icon name="right" :size="14" class="chev" :class="{ open }" />
    </button>
    <p v-show="open" class="body">{{ t(`ins_${i.id}_b` as MsgKey, params) }}</p>
  </article>
</template>

<style scoped>
.ins { padding: var(--s-4); display: grid; gap: var(--s-3); --tone: var(--ink-3); --tone-soft: var(--surface-2); }
.ins.warn { --tone: var(--over); --tone-soft: var(--over-soft); }
.ins.tip { --tone: var(--accent); --tone-soft: var(--accent-soft); }
.ins.good { --tone: var(--accent); --tone-soft: var(--accent-soft); }
.th { display: flex; align-items: center; gap: var(--s-2); }
.ic { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: var(--tone-soft); color: var(--tone); }
.lvl { font-size: var(--fs-2xs); color: var(--tone); text-transform: uppercase; letter-spacing: .06em; font-weight: var(--fw-medium); }
h2 { font-size: var(--fs-lg); font-weight: var(--fw-bold); letter-spacing: -0.01em; line-height: var(--lh-tight); }
.quiet h2 { font-weight: var(--fw-medium); }
.big { font-size: var(--fs-2xl); font-weight: var(--fw-light); letter-spacing: -0.03em; line-height: 1; }
.big small { font-size: var(--fs-sm); color: var(--ink-3); letter-spacing: 0; font-weight: var(--fw-regular); }
.viz { display: grid; gap: 6px; }
.axis { display: flex; justify-content: space-between; font-size: var(--fs-2xs); color: var(--ink-3); }
.axis .tl { color: var(--ink-2); }

.meals { grid-template-columns: repeat(4, 1fr); gap: var(--s-3); }
.mcol { display: grid; justify-items: center; gap: 4px; }
.mv { font-size: var(--fs-sm); color: var(--ink-2); }
.mv.ok { color: var(--accent); font-weight: var(--fw-medium); }
.mbar { position: relative; width: 28px; height: 56px; border-radius: 6px; background: var(--track); display: flex; align-items: flex-end; overflow: hidden; }
.mbar span { display: block; width: 100%; background: color-mix(in srgb, var(--accent) 40%, var(--surface)); border-radius: 6px 6px 0 0; transition: height var(--dur-slow) var(--ease); }
.mbar span.ok { background: var(--accent); }
.m25 { position: absolute; left: -2px; right: -2px; bottom: 50%; border-top: 1px dashed var(--ink-3); }
.ml { font-size: var(--fs-2xs); color: var(--ink-3); }

.cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
.cal span, .legend span { aspect-ratio: 1; border-radius: 6px; background: var(--accent); }
.cal .partial, .legend .partial { background: color-mix(in srgb, var(--accent) 30%, var(--surface)); }
.cal .miss, .legend .miss { background: transparent; border: 1.5px dashed var(--line-strong); }
.legend { display: flex; align-items: center; gap: 6px; font-size: var(--fs-2xs); color: var(--ink-3); }
.legend span { width: 10px; height: 10px; border-radius: 3px; margin-left: 6px; }
.legend span:first-child { margin-left: 0; }

.foods { display: grid; gap: var(--s-1); }
.fl { font-size: var(--fs-xs); color: var(--ink-3); }
.foods ul { list-style: none; margin: 0; padding: 0; display: grid; }
.foods li { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: var(--s-2); padding: 7px 0; }
.foods li + li { border-top: 1px solid var(--line); }
.fn { font-size: var(--fs-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fv { font-size: var(--fs-xs); color: var(--ink-3); }
.fchip { display: inline-flex; align-items: center; height: 22px; line-height: 1; font-size: var(--fs-xs); padding: 0 8px; border-radius: var(--r-pill); background: var(--surface-2); color: var(--ink-2); white-space: nowrap; }
.fchip.p { background: color-mix(in srgb, var(--protein) 14%, transparent); color: var(--protein); font-weight: var(--fw-medium); }

.why { justify-self: start; display: inline-flex; align-items: center; gap: 2px; border: 0; background: none; padding: 2px 0; color: var(--ink-3); font: inherit; font-size: var(--fs-xs); cursor: pointer; }
.chev { transition: transform var(--dur-fast); }
.chev.open { transform: rotate(90deg); }
.body { font-size: var(--fs-sm); color: var(--ink-2); line-height: 1.5; margin-top: calc(-1 * var(--s-2)); }
</style>
