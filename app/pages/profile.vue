<script setup lang="ts">
import type { MsgKey } from '~/utils/i18n'
import type { ProfileData } from '~/utils/insights'
import { errMsg, parseDecimal } from '~/utils/format'
import { recommendTargets, type Activity, type Experience, type GoalType, type Sex } from '~~/shared/targets'

// "About me": one question per screen, swipe or tap to move. Answers are saved as you go;
// the last screen shows the estimate and can apply it as goals.
const { t, n } = useT()
const toast = useToast()
const router = useRouter()
const requestFetch = useRequestFetch()
const { data } = await useAsyncData('profile', () => requestFetch<ProfileData>('/api/profile'))

const a = reactive({
  goal_type: (data.value?.profile.goal_type ?? 'recomp') as GoalType,
  sex: (data.value?.profile.sex ?? null) as Sex | null,
  birth_year: data.value?.profile.birth_year ?? null as number | null,
  height_cm: data.value?.profile.height_cm ?? null as number | null,
  weight_kg: data.value?.weight?.kg ?? null as number | null,
  training_days: data.value?.profile.training_days ?? null as number | null,
  activity: (data.value?.profile.activity ?? null) as Activity | null,
  experience: (data.value?.profile.experience ?? null) as Experience | null,
})

type Opt = { v: string, icon: string, label: MsgKey, desc?: MsgKey, glyph?: string }
type Step =
  | { key: 'goal_type' | 'sex' | 'activity' | 'experience', kind: 'choice', q: MsgKey, h: MsgKey, icon: string, opts: Opt[] }
  | { key: 'birth_year' | 'height_cm' | 'weight_kg', kind: 'number', q: MsgKey, h: MsgKey, icon: string, min: number, max: number, step: number, unit: string, def: () => number, slider?: number }
  | { key: 'training_days', kind: 'chips', q: MsgKey, h: MsgKey, icon: string }
  | { key: 'result', kind: 'result' }

const thisYear = Number((data.value?.today ?? '2026').slice(0, 4))
const steps: Step[] = [
  { key: 'goal_type', kind: 'choice', q: 'q_goal', h: 'q_goal_h', icon: 'target', opts: [
    { v: 'recomp', icon: 'swap', label: 'opt_goal_recomp', desc: 'opt_goal_recomp_d' },
    { v: 'cut', icon: 'arrowDown', label: 'opt_goal_cut', desc: 'opt_goal_cut_d' },
    { v: 'bulk', icon: 'arrowUp', label: 'opt_goal_bulk', desc: 'opt_goal_bulk_d' }] },
  { key: 'sex', kind: 'choice', q: 'q_sex', h: 'q_sex_h', icon: 'person', opts: [
    { v: 'm', icon: 'person', label: 'opt_sex_m', glyph: '♂' }, { v: 'f', icon: 'person', label: 'opt_sex_f', glyph: '♀' }] },
  { key: 'birth_year', kind: 'number', q: 'q_birth', h: 'q_birth_h', icon: 'cake', min: 1940, max: thisYear - 14, step: 1, unit: '', def: () => thisYear - 30 },
  { key: 'height_cm', kind: 'number', q: 'q_height', h: 'q_height_h', icon: 'ruler', min: 140, max: 215, step: 1, unit: 'cm', def: () => a.sex === 'f' ? 165 : 178 },
  { key: 'weight_kg', kind: 'number', q: 'q_weight', h: 'q_weight_h', icon: 'scale', min: 40, max: 180, step: 0.1, slider: 0.5, unit: 'kg', def: () => a.sex === 'f' ? 65 : 80 },
  { key: 'training_days', kind: 'chips', q: 'q_training', h: 'q_training_h', icon: 'dumbbell' },
  { key: 'activity', kind: 'choice', q: 'q_activity', h: 'q_activity_h', icon: 'walk', opts: [
    { v: 'sitting', icon: 'person', label: 'opt_act_sitting', desc: 'opt_act_sitting_d' },
    { v: 'light', icon: 'walk', label: 'opt_act_light', desc: 'opt_act_light_d' },
    { v: 'active', icon: 'walk', label: 'opt_act_active', desc: 'opt_act_active_d' },
    { v: 'physical', icon: 'dumbbell', label: 'opt_act_physical', desc: 'opt_act_physical_d' }] },
  { key: 'experience', kind: 'choice', q: 'q_experience', h: 'q_experience_h', icon: 'trendUp', opts: [
    { v: 'new', icon: 'sparkle', label: 'opt_exp_new', desc: 'opt_exp_new_d' },
    { v: 'returning', icon: 'swap', label: 'opt_exp_returning', desc: 'opt_exp_returning_d' },
    { v: 'trained', icon: 'dumbbell', label: 'opt_exp_trained', desc: 'opt_exp_trained_d' }] },
  { key: 'result', kind: 'result' },
]
const total = steps.length - 1
// start at the first unanswered question (or the result when all are answered)
const firstOpen = steps.findIndex(s => s.kind !== 'result' && (a as any)[s.key] == null)
// first time: from the start (goal has a default); later: the first unanswered question, or the result
const idx = ref(!data.value?.profile.done_at ? 0 : firstOpen < 0 ? total : firstOpen)
const cur = computed(() => steps[idx.value]!)

