import { and, eq, ne, or } from 'drizzle-orm'
import type { H3Event } from 'h3'

/**
 * Diary access, granted by the diary's OWNER (table diary_access, one row per owner → grantee):
 * - any active row: the grantee may see the owner's diary (needed to log well: totals, usual meals, products);
 * - can_log: may add food and water;
 * - can_edit: may edit and delete any entry; without it only entries the grantee logged themselves.
 * A grantee can ask for access (status 'requested'); only the owner turns it on, picks the rights, changes or
 * revokes them. The grantee can leave at any time. Nobody else (not even the admin) can grant access to a diary.
 *
 * In the app the Today screen sends `x-diary-for: <owner id>`; server/middleware/auth.ts then swaps
 * event.context.uid for the owner on DIARY_SCOPE routes only and keeps the real user in actorUid.
 * Over MCP the tools take `for_user` and call resolveTarget.
 */
export type Right = 'read' | 'log' | 'edit'
export interface Access { canLog: boolean, canEdit: boolean }

const norm = (s: string) => s.normalize('NFC').trim().toLowerCase()
const nameOfUser = (u: { id: string, login: string, name: string | null }) => u.name || displayName(u.id) || u.login

/** Active access of `actor` to `owner`'s diary, or null. Disabled users have none. */
export async function getAccess(actor: string, owner: string): Promise<Access | null> {
  if (actor === owner) return { canLog: true, canEdit: true }
  const a = schema.diaryAccess
  const [row] = await useDb().select().from(a).where(and(eq(a.ownerId, owner), eq(a.granteeId, actor), eq(a.status, 'active')))
  if (!row || !(await getUser(owner)) || !(await getUser(actor))) return null
  return { canLog: row.canLog, canEdit: row.canEdit }
}

export function allows(acc: Access | null, right: Right) {
  if (!acc) return false
  return right === 'read' || (right === 'log' ? acc.canLog : acc.canLog || acc.canEdit)
}

/** Diaries I may open (active grants to me), for the switcher and MCP get_context. */
export async function listConnections(uid: string) {
  const a = schema.diaryAccess
  const rows = await useDb().select().from(a).where(and(eq(a.granteeId, uid), eq(a.status, 'active')))
  const out: { id: string, login: string, name: string, can_log: boolean, can_edit: boolean }[] = []
  for (const r of rows) {
    const u = await getUser(r.ownerId)
    if (u) out.push({ id: u.id, login: u.login, name: nameOfUser(u), can_log: r.canLog, can_edit: r.canEdit })
  }
  return out.sort((x, y) => x.name.localeCompare(y.name))
}

/** Everything for the Settings screen: who has access to my diary, whose diaries I keep, and everyone else. */
export async function accessOverview(uid: string) {
  const a = schema.diaryAccess
  const rows = await useDb().select().from(a).where(or(eq(a.ownerId, uid), eq(a.granteeId, uid)))
  const users = [...(await allUsers()).values()].filter(u => !u.disabledAt)
  const pub = (id: string) => { const u = users.find(x => x.id === id); return u ? { id: u.id, login: u.login, name: nameOfUser(u) } : null }
  const side = (r: typeof rows[number], other: string) => { const u = pub(other); return u && { ...u, status: r.status, can_log: r.canLog, can_edit: r.canEdit } }
  return {
    // people who may keep my diary, and their pending requests
    granted: rows.filter(r => r.ownerId === uid).map(r => side(r, r.granteeId)).filter(Boolean),
    // diaries I may keep, and my pending requests
    mine: rows.filter(r => r.granteeId === uid).map(r => side(r, r.ownerId)).filter(Boolean),
    // to pick from when granting or asking
    users: users.filter(u => u.id !== uid).map(u => ({ id: u.id, login: u.login, name: nameOfUser(u) })).sort((x, y) => x.name.localeCompare(y.name)),
  }
}

/** Owner grants or changes rights (also approves a request). At least one right must stay on. */
export async function grantAccess(owner: string, grantee: string, rights: { can_log: boolean, can_edit: boolean }) {
  if (owner === grantee) throw createError({ statusCode: 400, statusMessage: 'That is your own diary' })
  if (!(await getUser(grantee))) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  if (!rights.can_log && !rights.can_edit) throw createError({ statusCode: 400, statusMessage: 'Pick at least one right, or remove access' })
  const v = { ownerId: owner, granteeId: grantee, status: 'active' as const, canLog: rights.can_log, canEdit: rights.can_edit }
  await useDb().insert(schema.diaryAccess).values(v)
    .onConflictDoUpdate({ target: [schema.diaryAccess.ownerId, schema.diaryAccess.granteeId], set: { status: 'active', canLog: v.canLog, canEdit: v.canEdit, updatedAt: new Date() } })
  return { ok: true }
}

/** Grantee asks the owner for access. Never changes an existing grant. */
export async function requestAccess(grantee: string, owner: string) {
  if (owner === grantee) throw createError({ statusCode: 400, statusMessage: 'That is your own diary' })
  if (!(await getUser(owner))) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  await useDb().insert(schema.diaryAccess).values({ ownerId: owner, granteeId: grantee, status: 'requested', canLog: true, canEdit: false }).onConflictDoNothing()
  return { ok: true }
}

