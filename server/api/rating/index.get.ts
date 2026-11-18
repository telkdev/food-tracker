import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const { period } = parseOr400(z.object({ period: z.enum(['today', 'yesterday', 'week']).default('today') }), getQuery(event))
  return getRating(uidOf(event), period)
})
