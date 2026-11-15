/**
 * Advice from the diary: deterministic rules over the last days of entries, no LLM.
 *
 * Pure (no DB): server/utils/insightsData.ts feeds it entries. Returns codes + numbers; the UI turns
 * them into text (ins_<id>_t / ins_<id>_b in app/utils/i18n.ts), so every rule works in ru/uk/en.
 *
 * The goal type only changes thresholds (GOAL_PROFILES). Recomp is the default: protein high,
 * calories at maintenance to a slight deficit. The diary can't see training, sleep or body weight,
 * so the advice never claims the goal is being reached; it checks the food side only.
 */

export type GoalType = 'recomp' | 'cut' | 'bulk'
export const GOAL_TYPES: GoalType[] = ['recomp', 'cut', 'bulk']
export type InsightMeal = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface InsightEntry {
  date: string
  meal: InsightMeal
  name: string
  /** product id, or null for free-text items */
  key: string | null
  grams: number
  per100: { kcal: number, p: number, f: number, c: number }
  kcal: number
  p: number
  f: number
  c: number
  source: string
  /** local hour it was logged, only when logged on the same local day as eaten (else null) */
  hour: number | null
}

export interface InsightInput {
  /** today, local; today itself is never analysed (still open) */
  today: string
  goal: { kcal: number, p: number | null, f: number | null, c: number | null }
  goalType?: GoalType
  weightKg?: number | null
  /** entries of the last HISTORY_DAYS days before today */
  entries: InsightEntry[]
  streakDays?: number
}

export type InsightLevel = 'warn' | 'tip' | 'good' | 'info'
export interface InsightFood { name: string, grams: number, kcal: number, p: number, f: number }
export interface Insight {
  id: string
  level: InsightLevel
  params: Record<string, string | number>
  foods?: InsightFood[]
}

interface GoalProfile {
  /** average kcal of complete days, as a share of the kcal goal */
  kcalLo: number
  kcalHi: number
  /** protein g per kg body weight */
  pPerKg: [number, number]
}

export const GOAL_PROFILES: Record<GoalType, GoalProfile> = {
  // maintenance to ~15% under: below that, muscle gain stalls; above, the "lose fat" half stops
  recomp: { kcalLo: 0.85, kcalHi: 1.05, pPerKg: [1.6, 2.2] },
  cut: { kcalLo: 0.8, kcalHi: 1.03, pPerKg: [1.8, 2.4] },
  bulk: { kcalLo: 0.97, kcalHi: 1.12, pPerKg: [1.6, 2.0] },
}

/** Days analysed (ending yesterday) and days searched for his own protein foods. */
export const WINDOW_DAYS = 14
export const HISTORY_DAYS = 60
/** A day under this share of the kcal goal is treated as not fully logged. */
export const PARTIAL_DAY = 0.4

const LEVEL_ORDER: Record<InsightLevel, number> = { warn: 0, tip: 1, good: 2, info: 3 }

const r0 = (n: number) => Math.round(n)
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const avg = (xs: number[]) => xs.length ? sum(xs) / xs.length : 0
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length ? (s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2) : 0
}
const addDays = (d: string, k: number) => new Date(Date.parse(`${d}T12:00:00Z`) + k * 86400_000).toISOString().slice(0, 10)
const weekday = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay()
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim()

// Vegetables and fruit by name (ru, uk, pl, en). Approximate: the diary has no fibre data.
const VEG = /овощ|овоч|огур|огір|помид|поміод|помідор|томат|салат|капуст|морков|морква|брокк|броко|перец|перець|паприк|кабач|цукин|шпинат|свекл|свёкл|буряк|тыкв|гарбуз|баклаж|редис|сельдер|селер|спарж|горош|фасол|квасол|зелень|лук|цибул|чеснок|часник|гриб|ябл|яблу|груш|банан|апельс|мандар|грейпф|ягод|ягід|клубн|полуниц|черник|чорниц|малин|смородин|вишн|черешн|виноград|киви|ківі|ананас|манго|персик|абрик|слив(?!оч|к)|арбуз|кавун|дын|гранат|авокад|ogór|pomid|sałat|kapust|marchew|brokuł|papryk|cukini|szpinak|burak|dyni|bakłaż|rzodkiew|seler|szparag|groszek|fasol|cebul|czosn|pieczark|grzyb|jabł|grusz|banan|pomarań|mandaryn|truskaw|borów|malin|porzecz|wiśni|czereśn|winogr|śliw|brzoskw|morel|arbuz|cucumber|tomato|salad|lettuce|cabbage|carrot|broccoli|pepper|zucchini|spinach|beet|pumpkin|eggplant|radish|celery|asparagus|peas|beans|onion|garlic|mushroom|apple|pear|banana|orange|tangerine|berr|grape|kiwi|pineapple|mango|peach|apricot|plum|melon|pomegranate|avocado|vegetable|fruit/
// ...but not when the name says it's juice, jam, cake, chips or a sweet flavour
const NOT_VEG = /сок|слойк|штрудел|strudel|шарлот|эклер|нектар|джем|варень|повидл|торт|пирог|пирож|ciast|tort|szarlot|чипс|chips|crisps|juice|sok |soku|nektar|dżem|konfitur|jam\b|cake|pie\b|jogurt|йогурт|скир|skyr|serek|сырок|сирок|морожен|lody|ice cream|кетчуп|ketchup|baton|батон/

