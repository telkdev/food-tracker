import { z } from 'zod'
// Advice from the last 14 days of the diary (rule-based, read-only). goal: recomp (default) | cut | bulk.
export default defineEventHandler(async (event) => {
  const q = parseOr400(z.object({ goal: z.enum(['recomp', 'cut', 'bulk']).optional() }), getQuery(event))
  return getInsights(uidOf(event), q.goal)
})
