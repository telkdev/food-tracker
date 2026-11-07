import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const { days } = parseOr400(z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }), getQuery(event))
  return getUsage(uidOf(event), days)
})
