import { and, eq, or } from 'drizzle-orm'
import type { H3Event } from 'h3'

/**
 * Connections: two users who may log food and water into each other's diary (and read it, to do that well).
 * Symmetric, stored once per pair with user_a < user_b. Created by the admin on the Users page; either side
 * can remove it in Settings.
 *
 * In the app the Today screen sends `x-diary-for: <user id>`; server/middleware/auth.ts then swaps
 * event.context.uid for the diary owner on DIARY_SCOPE routes only and keeps the real user in actorUid.
 * Over MCP the tools take `for_user` and call resolveTarget.
 */
export const pair = (a: string, b: string) => (a < b ? { userA: a, userB: b } : { userA: b, userB: a })

/** Normalise a name for matching: "Надя", "надя ", "NADIA" → same key. */
const norm = (s: string) => s.normalize('NFC').trim().toLowerCase()

export async function connectedIds(uid: string): Promise<string[]> {
  const c = schema.connections
  const rows = await useDb().select().from(c).where(or(eq(c.userA, uid), eq(c.userB, uid)))
  return rows.map(r => (r.userA === uid ? r.userB : r.userA))
}

/** Active (not disabled) connected users with their display names. */
export async function listConnections(uid: string) {
  const ids = await connectedIds(uid)
  const out: { id: string, login: string, name: string }[] = []
  for (const id of ids) {
    const u = await getUser(id)
    if (u) out.push({ id: u.id, login: u.login, name: u.name || displayName(u.id) || u.login })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export async function isConnected(a: string, b: string) {
  if (a === b) return false
  const c = schema.connections
  const p = pair(a, b)
  const [row] = await useDb().select({ a: c.userA }).from(c).where(and(eq(c.userA, p.userA), eq(c.userB, p.userB)))
  return !!row && !!(await getUser(b)) && !!(await getUser(a))
}

/**
 * Whose diary a call is for. Empty / own id / own login / own name → the caller. Otherwise the person must be
 * connected; matched by id, login or display name (case-insensitive), so Claude can pass "nadia" or "Надя".
 */
export async function resolveTarget(uid: string, forUser: string | null | undefined): Promise<string> {
  const q = forUser == null ? '' : norm(forUser)
  if (!q) return uid
  const me = await getUser(uid)
  if (me && [me.id, me.login, me.name ?? '', displayName(me.id) ?? ''].some(x => x && norm(x) === q)) return uid
  const list = await listConnections(uid)
  const hit = list.find(u => [u.id, u.login, u.name].some(x => norm(x) === q))
  if (hit) return hit.id
  const names = list.map(u => `${u.login} (${u.name})`).join(', ')
  throw createError({
    statusCode: 403,
    statusMessage: list.length
      ? `"${forUser}" is not connected to you. Connected: ${names}. Pass one of these as for_user.`
      : `"${forUser}" is not connected to you, and you have no connections. The admin can connect users on the Users page of the app.`,
  })
}

export async function connect(a: string, b: string, by: string) {
  if (a === b) throw createError({ statusCode: 400, statusMessage: 'Pick two different users' })
  if (!(await getUser(a)) || !(await getUser(b))) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  await useDb().insert(schema.connections).values({ ...pair(a, b), createdBy: by }).onConflictDoNothing()
  return { ok: true }
}

export async function disconnect(a: string, b: string) {
  const c = schema.connections
  const p = pair(a, b)
  const rows = await useDb().delete(c).where(and(eq(c.userA, p.userA), eq(c.userB, p.userB))).returning()
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Not connected' })
  return { ok: true }
}

/** All pairs, for the admin's Users page. */
export async function allConnections() {
  const rows = await useDb().select().from(schema.connections)
  return rows.map(r => [r.userA, r.userB] as [string, string])
}

/**
 * Routes the Today screen uses for someone else's diary. Everything else (settings changes, account, admin,
 * profile, reports, preferences, product edits) always acts on the logged-in user, whatever the header says.
 */
const DIARY_SCOPE: [string, RegExp][] = [
  ['GET', /^\/api\/day$/],
  ['GET', /^\/api\/range$/],
  ['GET', /^\/api\/settings$/],
  ['GET', /^\/api\/plan$/],
  ['GET', /^\/api\/meals$/],
  ['POST', /^\/api\/meals\/[^/]+\/log$/],
  ['GET', /^\/api\/products$/],
  ['POST', /^\/api\/products$/],
  ['GET', /^\/api\/products\/barcode\/[^/]+$/],
  ['POST', /^\/api\/entries$/],
  ['PATCH', /^\/api\/entries\/[^/]+$/],
  ['DELETE', /^\/api\/entries\/[^/]+$/],
  ['POST', /^\/api\/water$/],
  ['DELETE', /^\/api\/water\/[^/]+$/],
]
export const inDiaryScope = (method: string, path: string) => DIARY_SCOPE.some(([m, re]) => m === method && re.test(path))

/** Called by the auth middleware after the session check. Throws 403 if the header names someone not connected. */
export async function applyDiaryFor(event: H3Event, uid: string, path: string) {
  const raw = getHeader(event, 'x-diary-for')
  if (!raw || raw === uid || !inDiaryScope(event.method, path)) return
  if (!(await isConnected(uid, raw))) throw createError({ statusCode: 403, statusMessage: 'Not connected to this user' })
  event.context.actorUid = uid
  event.context.uid = raw
}

/** Who wrote a row: null when it is the diary owner themselves. */
export function loggedByOf(event: H3Event): string | null {
  const a = event.context.actorUid
  return a && a !== event.context.uid ? a : null
}

declare module 'h3' {
  interface H3EventContext { actorUid?: string }
}
