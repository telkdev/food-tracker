// Everything under /api is private except health and the login endpoints.
// /mcp will get its own OAuth bearer-token guard in build step 5.
const PUBLIC = ['/api/health', '/api/auth/login', '/api/_auth/session']

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/')) return
  if (PUBLIC.includes(path)) return
  await requireUserSession(event)
})
