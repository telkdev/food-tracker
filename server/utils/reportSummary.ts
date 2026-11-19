/**
 * Period report for a coach: pure aggregation (no DB), fed by server/utils/report.ts.
 * Used by the PDF (server/utils/reportPdf.ts), GET /api/report and the MCP tool get_report.
 *
 * Rules (same spirit as the Tips engine):
 * - a day with entries but < 40 % of the kcal goal is "partial" (forgot to log, sick day):
 *   it is listed, but left out of averages and adherence so it doesn't fake a deficit;
 * - fiber / sugar / salt unknown for a food are estimated by food type (report.ts → entryExtras); coverage
 *   is the share of kcal with real values, shown next to them;
 * - goals are the ones in force today: the diary keeps no goal history.
 */

import { weightTrend } from '../../shared/targets'

export type ReportMeal = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export const REPORT_MEALS: ReportMeal[] = ['breakfast', 'lunch', 'dinner', 'snack']
export const PARTIAL_SHARE = 0.4
/** kcal within ±10 % of the goal counts as "on target" */
export const KCAL_TOLERANCE = 0.1
/** protein at ≥ 90 % of the goal counts as hit */
export const PROTEIN_HIT = 0.9

export interface ReportEntry {
  date: string
  meal: ReportMeal
  name: string
  key: string | null
  grams: number
  kcal: number
  p: number
  f: number
  c: number
  fiber: number | null
  sugar: number | null
  salt: number | null
  /** which of fiber / sugar / salt are estimated by food type rather than real values */
  est?: ('fiber' | 'sugar' | 'salt')[]
  source: string
}

export interface ReportInput {
  from: string
  to: string
  today: string
  goal: { kcal: number, p: number | null, f: number | null, c: number | null }
  /** protein/fat/carbs goals recommended from the profile, used where no manual goal is set */
  suggested?: { p: number, f: number, c: number } | null
  waterGoalMl: number | null
  entries: ReportEntry[]
  water: { date: string, ml: number }[]
  /** weigh-ins from a bit before `from` up to `to`, oldest first */
  weights: { date: string, kg: number }[]
}

const r0 = (n: number) => Math.round(n)
const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0)
const mean = (xs: number[]) => xs.length ? sum(xs, x => x) / xs.length : null
export const addDaysIso = (d: string, k: number) => new Date(Date.parse(`${d}T12:00:00Z`) + k * 86400_000).toISOString().slice(0, 10)

export function daysBetween(from: string, to: string) {
  const out: string[] = []
  for (let d = from; d <= to; d = addDaysIso(d, 1)) out.push(d)
  return out
}

export interface ReportDay {
  date: string
  logged: boolean
  partial: boolean
  entries: number
  kcal: number
  p: number
  f: number
  c: number
  fiber: number | null
  sugar: number | null
  salt: number | null
  water_ml: number
  estimate_kcal: number
  meals: Record<ReportMeal, number>
}

function extra(rows: ReportEntry[], k: 'fiber' | 'sugar' | 'salt') {
  const known = rows.filter(r => r[k] != null)
  return known.length ? sum(known, r => r[k]!) : null
}

function coverage(rows: ReportEntry[], k: 'fiber' | 'sugar' | 'salt') {
  const kcal = sum(rows, r => r.kcal)
  if (!rows.length) return 0
  const real = (r: ReportEntry) => r[k] != null && !r.est?.includes(k)
  if (kcal <= 0) return rows.some(real) ? 1 : 0
  return r2(sum(rows.filter(real), r => r.kcal) / kcal)
}

