import { createHash, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

const body = z.object({ password: z.string().min(1).max(200) })
// Normalise so a trailing space/newline pasted into Render, or different Unicode forms of Cyrillic
// letters (phone vs desktop keyboard), don't make the right password fail.
const norm = (s: string) => s.normalize('NFC').trim()
const digest = (s: string) => createHash('sha256').update(norm(s)).digest()

export default defineEventHandler(async (event) => {
  const { password } = await readValidatedBody(event, body.parse)
  // Read the raw env var (runtimeConfig runs values through destr()). Note: Render turns "$$" into "$"
  // in env values, so avoid "$" in NUXT_APP_PASSWORD.
  const expected = String(process.env.NUXT_APP_PASSWORD ?? useRuntimeConfig(event).appPassword ?? '')
  if (!expected || norm(expected).length < 12) {
    throw createError({ statusCode: 500, statusMessage: 'NUXT_APP_PASSWORD is not configured (min 12 chars)' })
  }
  if (!timingSafeEqual(digest(password), digest(expected))) {
    await new Promise(r => setTimeout(r, 800)) // cheap brute-force slowdown
    console.warn('[login] wrong password')
    throw createError({ statusCode: 401, statusMessage: 'Wrong password' })
  }
  await setUserSession(event, { user: { id: 'owner' }, loggedInAt: Date.now() })
  return { ok: true }
})
