import { createHash, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

const body = z.object({ password: z.string().min(1).max(200) })
// Normalise so a trailing space/newline pasted into Render, or different Unicode forms of Cyrillic
// letters (phone vs desktop keyboard), don't make the right password fail.
const norm = (s: string) => s.normalize('NFC').trim()
const digest = (s: string) => createHash('sha256').update(norm(s)).digest()

export default defineEventHandler(async (event) => {
  const { password } = await readValidatedBody(event, body.parse)
  const expected = useRuntimeConfig(event).appPassword
  if (!expected || norm(expected).length < 12) {
    throw createError({ statusCode: 500, statusMessage: 'NUXT_APP_PASSWORD is not configured (min 12 chars)' })
  }
  if (!timingSafeEqual(digest(password), digest(expected))) {
    await new Promise(r => setTimeout(r, 800)) // cheap brute-force slowdown
    // Lengths only (never values) to debug copy-paste problems; the length check tells nothing useful to an attacker.
    console.warn(`[login] wrong password: got ${norm(password).length} chars, expected ${norm(expected).length}`)
    throw createError({ statusCode: 401, statusMessage: `Wrong password (you entered ${norm(password).length} characters)` })
  }
  await setUserSession(event, { user: { id: 'owner' }, loggedInAt: Date.now() })
  return { ok: true }
})
