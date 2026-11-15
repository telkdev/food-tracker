import { desc, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const u = (await getUser(uidOf(event)))!
  const t = schema.passkeys
  const keys = await useDb().select({ id: t.id, name: t.name, backedUp: t.backedUp, createdAt: t.createdAt, lastUsedAt: t.lastUsedAt })
    .from(t).where(eq(t.userId, u.id)).orderBy(desc(t.createdAt))
  return { id: u.id, login: u.login, name: u.name, greeting: await userDisplayName(u.id), isAdmin: u.isAdmin, hasPassword: !!u.passwordHash, passkeys: keys }
})
