import { z } from 'zod'

// Change own password. Logs out every other device; this one stays logged in.
const body = z.object({ current: z.string().max(200).optional(), next: z.string().max(200) })

export default defineEventHandler(async (event) => {
  assertLoginAllowed(event)
  const u = (await getUser(uidOf(event)))!
  const { current, next } = await readValidatedBody(event, body.parse)
  if (normPassword(next).length < MIN_PASSWORD) throw createError({ statusCode: 400, statusMessage: `The new password needs at least ${MIN_PASSWORD} characters` })
  if (u.passwordHash && !(await verifyPassword(u.passwordHash, normPassword(current ?? '')))) {
    recordLoginFailure(event)
    throw createError({ statusCode: 400, statusMessage: 'The current password is wrong' })
  }
  await setPassword(u.id, next, { logoutOthers: true })
  await startSession(event, (await getUser(u.id))!)
  return { ok: true }
})
