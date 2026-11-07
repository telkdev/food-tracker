import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const { date } = parseOr400(z.object({ date: isoDate.optional() }), getQuery(event))
  return getDay(uidOf(event), date)
})