/** Owner revokes / declines, or grantee leaves / cancels a request. */
export async function removeAccess(owner: string, grantee: string) {
  const a = schema.diaryAccess
  const rows = await useDb().delete(a).where(and(eq(a.ownerId, owner), eq(a.granteeId, grantee))).returning()
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'No such access' })
  return { ok: true }
}

/** Number of requests waiting for me, for a badge. */
export async function pendingRequests(uid: string) {
  const a = schema.diaryAccess
  const rows = await useDb().select({ g: a.granteeId }).from(a).where(and(eq(a.ownerId, uid), eq(a.status, 'requested'), ne(a.granteeId, uid)))
  return rows.length
}

const deny = (right: Right, who: string) => createError({
  statusCode: 403,
  statusMessage: right === 'read'
    ? `No access to ${who}'s diary`
    : `${who} has not allowed you to ${right === 'log' ? 'add food or water to' : 'edit or delete entries in'} their diary`,
})

/**
 * Whose diary a call is for, and whether the caller may do `right` there. Empty / own id / login / name → the
 * caller. Otherwise matched among diaries shared with the caller by id, login or display name (case-insensitive).
 * `onlyOwn`: edits are limited to rows the caller logged (they may log but not edit others' entries).
 */
export async function resolveTarget(uid: string, forUser: string | null | undefined, right: Right = 'read'): Promise<{ target: string, onlyOwn: string | null }> {
  const q = forUser == null ? '' : norm(forUser)
  if (!q) return { target: uid, onlyOwn: null }
  const me = await getUser(uid)
  if (me && [me.id, me.login, me.name ?? '', displayName(me.id) ?? ''].some(x => x && norm(x) === q)) return { target: uid, onlyOwn: null }
  const list = await listConnections(uid)
  const hit = list.find(u => [u.id, u.login, u.name].some(x => norm(x) === q))
  if (!hit) {
    const names = list.map(u => `${u.login} (${u.name})`).join(', ')
    throw createError({
      statusCode: 403,
      statusMessage: list.length
        ? `"${forUser}" has not shared their diary with you. Shared with you: ${names}. Pass one of these as for_user.`
        : `"${forUser}" has not shared their diary with you, and nobody has. The owner gives access in Settings → Diary access.`,
    })
  }
  const acc = { canLog: hit.can_log, canEdit: hit.can_edit }
  if (!allows(acc, right)) throw deny(right, hit.name)
  return { target: hit.id, onlyOwn: right === 'edit' && !acc.canEdit ? uid : null }
}

/**
 * Routes the Today screen uses for someone else's diary, with the right each needs. Everything else (settings
 * changes, account, admin, profile, reports, preferences, product edits) always acts on the logged-in user.
 */
const DIARY_SCOPE: [string, RegExp, Right][] = [
  ['GET', /^\/api\/day$/, 'read'],
  ['GET', /^\/api\/range$/, 'read'],
  ['GET', /^\/api\/settings$/, 'read'],
  ['GET', /^\/api\/plan$/, 'read'],
  ['GET', /^\/api\/meals$/, 'read'],
  ['GET', /^\/api\/products$/, 'read'],
  ['GET', /^\/api\/products\/barcode\/[^/]+$/, 'log'],
  ['POST', /^\/api\/meals\/[^/]+\/log$/, 'log'],
  ['POST', /^\/api\/products$/, 'log'],
  ['POST', /^\/api\/entries$/, 'log'],
  ['POST', /^\/api\/water$/, 'log'],
  ['PATCH', /^\/api\/entries\/[^/]+$/, 'edit'],
  ['DELETE', /^\/api\/entries\/[^/]+$/, 'edit'],
  ['DELETE', /^\/api\/water\/[^/]+$/, 'edit'],
]
export const scopeOf = (method: string, path: string): Right | null => DIARY_SCOPE.find(([m, re]) => m === method && re.test(path))?.[2] ?? null
export const inDiaryScope = (method: string, path: string) => scopeOf(method, path) !== null

/** Called by the auth middleware after the session check. Throws 403 when the owner hasn't allowed it. */
export async function applyDiaryFor(event: H3Event, uid: string, path: string) {
  const raw = getHeader(event, 'x-diary-for')
  if (!raw || raw === uid) return
  const right = scopeOf(event.method, path)
  if (!right) return
  const acc = await getAccess(uid, raw)
  if (!acc) throw createError({ statusCode: 403, statusMessage: 'No access to this diary' })
  if (!allows(acc, right)) throw createError({ statusCode: 403, statusMessage: right === 'log' ? 'Not allowed to add to this diary' : 'Not allowed to edit this diary' })
  event.context.actorUid = uid
  event.context.uid = raw
  // may log but not edit others' entries: edits limited to own rows
  if (right === 'edit' && !acc.canEdit) event.context.onlyOwn = uid
}

/** Who wrote a row: null when it is the diary owner themselves. */
export function loggedByOf(event: H3Event): string | null {
  const a = event.context.actorUid
  return a && a !== event.context.uid ? a : null
}

declare module 'h3' {
  interface H3EventContext { actorUid?: string, onlyOwn?: string }
}
