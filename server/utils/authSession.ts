import type { H3Event } from 'h3'
import type { User } from '../db/schema'

/**
 * Login sessions: a sealed cookie (nuxt-auth-utils) holding { user: { id }, sv, loggedInAt, seenAt }.
 *
 * - Long-lived: browsers cap a cookie at ~400 days from the last Set-Cookie, so the cookie is re-sent at most
 *   once a day while you use the app; you only log in again after 180 days without opening it.
 *   (runtimeConfig.session.maxAge is 10 years so h3 never expires it on its own; the idle limit below is the real one.)
 * - Revocable: `sv` must match users.session_version. "Log out everywhere" and password resets bump it.
 * - Cookies from before migration 0008 have no `sv`. They stay valid (nobody has to log in again) as long as the
 *   user's session_version is still 1, and get upgraded on the next request.
 */
export const IDLE_LIMIT_MS = 180 * 86_400_000
const REFRESH_MS = 86_400_000

interface SessionData { user?: { id?: unknown }, sv?: number, loggedInAt?: number, seenAt?: number }

/** The logged-in, enabled user of this request, or null. Refreshes/upgrades the cookie when due. */
export async function sessionUser(event: H3Event): Promise<User | null> {
  const s = await getUserSession(event) as SessionData
  const u = await getUser(s.user?.id)
  if (!u) return null
  const legacy = s.sv === undefined
  if (legacy ? u.sessionVersion !== 1 : s.sv !== u.sessionVersion) return null
  const now = Date.now()
  const seen = Number(s.seenAt ?? s.loggedInAt ?? now)
  if (now - seen > IDLE_LIMIT_MS) return null
  if (legacy || now - seen > REFRESH_MS) await setUserSession(event, { sv: u.sessionVersion, seenAt: now })
  return u
}

/** Logs this browser in as `u` (replaces whatever session it had). */
export async function startSession(event: H3Event, u: User) {
  const now = Date.now()
  await replaceUserSession(event, { user: { id: u.id }, sv: u.sessionVersion, loggedInAt: now, seenAt: now })
  await getSettings(u.id) // creates a new user's settings row on first login
}

export const sessionCookieName = () => String((useRuntimeConfig().session as { name?: string } | undefined)?.name || 'nuxt-auth-session')
