// The app's useUserSession() reads /api/_auth/session. Without this a revoked or disabled session would still look
// logged in there (the cookie itself is valid) while every /api call fails; now it reads as logged out.
export default defineNitroPlugin(() => {
  sessionHooks.hook('fetch', async (_session, event) => {
    if (await sessionUser(event as any)) return
    await clearUserSession(event as any)
    throw createError({ statusCode: 401, statusMessage: 'Session expired' })
  })
})