const unitLabel = (u: string) => u === 'kg' ? t('weightPh') : u === 'cm' ? t('heightUnit') : ''

// ---- saving: each answer goes to the server when you move on ----
const busy = ref(false)
async function save(extra: Record<string, unknown> = {}) {
  const body: Record<string, unknown> = {
    goal_type: a.goal_type, sex: a.sex, birth_year: a.birth_year, height_cm: a.height_cm,
    training_days: a.training_days, activity: a.activity, experience: a.experience, ...extra,
  }
  if (a.weight_kg != null && a.weight_kg !== data.value?.weight?.kg) body.weight_kg = a.weight_kg
  try {
    data.value = await $fetch<ProfileData>('/api/profile', { method: 'PUT', body })
  }
  catch (e) { toast.show(errMsg(e, t('somethingWrong'))) }
}

function go(to: number) {
  const next = Math.max(0, Math.min(total, to))
  if (next === idx.value) return
  const s = cur.value
  // a number question counts as answered once you move past it
  if (s.kind === 'number' && (a as any)[s.key] == null && next > idx.value) (a as any)[s.key] = s.def()
  idx.value = next
  save(next === total ? { done: true } : {})
}
function pick(key: string, v: string | number) {
  (a as any)[key] = v
  setTimeout(() => go(idx.value + 1), 220)
}
function bump(s: Extract<Step, { kind: 'number' }>, dir: number) {
  const v = ((a as any)[s.key] ?? s.def()) + dir * s.step
  ;(a as any)[s.key] = Math.round(Math.max(s.min, Math.min(s.max, v)) * 10) / 10
}
const numVal = (s: Extract<Step, { kind: 'number' }>) => (a as any)[s.key] ?? s.def()
// typed value: comma or dot, clamped to the range on blur/enter
function typeNum(s: Extract<Step, { kind: 'number' }>, ev: Event) {
  const el = ev.target as HTMLInputElement
  const v = parseDecimal(el.value)
  if (Number.isFinite(v)) (a as any)[s.key] = Math.round(Math.max(s.min, Math.min(s.max, v)) * 10) / 10
  el.value = fmtNumVal(s)
}
const fmtNumVal = (s: Extract<Step, { kind: 'number' }>) => s.step < 1 ? n(numVal(s), 1) : String(numVal(s))
function setNum(s: Extract<Step, { kind: 'number' }>, ev: Event) {
  (a as any)[s.key] = Number((ev.target as HTMLInputElement).value)
}

// ---- swipe ----
const drag = ref(0)
let x0 = 0, y0 = 0, mode: 'none' | 'x' | 'y' = 'none'
// a gesture counts only if it started on the card itself: dragging a slider, or anything marked
// data-noswipe (the whole number picker), never moves the cards
let active = false
let swiped = false
function down(e: PointerEvent) {
  active = !(e.target as Element | null)?.closest('input, textarea, select, [data-noswipe]')
  x0 = e.clientX; y0 = e.clientY; mode = 'none'
}
function move(e: PointerEvent) {
  if (!active) return
  if (e.buttons === 0 && e.pointerType === 'mouse') return
  const dx = e.clientX - x0, dy = e.clientY - y0
  if (mode === 'none' && Math.abs(dx) > 10) mode = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
  if (mode === 'x') {
    // rubber band at the ends
    const edge = (idx.value === 0 && dx > 0) || (idx.value === total && dx < 0)
    drag.value = edge ? dx / 4 : dx
  }
}
function up() {
  if (!active) { drag.value = 0; return }
  active = false
  swiped = mode === 'x' && Math.abs(drag.value) > 10
  if (mode === 'x') {
    if (drag.value < -60) go(idx.value + 1)
    else if (drag.value > 60) go(idx.value - 1)
  }
  drag.value = 0
  mode = 'none'
}
// the click that ends a swipe must not pick the option under the finger
function eatClick(e: MouseEvent) {
  if (swiped) { e.stopPropagation(); e.preventDefault(); swiped = false }
}

