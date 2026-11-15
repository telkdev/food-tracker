import { z } from 'zod'

const body = z.object({ login: z.string().trim().min(1).max(60), password: z.string().min(1).max(200) })

export default defineEventHandler(async (event) => {
  assertLoginAllowed(event)
  const parsed = body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Enter your login and password' })
  const u = await checkPassword(parsed.data.login, parsed.data.password)
  if (!u) {
    recordLoginFailure(event)
    await new Promise(r => setTimeout(r, 800)) // cheap brute-force slowdown
    console.warn('[login] wrong login or password')
    throw createError({ statusCode: 401, statusMessage: 'Wrong login or password' })
  }
  await startSession(event, u)
  return { ok: true }
})
