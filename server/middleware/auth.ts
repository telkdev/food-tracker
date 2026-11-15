// Everything under /api is private except health, login and invite endpoints. /mcp has its own bearer-token guard.
const PUBLIC = ['/api/health', '/api/ping', '/api/auth/login', '/api/_auth/session', '/api/webauthn/authenticate', '/api/invite']

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/')) {
    // page loads: refresh/upgrade the session cookie too (SSR's own /api calls can't set cookies in the browser)
    if (event.method === 'GET' && getCookie(event, sessionCookieName()) && !/\.\w+$/.test(path) && !path.startsWith('/_nuxt/')) {
      try { await sessionUser(event) }
      catch (e) { console.warn('[auth] session refresh failed', e) }
    }
    return
  }
  if (PUBLIC.includes(path)) return
  const user = await sessionUser(event)
  if (!user) {
    // disabled user, revoked session ("log out everywhere"), idle too long, or not logged in
    if (getCookie(event, sessionCookieName())) await clearUserSession(event)
    throw createError({ statusCode: 401, statusMessage: 'Not logged in' })
  }
  event.context.uid = user.id
})
