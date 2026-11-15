// Steps, active kcal and workouts from the phone (HC Webhook on Android, or a simple daily POST from
// iOS Shortcuts / Tasker / curl). Auth: the user's ingest token (Settings → Шаги с телефона), not the login cookie.
// Body shapes: see server/utils/activityParse.ts.
export default defineEventHandler(async (event) => {
  const uid = await ingestUser({
    authorization: getHeader(event, 'authorization') ?? undefined,
    apiKey: getHeader(event, 'x-api-key') ?? undefined,
  })
  if (!uid) throw createError({ statusCode: 401, statusMessage: 'Unknown or missing ingest token' })
  const len = Number(getHeader(event, 'content-length') ?? 0)
  if (len > 8 * 1024 * 1024) throw createError({ statusCode: 413, statusMessage: 'Payload too large (8 MB max)' })
  let body: unknown
  try { body = await readBody(event) }
  catch { throw createError({ statusCode: 400, statusMessage: 'Body must be JSON' }) }
  return ingestActivity(uid, body)
})
