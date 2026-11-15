import { and, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const u = (await getUser(uidOf(event)))!
  const id = getRouterParam(event, 'id')!
  const t = schema.passkeys
  const mine = await useDb().select({ id: t.id }).from(t).where(eq(t.userId, u.id))
  if (!mine.some(k => k.id === id)) throw createError({ statusCode: 404, statusMessage: 'Passkey not found' })
  if (!u.passwordHash && mine.length === 1) {
    throw createError({ statusCode: 400, statusMessage: 'This is your only way to log in. Set a password first.' })
  }
  await useDb().delete(t).where(and(eq(t.id, id), eq(t.userId, u.id)))
  return { ok: true }
})