export function isVegOrFruit(name: string) {
  const s = norm(name)
  // keep Cyrillic "й/ё" intact for the regexes: norm() strips the breve/diaeresis, so also test the raw lower-case name
  const raw = name.toLowerCase()
  return (VEG.test(s) || VEG.test(raw)) && !(NOT_VEG.test(s) || NOT_VEG.test(raw))
}

/** Energy-dense and almost no protein: sweets, pastries, chips, sweet spreads. Pure fats (oil, butter) are left out. */
export function isLowProteinDense(per100: { kcal: number, p: number, f: number }) {
  return per100.kcal >= 250 && per100.p * 4 / per100.kcal < 0.12 && per100.f < 75
}

/** A food worth suggesting for protein: at least 40% of its energy from protein, not fatty. */
export function isLeanProtein(per100: { kcal: number, p: number, f: number }) {
  return per100.p >= 8 && per100.kcal > 0 && per100.p * 4 / per100.kcal >= 0.4 && per100.f <= 12
}

interface DayStat { date: string, kcal: number, p: number, f: number, c: number, mealsP: Record<string, number> }

export function buildInsights(input: InsightInput) {
  const goalType = input.goalType ?? 'recomp'
  const prof = GOAL_PROFILES[goalType]
  const { goal, today } = input
  const to = addDays(today, -1)
  const from = addDays(today, -WINDOW_DAYS)
  const win = input.entries.filter(e => e.date >= from && e.date <= to)

  // per-day totals
  const byDay = new Map<string, DayStat>()
  for (const e of win) {
    const d = byDay.get(e.date) ?? { date: e.date, kcal: 0, p: 0, f: 0, c: 0, mealsP: {} }
    d.kcal += e.kcal; d.p += e.p; d.f += e.f; d.c += e.c
    d.mealsP[e.meal] = (d.mealsP[e.meal] ?? 0) + e.p
    byDay.set(e.date, d)
  }
  const logged = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date))
  const complete = logged.filter(d => d.kcal >= goal.kcal * PARTIAL_DAY)
  const completeDates = new Set(complete.map(d => d.date))
  const cEntries = win.filter(e => completeDates.has(e.date))
  const partial = logged.length - complete.length
  // days before the very first entry don't count as missed (he just started)
  const first = input.entries.reduce((m, e) => e.date < m ? e.date : m, to)
  const start = first > from ? first : from
  const span = Math.max(0, Math.round((Date.parse(to) - Date.parse(start)) / 86400_000) + 1)
  const missed = Math.max(0, span - logged.length)

  const pTarget = goal.p ?? (input.weightKg ? r0(input.weightKg * (prof.pPerKg[0] + prof.pPerKg[1]) / 2) : null)
  const avgKcal = avg(complete.map(d => d.kcal))
  const avgP = avg(complete.map(d => d.p))
  const avgF = avg(complete.map(d => d.f))
  const hitDays = pTarget == null ? 0 : complete.filter(d => d.p >= pTarget * 0.9).length
  const kcalOkDays = complete.filter(d => d.kcal >= goal.kcal * 0.9 && d.kcal <= goal.kcal * 1.1).length

  const stats = {
    from, to,
    window_days: WINDOW_DAYS,
    logged_days: logged.length,
    complete_days: complete.length,
    partial_days: partial,
    avg_kcal: complete.length ? r0(avgKcal) : null,
    avg_p: complete.length ? r0(avgP) : null,
    avg_f: complete.length ? r0(avgF) : null,
    avg_c: complete.length ? r0(avg(complete.map(d => d.c))) : null,
    p_target: pTarget,
    p_hit_days: hitDays,
    kcal_ok_days: kcalOkDays,
  }

  const out: Insight[] = []
  const push = (id: string, level: InsightLevel, params: Insight['params'] = {}, foods?: InsightFood[]) =>
    out.push(foods?.length ? { id, level, params, foods } : { id, level, params })

  // honest caveats always come last (info), see the end
  if (complete.length < 3) {
    push('noData', 'info', { days: complete.length, need: 3 })
    return finish(goalType, stats, out, input)
  }
  if (complete.length < 7) push('fewDays', 'info', { days: complete.length })

  // ---------- protein ----------
  const proteinFoods = leanProteinFoods(input.entries)
  if (pTarget == null) {
    push('proteinNoGoal', 'tip', { lo: prof.pPerKg[0], hi: prof.pPerKg[1], at80lo: r0(80 * prof.pPerKg[0]), at80hi: r0(80 * prof.pPerKg[1]), avg: r0(avgP) })
  }
  else if (avgP < pTarget * 0.9) {
    push('proteinLow', 'warn', { avg: r0(avgP), target: pTarget, gap: r0(pTarget - avgP), hit: hitDays, days: complete.length }, proteinFoods)
  }
  else {
    push('proteinOk', 'good', { avg: r0(avgP), target: pTarget, hit: hitDays, days: complete.length })
  }

  // trend: last 7 days vs the 7 before (complete days only, ≥3 in each half)
  const mid = addDays(today, -7)
  const recent = complete.filter(d => d.date >= mid)
  const before = complete.filter(d => d.date < mid)
  if (recent.length >= 3 && before.length >= 3) {
    const pr = avg(recent.map(d => d.p))
    const pb = avg(before.map(d => d.p))
    if (pb - pr >= 15 && pr < pb * 0.85) push('proteinDrop', 'warn', { now: r0(pr), before: r0(pb) }, pTarget == null || avgP >= pTarget * 0.9 ? proteinFoods : undefined)
    const kr = avg(recent.map(d => d.kcal))
    const kb = avg(before.map(d => d.kcal))
    if (Math.abs(kr - kb) >= 300) push(kr > kb ? 'kcalUpTrend' : 'kcalDownTrend', 'tip', { now: r0(kr), before: r0(kb) })
  }

  // protein spread over meals: ~25 g+ per meal, 3–4 times a day, works better for muscle than one big dose
  const bigMeals = avg(complete.map(d => Object.values(d.mealsP).filter(p => p >= 25).length))
  if (bigMeals < 2.5) {
    const mealAvg = (['breakfast', 'lunch', 'dinner', 'snack'] as InsightMeal[])
      .map(m => ({ m, days: complete.filter(d => d.mealsP[m] != null).length, p: avg(complete.filter(d => d.mealsP[m] != null).map(d => d.mealsP[m]!)) }))
      .filter(x => x.days >= complete.length / 2)
      .sort((a, b) => a.p - b.p)
    const weak = mealAvg[0]
    if (weak && weak.p < 25) push('proteinSpread', 'tip', { meals: Math.round(bigMeals * 10) / 10, meal: weak.m, p: r0(weak.p) })
  }

  // ---------- calories ----------
  const lo = goal.kcal * prof.kcalLo
  const hi = goal.kcal * prof.kcalHi
  if (avgKcal > hi) push('kcalOver', 'warn', { avg: r0(avgKcal), goal: goal.kcal, diff: r0(avgKcal - goal.kcal) })
  else if (avgKcal < lo) push('kcalUnder', 'warn', { avg: r0(avgKcal), goal: goal.kcal, diff: r0(goal.kcal - avgKcal) })
  else push('kcalOk', 'good', { avg: r0(avgKcal), goal: goal.kcal })

  // consistency: days within ±10% of the goal
  if (complete.length >= 5 && kcalOkDays / complete.length < 0.5) {
    const sd = Math.sqrt(avg(complete.map(d => (d.kcal - avgKcal) ** 2)))
    push('kcalSwing', 'tip', { ok: kcalOkDays, days: complete.length, sd: r0(sd) })
  }

  // weekend (Sat, Sun) vs weekdays
  const we = complete.filter(d => [0, 6].includes(weekday(d.date)))
  const wd = complete.filter(d => ![0, 6].includes(weekday(d.date)))
  if (we.length >= 2 && wd.length >= 3) {
    const diff = avg(we.map(d => d.kcal)) - avg(wd.map(d => d.kcal))
    if (diff >= 300) push('weekend', 'tip', { diff: r0(diff), weekend: r0(avg(we.map(d => d.kcal))), weekday: r0(avg(wd.map(d => d.kcal))) })
  }

  // ---------- fat ----------
  if (goal.f != null && avgF > goal.f * 1.1) {
    push('fatOver', 'warn', { avg: r0(avgF), goal: goal.f }, topBy(cEntries, 'f', complete.length, 3))
  }

  // ---------- what to cut: energy-dense, low-protein foods ----------
  const totalKcal = sum(cEntries.map(e => e.kcal))
  const dense = cEntries.filter(e => isLowProteinDense(e.per100))
  const denseKcal = sum(dense.map(e => e.kcal))
  if (totalKcal > 0 && denseKcal / totalKcal >= 0.15) {
    push('treats', 'tip', { share: r0(denseKcal / totalKcal * 100), perDay: r0(denseKcal / complete.length) }, topBy(dense, 'kcal', complete.length, 3))
  }

  // ---------- what to add: vegetables / fruit (fibre, micronutrients, fullness on a deficit) ----------
  const vegG = sum(cEntries.filter(e => isVegOrFruit(e.name)).map(e => e.grams)) / complete.length
  const vegDays = new Set(cEntries.filter(e => isVegOrFruit(e.name)).map(e => e.date)).size
  if (vegG < 300) push('veg', 'tip', { grams: r0(vegG), days: vegDays, total: complete.length })
  else if (vegG >= 400) push('vegOk', 'good', { grams: r0(vegG) })

  // ---------- late eating (by log time; only entries logged the same day) ----------
  const timed = cEntries.filter(e => e.hour != null)
  const timedDays = new Set(timed.map(e => e.date)).size
  const timedKcal = sum(timed.map(e => e.kcal))
  if (timedDays >= 5 && timedKcal > 0) {
    const late = sum(timed.filter(e => e.hour! >= 21).map(e => e.kcal)) / timedKcal
    if (late >= 0.25) push('late', 'tip', { share: r0(late * 100) })
  }

  // ---------- data quality ----------
  const estKcal = sum(cEntries.filter(e => e.source === 'estimate').map(e => e.kcal))
  if (totalKcal > 0 && estKcal / totalKcal >= 0.3) push('estimates', 'tip', { share: r0(estKcal / totalKcal * 100) })
  if (missed + partial >= 3) push('gaps', 'tip', { missed, partial, days: span })
  if ((input.streakDays ?? 0) >= 7) push('streak', 'good', { days: input.streakDays! })

  return finish(goalType, stats, out, input)
}

