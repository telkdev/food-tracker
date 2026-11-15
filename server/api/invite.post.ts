import { z } from 'zod'

// Public: set a password with an invite / reset link, then log in. A reset logs out every other device.
const body = z.object({ token: z.string().max(100), password: z.string().max(200) })

export default defineEventHandler(async (event) => {
  const { token, password } = await readValidatedBody(event, body.parse)
  const u = await userByInvite(token)
  if (!u) throw createError({ statusCode: 404, statusMessage: 'This link has expired or was already used. Ask for a new one.' })
  if (normPassword(password).length < MIN_PASSWORD) throw createError({ statusCode: 400, statusMessage: `The password needs at least ${MIN_PASSWORD} characters` })
  await setPassword(u.id, password, { logoutOthers: !!u.passwordHash })
  await startSession(event, (await getUser(u.id))!)
  return { ok: true }
})
