/**
 * Hair care tracker (tab «Волосы»): routines with a weekly frequency, one check per routine per day.
 * Pure helpers shared by the server, the MCP tools and the page. No DB, no Nuxt auto-imports.
 *
 * Who sees it: only HAIR_USERS for now (Vasyl, 2026-11-21: "только для Нади пока что").
 * The server checks this on every /api/hair call and when building MCP tools; the tab bar only hides the tab.
 */
export const HAIR_USERS: readonly string[] = ['nadia']
export const hasHair = (uid: string | null | undefined) => !!uid && HAIR_USERS.includes(uid)

export interface HairRoutineLike {
  id: string
  name: string
  per_week: number // 1..7, 7 = daily
  created_on: string // local date the routine was added (plan starts counting from it)
}
export interface HairLogLike { routine_id: string, date: string }

const DAY = 86_400_000
const ms = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
export const addDaysIso = (iso: string, k: number) => new Date(ms(iso) + k * DAY).toISOString().slice(0, 10)
export const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY)
/** Monday of the week that holds `iso`. */
export function weekStart(iso: string) {
  const dow = (new Date(ms(iso)).getUTCDay() + 6) % 7 // Mon = 0
  return addDaysIso(iso, -dow)
}

/** Planned checks of a routine over [from, to], counted from the day it was added. Daily = every day. */
export function plannedIn(r: HairRoutineLike, from: string, to: string) {
  const start = r.created_on > from ? r.created_on : from
  if (start > to) return 0
  const days = daysBetween(start, to) + 1
  return r.per_week >= 7 ? days : Math.ceil(days * r.per_week / 7)
}

/** Consecutive days with at least one check. Today without checks yet keeps yesterday's streak alive. */
export function hairStreak(dates: Iterable<string>, today: string) {
  const set = new Set(dates)
  const todayDone = set.has(today)
  let d = todayDone ? today : addDaysIso(today, -1)
  let n = 0
  while (set.has(d)) { n++; d = addDaysIso(d, -1) }
  return { days: n, today_done: todayDone }
}

/** This week (Mon..Sun): per routine done/target, and the overall share (extra checks above target don't count). */
export function weekProgress(routines: HairRoutineLike[], logs: HairLogLike[], today: string) {
  const from = weekStart(today)
  const to = addDaysIso(from, 6)
  const per = routines.map((r) => {
    const done = logs.filter(l => l.routine_id === r.id && l.date >= from && l.date <= to).length
    return { id: r.id, done, target: r.per_week, done_today: logs.some(l => l.routine_id === r.id && l.date === today) }
  })
  const target = per.reduce((a, p) => a + p.target, 0)
  const done = per.reduce((a, p) => a + Math.min(p.done, p.target), 0)
  return { from, to, done, target, pct: target ? Math.round(done / target * 100) : 0, routines: per }
}

/**
 * Report for [from, to]: per routine done vs planned and adherence %, checks per day (for a heat strip),
 * days with any care. Planned counts start on the day a routine was added.
 */
export function hairReport(routines: HairRoutineLike[], logs: HairLogLike[], from: string, to: string) {
  const inRange = logs.filter(l => l.date >= from && l.date <= to)
  const per = routines.map((r) => {
    const mine = inRange.filter(l => l.routine_id === r.id)
    const done = mine.length
    // a check dated before the routine was added (logged afterwards) moves its plan start back
    const first = mine.reduce((m, l) => (l.date < m ? l.date : m), r.created_on)
    const planned = plannedIn({ ...r, created_on: first }, from, to)
    return { id: r.id, name: r.name, per_week: r.per_week, done, planned, pct: planned ? Math.min(100, Math.round(done / planned * 100)) : null }
  })
  const len = daysBetween(from, to) + 1
  const byDay = new Map<string, number>()
  for (const l of inRange) byDay.set(l.date, (byDay.get(l.date) ?? 0) + 1)
  const days = Array.from({ length: len }, (_, i) => { const d = addDaysIso(from, i); return { date: d, checks: byDay.get(d) ?? 0 } })
  const planned = per.reduce((a, p) => a + p.planned, 0)
  const done = per.reduce((a, p) => a + Math.min(p.done, p.planned), 0)
  return {
    from, to, period_days: len,
    care_days: days.filter(d => d.checks > 0).length,
    checks: inRange.length,
    pct: planned ? Math.min(100, Math.round(done / planned * 100)) : null,
    routines: per,
    days,
  }
}