function finish(goalType: GoalType, stats: Record<string, unknown>, out: Insight[], input: InsightInput) {
  // what the diary can't see: training, weight trend. Always shown, last.
  const prof = GOAL_PROFILES[goalType]
  out.push({ id: `basics_${goalType}`, level: 'info', params: { lo: prof.pPerKg[0], hi: prof.pPerKg[1] } })
  if (!input.weightKg) out.push({ id: 'noWeight', level: 'info', params: {} })
  out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
  return { goal_type: goalType, stats, insights: out }
}

/** Foods contributing most of a nutrient over the window, as a per-day average. */
function topBy(entries: InsightEntry[], k: 'kcal' | 'f', days: number, n: number): InsightFood[] {
  const g = new Map<string, { name: string, grams: number, kcal: number, p: number, f: number }>()
  for (const e of entries) {
    const key = e.key ?? `n:${norm(e.name)}`
    const x = g.get(key) ?? { name: e.name, grams: 0, kcal: 0, p: 0, f: 0 }
    x.grams += e.grams; x.kcal += e.kcal; x.p += e.p; x.f += e.f
    g.set(key, x)
  }
  return [...g.values()].sort((a, b) => b[k] - a[k]).slice(0, n)
    .map(x => ({ name: x.name, grams: r0(x.grams / days), kcal: r0(x.kcal / days), p: r0(x.p / days), f: r0(x.f / days) }))
}

/** His own lean protein foods, most often eaten first, with his usual portion. */
export function leanProteinFoods(entries: InsightEntry[], n = 3): InsightFood[] {
  const g = new Map<string, InsightEntry[]>()
  for (const e of entries) {
    if (!isLeanProtein(e.per100)) continue
    const key = e.key ?? `n:${norm(e.name)}`
    g.set(key, [...(g.get(key) ?? []), e])
  }
  return [...g.values()]
    .map((list) => {
      const last = list[list.length - 1]!
      const grams = r0(median(list.map(e => e.grams)))
      return { times: list.length, density: last.per100.p / last.per100.kcal, food: { name: last.name, grams, kcal: r0(last.per100.kcal * grams / 100), p: r0(last.per100.p * grams / 100), f: r0(last.per100.f * grams / 100) } }
    })
    .filter(x => x.food.p >= 10)
    .sort((a, b) => b.times - a.times || b.density - a.density)
    .slice(0, n)
    .map(x => x.food)
}
