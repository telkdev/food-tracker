import { z } from 'zod'

const body = z.object({ password: z.string().min(1).max(200) })

export default defineEventHandler(async (event) => {
  assertLoginAllowed(event)
  const { password } = await readValidatedBody(event, body.parse)
  if (!configuredUsers().length) {
    throw createError({ statusCode: 500, statusMessage: 'No users configured: set NUXT_APP_PASSWORD (min 12 chars)' })
  }
  const uid = userByPassword(password)
  if (!uid) {
    recordLoginFailure(event)
    await new Promise(r => setTimeout(r, 800)) // cheap brute-force slowdown
    console.warn('[login] wrong password')
    throw createError({ statusCode: 401, statusMessage: 'Wrong password' })
  }
  await setUserSession(event, { user: { id: uid }, loggedInAt: Date.now() })
  await getSettings(uid) // creates the new user's settings row on first login
  return { ok: true }
})
