import { z } from 'zod'
// Suggested portions for the rest of today from foods eaten in the last days. Read-only.
export default defineEventHandler(async (event) => {
  const q = parseOr400(z.object({ days: z.coerce.number().int().min(1).max(3).optional(), exclude: z.union([z.string(), z.array(z.string())]).optional(), variant: z.coerce.number().int().min(0).max(50).optional() }), getQuery(event))
  // repeated ?exclude=…&exclude=… (names may contain commas, so no splitting)
  const exclude = (q.exclude == null ? [] : Array.isArray(q.exclude) ? q.exclude : [q.exclude]).filter(Boolean)
  return suggestDayPlan(uidOf(event), { days: q.days, exclude, variant: q.variant })
})
