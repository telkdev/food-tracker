// Everything under /api is private except health and the login endpoints. /mcp has its own bearer-token guard.
const PUBLIC = ['/api/health', '/api/auth/login', '/api/_auth/session']

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/')) return
  if (PUBLIC.includes(path)) return
  const session = await requireUserSession(event)
  const id = (session.user as { id?: unknown }).id
  // a user removed from NUXT_USERS loses access even with a live session cookie
  if (!isKnownUser(id)) {
    await clearUserSession(event)
    throw createError({ statusCode: 401, statusMessage: 'Unknown user' })
  }
  event.context.uid = id
})
