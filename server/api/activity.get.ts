import { z } from 'zod'
// Daily steps / active kcal / workouts for a range (default: the last 14 days incl. today).
export default defineEventHandler(async (event) => {
  const uid = uidOf(event)
  const s = await getSettings(uid)
  const today = localDate(s.timezone)
  const q = parseOr400(z.object({ from: isoDate.optional(), to: isoDate.optional() }), getQuery(event))
  const to = q.to ?? today
  const from = q.from ?? new Date(Date.parse(`${to}T12:00:00Z`) - 13 * 86400_000).toISOString().slice(0, 10)
  if (from > to || Date.parse(to) - Date.parse(from) > 366 * 86400_000) throw createError({ statusCode: 400, statusMessage: 'Bad range (max 366 days)' })
  const [days, summary] = await Promise.all([getActivityDays(uid, from, to), getStepsSummary(uid, today)])
  return { from, to, days, steps_avg_14d: summary.average }
})
