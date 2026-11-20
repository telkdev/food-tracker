import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { a, b } = parseOr400(z.object({ a: z.string().min(1), b: z.string().min(1) }), getQuery(event))
  return disconnect(a, b)
})
