import { localHour } from './dates'

/**
 * Render free web services sleep after 15 min without inbound traffic, and a cold start takes
 * longer than claude.ai waits, so the connector shows zero tools. The service pings its own public
 * URL during the day (the request goes through Render's proxy, so it counts as inbound traffic).
 * At night it stops and the service sleeps, which keeps the workspace under 750 free hours/month.
 */
export const KEEP_AWAKE_INTERVAL_MS = 10 * 60 * 1000

/** "7-24" → { from: 7, to: 24 } (local hours, `to` exclusive). Invalid or "off" → null. */
export function parseHours(spec: string | undefined): { from: number, to: number } | null {
  const m = /^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*$/.exec(spec ?? '')
  if (!m) return null
  const from = Number(m[1])
  const to = Number(m[2])
  if (from < 0 || to > 24 || from >= to) return null
  return { from, to }
}

export function isAwakeHour(hours: { from: number, to: number }, timeZone: string, now: Date = new Date()): boolean {
  const h = localHour(timeZone, now)
  return h >= hours.from && h < hours.to
}
