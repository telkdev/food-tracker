// Public: who an invite / reset link is for.
export default defineEventHandler(async (event) => {
  const u = await userByInvite(getQuery(event).token)
  if (!u) throw createError({ statusCode: 404, statusMessage: 'This link has expired or was already used. Ask for a new one.' })
  return { login: u.login, greeting: await userDisplayName(u.id), reset: !!u.passwordHash }
})
