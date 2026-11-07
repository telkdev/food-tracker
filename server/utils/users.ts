import { createHash, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

/**
 * Users come from env, no sign-up:
 * - NUXT_APP_PASSWORD → user "owner" (Vasyl; all data from before multi-user belongs to it)
 * - NUXT_USERS = "anna:long-password-1,petr:long-password-2" → more users, each with a private diary
 * Login is password-only: the password tells us who you are, so passwords must be unique and 12+ chars.
 * Values are read raw from process.env (runtimeConfig runs them through destr()). Render turns "$$" into "$",
 * so don't use "$"; ":" and "," are separators.
 */
export interface AppUser { id: string, password: string }

// Normalise so a trailing space/newline pasted into Render, or different Unicode forms of Cyrillic
// letters (phone vs desktop keyboard), don't make the right password fail.
const norm = (s: string) => s.normalize('NFC').trim()
const digest = (s: string) => createHash('sha256').update(norm(s)).digest()

let warned = false
export function configuredUsers(): AppUser[] {
  const out: AppUser[] = []
  const problems: string[] = []
  const owner = norm(String(process.env.NUXT_APP_PASSWORD ?? ''))
  if (owner) out.push({ id: 'owner', password: owner })
  const parts = String(process.env.NUXT_USERS ?? '').split(',').map(norm).filter(Boolean)
  for (const [n, part] of parts.entries()) {
    const i = part.indexOf(':')
    const id = norm(part.slice(0, i)).toLowerCase()
    const password = norm(part.slice(i + 1))
    if (i < 1 || !/^[a-z0-9_]{1,30}$/.test(id)) { problems.push(`NUXT_USERS entry #${n + 1} needs name:password with a name of a-z, 0-9, _`); continue }
    if (out.some(u => u.id === id)) { problems.push(`duplicate user ${id}`); continue }
    out.push({ id, password })
  }
  // a short or shared password would let one user log in as another: refuse those users entirely
  const ok = out.filter((u) => {
    if (u.password.length < 12) { problems.push(`password of ${u.id} is shorter than 12 chars`); return false }
    if (out.some(o => o !== u && o.password === u.password)) { problems.push(`${u.id} shares a password with another user`); return false }
    return true
  })
  if (problems.length && !warned) { warned = true; console.error('[users] ignored:', problems.join('; ')) }
  return ok
}

export function isKnownUser(id: unknown): id is string {
  return typeof id === 'string' && configuredUsers().some(u => u.id === id)
}

/** The user whose password this is, or null. Compares against every user so timing doesn't reveal which matched. */
export function userByPassword(password: string): string | null {
  const d = digest(password)
  let found: string | null = null
  for (const u of configuredUsers()) if (timingSafeEqual(d, digest(u.password))) found = u.id
  return found
}

/** User of an /api request; set by server/middleware/auth.ts after checking the session. */
export function uidOf(event: H3Event): string {
  const uid = event.context.uid
  if (!uid) throw createError({ statusCode: 401, statusMessage: 'Not logged in' })
  return uid
}

declare module 'h3' {
  interface H3EventContext { uid?: string }
}
