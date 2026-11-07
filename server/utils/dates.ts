/**
 * Diary dates are local calendar dates (YYYY-MM-DD) in the user's timezone.
 * Never derive them from new Date().toISOString(): that's UTC and breaks between 00:00 and 01:00/02:00 in Warsaw.
 */
export function localDate(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function localHour(timeZone: string, now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(now))
}

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack'

/** Fallback only: callers (UI, Claude) should pass the meal explicitly when known. */
export function mealFromTime(timeZone: string, now: Date = new Date()): Meal {
  const h = localHour(timeZone, now)
  if (h >= 5 && h < 11) return 'breakfast'
  if (h >= 11 && h < 16) return 'lunch'
  if (h >= 16 && h < 22) return 'dinner'
  return 'snack'
}

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}
