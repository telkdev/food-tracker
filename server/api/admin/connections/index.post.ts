import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const { a, b } = parseOr400(z.object({ a: z.string().min(1), b: z.string().min(1) }), await readBody(event))
  return connect(a, b, admin.id)
})
