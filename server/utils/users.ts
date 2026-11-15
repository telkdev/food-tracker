import { randomBytes } from 'node:crypto'
import { eq, isNull, and, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { User } from '../db/schema'

/**
 * Users live in the `users` table (migration 0008). users.id is the user_id on every row and never changes;
 * users.login is what you type and can be renamed.
 *
 * Env is import-only now: on the first start after the migration, NUXT_APP_PASSWORD (user "owner") and
 * NUXT_USERS ("nadia:password,dima:password") fill in password hashes that are still empty, and NUXT_USER_NAMES
 * fills empty greeting names. A password set in the app is never overwritten by env, and removing someone from
 * env no longer locks them out: disable them on the Users page instead. Once everyone is imported the three
 * variables can be deleted from Render.
 */
export interface EnvUser { id: string, password: string }

// Normalise so a trailing space/newline pasted into Render, or different Unicode forms of Cyrillic
// letters (phone vs desktop keyboard), don't make the right password fail.
export const normPassword = (s: string) => s.normalize('NFC').trim()
export const LOGIN_RE = /^[a-z0-9_]{1,30}$/
export const MIN_PASSWORD = 8

/** Users from the legacy env variables, with the same rules as before (so nobody gets in who couldn't before). */
export function parseEnvUsers(env: Record<string, string | undefined> = process.env): { users: EnvUser[], problems: string[] } {
  const out: EnvUser[] = []
  const problems: string[] = []
  const owner = normPassword(String(env.NUXT_APP_PASSWORD ?? ''))
  if (owner) out.push({ id: 'owner', password: owner })
  const parts = String(env.NUXT_USERS ?? '').split(',').map(normPassword).filter(Boolean)
  for (const [n, part] of parts.entries()) {
    const i = part.indexOf(':')
    const id = normPassword(part.slice(0, i)).toLowerCase()
    const password = normPassword(part.slice(i + 1))
    if (i < 1 || !LOGIN_RE.test(id)) { problems.push(`NUXT_USERS entry #${n + 1} needs name:password with a name of a-z, 0-9, _`); continue }
    if (out.some(u => u.id === id)) { problems.push(`duplicate user ${id}`); continue }
    out.push({ id, password })
  }
  const users = out.filter((u) => {
    if (u.password.length < 12) { problems.push(`password of ${u.id} is shorter than 12 chars`); return false }
    if (out.some(o => o !== u && o.password === u.password)) { problems.push(`${u.id} shares a password with another user`); return false }
    return true
  })
  return { users, problems }
}

let synced: Promise<void> | undefined
/** One-time (per process) import of env users into the table. Cheap after the first run: only fills NULLs. */
export function syncEnvUsers(): Promise<void> {
  synced ??= (async () => {
    const db = useDb()
    const t = schema.users
    const { users, problems } = parseEnvUsers()
    if (problems.length) console.error('[users] env entries ignored:', problems.join('; '))
    const names = parseUserNames(process.env.NUXT_USER_NAMES)
    for (const u of users) {
      await db.insert(t).values({ id: u.id, login: u.id, isAdmin: u.id === 'owner' }).onConflictDoNothing()
      const [row] = await db.select({ passwordHash: t.passwordHash }).from(t).where(eq(t.id, u.id))
      if (row && !row.passwordHash) {
        await db.update(t).set({ passwordHash: await hashPassword(u.password) }).where(and(eq(t.id, u.id), isNull(t.passwordHash)))
        console.log(`[users] imported password of ${u.id} from env`)
      }
    }
    for (const [id, name] of Object.entries(names)) {
      await db.update(t).set({ name }).where(and(eq(t.id, id), isNull(t.name)))
    }
    invalidateUsers()
  })().catch((e) => { synced = undefined; throw e })
  return synced
}

// Small in-memory cache: every /api request checks its user, and there are a handful of users.
const TTL_MS = 30_000
let cache: { at: number, byId: Map<string, User> } | undefined
export function invalidateUsers() { cache = undefined }

export async function allUsers(): Promise<Map<string, User>> {
  await syncEnvUsers()
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const rows = await useDb().select().from(schema.users)
    cache = { at: Date.now(), byId: new Map(rows.map(r => [r.id, r])) }
  }
  return cache.byId
}

/** An enabled user, or null. */
export async function getUser(id: unknown): Promise<User | null> {
  if (typeof id !== 'string') return null
  const u = (await allUsers()).get(id)
  return u && !u.disabledAt ? u : null
}

export async function isKnownUser(id: unknown): Promise<boolean> {
  return !!(await getUser(id))
}

// a real hash to compare against when the login doesn't exist, so timing doesn't tell which logins exist
let dummyHash: Promise<string> | undefined
/** The user whose login and password these are, or null. */
export async function checkPassword(login: string, password: string): Promise<User | null> {
  const l = login.trim().toLowerCase()
  const u = [...(await allUsers()).values()].find(x => x.login === l && !x.disabledAt)
  if (!u?.passwordHash) {
    dummyHash ??= hashPassword(randomBytes(16).toString('hex'))
    await verifyPassword(await dummyHash, normPassword(password))
    return null
  }
  return (await verifyPassword(u.passwordHash, normPassword(password))) ? u : null
}

export async function setPassword(id: string, password: string, opts: { logoutOthers?: boolean } = {}) {
  const t = schema.users
  await useDb().update(t).set({
    passwordHash: await hashPassword(normPassword(password)),
    inviteHash: null,
    inviteExpiresAt: null,
    ...(opts.logoutOthers ? { sessionVersion: sql`${t.sessionVersion} + 1` } : {}),
  }).where(eq(t.id, id))
  invalidateUsers()
}

export async function bumpSessionVersion(id: string) {
  const t = schema.users
  await useDb().update(t).set({ sessionVersion: sql`${t.sessionVersion} + 1` }).where(eq(t.id, id))
  invalidateUsers()
}

/** Greeting name: the name set in the app, else NUXT_USER_NAMES / defaults (see userNames.ts). */
export async function userDisplayName(uid: string): Promise<string | null> {
  const u = (await allUsers()).get(uid)
  return u?.name || displayName(uid)
}

/** User of an /api request; set by server/middleware/auth.ts after checking the session. */
export function uidOf(event: H3Event): string {
  const uid = event.context.uid
  if (!uid) throw createError({ statusCode: 401, statusMessage: 'Not logged in' })
  return uid
}

export async function requireAdmin(event: H3Event): Promise<User> {
  const u = await getUser(uidOf(event))
  if (!u?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Only the admin can do this' })
  return u
}

declare module 'h3' {
  interface H3EventContext { uid?: string }
}

// ---------- one-time links to set a password (new user, or a reset by the admin) ----------
const INVITE_TTL_MS = 7 * 86_400_000

/** New link for `id`; replaces any older link. The current password keeps working until the link is used. */
export async function createInvite(event: H3Event, id: string): Promise<{ url: string, expiresAt: Date }> {
  const token = randomBytes(24).toString('base64url')
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
  await useDb().update(schema.users).set({ inviteHash: sha256(token), inviteExpiresAt: expiresAt }).where(eq(schema.users.id, id))
  invalidateUsers()
  return { url: `${baseUrl(event)}/invite?token=${token}`, expiresAt }
}

export async function userByInvite(token: unknown): Promise<User | null> {
  if (typeof token !== 'string' || !/^[\w-]{20,64}$/.test(token)) return null
  const [u] = await useDb().select().from(schema.users).where(eq(schema.users.inviteHash, sha256(token)))
  if (!u || u.disabledAt || !u.inviteExpiresAt || u.inviteExpiresAt < new Date()) return null
  return u
}
