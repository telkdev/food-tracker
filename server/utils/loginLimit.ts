import type { H3Event } from 'h3'

/**
 * Brute-force brake for the password-only login (a password alone picks the user, so a guess that hits
 * any user's password gets in). In memory: fine for one Render instance; a restart resets it.
 * - per IP: 5 wrong passwords per 15 min, then 429 until the window passes
 * - global: 30 wrong passwords per 15 min from all IPs together. X-Forwarded-For can be spoofed, so this cap
 *   is the real guard; the per-IP one just keeps a fat-fingered user from locking everyone else out early
 */
const WINDOW_MS = 15 * 60_000
const PER_IP = 5
const GLOBAL = 30
const fails = new Map<string, number[]>()

const recent = (key: string, now: number) => (fails.get(key) ?? []).filter(t => now - t < WINDOW_MS)

function ipOf(event: H3Event) {
  return getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
}

export function assertLoginAllowed(event: H3Event) {
  const now = Date.now()
  const ip = recent(`ip:${ipOf(event)}`, now)
  const all = recent('all', now)
  if (ip.length >= PER_IP || all.length >= GLOBAL) {
    const oldest = Math.min(...(ip.length >= PER_IP ? ip : all))
    setResponseHeader(event, 'Retry-After', Math.ceil((oldest + WINDOW_MS - now) / 1000))
    throw createError({ statusCode: 429, statusMessage: 'Too many wrong passwords. Try again in 15 minutes.' })
  }
}

export function recordLoginFailure(event: H3Event) {
  const now = Date.now()
  for (const key of [`ip:${ipOf(event)}`, 'all']) fails.set(key, [...recent(key, now), now])
  if (fails.size > 10_000) for (const [k, v] of fails) if (!v.some(t => now - t < WINDOW_MS)) fails.delete(k)
}
