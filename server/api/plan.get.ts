import { z } from 'zod'
// Suggested portions for the rest of today from foods eaten in the last days. Read-only.
export default defineEventHandler(async (event) => {
  const q = parseOr400(z.object({ days: z.coerce.number().int().min(1).max(3).optional(), exclude: z.union([z.string(), z.array(z.string())]).optional() }), getQuery(event))
  const exclude = q.exclude == null ? [] : Array.isArray(q.exclude) ? q.exclude : q.exclude.split(',').filter(Boolean)
  return suggestDayPlan(uidOf(event), { days: q.days, exclude })
})