// ---- result ----
const rec = computed(() => recommendTargets({
  goalType: a.goal_type, sex: a.sex, birthYear: a.birth_year, heightCm: a.height_cm,
  activity: a.activity, trainingDays: a.training_days, experience: a.experience,
}, a.weight_kg, data.value?.today ?? `${thisYear}-01-01`))
const goal = computed(() => data.value?.goal)
const macros = computed(() => {
  const r = rec.value, g = goal.value
  if (!r || !g) return []
  return [
    { k: 'kcal', label: t('kcal'), v: r.kcal, now: g.kcal, unit: '' },
    { k: 'p', label: t('protein'), v: r.p, now: g.p, unit: t('g') },
    { k: 'f', label: t('fat'), v: r.f, now: g.f, unit: t('g') },
    { k: 'c', label: t('carbs'), v: r.c, now: g.c, unit: t('g') },
  ]
})
async function apply() {
  const r = rec.value
  if (!r) return
  busy.value = true
  try {
    await $fetch('/api/settings', { method: 'PATCH', body: { kcal_goal: r.kcal, p_goal: r.p, f_goal: r.f, c_goal: r.c } })
    toast.show(t('goalsApplied'))
    clearNuxtData(['insights', 'settings'])
    useSettings().settings.value = null
    await router.push('/tips')
  }
  catch (e) { toast.show(errMsg(e, t('somethingWrong'))) }
  finally { busy.value = false }
}
function finish() {
  clearNuxtData('insights')
  router.push('/tips')
}

useHead({ title: () => `${t('profileTitle')} · ${t('appName')}` })
</script>

<template>
  <div class="quiz">
    <header class="qh">
      <button type="button" class="icon-btn" :aria-label="t('qClose')" @click="finish"><Icon name="close" :size="22" /></button>
      <div class="prog" role="progressbar" :aria-valuenow="Math.min(idx + 1, total)" :aria-valuemin="1" :aria-valuemax="total">
        <span v-for="k in total" :key="k" :class="{ on: k <= idx + 1, cur: k === idx + 1 }" @click="go(k - 1)" />
      </div>
      <span class="cnt num">{{ idx < total ? t('qStep', { n: idx + 1, total }) : '' }}</span>
    </header>

    <div class="viewport" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @click.capture="eatClick">
      <div class="track" :class="{ dragging: drag !== 0 }" :style="{ transform: `translateX(calc(${-idx * 100}% + ${drag}px))` }">
        <section v-for="(s, k) in steps" :key="s.key" class="slide" :aria-hidden="k !== idx" :inert="k !== idx">
          <template v-if="s.kind !== 'result'">
            <span class="qic"><Icon :name="s.icon" :size="28" /></span>
            <h1>{{ t(s.q) }}</h1>
            <p class="hint">{{ t(s.h) }}</p>

            <div v-if="s.kind === 'choice'" class="opts" :class="{ two: s.opts.length === 2 }">
              <button
                v-for="o in s.opts" :key="o.v" type="button" class="opt" :class="{ sel: (a as any)[s.key] === o.v }"
                :aria-pressed="(a as any)[s.key] === o.v" @click="pick(s.key, o.v)"
              >
                <span class="oic" :class="{ glyph: o.glyph }"><template v-if="o.glyph">{{ o.glyph }}</template><Icon v-else :name="o.icon" :size="22" /></span>
                <span class="otx"><strong>{{ t(o.label) }}</strong><span v-if="o.desc">{{ t(o.desc) }}</span></span>
                <span class="tick"><Icon name="check" :size="18" /></span>
              </button>
            </div>

            <div v-else-if="s.kind === 'number'" class="numq" data-noswipe>
              <div class="numrow">
                <button type="button" class="step" :aria-label="'−'" @click="bump(s, -1)"><Icon name="minus" :size="24" /></button>
                <label class="numv">
                  <input
                    class="numin num" :inputmode="s.step < 1 ? 'decimal' : 'numeric'" :value="fmtNumVal(s)" :aria-label="t(s.q)"
                    @focus="($event.target as HTMLInputElement).select()" @change="typeNum(s, $event)" @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
                  ><small>{{ unitLabel(s.unit) }}</small>
                </label>
                <button type="button" class="step" :aria-label="'+'" @click="bump(s, 1)"><Icon name="plus" :size="24" /></button>
              </div>
              <input
                class="range" type="range" :min="s.min" :max="s.max" :step="s.slider ?? s.step" :value="numVal(s)" :aria-label="t(s.q)"
                @input="setNum(s, $event)"
              >
              <div class="ticks num"><span>{{ s.min }}</span><span>{{ s.max }}</span></div>
            </div>

            <div v-else-if="s.kind === 'chips'" class="chips">
              <button
                v-for="d in 8" :key="d" type="button" class="dchip num" :class="{ sel: a.training_days === d - 1 }"
                :aria-pressed="a.training_days === d - 1" @click="pick('training_days', d - 1)"
              >{{ d - 1 }}</button>
            </div>
          </template>

          <template v-else>
            <span class="qic done"><Icon name="sparkle" :size="28" /></span>
            <h1>{{ t('q_result') }}</h1>
            <template v-if="rec">
              <div class="maint">
                <Icon name="flame" :size="22" />
                <span class="num">{{ t('q_result_maint', { kcal: n(rec.maintenance) }) }}</span>
              </div>
              <p class="hint">{{ t('q_result_sub', { goal: t(`goal_${a.goal_type}` as MsgKey) }) }}</p>
              <div class="macros">
                <div v-for="m in macros" :key="m.k" class="mac" :class="m.k">
                  <span class="mbar" />
                  <span class="ml">{{ m.label }}</span>
                  <span class="mv num">{{ n(m.v) }}<small>{{ m.unit }}</small></span>
                  <span class="mn num" :class="{ diff: m.now != null && Math.abs(m.now - m.v) > m.v * 0.08 }">
                    {{ t('q_result_now', { n: m.now != null ? n(m.now) : '—' }) }}
                  </span>
                </div>
              </div>
              <ul class="notes">
                <li v-if="rec.bmi > 27"><Icon name="info" :size="16" />{{ t('q_result_bmi', { bmi: n(rec.bmi, 1), kg: n(rec.refKg) }) }}</li>
                <li v-if="a.goal_type === 'recomp' && a.experience === 'trained'"><Icon name="info" :size="16" />{{ t('q_result_trained') }}</li>
                <li><Icon name="scale" :size="16" />{{ t('q_result_note') }}</li>
              </ul>
              <div class="acts">
                <button type="button" class="btn btn-primary btn-lg btn-block" :disabled="busy" @click="apply">{{ t('q_apply') }}</button>
                <button type="button" class="btn btn-ghost btn-block" @click="finish">{{ t('q_keep') }}</button>
              </div>
            </template>
            <p v-else class="hint">{{ t('q_result_none') }}</p>
          </template>
        </section>
      </div>
    </div>

    <footer v-if="idx < total" class="qf">
      <button type="button" class="btn btn-ghost" :disabled="idx === 0" @click="go(idx - 1)"><Icon name="left" :size="18" />{{ t('qBack') }}</button>
      <button type="button" class="btn btn-primary" @click="go(idx + 1)">{{ (cur as any).key && (a as any)[(cur as any).key] == null && cur.kind !== 'number' ? t('qSkip') : t('qNext') }}<Icon name="right" :size="18" /></button>
    </footer>
  </div>
