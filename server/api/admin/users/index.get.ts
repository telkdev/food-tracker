import { count } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const keys = await useDb().select({ userId: schema.passkeys.userId, n: count() }).from(schema.passkeys).groupBy(schema.passkeys.userId)
  const byUser = new Map(keys.map(k => [k.userId, Number(k.n)]))
  const rows = [...(await allUsers()).values()].sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) || a.login.localeCompare(b.login))
  return rows.map(u => ({
    id: u.id, login: u.login, name: u.name, isAdmin: u.isAdmin, disabled: !!u.disabledAt,
    hasPassword: !!u.passwordHash, passkeys: byUser.get(u.id) ?? 0,
    invitePending: !!u.inviteHash && !!u.inviteExpiresAt && u.inviteExpiresAt > new Date(),
  }))
})
