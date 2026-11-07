/**
 * Day streak: consecutive local calendar days (settings.timezone) with at least one diary entry.
 *
 * Rules:
 * - A day counts as soon as it has any entry, whatever its size. Backfilling a past day (logging last
 *   night's dinner the next morning with that date) counts for that day too: the diary date is what matters.
 * - Today not logged yet does not break the streak: until local midnight it shows the run that ended
 *   yesterday, with today_logged = false.
 * - A streak carried over from another app (settings.streakCarryDays, ending on streakCarryUntil) counts as
 *   if those days were logged here. It only continues if the next day (carry_until + 1) is logged here, and so on.
 *   Carried days are not diary entries: totals, averages and the week view never see them.
 */

const DAY = 86400_000
const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
export const addIsoDays = (iso: string, k: number) => new Date(toMs(iso) + k * DAY).toISOString().slice(0, 10)

/** 10, 20, 30, 50, 100, 150 … 300, 365, then every 100 (400, 500 …). */
export function isMilestone(n: number): boolean {
  if (n <= 0) return false
  if ([10, 20, 30, 50, 365].includes(n)) return true
  if (n >= 100 && n <= 300) return n % 50 === 0
  return n >= 400 && n % 100 === 0
}

export function nextMilestone(n: number): number {
  let m = n + 1
  while (!isMilestone(m)) m++
  return m
}

export interface StreakCarry { days: number, until: string | null }
export interface Streak {
  days: number
  today_logged: boolean
  /** first day of the current run (may be a carried day); null when days = 0 */
  since: string | null
  /** how many of `days` come from the carried-over streak */
  carried: number
  /** true when today is logged and `days` is a milestone (10, 20, 30, 50, 100 …) */
  milestone: boolean
  next_milestone: number
}

/**
 * @param logged local dates (YYYY-MM-DD) that have at least one entry, any order; future dates are ignored
 * @param today  today's local date in the user's timezone
 */
export function computeStreak(logged: Iterable<string>, today: string, carry: StreakCarry = { days: 0, until: null }): Streak {
  const set = new Set(logged)
  const carryFrom = carry.until && carry.days > 0 ? addIsoDays(carry.until, -(carry.days - 1)) : null
  const isCarried = (d: string) => !!carryFrom && d >= carryFrom && d <= carry.until!
  const on = (d: string) => set.has(d) || isCarried(d)

  const todayLogged = on(today)
  let d = todayLogged ? today : addIsoDays(today, -1)
  let days = 0
  let carried = 0
  let since: string | null = null
  while (on(d)) {
    days++
    if (!set.has(d)) carried++
    since = d
    d = addIsoDays(d, -1)
  }
  return {
    days,
    today_logged: set.has(today),
    since,
    carried,
    milestone: set.has(today) && isMilestone(days),
    next_milestone: nextMilestone(days),
  }
}