export function buildReport(input: ReportInput) {
  const to = input.to > input.today ? input.today : input.to
  const dates = input.from <= to ? daysBetween(input.from, to) : []
  const byDate = new Map<string, ReportEntry[]>()
  for (const e of input.entries) {
    if (e.date < input.from || e.date > to) continue
    if (!byDate.has(e.date)) byDate.set(e.date, [])
    byDate.get(e.date)!.push(e)
  }
  const waterBy = new Map<string, number>()
  for (const w of input.water) if (w.date >= input.from && w.date <= to) waterBy.set(w.date, (waterBy.get(w.date) ?? 0) + w.ml)

  const goal = {
    kcal: input.goal.kcal,
    p: input.goal.p ?? input.suggested?.p ?? null,
    f: input.goal.f ?? input.suggested?.f ?? null,
    c: input.goal.c ?? input.suggested?.c ?? null,
    // where a macro goal came from: set by hand, or recommended from the profile
    p_suggested: input.goal.p == null && input.suggested?.p != null,
    water_ml: input.waterGoalMl,
  }

  const days: ReportDay[] = dates.map((date) => {
    const rows = byDate.get(date) ?? []
    const kcal = sum(rows, r => r.kcal)
    return {
      date,
      logged: rows.length > 0,
      partial: rows.length > 0 && kcal < goal.kcal * PARTIAL_SHARE,
      entries: rows.length,
      kcal: r0(kcal), p: r1(sum(rows, r => r.p)), f: r1(sum(rows, r => r.f)), c: r1(sum(rows, r => r.c)),
      fiber: rows.length ? (v => v == null ? null : r1(v))(extra(rows, 'fiber')) : null,
      sugar: rows.length ? (v => v == null ? null : r1(v))(extra(rows, 'sugar')) : null,
      salt: rows.length ? (v => v == null ? null : r2(v))(extra(rows, 'salt')) : null,
      water_ml: waterBy.get(date) ?? 0,
      estimate_kcal: r0(sum(rows.filter(r => r.source === 'estimate'), r => r.kcal)),
      meals: Object.fromEntries(REPORT_MEALS.map(m => [m, r0(sum(rows.filter(r => r.meal === m), r => r.kcal))])) as Record<ReportMeal, number>,
    }
  })

  const full = days.filter(d => d.logged && !d.partial)
  const fullDates = new Set(full.map(d => d.date))
  const fullRows = input.entries.filter(e => fullDates.has(e.date))
  const avgOf = (k: 'kcal' | 'p' | 'f' | 'c') => (v => v == null ? null : (k === 'kcal' ? r0(v) : r1(v)))(mean(full.map(d => d[k])))

  const avg = { kcal: avgOf('kcal'), p: avgOf('p'), f: avgOf('f'), c: avgOf('c') }
  const energy = avg.kcal ? {
    p: r0((avg.p ?? 0) * 4 / ((avg.p ?? 0) * 4 + (avg.f ?? 0) * 9 + (avg.c ?? 0) * 4 || 1) * 100),
    f: r0((avg.f ?? 0) * 9 / ((avg.p ?? 0) * 4 + (avg.f ?? 0) * 9 + (avg.c ?? 0) * 4 || 1) * 100),
    c: r0((avg.c ?? 0) * 4 / ((avg.p ?? 0) * 4 + (avg.f ?? 0) * 9 + (avg.c ?? 0) * 4 || 1) * 100),
  } : null

  const kcalOn = full.filter(d => Math.abs(d.kcal - goal.kcal) <= goal.kcal * KCAL_TOLERANCE).length
  const kcalOver = full.filter(d => d.kcal > goal.kcal * (1 + KCAL_TOLERANCE)).length
  const kcalUnder = full.filter(d => d.kcal < goal.kcal * (1 - KCAL_TOLERANCE)).length
  const proteinHit = goal.p ? full.filter(d => d.p >= goal.p! * PROTEIN_HIT).length : null

  const extrasAvg = (k: 'fiber' | 'sugar' | 'salt') => {
    const vals = full.map(d => d[k]).filter((v): v is number => v != null)
    const m = mean(vals)
    return { g: m == null ? null : (k === 'salt' ? r2(m) : r1(m)), coverage: coverage(fullRows, k) }
  }

  const waterDays = days.filter(d => d.water_ml > 0)
  const waterAvg = mean(waterDays.map(d => d.water_ml))

  const totalKcal = sum(fullRows, r => r.kcal)
  const mealShare = Object.fromEntries(REPORT_MEALS.map(m => [m, totalKcal ? r0(sum(fullRows.filter(r => r.meal === m), r => r.kcal) / totalKcal * 100) : 0])) as Record<ReportMeal, number>

  // top foods over all logged days (partial ones included: the food was eaten)
  const periodRows = [...byDate.values()].flat()
  const groups = new Map<string, { name: string, times: number, grams: number, kcal: number, p: number, dates: Set<string> }>()
  for (const r of periodRows) {
    const k = r.key ?? `n:${r.name.trim().toLowerCase()}`
    const g = groups.get(k) ?? { name: r.name.trim(), times: 0, grams: 0, kcal: 0, p: 0, dates: new Set<string>() }
    g.times++; g.grams += r.grams; g.kcal += r.kcal; g.p += r.p; g.dates.add(r.date)
    groups.set(k, g)
  }
  const allKcal = sum(periodRows, r => r.kcal)
  const allP = sum(periodRows, r => r.p)
  const foodRow = (g: typeof groups extends Map<string, infer V> ? V : never) => ({
    name: g.name, times: g.times, days: g.dates.size, grams: r0(g.grams), kcal: r0(g.kcal), p: r1(g.p),
    kcal_share: allKcal ? r1(g.kcal / allKcal * 100) : 0,
    p_share: allP ? r1(g.p / allP * 100) : 0,
  })
  const foods = [...groups.values()]
  const topKcal = [...foods].sort((a, b) => b.kcal - a.kcal).slice(0, 10).map(foodRow)
  const topProtein = [...foods].filter(g => g.p > 0).sort((a, b) => b.p - a.p).slice(0, 7).map(foodRow)

  // weight: last weigh-in on or before each end of the period (up to 14 days before `from`)
  const ws = input.weights.filter(w => w.date <= to && w.date >= addDaysIso(input.from, -14))
  const startW = [...ws].reverse().find(w => w.date <= input.from) ?? ws.find(w => w.date >= input.from) ?? null
  const endW = ws.at(-1) ?? null
  const inPeriod = ws.filter(w => w.date >= input.from)
  const trend = weightTrend(ws, to, Math.max(7, dates.length + 14))
  const weight = endW ? {
    start: startW, end: endW,
    change: startW && startW.date !== endW.date ? r1(endW.kg - startW.kg) : null,
    per_week: trend?.perWeek ?? null,
    weigh_ins: inPeriod.length,
    points: inPeriod,
  } : null

  const estimateKcal = sum(fullRows.filter(r => r.source === 'estimate'), r => r.kcal)

  return {
    from: input.from,
    to,
    /** the asked end, when it was after today */
    to_asked: input.to,
    period_days: dates.length,
    logged_days: days.filter(d => d.logged).length,
    full_days: full.length,
    partial_days: days.filter(d => d.partial).length,
    goal,
    avg,
    energy_pct: energy,
    adherence: {
      kcal_on_target: kcalOn, kcal_over: kcalOver, kcal_under: kcalUnder,
      protein_hit: proteinHit,
      avg_kcal_vs_goal: avg.kcal != null ? r0(avg.kcal - goal.kcal) : null,
      avg_p_pct: avg.p != null && goal.p ? r0(avg.p / goal.p * 100) : null,
    },
    extras: { fiber: extrasAvg('fiber'), sugar: extrasAvg('sugar'), salt: extrasAvg('salt') },
    water: { avg_ml: waterAvg == null ? null : r0(waterAvg), days: waterDays.length, goal_ml: goal.water_ml, hit_days: goal.water_ml ? waterDays.filter(d => d.water_ml >= goal.water_ml! * 0.9).length : null },
    meal_share: mealShare,
    estimate_pct: totalKcal ? r0(estimateKcal / totalKcal * 100) : 0,
    top_kcal: topKcal,
    top_protein: topProtein,
    weight,
    days,
  }
}

export type Report = ReturnType<typeof buildReport>