</template>

<style scoped>
.quiz { display: grid; gap: var(--s-4); }
.qh { display: flex; align-items: center; gap: var(--s-3); padding-top: var(--s-2); }
.prog { flex: 1; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 4px; }
.prog span { height: 4px; border-radius: 2px; background: var(--track); cursor: pointer; transition: background var(--dur); }
.prog span.on { background: color-mix(in srgb, var(--accent) 45%, var(--surface)); }
.prog span.cur { background: var(--accent); }
.cnt { font-size: var(--fs-xs); color: var(--ink-3); min-width: 3.5em; text-align: right; }

.viewport { overflow: hidden; touch-action: pan-y; margin: 0 calc(-1 * var(--gutter)); }
.track { display: flex; transition: transform var(--dur-sheet) var(--ease-sheet); will-change: transform; }
.track.dragging { transition: none; }
.slide { flex: 0 0 100%; min-width: 0; padding: var(--s-4) var(--gutter) var(--s-2); display: grid; align-content: start; gap: var(--s-3); user-select: none; }
.qic { width: 56px; height: 56px; border-radius: 18px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent-soft-ink); }
.qic.done { background: var(--accent); color: var(--accent-ink); }
.slide h1 { font-size: var(--fs-2xl); font-weight: var(--fw-black); letter-spacing: -0.025em; line-height: var(--lh-tight); }
.hint { font-size: var(--fs-sm); color: var(--ink-2); }

