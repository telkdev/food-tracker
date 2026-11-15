import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'

// Rename the login or greeting, disable/enable, or log a user out everywhere. Never deletes data.
const body = z.object({
  login: z.string().trim().toLowerCase().regex(LOGIN_RE).optional(),
  name: z.string().trim().max(40).nullable().optional(),
  disabled: z.boolean().optional(),
  logoutEverywhere: z.literal(true).optional(),
})

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = getRouterParam(event, 'id')!
  const users = await allUsers()
  if (!users.has(id)) throw createError({ statusCode: 404, statusMessage: 'No such user' })
  const parsed = body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Login: latin letters, digits and _, up to 30' })
  const p = parsed.data
  if (p.login && [...users.values()].some(u => u.id !== id && (u.login === p.login || u.id === p.login))) {
    throw createError({ statusCode: 409, statusMessage: 'This login is taken' })
  }
  if (p.disabled && id === admin.id) throw createError({ statusCode: 400, statusMessage: 'You can’t disable yourself' })
  const t = schema.users
  await useDb().update(t).set({
    ...(p.login ? { login: p.login } : {}),
    ...(p.name !== undefined ? { name: p.name ? p.name.normalize('NFC') : null } : {}),
    ...(p.disabled !== undefined ? { disabledAt: p.disabled ? new Date() : null } : {}),
    ...(p.disabled || p.logoutEverywhere ? { sessionVersion: sql`${t.sessionVersion} + 1` } : {}),
  }).where(eq(t.id, id))
  invalidateUsers()
  if (id === admin.id && p.logoutEverywhere) await startSession(event, (await getUser(id))!)
  return { ok: true }
})
