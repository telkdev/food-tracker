/** Waking hours for the self-ping, in Europe/Warsaw local time (DST handled by Intl). */
export const KEEP_AWAKE_TZ = 'Europe/Warsaw'
export const KEEP_AWAKE_FROM = 8 * 60 + 30 // 08:30
export const KEEP_AWAKE_UNTIL = 22 * 60 // 22:00, last ping before this; the instance sleeps ~15 min later

export function localMinutes(timeZone: string, now: Date = new Date()): number {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(now).split(':').map(Number)
  return h! * 60 + m!
}

export function inKeepAwakeWindow(now: Date = new Date()): boolean {
  const t = localMinutes(KEEP_AWAKE_TZ, now)
  return t >= KEEP_AWAKE_FROM && t < KEEP_AWAKE_UNTIL
}