.opts { display: grid; gap: var(--s-2); margin-top: var(--s-2); }
.opts.two { grid-template-columns: 1fr 1fr; }
.opt { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-4); border-radius: var(--r-lg); border: 1.5px solid var(--line-strong); background: var(--surface); color: var(--ink); text-align: left; font: inherit; cursor: pointer; transition: border-color var(--dur-fast), background var(--dur-fast), transform var(--dur-fast); }
.opt:active { transform: scale(.98); }
.opt.sel { border-color: var(--accent); background: var(--accent-soft); }
.oic { flex: none; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: var(--surface-2); color: var(--ink-2); }
.oic.glyph { font-size: 22px; line-height: 1; }
.opts.two .oic { width: 56px; height: 56px; }
.opts.two .oic.glyph { font-size: 30px; }
.opt.sel .oic { background: var(--accent); color: var(--accent-ink); }
.otx { flex: 1; min-width: 0; display: grid; gap: 2px; }
.otx strong { font-weight: var(--fw-bold); }
.otx span { font-size: var(--fs-xs); color: var(--ink-2); }
.tick { flex: none; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; color: transparent; border: 1.5px solid var(--line-strong); }
.opt.sel .tick { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.opts.two .opt { flex-direction: column; text-align: center; padding: var(--s-5) var(--s-3); }
.opts.two .tick { display: none; }

.numq { display: grid; gap: var(--s-3); margin-top: var(--s-4); }
.numrow { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); }
.step { width: 56px; height: 56px; border-radius: 50%; border: 1.5px solid var(--line-strong); background: var(--surface); color: var(--ink); display: grid; place-items: center; cursor: pointer; }
.step:active { background: var(--surface-2); }
.numv { display: flex; align-items: baseline; justify-content: center; min-width: 0; flex: 1; }
.numin { width: 4.2ch; min-width: 0; border: 0; border-bottom: 1.5px dashed var(--line-strong); background: none; padding: 0; text-align: center; color: var(--ink); font: inherit; font-size: var(--fs-hero); font-weight: var(--fw-light); letter-spacing: -0.04em; }
.numin:focus { outline: none; border-bottom-color: var(--accent); }
.numv small { font-size: var(--fs-lg); color: var(--ink-3); margin-left: 4px; letter-spacing: 0; }
.range { width: 100%; height: 44px; margin: 0; background: transparent; -webkit-appearance: none; appearance: none; touch-action: none; cursor: pointer; }
.range::-webkit-slider-runnable-track { height: 6px; border-radius: 3px; background: var(--track); }
.range::-moz-range-track { height: 6px; border-radius: 3px; background: var(--track); }
.range::-webkit-slider-thumb { -webkit-appearance: none; width: 30px; height: 30px; margin-top: -12px; border-radius: 50%; background: var(--accent); border: 4px solid var(--surface); box-shadow: 0 0 0 1px var(--line-strong); }
.range::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background: var(--accent); border: 4px solid var(--surface); box-shadow: 0 0 0 1px var(--line-strong); }
.ticks { display: flex; justify-content: space-between; font-size: var(--fs-2xs); color: var(--ink-3); }

.chips { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--s-3); margin-top: var(--s-4); }
.dchip { aspect-ratio: 1; border-radius: 50%; border: 1.5px solid var(--line-strong); background: var(--surface); font: inherit; font-size: var(--fs-xl); color: var(--ink); cursor: pointer; transition: all var(--dur-fast); }
.dchip.sel { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }

.maint { display: flex; align-items: center; gap: var(--s-2); color: var(--over); font-size: var(--fs-lg); font-weight: var(--fw-medium); }
.maint .num { color: var(--ink); }
.macros { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-2); }
.mac { position: relative; overflow: hidden; display: grid; gap: 2px; padding: var(--s-3) var(--s-4) var(--s-3); border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--line); --c: var(--accent); }
.mac.p { --c: var(--protein); } .mac.f { --c: var(--fat); } .mac.c { --c: var(--carbs); }
.mbar { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--c); }
.ml { font-size: var(--fs-xs); color: var(--ink-2); }
.mv { font-size: var(--fs-xl); font-weight: var(--fw-regular); letter-spacing: -0.02em; }
.mv small { font-size: var(--fs-sm); color: var(--ink-3); margin-left: 2px; }
.mn { font-size: var(--fs-2xs); color: var(--ink-3); }
.mn.diff { color: var(--c); font-weight: var(--fw-medium); }
.notes { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-2); }
.notes li { display: flex; gap: var(--s-2); font-size: var(--fs-xs); color: var(--ink-2); line-height: 1.45; }
.notes li :deep(svg) { flex: none; margin-top: 1px; color: var(--ink-3); }
.acts { display: grid; gap: var(--s-2); margin-top: var(--s-2); }

.qf { display: flex; justify-content: space-between; gap: var(--s-3); }
.qf .btn { display: inline-flex; align-items: center; gap: 4px; min-width: 120px; justify-content: center; }
</style>
