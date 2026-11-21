import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const uid = requireHair(event)
  const days = parseOr400(z.coerce.number().int().min(7).max(365).default(28), getQuery(event).days)
  return getHair(uid, days)
})
